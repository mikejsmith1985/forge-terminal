// forge-git is a drop-in PATH shim for the git binary that intercepts
// --no-verify bypass attempts on commit and push, blocking them and logging
// the violation to ~/.forge/audit/violations.log.
//
// Install: build this binary and place it at ~/.forge/bin/git (or git.exe on
// Windows), then ensure ~/.forge/bin appears before the system git in PATH.
// Every git call routes through here; non-bypass commands are transparently
// forwarded to the real git binary.
package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	args := os.Args[1:]

	if isHookBypass(args) {
		logViolation(args)
		fmt.Fprintln(os.Stderr, "⛔  forge-git: --no-verify is blocked by Forge workflow enforcement.")
		fmt.Fprintln(os.Stderr, "    Forge hooks protect code quality gates. This attempt has been logged.")
		fmt.Fprintln(os.Stderr, "    Violation log: ~/.forge/audit/violations.log")
		os.Exit(1)
	}

	realGit, err := findRealGit()
	if err != nil {
		fmt.Fprintf(os.Stderr, "forge-git: could not locate real git binary: %v\n", err)
		os.Exit(1)
	}

	cmd := exec.Command(realGit, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		os.Exit(1)
	}
}

// isHookBypass returns true when args include --no-verify (or the -n shorthand
// for git commit) alongside a commit or push subcommand.
func isHookBypass(args []string) bool {
	subcommand := firstSubcommand(args)
	if subcommand != "commit" && subcommand != "push" {
		return false
	}
	for _, arg := range args {
		if arg == "--no-verify" {
			return true
		}
		// -n is the --no-verify shorthand for git commit only;
		// for git push -n means --dry-run, so we don't block it.
		if arg == "-n" && subcommand == "commit" {
			return true
		}
	}
	return false
}

// firstSubcommand returns the first non-flag argument, which is the git subcommand.
func firstSubcommand(args []string) string {
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			return arg
		}
	}
	return ""
}

// findRealGit walks PATH, skipping the directory containing this shim, and
// returns the path of the first git binary found elsewhere.
func findRealGit() (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolving own path: %w", err)
	}
	selfDir := filepath.Clean(filepath.Dir(self))

	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if filepath.Clean(dir) == selfDir {
			continue
		}
		for _, name := range []string{"git", "git.exe"} {
			candidate := filepath.Join(dir, name)
			if _, statErr := os.Stat(candidate); statErr == nil {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("no git binary found in PATH (skipped %s)", selfDir)
}

// logViolation appends a structured record to ~/.forge/audit/violations.log.
func logViolation(args []string) {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	auditDir := filepath.Join(home, ".forge", "audit")
	if mkErr := os.MkdirAll(auditDir, 0o755); mkErr != nil {
		return
	}

	logPath := filepath.Join(auditDir, "violations.log")
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer file.Close()

	cwd, _ := os.Getwd()
	logger := log.New(file, "", 0)
	logger.Printf("[%s] BLOCKED --no-verify | args: git %s | cwd: %s",
		time.Now().UTC().Format(time.RFC3339),
		strings.Join(args, " "),
		cwd,
	)
}
