// tools_workflow.go implements the workflow_status MCP tool.
//
// This tool lets external AI clients (VS Code Copilot, Cursor, EZTest) query
// whether the current Forge project's Forge Workflow compliance is passing
// — without needing to access the filesystem directly or parse config files.
package mcp

import (
	"encoding/json"
	"fmt"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// workflowStatusTool runs a compliance scan on the project and returns the result.
type workflowStatusTool struct {
	projectPath    string
	workflowConfig workflow.WorkflowConfig
}

func newWorkflowStatusTool(projectPath string, config workflow.WorkflowConfig) ToolHandler {
	return &workflowStatusTool{
		projectPath:    projectPath,
		workflowConfig: config,
	}
}

func (t *workflowStatusTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "workflow_status",
		Description: "Scan the Forge Terminal project's Forge Workflow compliance and return the current status, score, and any active violations.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

func (t *workflowStatusTool) Execute(_ map[string]any) (*CallToolResult, error) {
	if t.projectPath == "" {
		return errorContent("no project path configured — cannot run workflow scan"), nil
	}

	report, err := workflow.ScanCompliance(t.projectPath, t.workflowConfig)
	if err != nil {
		return errorContent(fmt.Sprintf("workflow compliance scan failed: %v", err)), nil
	}

	output, marshalErr := json.MarshalIndent(report, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising compliance report: " + marshalErr.Error()), nil
	}

	return textContent(string(output)), nil
}
