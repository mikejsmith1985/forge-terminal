// tools_tasks.go implements the task_submit MCP tool.
//
// task_submit is the MCP replacement for the old EZTest file-drop mechanism.
// Instead of writing .forge/pending-tasks/*.md files and hoping Forge polls them,
// EZTest (and any other MCP client) calls this tool to submit structured work
// items directly to Forge's in-memory task broker. Forge acknowledges immediately
// with a task ID; the submitter can monitor status via GET /api/mcp/tasks/{id}.
package mcp

import (
	"encoding/json"
	"fmt"
)

// taskSubmitTool submits a work item to the Forge agent loop via the TaskBroker.
type taskSubmitTool struct {
	broker *TaskBroker
}

func newTaskSubmitTool(broker *TaskBroker) ToolHandler {
	return &taskSubmitTool{broker: broker}
}

func (t *taskSubmitTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "task_submit",
		Description: "Submit a structured task to the Forge Terminal agent loop. " +
			"Returns a task ID immediately. The agent processes the task asynchronously. " +
			"Use this instead of writing files to .forge/pending-tasks/.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"type": {
					"type": "string",
					"description": "Task category: 'bug-report', 'test-request', 'code-fix', or any custom string."
				},
				"payload": {
					"type": "string",
					"description": "Full task description. Markdown is supported and encouraged."
				},
				"source": {
					"type": "string",
					"description": "Identifier for the submitting tool (e.g. 'eztest-mcp', 'copilot-chat'). Used for audit logging."
				}
			},
			"required": ["type", "payload"]
		}`),
	}
}

func (t *taskSubmitTool) Execute(args map[string]any) (*CallToolResult, error) {
	taskType, payload, source, err := parseTaskArgs(args)
	if err != nil {
		return errorContent(err.Error()), nil
	}

	created := t.broker.Submit(taskType, payload, source)

	summary := map[string]any{
		"taskId":      created.ID,
		"status":      created.Status,
		"type":        created.Type,
		"source":      created.Source,
		"submittedAt": created.SubmittedAt,
	}
	output, marshalErr := json.MarshalIndent(summary, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising task response: " + marshalErr.Error()), nil
	}

	return textContent(string(output)), nil
}

// parseTaskArgs validates and extracts the arguments for task_submit.
func parseTaskArgs(args map[string]any) (taskType string, payload string, source string, err error) {
	rawType, ok := args["type"]
	if !ok {
		return "", "", "", fmt.Errorf("type is required")
	}
	taskType, ok = rawType.(string)
	if !ok || taskType == "" {
		return "", "", "", fmt.Errorf("type must be a non-empty string")
	}

	rawPayload, ok := args["payload"]
	if !ok {
		return "", "", "", fmt.Errorf("payload is required")
	}
	payload, ok = rawPayload.(string)
	if !ok || payload == "" {
		return "", "", "", fmt.Errorf("payload must be a non-empty string")
	}

	// source is optional — default to "unknown".
	source = "unknown"
	if rawSource, hasSource := args["source"]; hasSource {
		if srcStr, isStr := rawSource.(string); isStr && srcStr != "" {
			source = srcStr
		}
	}

	return taskType, payload, source, nil
}
