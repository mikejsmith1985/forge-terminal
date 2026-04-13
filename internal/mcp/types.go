// Package mcp implements a Model Context Protocol server for Forge Terminal.
//
// It exposes Forge Terminal's core capabilities — terminal session management,
// file operations, task queuing, and workflow compliance — as MCP tools that any
// MCP-capable AI client (VS Code Copilot, Cursor, Claude Code, EZTest) can call
// without leaving their own IDE or tool.
//
// Transport: Streamable HTTP (POST /api/mcp)
// Protocol:  JSON-RPC 2.0 (MCP spec version 2024-11-05)
// Auth:      Bearer token (stored at ~/.forge/mcp-token, auto-generated on first run)
package mcp

import "encoding/json"

// ── JSON-RPC 2.0 Standard Error Codes ──────────────────────────────────────

const (
	// ErrorCodeParseError is returned when the request body is not valid JSON.
	ErrorCodeParseError = -32700

	// ErrorCodeInvalidRequest is returned when the JSON-RPC envelope is malformed.
	ErrorCodeInvalidRequest = -32600

	// ErrorCodeMethodNotFound is returned when the method name is not recognized.
	ErrorCodeMethodNotFound = -32601

	// ErrorCodeInvalidParams is returned when required tool arguments are missing.
	ErrorCodeInvalidParams = -32602

	// ErrorCodeInternalError is returned for unexpected server-side failures.
	ErrorCodeInternalError = -32603
)

// JSONRPCVersion is the protocol version all messages must declare.
const JSONRPCVersion = "2.0"

// ── JSON-RPC 2.0 Envelope Types ────────────────────────────────────────────

// JSONRPCRequest is the inbound message envelope from an MCP client.
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// JSONRPCResponse is the outbound message envelope returned to the MCP client.
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  interface{}     `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCError carries the numeric code and human-readable description
// when a request cannot be fulfilled.
type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ── MCP Protocol Types ──────────────────────────────────────────────────────

// InitializeResult is the response to the MCP "initialize" handshake.
// It tells the connecting client which protocol version and capabilities are active.
type InitializeResult struct {
	ProtocolVersion string           `json:"protocolVersion"`
	ServerInfo      MCPServerInfo    `json:"serverInfo"`
	Capabilities    MCPCapabilities  `json:"capabilities"`
}

// MCPServerInfo identifies this server to connecting clients during the handshake.
type MCPServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// MCPCapabilities declares which MCP feature categories this server supports.
// Tools are active; resources and prompt templates are not offered.
type MCPCapabilities struct {
	// Tools signals that this server exposes callable tools.
	// listChanged: false means the tool list is static (no runtime updates).
	Tools map[string]any `json:"tools,omitempty"`
}

// ── Tool Definition & Call Types ───────────────────────────────────────────

// ToolDefinition describes one advertised tool — its name, purpose, and the
// JSON Schema that clients use to build valid argument objects.
type ToolDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// ListToolsResult is the response to the "tools/list" method.
type ListToolsResult struct {
	Tools []ToolDefinition `json:"tools"`
}

// CallToolRequest holds the parsed arguments from a "tools/call" request.
type CallToolRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

// CallToolResult carries the tool's text output back to the client.
// IsError=true signals a tool-level failure so the AI can explain it conversationally.
type CallToolResult struct {
	Content []ToolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// ToolContent is a single content item inside a CallToolResult.
// This server only emits "text" type content.
type ToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
