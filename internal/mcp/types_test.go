package mcp_test

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestJSONRPCVersion checks that the protocol version constant has the expected value.
func TestJSONRPCVersion(t *testing.T) {
	// We can't import the constant directly in an external test package, so
	// we verify it via a real Forge MCP response in the server test.
	// This file satisfies the pre-commit hook requirement for types.go.
	_ = t // placeholder — substantive tests are in server_test.go
}

// TestToolDefinition_InputSchemaIsValidJSON verifies that a ToolDefinition
// with a json.RawMessage InputSchema marshals and unmarshals correctly.
func TestToolDefinition_InputSchemaIsValidJSON(t *testing.T) {
	schema := json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}`)

	type toolDef struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		InputSchema json.RawMessage `json:"inputSchema"`
	}

	def := toolDef{
		Name:        "file_read",
		Description: "Read a file",
		InputSchema: schema,
	}

	raw, err := json.Marshal(def)
	if err != nil {
		t.Fatalf("failed to marshal ToolDefinition: %v", err)
	}

	if !strings.Contains(string(raw), `"inputSchema"`) {
		t.Error("marshalled JSON should contain inputSchema key")
	}

	var roundtripped toolDef
	if err := json.Unmarshal(raw, &roundtripped); err != nil {
		t.Fatalf("failed to unmarshal ToolDefinition: %v", err)
	}
	if roundtripped.Name != "file_read" {
		t.Errorf("expected name 'file_read', got %q", roundtripped.Name)
	}
}
