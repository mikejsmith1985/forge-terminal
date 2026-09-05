// workflow_cli.go — `forge workflow ...` subcommand entry point.
//
// Used by the pre-commit hook so the hook does not have to call the MCP
// HTTP endpoint or duplicate ticket-parsing logic.  Returns OS exit codes
// the hook can shell-test directly (0 = pass, 1 = fail/usage, 2 = blocked).
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// runWorkflowCommand dispatches `forge workflow <sub>` and returns the OS
// exit code the caller should use.
func runWorkflowCommand(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: forge workflow <preflight|record|naming|hooks> [...]")
		return 1
	}
	switch args[0] {
	case "preflight":
		return runWorkflowPreflight()
	case "hooks":
		return runWorkflowHooks()
	case "record":
		return runWorkflowRecord(args[1:])
	case "naming":
		return runWorkflowNaming()
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

// runWorkflowHooks installs the workflow gate into the pre-commit hook git
// runs for the current repository, and says where that is.
//
// This is what scripts/install-workflow-hooks.{ps1,sh} call, so the hook body
// has one source of truth. Exit 0 when the gate is in place, 2 when a hook
// written by another tool is in the way, 1 on any other failure.
func runWorkflowHooks() int {
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "hooks: %v\n", err)
		return 1
	}

	hooksDirectory, err := workflow.EffectiveHooksDir(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hooks: %s is not a git repository\n", root)
		return 1
	}

	installErr := workflow.EnsureHookInstalled(root)
	if errors.Is(installErr, workflow.ErrForeignPreCommitHook) {
		fmt.Fprintf(os.Stderr, "hooks: %v\n  hook: %s\n", installErr, filepath.Join(hooksDirectory, "pre-commit"))
		return 2
	}
	if installErr != nil {
		fmt.Fprintf(os.Stderr, "hooks: %v\n", installErr)
		return 1
	}
	fmt.Printf("[forge] workflow gate installed in %s\n", filepath.Join(hooksDirectory, "pre-commit"))
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

// runWorkflowNaming checks staged Go files for unreadable names.
//
// Exit 2 when a blocking violation is found, so the pre-commit hook can refuse
// the commit the same way it refuses a missing gate. Advisory findings —
// verb-first, which is recognised from a word list that can never be complete —
// are printed and do not affect the exit code.
func runWorkflowNaming() int {
	projectRoot, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "naming: %v\n", err)
		return 1
	}

	var blocking, advisory []workflow.NamingFinding

	for _, stagedPath := range stagedPaths(projectRoot) {
		source, readErr := os.ReadFile(filepath.Join(projectRoot, stagedPath))
		if readErr != nil {
			// A staged deletion has no content to check. Not a violation.
			continue
		}

		for _, finding := range workflow.CheckChangedFile(stagedPath, string(source)) {
			if finding.Rule.IsBlocking() {
				blocking = append(blocking, finding)
			} else {
				advisory = append(advisory, finding)
			}
		}
	}

	for _, finding := range advisory {
		fmt.Printf("[forge] naming (advisory) %s:%d  %s — %s\n",
			finding.Path, finding.Line, finding.Identifier, finding.Suggestion)
	}
	for _, finding := range blocking {
		fmt.Fprintf(os.Stderr, "[forge] naming %s:%d  %s — %s\n",
			finding.Path, finding.Line, finding.Identifier, finding.Suggestion)
	}

	if len(blocking) > 0 {
		return 2
	}
	return 0
}
