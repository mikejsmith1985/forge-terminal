// tools_change_brief.go — the MCP tool an agent uses to publish a change brief.
//
// This is the seam the whole feature rests on.  Forge owns the terminal and
// sees every byte a CLI emits, but an agent CLI is a full-screen program: what
// lands in the scrollback is escape sequences and screen redraws, not a
// transcript.  Recovering "the assistant's explanation" from that is guesswork,
// and guesswork cannot gate a commit without either blocking correct work or
// waving bad work through.
//
// A tool call sidesteps the problem entirely.  Forge receives exactly the
// document the agent meant to send, can render it faithfully, and — the part
// that matters — can tell when no document arrived.  Absence is what makes the
// commit gate possible.
//
// Because MCP is spoken by every CLI under consideration, nothing here is
// specific to one assistant.
package mcp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// briefBroadcaster pushes a published brief to the frontend.
//
// Declared as an interface rather than taking the terminal handler directly so
// this tool can be tested without a running terminal, and so a brief that has
// nowhere to render still publishes.
type briefBroadcaster interface {
	BroadcastJSONToSession(sessionID string, payload any) bool
}

// changeBriefPublishTool stores a brief, records its gate, and shows it.
type changeBriefPublishTool struct {
	projectPath string
	broadcaster briefBroadcaster
}

func newChangeBriefPublishTool(projectPath string, broadcaster briefBroadcaster) ToolHandler {
	return &changeBriefPublishTool{projectPath: projectPath, broadcaster: broadcaster}
}

func (t *changeBriefPublishTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "change_brief_publish",
		Description: "Publish a visual change brief for a completed code change. " +
			"Records the brief-published gate and renders the brief in Forge Terminal. " +
			"A commit is refused when no brief was published for the task. " +
			"Panels must carry real content: an empty or near-empty panel is rejected.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"taskId":         {"type": "string", "description": "The task this brief explains. Must match the taskId used for the other workflow gates."},
				"headline":       {"type": "string", "description": "The change in one line, as you would say it out loud."},
				"whatChanged":    {"type": "string", "description": "The change itself, in the fewest words that survive."},
				"whyItChanged":   {"type": "string", "description": "The reason it was made."},
				"whatCouldBreak": {"type": "string", "description": "The risk or assumption. Say 'nothing, because ...' if there genuinely is none."},
				"isRoutine":      {"type": "boolean", "description": "Claim explicitly that the change had no real decision in it. Required when decisions is empty."},
				"filesTouched":   {"type": "integer", "description": "How many files changed. A count, not a list."},
				"sessionId":      {"type": "string", "description": "Optional: the terminal session whose panel should show this brief."},
				"decisions": {
					"type": "array",
					"description": "The forks that mattered. Omit only when isRoutine is true.",
					"items": {
						"type": "object",
						"properties": {
							"chose":        {"type": "string", "description": "The path taken."},
							"insteadOf":    {"type": "string", "description": "The viable alternative not taken. Must differ from chose."},
							"because":      {"type": "string", "description": "Why, in words a non-specialist would follow."},
							"openQuestion": {"type": "string", "description": "What the developer might reasonably push back on."}
						},
						"required": ["chose", "insteadOf", "because", "openQuestion"]
					}
				}
			},
			"required": ["taskId", "headline", "whatChanged", "whyItChanged", "whatCouldBreak", "isRoutine"]
		}`),
	}
}

func (t *changeBriefPublishTool) Execute(args map[string]any) (*CallToolResult, error) {
	if t.projectPath == "" {
		return errorContent("no project path configured — cannot publish a brief"), nil
	}

	brief, err := briefFromArgs(args)
	if err != nil {
		return errorContent(fmt.Sprintf("change_brief_publish: %v", err)), nil
	}

	// Stored first.  A brief that failed validation must leave nothing behind,
	// or a rejected document would still unblock the commit.
	if err := workflow.SaveBrief(t.projectPath, brief); err != nil {
		return errorContent(fmt.Sprintf("change_brief_publish: %v", err)), nil
	}

	evidence := fmt.Sprintf("brief %s published for task %s", brief.BriefID, brief.TaskID)
	if _, err := workflow.RecordGate(t.projectPath, brief.TaskID, workflow.GateBriefPublished, evidence); err != nil {
		return errorContent(fmt.Sprintf("recording the brief-published gate: %v", err)), nil
	}

	// Rendering is best-effort by design.  A brief that cannot be shown is
	// still recorded, so the commit gate stays truthful when no session is
	// attached or the panel is unavailable.
	wasShown := t.broadcastBrief(brief)

	body, marshalErr := json.MarshalIndent(map[string]any{
		"briefId":  brief.BriefID,
		"taskId":   brief.TaskID,
		"rendered": wasShown,
	}, "", "  ")
	if marshalErr != nil {
		return errorContent("encoding the publish result: " + marshalErr.Error()), nil
	}
	return textContent(string(body)), nil
}

// broadcastBrief shows the brief, reporting whether anywhere received it.
func (t *changeBriefPublishTool) broadcastBrief(brief *workflow.ChangeBrief) bool {
	if t.broadcaster == nil || brief.SessionID == "" {
		return false
	}
	return t.broadcaster.BroadcastJSONToSession(brief.SessionID, map[string]any{
		"type":  "CHANGE_BRIEF",
		"brief": brief,
	})
}

// briefFromArgs builds a brief from tool arguments.
//
// Argument extraction is separated from publication so a malformed call is
// reported as a rejection the agent can act on, rather than as a failure part
// way through storing something.
func briefFromArgs(args map[string]any) (*workflow.ChangeBrief, error) {
	taskID := strings.TrimSpace(stringArg(args, "taskId"))
	if taskID == "" {
		return nil, fmt.Errorf("taskId is required: without it the brief cannot gate a commit")
	}

	isRoutine, _ := args["isRoutine"].(bool)

	decisions, err := decisionsFromArgs(args["decisions"])
	if err != nil {
		return nil, err
	}

	brief := &workflow.ChangeBrief{
		// Keyed by task, so republishing a correction replaces the brief rather
		// than leaving the developer two versions to reconcile.
		BriefID:        "brief-" + taskID,
		SessionID:      stringArg(args, "sessionId"),
		TaskID:         taskID,
		Headline:       stringArg(args, "headline"),
		WhatChanged:    stringArg(args, "whatChanged"),
		WhyItChanged:   stringArg(args, "whyItChanged"),
		WhatCouldBreak: stringArg(args, "whatCouldBreak"),
		Decisions:      decisions,
		IsRoutine:      isRoutine,
		FilesTouched:   intArg(args, "filesTouched"),
	}

	// Validated here as well as in the store, so the agent gets the field name
	// back rather than a storage error mentioning a path it cannot act on.
	if err := brief.Validate(); err != nil {
		return nil, err
	}
	return brief, nil
}

// decisionsFromArgs converts the decisions argument into typed values.
func decisionsFromArgs(raw any) ([]workflow.Decision, error) {
	if raw == nil {
		return nil, nil
	}

	entries, isList := raw.([]any)
	if !isList {
		return nil, fmt.Errorf("decisions must be a list")
	}

	decisions := make([]workflow.Decision, 0, len(entries))
	for index, entry := range entries {
		fields, isObject := entry.(map[string]any)
		if !isObject {
			return nil, fmt.Errorf("decision %d must be an object", index)
		}
		decisions = append(decisions, workflow.Decision{
			Chose:        stringArg(fields, "chose"),
			InsteadOf:    stringArg(fields, "insteadOf"),
			Because:      stringArg(fields, "because"),
			OpenQuestion: stringArg(fields, "openQuestion"),
		})
	}
	return decisions, nil
}

// stringArg reads a string argument, treating a missing value as empty.
func stringArg(args map[string]any, name string) string {
	value, _ := args[name].(string)
	return value
}

// intArg reads a whole-number argument.
//
// JSON decoding yields float64 for every number, so both forms are accepted
// rather than making the caller guess which one this tool wants.
func intArg(args map[string]any, name string) int {
	switch value := args[name].(type) {
	case float64:
		return int(value)
	case int:
		return value
	default:
		return 0
	}
}
