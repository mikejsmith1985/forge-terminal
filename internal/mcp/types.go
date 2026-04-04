// Package mcp implements a Model Context Protocol server for Forge Terminal's
// workflow enforcement system. It exposes workflow-gated tools to Copilot CLI
// so agents can only perform actions appropriate to their current phase.
package mcp

import (
	"encoding/json"
	"time"
)

// ── JSON-RPC 2.0 wire types ─────────────────────────────────────────────────

// Request is a JSON-RPC 2.0 request object.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"` // omit for notifications
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is a JSON-RPC 2.0 response object.
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError is the error object within a JSON-RPC 2.0 response.
type RPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Standard JSON-RPC 2.0 error codes.
const (
	ErrCodeParseError     = -32700
	ErrCodeInvalidRequest = -32600
	ErrCodeMethodNotFound = -32601
	ErrCodeInvalidParams  = -32602
	ErrCodeInternalError  = -32603
)

// ── MCP protocol types ──────────────────────────────────────────────────────

// ServerInfo describes this MCP server to the client during initialization.
type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ClientInfo is sent by the client during initialization.
type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// InitializeParams are the parameters for the initialize request.
type InitializeParams struct {
	ProtocolVersion string     `json:"protocolVersion"`
	Capabilities    ClientCaps `json:"capabilities"`
	ClientInfo      ClientInfo `json:"clientInfo"`
}

// InitializeResult is the response to an initialize request.
type InitializeResult struct {
	ProtocolVersion string     `json:"protocolVersion"`
	Capabilities    ServerCaps `json:"capabilities"`
	ServerInfo      ServerInfo `json:"serverInfo"`
}

// ClientCaps describes what the client supports.
type ClientCaps struct{}

// ServerCaps describes what this server supports.
type ServerCaps struct {
	Tools     *ToolsCap     `json:"tools,omitempty"`
	Resources *ResourcesCap `json:"resources,omitempty"`
}

// ToolsCap signals that this server provides callable tools.
type ToolsCap struct{}

// ResourcesCap signals that this server provides readable resources.
type ResourcesCap struct{}

// Tool defines a callable tool exposed by the MCP server.
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

// InputSchema describes the JSON Schema for a tool's input parameters.
type InputSchema struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties,omitempty"`
	Required   []string            `json:"required,omitempty"`
}

// Property describes a single input parameter.
type Property struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

// ToolsListResult is the response to tools/list.
type ToolsListResult struct {
	Tools []Tool `json:"tools"`
}

// ToolCallParams are the parameters for tools/call.
type ToolCallParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// ToolCallResult is the response to tools/call.
type ToolCallResult struct {
	Content []ContentItem `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// ContentItem is a single piece of content in a tool result.
type ContentItem struct {
	Type string `json:"type"` // "text" for text content
	Text string `json:"text"`
}

// Resource defines a readable resource exposed by the MCP server.
type Resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description"`
	MIMEType    string `json:"mimeType"`
}

// ResourcesListResult is the response to resources/list.
type ResourcesListResult struct {
	Resources []Resource `json:"resources"`
}

// ResourceReadParams are the parameters for resources/read.
type ResourceReadParams struct {
	URI string `json:"uri"`
}

// ResourceReadResult is the response to resources/read.
type ResourceReadResult struct {
	Contents []ResourceContent `json:"contents"`
}

// ResourceContent is a single piece of content in a resource read result.
type ResourceContent struct {
	URI      string `json:"uri"`
	MIMEType string `json:"mimeType"`
	Text     string `json:"text"`
}

// ── Workflow domain types ───────────────────────────────────────────────────

// WorkflowPhase represents a stage in the enforced development workflow.
type WorkflowPhase string

const (
	// PhaseTicket is the initial phase: task intake only, no code changes.
	PhaseTicket WorkflowPhase = "ticket"
	// PhasePlanning is the planning phase: read-only analysis, no source writes.
	PhasePlanning WorkflowPhase = "planning"
	// PhaseImplementation is the coding phase: source writes allowed.
	PhaseImplementation WorkflowPhase = "implementation"
	// PhaseReview is the final phase: diff, PR creation, no new code.
	PhaseReview WorkflowPhase = "review"
	// PhaseComplete marks a fully reviewed and merged workflow.
	PhaseComplete WorkflowPhase = "complete"
)

// phaseOrder defines the required progression sequence.
// An agent cannot skip phases.
var phaseOrder = []WorkflowPhase{
	PhaseTicket,
	PhasePlanning,
	PhaseImplementation,
	PhaseReview,
	PhaseComplete,
}

// PhaseEntry records when a workflow phase was entered and exited.
type PhaseEntry struct {
	Phase       WorkflowPhase `json:"phase"`
	EnteredAt   time.Time     `json:"enteredAt"`
	CompletedAt *time.Time    `json:"completedAt,omitempty"`
}

// WorkflowTicket represents an active development task with full phase history.
// It is persisted as .forge/workflow-ticket.json in the project directory.
type WorkflowTicket struct {
	ID           string        `json:"id"`
	Title        string        `json:"title"`
	TaskType     string        `json:"taskType"` // "feature", "fix", "refactor", "chore"
	Branch       string        `json:"branch"`
	Phase        WorkflowPhase `json:"phase"`
	Plan         string        `json:"plan,omitempty"`
	CreatedAt    time.Time     `json:"createdAt"`
	UpdatedAt    time.Time     `json:"updatedAt"`
	PhaseHistory []PhaseEntry  `json:"phaseHistory"`
}

// IsPhaseAllowed returns true if moving to targetPhase is a valid transition
// from the ticket's current phase. Phases must advance in order; no skipping.
func (ticket *WorkflowTicket) IsPhaseAllowed(targetPhase WorkflowPhase) bool {
	currentIndex := -1
	targetIndex := -1
	for i, phase := range phaseOrder {
		if phase == ticket.Phase {
			currentIndex = i
		}
		if phase == targetPhase {
			targetIndex = i
		}
	}
	// Target must be exactly one step ahead of current.
	return currentIndex >= 0 && targetIndex == currentIndex+1
}

// AllowedActions returns human-readable descriptions of what the current phase permits.
func (ticket *WorkflowTicket) AllowedActions() []string {
	switch ticket.Phase {
	case PhaseTicket:
		return []string{"Read files", "Create workflow ticket", "Define branch name"}
	case PhasePlanning:
		return []string{"Read source files", "Write plan/documentation files", "Analyze architecture"}
	case PhaseImplementation:
		return []string{"Read/write source files", "Run tests", "Git add/commit"}
	case PhaseReview:
		return []string{"Run git diff", "Create pull request", "Address review comments"}
	default:
		return []string{"Workflow complete"}
	}
}
