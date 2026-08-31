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
	"os/exec"
	"strings"

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
	// Scoped to what is actually staged, so a documentation-only commit is not
	// asked for a change brief.  A gate that fires on everything gets bypassed
	// on everything, and a bypass used by reflex is a gate that has stopped
	// working.
	result, err := workflow.PreflightForChange(root, stagedPaths(root))
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

// stagedPaths returns the repository-relative paths git has staged.
//
// Returns nil when git cannot be asked — outside a repository, or with no git
// on the path.  A nil result means no source is known to have changed, so the
// brief gate does not fire.  That is the right way to fail: the alternative is
// blocking a commit over a question we were unable to ask.
func stagedPaths(projectRoot string) []string {
	command := exec.Command("git", "diff", "--cached", "--name-only")
	command.Dir = projectRoot

	output, err := command.Output()
	if err != nil {
		return nil
	}

	var paths []string
	for _, line := range strings.Split(string(output), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			paths = append(paths, trimmed)
		}
	}
	return paths
}
