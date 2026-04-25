// workflow_cli.go — `forge workflow ...` subcommand entry point.
//
// Used by the pre-commit hook so the hook does not have to call the MCP
// HTTP endpoint or duplicate ticket-parsing logic.  Returns OS exit codes
// the hook can shell-test directly (0 = pass, 1 = fail/usage, 2 = blocked).
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// runWorkflowCommand dispatches `forge workflow <sub>` and returns the OS
// exit code the caller should use.
func runWorkflowCommand(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: forge workflow <preflight|record> [...]")
		return 1
	}
	switch args[0] {
	case "preflight":
		return runWorkflowPreflight()
	case "record":
		return runWorkflowRecord(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "unknown workflow subcommand %q\n", args[0])
		return 1
	}
}

// runWorkflowPreflight prints the JSON preflight result and returns
// exit 0 on pass, 2 on fail (so the git hook can `exit $?` cleanly).
func runWorkflowPreflight() int {
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "preflight: %v\n", err)
		return 1
	}
	result, err := workflow.Preflight(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "preflight: %v\n", err)
		return 1
	}
	body, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(body))
	if !result.OK {
		return 2
	}
	return 0
}

// runWorkflowRecord exposes ticket recording from the CLI.  Mostly useful
// for shell scripts and ad-hoc debugging — the agent normally calls the
// MCP tool directly.
func runWorkflowRecord(args []string) int {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: forge workflow record <gate> <evidence> [taskId]")
		return 1
	}
	gate, evidence := args[0], args[1]
	taskID := ""
	if len(args) >= 3 {
		taskID = args[2]
	}
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "record: %v\n", err)
		return 1
	}
	ticket, err := workflow.RecordGate(root, taskID, gate, evidence)
	if err != nil {
		fmt.Fprintf(os.Stderr, "record: %v\n", err)
		return 1
	}
	body, _ := json.MarshalIndent(ticket, "", "  ")
	fmt.Println(string(body))
	return 0
}
