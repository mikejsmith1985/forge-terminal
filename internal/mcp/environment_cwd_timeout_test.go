// environment_cwd_timeout_test.go - environment_run runs where it is told, and detached builds get time to finish.
//
// The defects these tests pin, all reported from a real PlatformIO build driven
// through the Claude desktop app:
//   - a native command ignored `cwd` and ran in Forge's launch folder (Downloads),
//     because the working directory was never handed to the child process;
//   - with no `cwd`, the command also fell back to that launch folder instead of
//     the calling tab's project;
//   - a detached build that took 122 seconds was marked failed, because detached
//     jobs inherited the 120-second default meant for blocking calls.
package mcp_test

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

// directoryRecordingRunner records the working directory of every command it is asked to run.
type directoryRecordingRunner struct {
	mutex               sync.Mutex
	recordedDirectories []string
}

func (runner *directoryRecordingRunner) RunCommand(_ context.Context, _ string, _ []string, workingDirectory string) (mcp.RunOutput, error) {
	runner.mutex.Lock()
	defer runner.mutex.Unlock()
	runner.recordedDirectories = append(runner.recordedDirectories, workingDirectory)
	return mcp.RunOutput{ExitCode: 0, Stdout: "ok"}, nil
}

// readLastDirectory returns the working directory of the most recent command, or "" if none ran.
func (runner *directoryRecordingRunner) readLastDirectory() string {
	runner.mutex.Lock()
	defer runner.mutex.Unlock()
	if len(runner.recordedDirectories) == 0 {
		return ""
	}
	return runner.recordedDirectories[len(runner.recordedDirectories)-1]
}

// buildServerWithProjects wires a recording runner and a tab-to-project table.
func buildServerWithProjects(t *testing.T, runner mcp.CommandRunner, tabProjects map[string]string) *mcp.Server {
	t.Helper()
	return mcp.NewServer("tok", mcp.Dependencies{
		ProjectPath:               t.TempDir(),
		ProjectPathFunc:           func() string { return "" },
		ProjectPathForSessionFunc: func(tabID string) string { return tabProjects[tabID] },
		EnvironmentCommandRunner:  runner,
		EnvironmentJobStore:       mcp.NewEnvironmentJobStore(t.TempDir()),
	})
}

func TestNativeCommandRunsInTheRequestedDirectory(t *testing.T) {
	runner := &directoryRecordingRunner{}
	requestedDirectory := t.TempDir()
	srv := buildServerWithProjects(t, runner, nil)

	result := callTool(t, srv, "environment_run", map[string]any{
		"command": "pio run", "environment": "native", "cwd": requestedDirectory,
	})

	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	if runner.readLastDirectory() != requestedDirectory {
		t.Fatalf("command ran in %q, want %q", runner.readLastDirectory(), requestedDirectory)
	}
}

func TestCommandWithoutCwdRunsInTheCallingTabsProject(t *testing.T) {
	runner := &directoryRecordingRunner{}
	tabProject := t.TempDir()
	srv := buildServerWithProjects(t, runner, map[string]string{"tab-7": tabProject})

	result := callTool(t, srv, "environment_run", map[string]any{
		"command": "pio run", "environment": "native", "tab_id": "tab-7",
	})

	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	if runner.readLastDirectory() != tabProject {
		t.Fatalf("command ran in %q, want the tab's project %q", runner.readLastDirectory(), tabProject)
	}
}

func TestCommandWithoutCwdOrProjectIsRefusedInsteadOfRunningInTheLaunchFolder(t *testing.T) {
	runner := &directoryRecordingRunner{}
	srv := buildServerWithProjects(t, runner, nil)

	result := callTool(t, srv, "environment_run", map[string]any{"command": "pio run", "environment": "native"})

	if !result.IsError || !strings.Contains(result.Content[0].Text, "cwd") {
		t.Fatalf("expected a refusal naming cwd, got: %v", result.Content)
	}
	if runner.readLastDirectory() != "" {
		t.Fatal("a command ran even though no directory could be identified")
	}
}

// startDetachedJob starts a detached environment_run and returns the job's recorded timeout.
func startDetachedJob(t *testing.T, srv *mcp.Server, extraArgs map[string]any) int {
	t.Helper()
	args := map[string]any{"command": "pio run", "environment": "native", "cwd": t.TempDir(), "detach": true}
	for key, value := range extraArgs {
		args[key] = value
	}
	result := callTool(t, srv, "environment_run", args)
	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	var started struct {
		Job struct {
			TimeoutSeconds int `json:"timeout_seconds"`
		} `json:"job"`
	}
	if err := json.Unmarshal([]byte(result.Content[0].Text), &started); err != nil {
		t.Fatalf("detached response is not JSON: %v", err)
	}
	// Let the background job finish before the temp dirs are removed.
	time.Sleep(50 * time.Millisecond)
	return started.Job.TimeoutSeconds
}

func TestDetachedJobsGetLongerThanTheBlockingDefault(t *testing.T) {
	srv := buildServerWithProjects(t, &directoryRecordingRunner{}, nil)

	timeoutSeconds := startDetachedJob(t, srv, nil)

	if timeoutSeconds < 1800 {
		t.Fatalf("detached job timeout = %ds; a 122-second build must not be cut off", timeoutSeconds)
	}
}

func TestDetachedJobsMayAskForMoreThanTheBlockingCap(t *testing.T) {
	srv := buildServerWithProjects(t, &directoryRecordingRunner{}, nil)

	timeoutSeconds := startDetachedJob(t, srv, map[string]any{"timeout_seconds": float64(2400)})

	if timeoutSeconds != 2400 {
		t.Fatalf("detached job timeout = %ds, want the requested 2400", timeoutSeconds)
	}
}

func TestDefaultJobStoreLivesInTheUsersForgeFolder(t *testing.T) {
	jobsRoot := mcp.NewUserEnvironmentJobStore().JobsRoot()

	if filepath.Base(jobsRoot) != "adaptive-build-jobs" || filepath.Base(filepath.Dir(jobsRoot)) != ".forge" {
		t.Fatalf("default job store at %q, want ~/.forge/adaptive-build-jobs", jobsRoot)
	}
}
