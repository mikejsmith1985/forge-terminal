// server.go implements the MCP server request dispatcher.
// It routes incoming JSON-RPC 2.0 requests to the appropriate handler
// and formats error responses according to the MCP specification.
package mcp

import (
	"encoding/json"
	"fmt"
)

// Server handles MCP protocol requests for a specific project directory.
// Each HTTP request creates a fresh Server with the project path; the server
// is stateless beyond the workflow ticket file on disk.
type Server struct {
	// projectPath is the root directory of the project being worked on.
	// Workflow ticket files are read/written relative to this path.
	projectPath string

	// serverVersion is reported during initialization.
	serverVersion string
}

// NewServer creates an MCP server instance scoped to the given project directory.
func NewServer(projectPath string) *Server {
	return &Server{
		projectPath:   projectPath,
		serverVersion: "1.0.0",
	}
}

// HandleRequest parses a JSON-RPC request and dispatches it to the correct handler.
// Returns a JSON-encoded response or an error if the request is malformed.
func (s *Server) HandleRequest(rawRequest []byte) ([]byte, error) {
	var req Request
	if err := json.Unmarshal(rawRequest, &req); err != nil {
		return s.encodeError(nil, ErrCodeParseError, "Parse error: "+err.Error()), nil
	}

	if req.JSONRPC != "2.0" {
		return s.encodeError(req.ID, ErrCodeInvalidRequest, "jsonrpc must be '2.0'"), nil
	}

	// Notifications (no ID) require no response.
	if req.ID == nil && req.Method == "notifications/initialized" {
		return nil, nil
	}

	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "tools/list":
		return s.handleToolsList(req)
	case "tools/call":
		return s.handleToolsCall(req)
	case "resources/list":
		return s.handleResourcesList(req)
	case "resources/read":
		return s.handleResourcesRead(req)
	default:
		return s.encodeError(req.ID, ErrCodeMethodNotFound,
			fmt.Sprintf("Method not found: %s", req.Method)), nil
	}
}

// handleInitialize responds to the MCP initialization handshake.
// The client sends its capabilities and receives the server's capabilities.
func (s *Server) handleInitialize(req Request) ([]byte, error) {
	result := InitializeResult{
		ProtocolVersion: "2024-11-05",
		Capabilities: ServerCaps{
			Tools:     &ToolsCap{},
			Resources: &ResourcesCap{},
		},
		ServerInfo: ServerInfo{
			Name:    "forge-workflow",
			Version: s.serverVersion,
		},
	}
	return s.encodeResult(req.ID, result)
}

// handleToolsList returns all available workflow enforcement tools.
func (s *Server) handleToolsList(req Request) ([]byte, error) {
	tools := listWorkflowTools()
	return s.encodeResult(req.ID, ToolsListResult{Tools: tools})
}

// handleToolsCall dispatches a tool invocation to the workflow tool engine.
func (s *Server) handleToolsCall(req Request) ([]byte, error) {
	var params ToolCallParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return s.encodeError(req.ID, ErrCodeInvalidParams, "Invalid params: "+err.Error()), nil
	}

	result, err := callWorkflowTool(s.projectPath, params.Name, params.Arguments)
	if err != nil {
		return s.encodeError(req.ID, ErrCodeInternalError, err.Error()), nil
	}

	return s.encodeResult(req.ID, result)
}

// handleResourcesList returns all available workflow resources.
func (s *Server) handleResourcesList(req Request) ([]byte, error) {
	resources := listWorkflowResources(s.projectPath)
	return s.encodeResult(req.ID, ResourcesListResult{Resources: resources})
}

// handleResourcesRead reads a specific workflow resource by URI.
func (s *Server) handleResourcesRead(req Request) ([]byte, error) {
	var params ResourceReadParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return s.encodeError(req.ID, ErrCodeInvalidParams, "Invalid params: "+err.Error()), nil
	}

	result, err := readWorkflowResource(s.projectPath, params.URI)
	if err != nil {
		return s.encodeError(req.ID, ErrCodeInternalError, err.Error()), nil
	}

	return s.encodeResult(req.ID, result)
}

// encodeResult wraps a result value in a JSON-RPC 2.0 success response.
func (s *Server) encodeResult(id json.RawMessage, result interface{}) ([]byte, error) {
	encoded, err := json.Marshal(result)
	if err != nil {
		return s.encodeError(id, ErrCodeInternalError, "Failed to encode result: "+err.Error()), nil
	}
	resp := Response{
		JSONRPC: "2.0",
		ID:      id,
		Result:  encoded,
	}
	return json.Marshal(resp)
}

// encodeError wraps an error in a JSON-RPC 2.0 error response.
func (s *Server) encodeError(id json.RawMessage, code int, message string) []byte {
	resp := Response{
		JSONRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
	}
	encoded, _ := json.Marshal(resp) // marshal cannot fail for this simple struct
	return encoded
}
