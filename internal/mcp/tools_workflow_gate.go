// tools_workflow_gate.go — MCP tools that drive the runtime workflow ledger.
//
// Two tools are exposed:
//
//   - workflow_gate_record   — append a gate pass to .forge/workflow-ticket.json
//   - workflow_preflight_check — return whether all required gates are recorded
//
// The pre-commit git hook installed by scripts/install-workflow-hooks.* shells
// out to the same logic via `forge workflow preflight`, so the CLI and the
// hook always agree on whether the ledger is complete.
package mcp

import (
	"encoding/json"
	"fmt"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// workflowGateRecordTool persists a gate pass to the project ticket.
type workflowGateRecordTool struct {
	// resolveProjectPath is asked on every call rather than once at startup,
	// because the project a gate belongs to is the one the developer's tab is
	// in, and that changes as they switch tabs.
	resolveProjectPath func() string
}

func newWorkflowGateRecordTool(resolveProjectPath func() string) ToolHandler {
	return &workflowGateRecordTool{resolveProjectPath: resolveProjectPath}
}

func (t *workflowGateRecordTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "workflow_gate_record",
		Description: "Record a workflow gate pass with timestamped evidence in .forge/workflow-ticket.json. " +
			"Required gates: branch-created, tests-written, tests-passed. " +
			"The pre-commit hook reads this ledger and blocks commits when required gates are missing.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"taskId":   {"type": "string", "description": "Stable identifier for the current task. Starting a new taskId resets the ledger."},
				"gate":     {"type": "string", "description": "Gate identifier, e.g. 'branch-created', 'tests-written', 'tests-passed'."},
				"evidence": {"type": "string", "description": "Short human-readable proof. Empty values are rejected."},
				"branch":   {"type": "string", "description": "Optional: the git branch this work targets (recorded once per ticket)."}
			},
			"required": ["gate", "evidence"]
		}`),
	}
}

func (t *workflowGateRecordTool) Execute(args map[string]any) (*CallToolResult, error) {
	projectPath := t.resolveProjectPath()
	if projectPath == "" {
		return errorContent("no project path configured — cannot record gate"), nil
	}
	gate, _ := args["gate"].(string)
	evidence, _ := args["evidence"].(string)
	taskID, _ := args["taskId"].(string)
	branch, _ := args["branch"].(string)

	ticket, err := workflow.RecordGate(projectPath, taskID, gate, evidence)
	if err != nil {
		return errorContent(fmt.Sprintf("workflow_gate_record: %v", err)), nil
	}
	if branch != "" && ticket.Branch == "" {
		ticket.Branch = branch
		if err := workflow.SaveTicket(projectPath, ticket); err != nil {
			return errorContent(fmt.Sprintf("saving branch on ticket: %v", err)), nil
		}
	}
	body, marshalErr := json.MarshalIndent(ticket, "", "  ")
	if marshalErr != nil {
		return errorContent("encoding ticket: " + marshalErr.Error()), nil
	}
	return textContent(string(body)), nil
}

// workflowPreflightTool returns whether the ticket has all required gates.
type workflowPreflightTool struct {
	resolveProjectPath func() string
}

func newWorkflowPreflightTool(resolveProjectPath func() string) ToolHandler {
	return &workflowPreflightTool{resolveProjectPath: resolveProjectPath}
}

func (t *workflowPreflightTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "workflow_preflight_check",
		Description: "Return whether the project's workflow ticket has recorded every gate the pre-commit hook requires. " +
			"Use before attempting a commit to confirm runtime enforcement will allow it.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

func (t *workflowPreflightTool) Execute(_ map[string]any) (*CallToolResult, error) {
	projectPath := t.resolveProjectPath()
	if projectPath == "" {
		return errorContent("no project path configured — cannot run preflight"), nil
	}
	result, err := workflow.Preflight(projectPath)
	if err != nil {
		return errorContent(fmt.Sprintf("preflight: %v", err)), nil
	}
	body, marshalErr := json.MarshalIndent(result, "", "  ")
	if marshalErr != nil {
		return errorContent("encoding preflight result: " + marshalErr.Error()), nil
	}
	return textContent(string(body)), nil
}
