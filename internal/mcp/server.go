// server.go implements the Forge Terminal MCP server.
//
// The server speaks JSON-RPC 2.0 over Streamable HTTP at POST /api/mcp.
// It maintains a registry of named tools and dispatches each incoming call
// to the correct tool handler. All requests must carry a valid bearer token.
//
// Transport: Streamable HTTP (MCP 1.0+ standard, supersedes SSE for servers).
// Auth:      Bearer token stored at ~/.forge/mcp-token (auto-generated).
// Protocol:  MCP 2024-11-05 (initialize + tools/list + tools/call).
package mcp

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// ── Constants ───────────────────────────────────────────────────────────────

const (
	// mcpProtocolVersion is the MCP spec version this server implements.
	mcpProtocolVersion = "2024-11-05"

	// serverName is the human-readable name returned in initialize responses.
	serverName = "Forge Terminal"

	// outputSizeCap is the maximum bytes returned in any single tool response.
	// This prevents runaway output from filling a client's context window.
	outputSizeCap = 50 * 1024 // 50 KiB
)

// ── Tool Handler Interface ───────────────────────────────────────────────────

// ToolHandler is implemented by each tool to declare its schema and run itself.
type ToolHandler interface {
	// Definition returns the MCP tool descriptor shown to clients on tools/list.
	Definition() ToolDefinition

	// Execute runs the tool with the given arguments and returns the result.
	Execute(args map[string]any) (*CallToolResult, error)
}

// ── Server ───────────────────────────────────────────────────────────────────

// Server is the Forge Terminal MCP server. It holds the tool registry,
// auth token, and the dependencies each tool needs to do its work.
type Server struct {
	authToken string
	tools     map[string]ToolHandler
	broker    *TaskBroker
}

// Dependencies bundles everything the Server needs from the rest of Forge.
// This avoids import cycles: cmd/forge owns the handler; internal/mcp imports terminal.
type Dependencies struct {
	// TermHandler gives tools access to active PTY sessions.
	TermHandler *terminal.Handler

	// WorkflowConfig is the project's workflow configuration for the status tool.
	WorkflowConfig workflow.WorkflowConfig

	// ProjectPath is the root path used by file tools and workflow compliance scans.
	ProjectPath string
}

// NewServer creates a fully initialised MCP server.
// authToken is loaded by auth.LoadOrCreateToken() before this call.
func NewServer(authToken string, deps Dependencies) *Server {
	broker := NewTaskBroker()

	srv := &Server{
		authToken: authToken,
		tools:     make(map[string]ToolHandler),
		broker:    broker,
	}

	srv.registerBuiltInTools(deps)
	return srv
}

// Broker returns the task broker so the Forge agent loop can consume submitted tasks.
func (srv *Server) Broker() *TaskBroker {
	return srv.broker
}

// ExecuteTool calls a named tool directly, bypassing HTTP and auth.
// Intended for unit testing only — not exposed over HTTP.
func (srv *Server) ExecuteTool(name string, args map[string]any) (*CallToolResult, error) {
	handler, found := srv.tools[name]
	if !found {
		return nil, fmt.Errorf("tool %q not registered", name)
	}
	return handler.Execute(args)
}

// HandleHTTP is the single HTTP handler for POST and GET /api/mcp.
// GET → returns the tool list as plain JSON for discovery.
// POST → handles full JSON-RPC 2.0 MCP messages.
func (srv *Server) HandleHTTP(w http.ResponseWriter, r *http.Request) {
	if !ValidateRequestToken(r, srv.authToken) {
		writeHTTPError(w, http.StatusUnauthorized, "invalid or missing bearer token")
		return
	}

	switch r.Method {
	case http.MethodGet:
		srv.handleDiscovery(w, r)
	case http.MethodPost:
		srv.handleRPC(w, r)
	default:
		writeHTTPError(w, http.StatusMethodNotAllowed, "only GET and POST are supported")
	}
}

// handleDiscovery responds to GET /api/mcp with a human-readable tool list.
func (srv *Server) handleDiscovery(w http.ResponseWriter, _ *http.Request) {
	result := srv.buildToolList()
	w.Header().Set("Content-Type", "application/json")
	encodeJSON(w, result)
}

// handleRPC parses an incoming JSON-RPC 2.0 request and dispatches it.
func (srv *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	var req JSONRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		srv.writeRPCError(w, json.RawMessage(`null`), ErrorCodeParseError, "could not decode JSON-RPC request: "+err.Error())
		return
	}

	log.Printf("[MCP] %s id=%v", req.Method, req.ID)

	w.Header().Set("Content-Type", "application/json")

	switch req.Method {
	case "initialize":
		srv.handleInitialize(w, &req)
	case "tools/list":
		srv.handleToolsList(w, &req)
	case "tools/call":
		srv.handleToolsCall(w, &req)
	default:
		srv.writeRPCError(w, req.ID, ErrorCodeMethodNotFound,
			fmt.Sprintf("unknown method %q", req.Method))
	}
}

// ── RPC Method Handlers ──────────────────────────────────────────────────────

// handleInitialize responds to the MCP handshake with server capabilities.
func (srv *Server) handleInitialize(w http.ResponseWriter, req *JSONRPCRequest) {
	result := InitializeResult{
		ProtocolVersion: mcpProtocolVersion,
		ServerInfo:      MCPServerInfo{Name: serverName},
		Capabilities: MCPCapabilities{
			Tools: map[string]any{"listChanged": false},
		},
	}
	encodeJSON(w, JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      req.ID,
		Result:  result,
	})
}

// handleToolsList returns the registered tool schemas.
func (srv *Server) handleToolsList(w http.ResponseWriter, req *JSONRPCRequest) {
	encodeJSON(w, JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      req.ID,
		Result:  srv.buildToolList(),
	})
}

// handleToolsCall dispatches a tools/call request to the matching ToolHandler.
func (srv *Server) handleToolsCall(w http.ResponseWriter, req *JSONRPCRequest) {
	callReq, err := decodeCallRequest(req.Params)
	if err != nil {
		srv.writeRPCError(w, req.ID, ErrorCodeInvalidParams,
			"invalid tools/call params: "+err.Error())
		return
	}

	handler, found := srv.tools[callReq.Name]
	if !found {
		srv.writeRPCError(w, req.ID, ErrorCodeMethodNotFound,
			fmt.Sprintf("unknown tool %q", callReq.Name))
		return
	}

	result, execErr := handler.Execute(callReq.Arguments)
	if execErr != nil {
		srv.writeRPCError(w, req.ID, ErrorCodeInternalError, execErr.Error())
		return
	}

	encodeJSON(w, JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      req.ID,
		Result:  result,
	})
}

// ── Registry ─────────────────────────────────────────────────────────────────

// registerBuiltInTools adds all Forge tools to the registry.
// This is called once inside NewServer.
func (srv *Server) registerBuiltInTools(deps Dependencies) {
	srv.register(newTerminalSessionsTool(deps.TermHandler))
	srv.register(newTerminalExecuteTool(deps.TermHandler))
	srv.register(newTerminalReadTool(deps.TermHandler))
	srv.register(newFileReadTool(deps.ProjectPath))
	srv.register(newFileWriteTool(deps.ProjectPath))
	srv.register(newFileListTool(deps.ProjectPath))
	srv.register(newTaskSubmitTool(srv.broker))
	srv.register(newWorkflowStatusTool(deps.ProjectPath, deps.WorkflowConfig))
}

// register adds a single ToolHandler to the registry under its declared name.
func (srv *Server) register(tool ToolHandler) {
	name := tool.Definition().Name
	srv.tools[name] = tool
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildToolList constructs a ListToolsResult from the current registry.
func (srv *Server) buildToolList() ListToolsResult {
	definitions := make([]ToolDefinition, 0, len(srv.tools))
	for _, handler := range srv.tools {
		definitions = append(definitions, handler.Definition())
	}
	return ListToolsResult{Tools: definitions}
}

// decodeCallRequest extracts the tool name and arguments from raw RPC params.
func decodeCallRequest(rawParams json.RawMessage) (*CallToolRequest, error) {
	if rawParams == nil {
		return nil, fmt.Errorf("params field is required for tools/call")
	}
	var callReq CallToolRequest
	if err := json.Unmarshal(rawParams, &callReq); err != nil {
		return nil, fmt.Errorf("decoding call request: %w", err)
	}
	if callReq.Name == "" {
		return nil, fmt.Errorf("tool name must not be empty")
	}
	return &callReq, nil
}

// writeRPCError sends a JSON-RPC error response.
// id should be a json.RawMessage (or nil when the request ID could not be parsed).
func (srv *Server) writeRPCError(w http.ResponseWriter, id json.RawMessage, code int, msg string) {
	encodeJSON(w, JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      id,
		Error: &JSONRPCError{
			Code:    code,
			Message: msg,
		},
	})
}

// writeHTTPError sends a plain HTTP error with a JSON body for non-RPC errors.
func writeHTTPError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encodeJSON(w, map[string]string{"error": msg})
}

// encodeJSON writes the given value as indented JSON to the response writer.
// Errors are logged but not propagated — the HTTP response is already committed.
func encodeJSON(w http.ResponseWriter, v any) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		log.Printf("[MCP] failed to encode JSON response: %v", err)
	}
}

// textContent is a shorthand for building a successful single-text ToolContent.
func textContent(text string) *CallToolResult {
	// Clamp to size cap so enormous PTY output doesn't explode client context windows.
	if len(text) > outputSizeCap {
		text = text[:outputSizeCap] + "\n[output truncated]"
	}
	return &CallToolResult{
		Content: []ToolContent{{Type: "text", Text: text}},
		IsError: false,
	}
}

// errorContent builds a tool result that signals a tool-level error.
// The JSON-RPC layer itself succeeds (200 OK); the error is in the content.
func errorContent(msg string) *CallToolResult {
	return &CallToolResult{
		Content: []ToolContent{{Type: "text", Text: "ERROR: " + msg}},
		IsError: true,
	}
}
