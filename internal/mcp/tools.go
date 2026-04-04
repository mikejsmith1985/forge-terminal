// tools.go implements the workflow enforcement tools exposed via MCP.
// Each tool represents one workflow operation agents can perform.
// Tools are phase-gated: attempting an out-of-phase operation returns an
// explicit refusal message rather than silently failing.
package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// workflowTicketPath returns the path to the workflow ticket file
// within the given project directory.
func workflowTicketPath(projectPath string) string {
	return filepath.Join(projectPath, ".forge", "workflow-ticket.json")
}

// listWorkflowTools returns all tool definitions for the MCP tools/list response.
func listWorkflowTools() []Tool {
	return []Tool{
		{
			Name:        "workflow_get_state",
			Description: "Get the current workflow state, active ticket, phase, and permitted actions. Call this at the start of every session.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {Type: "string", Description: "Project directory path (defaults to current directory)"},
				},
			},
		},
		{
			Name:        "workflow_create_ticket",
			Description: "Create a new workflow ticket to begin a development task. Required before any code changes.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path":     {Type: "string", Description: "Project directory path"},
					"title":    {Type: "string", Description: "Short description of the task (e.g. 'Add user login feature')"},
					"taskType": {Type: "string", Description: "Task category: feature, fix, refactor, or chore"},
					"branch":   {Type: "string", Description: "Git branch name (e.g. feature/add-user-login)"},
				},
				Required: []string{"title", "taskType", "branch"},
			},
		},
		{
			Name:        "workflow_advance_phase",
			Description: "Advance the workflow to the next phase. Phases must progress in order: ticket → planning → implementation → review → complete.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path":      {Type: "string", Description: "Project directory path"},
					"nextPhase": {Type: "string", Description: "Target phase: planning, implementation, review, or complete"},
					"summary":   {Type: "string", Description: "Brief summary of what was accomplished in the current phase"},
					"plan":      {Type: "string", Description: "Implementation plan (required when advancing to implementation phase)"},
				},
				Required: []string{"nextPhase"},
			},
		},
		{
			Name:        "workflow_check_permission",
			Description: "Check whether a specific action is permitted in the current workflow phase. Use this before performing sensitive operations.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path":   {Type: "string", Description: "Project directory path"},
					"action": {Type: "string", Description: "Action to check: write_source, git_commit, create_pr, write_plan, read_files"},
				},
				Required: []string{"action"},
			},
		},
	}
}

// callWorkflowTool dispatches a tool call by name to its implementation.
func callWorkflowTool(projectPath, toolName string, args map[string]interface{}) (ToolCallResult, error) {
	// Resolve project path from args if provided, falling back to the server's path.
	if pathArg, ok := args["path"].(string); ok && pathArg != "" {
		projectPath = pathArg
	}

	switch toolName {
	case "workflow_get_state":
		return toolGetState(projectPath)
	case "workflow_create_ticket":
		return toolCreateTicket(projectPath, args)
	case "workflow_advance_phase":
		return toolAdvancePhase(projectPath, args)
	case "workflow_check_permission":
		return toolCheckPermission(projectPath, args)
	default:
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: fmt.Sprintf("Unknown tool: %s", toolName)}},
		}, nil
	}
}

// toolGetState reads the current workflow ticket and returns a human-readable summary.
func toolGetState(projectPath string) (ToolCallResult, error) {
	ticket, err := readTicket(projectPath)
	if err != nil {
		// No ticket means the workflow hasn't started yet.
		return ToolCallResult{
			Content: []ContentItem{{
				Type: "text",
				Text: "No active workflow ticket.\n\nYou must create a ticket before performing any work.\nUse the workflow_create_ticket tool to begin.",
			}},
		}, nil
	}

	allowedActionsList := ticket.AllowedActions()
	summary := fmt.Sprintf(
		"Workflow Ticket: %s\nTitle: %s\nType: %s\nBranch: %s\nPhase: %s\nCreated: %s\n\nPermitted actions in %s phase:\n- %s",
		ticket.ID,
		ticket.Title,
		ticket.TaskType,
		ticket.Branch,
		ticket.Phase,
		ticket.CreatedAt.Format(time.RFC3339),
		ticket.Phase,
		strings.Join(allowedActionsList, "\n- "),
	)

	if ticket.Plan != "" {
		summary += "\n\nApproved Plan:\n" + ticket.Plan
	}

	return ToolCallResult{
		Content: []ContentItem{{Type: "text", Text: summary}},
	}, nil
}

// toolCreateTicket creates a new workflow ticket file on disk.
func toolCreateTicket(projectPath string, args map[string]interface{}) (ToolCallResult, error) {
	title, _ := args["title"].(string)
	taskType, _ := args["taskType"].(string)
	branch, _ := args["branch"].(string)

	if title == "" || taskType == "" || branch == "" {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: "title, taskType, and branch are required"}},
		}, nil
	}

	// Reject if a ticket already exists in an active phase.
	if existingTicket, err := readTicket(projectPath); err == nil {
		if existingTicket.Phase != PhaseComplete {
			return ToolCallResult{
				IsError: true,
				Content: []ContentItem{{
					Type: "text",
					Text: fmt.Sprintf("A workflow ticket already exists (phase: %s). Complete or close it before creating a new one.", existingTicket.Phase),
				}},
			}, nil
		}
	}

	now := time.Now().UTC()
	ticket := WorkflowTicket{
		ID:        fmt.Sprintf("WF-%s", now.Format("20060102-150405")),
		Title:     title,
		TaskType:  taskType,
		Branch:    branch,
		Phase:     PhaseTicket,
		CreatedAt: now,
		UpdatedAt: now,
		PhaseHistory: []PhaseEntry{
			{Phase: PhaseTicket, EnteredAt: now},
		},
	}

	if err := writeTicket(projectPath, &ticket); err != nil {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: "Failed to write ticket: " + err.Error()}},
		}, nil
	}

	return ToolCallResult{
		Content: []ContentItem{{
			Type: "text",
			Text: fmt.Sprintf(
				"✅ Workflow ticket created: %s\n\nTitle: %s\nBranch: %s\nPhase: ticket\n\nNext step: Switch to the Planner agent to create an implementation plan.\nRun: copilot --agent=planner",
				ticket.ID, ticket.Title, ticket.Branch,
			),
		}},
	}, nil
}

// toolAdvancePhase validates and advances the workflow to the next phase.
func toolAdvancePhase(projectPath string, args map[string]interface{}) (ToolCallResult, error) {
	nextPhaseStr, _ := args["nextPhase"].(string)
	summary, _ := args["summary"].(string)
	plan, _ := args["plan"].(string)

	nextPhase := WorkflowPhase(nextPhaseStr)

	ticket, err := readTicket(projectPath)
	if err != nil {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: "No active workflow ticket. Create one first."}},
		}, nil
	}

	if !ticket.IsPhaseAllowed(nextPhase) {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{
				Type: "text",
				Text: fmt.Sprintf(
					"❌ Cannot advance to %s from %s. Phases must progress in order: ticket → planning → implementation → review → complete.",
					nextPhase, ticket.Phase,
				),
			}},
		}, nil
	}

	// Require a plan when entering implementation.
	if nextPhase == PhaseImplementation && plan == "" {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: "A plan is required before advancing to implementation. Include the 'plan' argument."}},
		}, nil
	}

	now := time.Now().UTC()

	// Mark current phase as completed.
	for i := range ticket.PhaseHistory {
		if ticket.PhaseHistory[i].Phase == ticket.Phase && ticket.PhaseHistory[i].CompletedAt == nil {
			ticket.PhaseHistory[i].CompletedAt = &now
		}
	}

	// Add new phase entry.
	ticket.Phase = nextPhase
	ticket.UpdatedAt = now
	ticket.PhaseHistory = append(ticket.PhaseHistory, PhaseEntry{
		Phase:     nextPhase,
		EnteredAt: now,
	})

	// Store the approved plan when entering implementation.
	if plan != "" {
		ticket.Plan = plan
	}

	if err := writeTicket(projectPath, ticket); err != nil {
		return ToolCallResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: "Failed to update ticket: " + err.Error()}},
		}, nil
	}

	nextStepInstructions := nextStepMessage(nextPhase)

	return ToolCallResult{
		Content: []ContentItem{{
			Type: "text",
			Text: fmt.Sprintf(
				"✅ Advanced to %s phase.\n\n%s\n\n%s",
				nextPhase, summary, nextStepInstructions,
			),
		}},
	}, nil
}

// toolCheckPermission tells the agent whether an action is allowed in the current phase.
func toolCheckPermission(projectPath string, args map[string]interface{}) (ToolCallResult, error) {
	action, _ := args["action"].(string)

	ticket, err := readTicket(projectPath)
	if err != nil {
		return ToolCallResult{
			Content: []ContentItem{{
				Type: "text",
				Text: fmt.Sprintf("❌ Action '%s' is NOT permitted: No active workflow ticket exists.", action),
			}},
		}, nil
	}

	isAllowed, reason := isActionPermittedInPhase(action, ticket.Phase)
	if isAllowed {
		return ToolCallResult{
			Content: []ContentItem{{
				Type: "text",
				Text: fmt.Sprintf("✅ Action '%s' is permitted in the %s phase.", action, ticket.Phase),
			}},
		}, nil
	}

	return ToolCallResult{
		Content: []ContentItem{{
			Type: "text",
			Text: fmt.Sprintf(
				"❌ Action '%s' is NOT permitted in the %s phase.\nReason: %s\n\nAllowed actions: %s",
				action, ticket.Phase, reason, strings.Join(ticket.AllowedActions(), ", "),
			),
		}},
	}, nil
}

// isActionPermittedInPhase returns whether an action is allowed in a given phase,
// with a human-readable explanation when it is not.
func isActionPermittedInPhase(action string, phase WorkflowPhase) (bool, string) {
	switch action {
	case "write_source":
		if phase == PhaseImplementation {
			return true, ""
		}
		return false, "Source file writes are only permitted in the implementation phase"
	case "git_commit":
		if phase == PhaseImplementation || phase == PhaseReview {
			return true, ""
		}
		return false, "Git commits are only permitted in implementation or review phases"
	case "create_pr":
		if phase == PhaseReview {
			return true, ""
		}
		return false, "Pull request creation is only permitted in the review phase"
	case "write_plan":
		if phase == PhasePlanning || phase == PhaseImplementation {
			return true, ""
		}
		return false, "Plan file writes are only permitted in planning or implementation phases"
	case "read_files":
		// Reading is always permitted — agents need context in all phases.
		return true, ""
	default:
		// Unknown actions are rejected with a helpful message.
		return false, fmt.Sprintf("Unknown action '%s'. Known actions: write_source, git_commit, create_pr, write_plan, read_files", action)
	}
}

// nextStepMessage returns context-specific guidance for after a phase advance.
func nextStepMessage(phase WorkflowPhase) string {
	switch phase {
	case PhasePlanning:
		return "Switch to the Planner agent: copilot --agent=planner"
	case PhaseImplementation:
		return "Switch to the Implementer agent: copilot --agent=implementer"
	case PhaseReview:
		return "Switch to the Reviewer agent: copilot --agent=reviewer"
	case PhaseComplete:
		return "Workflow complete. The pull request has been created."
	default:
		return ""
	}
}

// ── Ticket file I/O ─────────────────────────────────────────────────────────

// readTicket reads and parses the workflow ticket from disk.
func readTicket(projectPath string) (*WorkflowTicket, error) {
	ticketPath := workflowTicketPath(projectPath)
	rawBytes, err := os.ReadFile(ticketPath)
	if err != nil {
		return nil, fmt.Errorf("no ticket found at %s: %w", ticketPath, err)
	}

	var ticket WorkflowTicket
	if err := json.Unmarshal(rawBytes, &ticket); err != nil {
		return nil, fmt.Errorf("ticket file is corrupted: %w", err)
	}

	return &ticket, nil
}

// writeTicket serializes and persists a workflow ticket to disk.
// It creates the .forge directory if it does not already exist.
func writeTicket(projectPath string, ticket *WorkflowTicket) error {
	forgeDir := filepath.Join(projectPath, ".forge")
	if err := os.MkdirAll(forgeDir, 0755); err != nil {
		return fmt.Errorf("failed to create .forge directory: %w", err)
	}

	encoded, err := json.MarshalIndent(ticket, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize ticket: %w", err)
	}

	return os.WriteFile(workflowTicketPath(projectPath), encoded, 0644)
}
