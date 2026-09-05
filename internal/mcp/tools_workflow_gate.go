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
	"errors"
	"fmt"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// workflowGateRecordTool persists a gate pass to the project ticket.
type workflowGateRecordTool struct {
	// resolveProjectPath is asked on every call rather than once at startup,
	// because the project a gate belongs to is the one the developer's tab is
	// in, and that changes as they switch tabs.
	//
	// It takes the calling session because with two projects open a
	// session-blind answer can be the wrong project, and a gate recorded in
	// the wrong project satisfies a commit there while the right one stays empty.
	resolveProjectPath func(sessionID string) string
}

func newWorkflowGateRecordTool(resolveProjectPath func(sessionID string) string) ToolHandler {
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
				"branch":   {"type": "string", "description": "Optional: the git branch this work targets. Stamped from HEAD automatically when omitted."},
				"sessionId": {"type": "string", "description": "The value of the FORGE_SESSION_ID environment variable in the terminal you are working in. Pass it: it routes the ledger to that tab's project when several are open."}
			},
			"required": ["gate", "evidence"]
		}`),
	}
}

func (t *workflowGateRecordTool) Execute(args map[string]any) (*CallToolResult, error) {
	projectPath := t.resolveProjectPath(stringArg(args, "sessionId"))
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
	return textContent(string(body) + hookInstallWarning(projectPath)), nil
}

// hookInstallWarning names the one install failure worth telling the agent
// about: another tool's hook occupies pre-commit, so the ledger is being
// written but nothing will read it at commit time. Silence here is how the
// gate went missing for months without anyone noticing.
func hookInstallWarning(projectPath string) string {
	installErr := workflow.EnsureHookInstalled(projectPath)
	if !errors.Is(installErr, workflow.ErrForeignPreCommitHook) {
		return ""
	}
	return "\n\nWARNING: " + installErr.Error()
}

// workflowPreflightTool returns whether the ticket has all required gates.
type workflowPreflightTool struct {
	resolveProjectPath func(sessionID string) string
}

func newWorkflowPreflightTool(resolveProjectPath func(sessionID string) string) ToolHandler {
	return &workflowPreflightTool{resolveProjectPath: resolveProjectPath}
}

func (t *workflowPreflightTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "workflow_preflight_check",
		Description: "Return whether the project's workflow ticket has recorded every gate the pre-commit hook requires. " +
			"Use before attempting a commit to confirm runtime enforcement will allow it.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"sessionId": {"type": "string", "description": "The value of the FORGE_SESSION_ID environment variable in the terminal you are working in, so the check reads that tab's project."}
			},
			"required": []
		}`),
	}
}

func (t *workflowPreflightTool) Execute(args map[string]any) (*CallToolResult, error) {
	projectPath := t.resolveProjectPath(stringArg(args, "sessionId"))
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
