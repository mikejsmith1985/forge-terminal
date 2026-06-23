// Package git is a thin, mockable wrapper over the `git` CLI used by the
// worktree-automation feature (specs/011): it provides just the worktree,
// branch, and repo-introspection commands the SDD pipeline needs, behind a
// Runner seam so unit tests can mock git without shelling out.
package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// Runner executes a git subcommand inside dir and returns trimmed stdout.
// It is the single seam tests mock: a fake Runner lets unit tests assert the
// exact command issued and feed canned output without touching a real repo.
type Runner interface {
	Run(dir string, args ...string) (string, error)
}

// execRunner is the production Runner: it shells out to the real `git` binary.
type execRunner struct{}

// Run executes `git <args...>` with its working directory set to dir and
// returns trimmed stdout, or an error that includes git's stderr for context.
func (execRunner) Run(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	setSysProcAttr(cmd) // suppress console window on Windows (CREATE_NO_WINDOW)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w (%s)", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

// Client is the worktree/branch helper used by the rest of the backend. Construct
// it with New() for production; tests construct it with a fake Runner.
type Client struct {
	runner Runner
}

// New returns a Client backed by the real git binary.
func New() *Client {
	return &Client{runner: execRunner{}}
}

// NewWithRunner returns a Client backed by the supplied Runner (used by tests).
func NewWithRunner(runner Runner) *Client {
	return &Client{runner: runner}
}
