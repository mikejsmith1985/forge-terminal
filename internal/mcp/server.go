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
	"sort"
	"sync"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// sortStrings sorts a string slice in place.
// Extracted as a named helper so call sites are self-documenting.
func sortStrings(slice []string) { sort.Strings(slice) }

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
// The tool registry is hot-reloadable: call ReloadAllowedTools to apply a
// new forge.toml allowed_tools list without restarting the process.
type Server struct {
	authToken string
	deps      Dependencies // retained so ReloadAllowedTools can rebuild handlers
	toolsMu   sync.RWMutex // guards the tools map for concurrent reload safety
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
	//
	// Prefer ProjectPathFunc. This stays for tests and for callers that genuinely
	// know the project up front.
	ProjectPath string

	// ProjectPathFunc resolves the project at call time rather than at startup.
	//
	// Needed because the right answer changes: the developer switches tabs, and
	// the project a tool should write to is the one that tab is bound to. A path
	// captured when Forge started describes where Forge was launched, which is
	// the project only by coincidence — and on Windows that coincidence produced
	// writes into C:\WINDOWS\system32.
	//
	// Nil falls back to ProjectPath.
	ProjectPathFunc func() string

	// AllowedTools restricts which built-in tools are registered.
	// An empty/nil slice means all tools are exposed (the default).
	AllowedTools []string

	// EnvironmentCommandRunner overrides the default OS process runner used by the
	// environment_detect and environment_run tools. Set this in tests to inject a
	// mock without spawning real WSL or Docker processes. Nil means use the real runner.
	EnvironmentCommandRunner CommandRunner

	// EnvironmentJobStore overrides where detached adaptive build jobs are persisted.
	// Tests inject a temp-backed store; production defaults to ProjectPath/.forge.
	EnvironmentJobStore *EnvironmentJobStore

	// VaultAccess provides the vault_inject tool with zero-knowledge secret injection.
	// Nil means vault_inject is registered but returns an error when called (vault not ready).
	// In production this is vault.GetGlobal(); in tests it is a mock VaultSecretInjector.
	VaultAccess VaultSecretInjector

	// VaultScriptRunner provides vault_run_script with a PTY-free subprocess executor.
	// Nil means vault_run_script is registered but returns an error when called.
	// In production this is &realVaultScriptRunner{}; in tests it is a mock VaultScriptRunner.
	VaultScriptRunner VaultScriptRunner

	// VaultNameLister provides vault_list with the names of all vault entries.
	// Nil means vault_list is registered but returns an error when called (vault not ready).
	// In production this is vault.GetGlobal(); in tests it is a mock VaultNameLister.
	// *vault.Vault satisfies this interface in addition to VaultSecretInjector —
	// both VaultAccess and VaultNameLister can point to the same vault singleton.
	VaultNameLister VaultNameLister
}

// NewServer creates a fully initialised MCP server.
// authToken is loaded by auth.LoadOrCreateToken() before this call.
// resolveProjectPath returns the project a tool should act on, asked fresh.
//
// Resolved per call rather than held, because the developer changes tabs and the
// answer changes with them.
func (deps Dependencies) resolveProjectPath() string {
	if deps.ProjectPathFunc != nil {
		if resolved := deps.ProjectPathFunc(); resolved != "" {
			return resolved
		}
	}
	return deps.ProjectPath
}

func NewServer(authToken string, deps Dependencies) *Server {
	broker := NewTaskBroker()

	srv := &Server{
		authToken: authToken,
		deps:      deps,
		tools:     make(map[string]ToolHandler),
		broker:    broker,
	}

	srv.tools = srv.buildToolRegistry(deps.AllowedTools)
	return srv
}

// ReloadAllowedTools applies a new allowed_tools list from forge.toml without
// restarting Forge. Existing in-flight tool calls complete normally — the lock
// is held only long enough to swap the map pointer. Passing an empty slice
// restores the default behaviour (all built-in tools are exposed).
func (srv *Server) ReloadAllowedTools(allowedTools []string) {
	freshTools := srv.buildToolRegistry(allowedTools)

	srv.toolsMu.Lock()
	previousTools := srv.tools
	srv.tools = freshTools
	srv.toolsMu.Unlock()

	// Log which tools were added or removed so the operator can verify the reload.
	logToolDiff(previousTools, freshTools)
}

// ValidateHTTPRequest returns true when the request carries the correct bearer
// token. Used by handlers that live outside the MCP server's HandleHTTP path
// (e.g. /api/mcp/tasks, /api/mcp/reload) but need the same auth guarantee.
func (srv *Server) ValidateHTTPRequest(r *http.Request) bool {
	return ValidateRequestToken(r, srv.authToken)
}

// Broker returns the task broker so the Forge agent loop can consume submitted tasks.
func (srv *Server) Broker() *TaskBroker {
	return srv.broker
}

// UIStatus holds the MCP information surfaced to the Forge UI status endpoint.
// It is intentionally separate from MCP protocol types — it is a plain HTTP
// response for the Forge frontend, not an MCP message.
type UIStatus struct {
	// IsEnabled reports whether the MCP server was started with a valid token.
	IsEnabled bool `json:"is_enabled"`

	// ActiveTools is the ordered list of tool names currently registered.
	ActiveTools []string `json:"active_tools"`

	// ToolCount is the number of active tools (convenience field for the UI).
	ToolCount int `json:"tool_count"`
}

// GetUIStatus returns a snapshot of the server's current state for display in
// the Forge command card panel. It does not require the MCP bearer token —
// callers are expected to use Forge's own auth middleware instead.
func (srv *Server) GetUIStatus() UIStatus {
	srv.toolsMu.RLock()
	toolNames := make([]string, 0, len(srv.tools))
	for name := range srv.tools {
		toolNames = append(toolNames, name)
	}
	srv.toolsMu.RUnlock()

	// Sort for stable, predictable ordering in the UI.
	sortStrings(toolNames)

	return UIStatus{
		IsEnabled:   true,
		ActiveTools: toolNames,
		ToolCount:   len(toolNames),
	}
}

// ExecuteTool calls a named tool directly, bypassing HTTP and auth.
// Intended for unit testing only — not exposed over HTTP.
func (srv *Server) ExecuteTool(name string, args map[string]any) (*CallToolResult, error) {
	srv.toolsMu.RLock()
	handler, found := srv.tools[name]
	srv.toolsMu.RUnlock()

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
// listChanged is true because forge.toml hot-reload can change the tool set at runtime.
func (srv *Server) handleInitialize(w http.ResponseWriter, req *JSONRPCRequest) {
	result := InitializeResult{
		ProtocolVersion: mcpProtocolVersion,
		ServerInfo:      MCPServerInfo{Name: serverName},
		Capabilities: MCPCapabilities{
			Tools: map[string]any{"listChanged": true},
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
// The tools map lock is held only for the initial lookup, not during Execute,
// so long-running tools (environment_run, terminal ops) do not block reloads.
func (srv *Server) handleToolsCall(w http.ResponseWriter, req *JSONRPCRequest) {
	callReq, err := decodeCallRequest(req.Params)
	if err != nil {
		srv.writeRPCError(w, req.ID, ErrorCodeInvalidParams,
			"invalid tools/call params: "+err.Error())
		return
	}

	// Snapshot the handler under a short read lock, then release before Execute.
	srv.toolsMu.RLock()
	handler, found := srv.tools[callReq.Name]
	srv.toolsMu.RUnlock()

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

// buildToolRegistry constructs a fresh tools map filtered by allowedTools.
// An empty or nil allowedTools slice means all built-in tools are exposed.
// This is called both at startup (inside NewServer) and on each hot-reload.
func (srv *Server) buildToolRegistry(allowedTools []string) map[string]ToolHandler {
	// Build the allowed-name set for O(1) lookup.
	isFilterActive := len(allowedTools) > 0
	allowedByName := make(map[string]bool, len(allowedTools))
	for _, toolName := range allowedTools {
		allowedByName[toolName] = true
	}

	// Use the injected runner if provided (for tests), otherwise use the real
	// OS process runner that shells out to wsl.exe / docker / cmd.exe.
	environmentRunner := srv.deps.EnvironmentCommandRunner
	if environmentRunner == nil {
		environmentRunner = &realCommandRunner{}
	}
	environmentJobStore := srv.deps.EnvironmentJobStore
	if environmentJobStore == nil {
		environmentJobStore = NewEnvironmentJobStore(srv.deps.ProjectPath)
	}
	environmentJobManager := NewEnvironmentJobManager(environmentRunner, environmentJobStore)

	// Use the injected VaultScriptRunner if provided (for tests), otherwise use
	// the real subprocess runner that shells out to pwsh / sh.
	vaultScriptRunner := srv.deps.VaultScriptRunner
	if vaultScriptRunner == nil {
		vaultScriptRunner = &realVaultScriptRunner{}
	}

	candidates := []ToolHandler{
		newTerminalSessionsTool(srv.deps.TermHandler),
		newTerminalExecuteTool(srv.deps.TermHandler),
		newTerminalReadTool(srv.deps.TermHandler),
		newFileReadTool(srv.deps.ProjectPath),
		newFileWriteTool(srv.deps.ProjectPath),
		newFileListTool(srv.deps.ProjectPath),
		newTaskSubmitTool(srv.broker),
		newWorkflowStatusTool(srv.deps.ProjectPath, srv.deps.WorkflowConfig),
		// These three write project state, so they resolve the project when they
		// run rather than when Forge started — the developer changes tabs, and
		// the right project changes with them.
		newWorkflowGateRecordTool(srv.deps.resolveProjectPath),
		newWorkflowPreflightTool(srv.deps.resolveProjectPath),
		newChangeBriefPublishTool(srv.deps.resolveProjectPath, srv.deps.TermHandler),
		newEnvironmentDetectTool(environmentRunner),
		newEnvironmentRunTool(environmentRunner, environmentJobManager),
		newEnvironmentJobsTool(environmentJobManager),
		newEnvironmentReadJobTool(environmentJobManager),
		newVaultInjectTool(srv.deps.VaultAccess),
		newVaultRunScriptTool(vaultScriptRunner),
		newVaultListTool(srv.deps.VaultNameLister),
	}

	registry := make(map[string]ToolHandler, len(candidates))
	for _, tool := range candidates {
		toolName := tool.Definition().Name
		if isFilterActive && !allowedByName[toolName] {
			log.Printf("[MCP] Tool %q disabled by forge.toml allowed_tools", toolName)
			continue
		}
		registry[toolName] = tool
	}
	return registry
}

// logToolDiff emits a log line for each tool added or removed between reloads,
// so operators can confirm that hot-reload applied the expected changes.
func logToolDiff(previousTools, freshTools map[string]ToolHandler) {
	for toolName := range freshTools {
		if _, wasPresent := previousTools[toolName]; !wasPresent {
			log.Printf("[MCP] Hot-reload: tool %q is now enabled", toolName)
		}
	}
	for toolName := range previousTools {
		if _, isPresent := freshTools[toolName]; !isPresent {
			log.Printf("[MCP] Hot-reload: tool %q is now disabled", toolName)
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildToolList constructs a ListToolsResult from the current registry.
// The read lock ensures this is safe to call concurrently with ReloadAllowedTools.
func (srv *Server) buildToolList() ListToolsResult {
	srv.toolsMu.RLock()
	defer srv.toolsMu.RUnlock()

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
