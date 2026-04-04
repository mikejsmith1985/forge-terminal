// resources.go implements the MCP resources for the workflow enforcement system.
// Resources are read-only views into the workflow state that agents can poll
// without consuming a tool call quota.
package mcp

import (
	"encoding/json"
	"fmt"
	"strings"
)

// listWorkflowResources returns the resource catalog for the given project.
func listWorkflowResources(projectPath string) []Resource {
	return []Resource{
		{
			URI:         "workflow://state",
			Name:        "Workflow State",
			Description: "Current workflow ticket, active phase, and permitted actions",
			MIMEType:    "application/json",
		},
		{
			URI:         "workflow://phases",
			Name:        "Phase Definitions",
			Description: "All workflow phases with their permitted actions and agent assignments",
			MIMEType:    "text/plain",
		},
	}
}

// readWorkflowResource reads a workflow resource by its URI.
func readWorkflowResource(projectPath, uri string) (ResourceReadResult, error) {
	switch uri {
	case "workflow://state":
		return resourceWorkflowState(projectPath)
	case "workflow://phases":
		return resourcePhaseDefinitions()
	default:
		return ResourceReadResult{}, fmt.Errorf("unknown resource URI: %s", uri)
	}
}

// resourceWorkflowState returns the full current ticket as JSON, or a
// "no ticket" message if none exists.
func resourceWorkflowState(projectPath string) (ResourceReadResult, error) {
	ticket, err := readTicket(projectPath)
	if err != nil {
		noTicketPayload := map[string]interface{}{
			"hasActiveTicket": false,
			"message":         "No active workflow ticket. Use workflow_create_ticket to begin.",
		}
		encoded, _ := json.MarshalIndent(noTicketPayload, "", "  ")
		return ResourceReadResult{
			Contents: []ResourceContent{{
				URI:      "workflow://state",
				MIMEType: "application/json",
				Text:     string(encoded),
			}},
		}, nil
	}

	// Include hasActiveTicket for easy boolean checks by agents.
	stateView := map[string]interface{}{
		"hasActiveTicket": true,
		"ticket":          ticket,
		"allowedActions":  ticket.AllowedActions(),
	}
	encoded, err := json.MarshalIndent(stateView, "", "  ")
	if err != nil {
		return ResourceReadResult{}, fmt.Errorf("failed to encode state: %w", err)
	}

	return ResourceReadResult{
		Contents: []ResourceContent{{
			URI:      "workflow://state",
			MIMEType: "application/json",
			Text:     string(encoded),
		}},
	}, nil
}

// resourcePhaseDefinitions returns a human-readable guide to all workflow phases.
func resourcePhaseDefinitions() (ResourceReadResult, error) {
	lines := []string{
		"# Forge Workflow Phases",
		"",
		"Phases must be followed in order. Skipping is not permitted.",
		"",
		"## 1. ticket (workflow-guard agent)",
		"   Permitted: Read files, create workflow ticket, define branch",
		"   Forbidden: All source writes, git commits, PR creation",
		"   Advance with: workflow_advance_phase(nextPhase='planning')",
		"",
		"## 2. planning (planner agent)",
		"   Permitted: Read source files, write plan/docs, analyze architecture",
		"   Forbidden: Source file writes, git commits, PR creation",
		"   Advance with: workflow_advance_phase(nextPhase='implementation', plan='...')",
		"",
		"## 3. implementation (implementer agent)",
		"   Permitted: Read/write source, run tests, git add/commit",
		"   Forbidden: PR creation (use reviewer agent for that)",
		"   Advance with: workflow_advance_phase(nextPhase='review')",
		"",
		"## 4. review (reviewer agent)",
		"   Permitted: Git diff, create PR, address review comments",
		"   Forbidden: New feature code, source writes unrelated to review feedback",
		"   Advance with: workflow_advance_phase(nextPhase='complete')",
		"",
		"## 5. complete",
		"   The workflow is done. PR has been created.",
	}

	return ResourceReadResult{
		Contents: []ResourceContent{{
			URI:      "workflow://phases",
			MIMEType: "text/plain",
			Text:     strings.Join(lines, "\n"),
		}},
	}, nil
}
