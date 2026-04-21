// environment_runner_test.go tests the internal helper functions that power the
// environment_run MCP tool — path conversion, command argument building, strategy
// resolution, and timeout clamping.
//
// This file uses `package mcp` (not `package mcp_test`) so it can reach
// unexported helpers without polluting the public API.
package mcp

import (
	"context"
	"strings"
	"testing"
)

// ── Mock CommandRunner ────────────────────────────────────────────────────────

// mockCommandRunner is a test double for CommandRunner.
// It records every call and returns canned responses keyed by executable name
// so tests can verify what commands were built without spawning real processes.
type mockCommandRunner struct {
	responsesByExecutable map[string]RunOutput
	recordedCalls         []recordedCommandCall
}

// recordedCommandCall captures a single RunCommand invocation for later assertion.
type recordedCommandCall struct {
	ExecutableName string
	Arguments      []string
}

func newMockCommandRunner(responsesByExecutable map[string]RunOutput) *mockCommandRunner {
	return &mockCommandRunner{
		responsesByExecutable: responsesByExecutable,
	}
}

func (m *mockCommandRunner) RunCommand(_ context.Context, name string, args []string) (RunOutput, error) {
	m.recordedCalls = append(m.recordedCalls, recordedCommandCall{
		ExecutableName: name,
		Arguments:      args,
	})
	if output, hasOutput := m.responsesByExecutable[name]; hasOutput {
		return output, nil
	}
	// Default: report failure so tests that don't configure a response catch misconfigured calls.
	return RunOutput{ExitCode: 1, Stderr: "mock: no response configured for " + name}, nil
}

// ── WSL Path Conversion ───────────────────────────────────────────────────────

func TestConvertWindowsPathToWSLMount_BasicPath(t *testing.T) {
	input := `C:\Projects\foo`
	want := `/mnt/c/Projects/foo`
	got := convertWindowsPathToWSLMount(input)
	if got != want {
		t.Errorf("convertWindowsPathToWSLMount(%q) = %q; want %q", input, got, want)
	}
}

func TestConvertWindowsPathToWSLMount_TrailingBackslash(t *testing.T) {
	input := `C:\Projects\foo\`
	want := `/mnt/c/Projects/foo`
	got := convertWindowsPathToWSLMount(input)
	if got != want {
		t.Errorf("convertWindowsPathToWSLMount(%q) = %q; want %q", input, got, want)
	}
}

func TestConvertWindowsPathToWSLMount_DriveLetterIsLowercased(t *testing.T) {
	input := `D:\Work\project`
	want := `/mnt/d/Work/project`
	got := convertWindowsPathToWSLMount(input)
	if got != want {
		t.Errorf("convertWindowsPathToWSLMount(%q) = %q; want %q", input, got, want)
	}
}

func TestConvertWindowsPathToWSLMount_NonDrivePath_PassesThrough(t *testing.T) {
	input := `/already/unix/path`
	got := convertWindowsPathToWSLMount(input)
	if got != input {
		t.Errorf("convertWindowsPathToWSLMount(%q) = %q; want passthrough %q", input, got, input)
	}
}

// ── WSL Command Argument Building ─────────────────────────────────────────────

func TestBuildWSLCommandArgs_HasCorrectShellPrefix(t *testing.T) {
	args := buildWSLCommandArgs("npm run build", `C:\Projects\app`)

	// The first three args must be: -e bash -c
	if len(args) < 4 {
		t.Fatalf("expected at least 4 args, got %d: %v", len(args), args)
	}
	if args[0] != "-e" || args[1] != "bash" || args[2] != "-c" {
		t.Errorf("expected args to start with [-e bash -c], got %v", args[:3])
	}
}

func TestBuildWSLCommandArgs_ScriptContainsConvertedPath(t *testing.T) {
	args := buildWSLCommandArgs("npm run build", `C:\Projects\app`)
	script := args[3]
	if !strings.Contains(script, "/mnt/c/Projects/app") {
		t.Errorf("WSL script %q does not contain the converted Linux path /mnt/c/Projects/app", script)
	}
}

func TestBuildWSLCommandArgs_ScriptContainsCommand(t *testing.T) {
	args := buildWSLCommandArgs("npm run build", `C:\Projects\app`)
	script := args[3]
	if !strings.Contains(script, "npm run build") {
		t.Errorf("WSL script %q does not contain the original command 'npm run build'", script)
	}
}

// ── Docker Command Argument Building ──────────────────────────────────────────

func TestBuildDockerCommandArgs_IncludesRemoveFlagForEphemeralContainer(t *testing.T) {
	args := buildDockerCommandArgs("npm run build", `C:\Projects\app`, "node:lts")
	if !containsStringInSlice(args, "--rm") {
		t.Errorf("docker args must include --rm to ensure ephemeral containers; got: %v", args)
	}
}

func TestBuildDockerCommandArgs_MountsWorkingDirectoryAtWorkspace(t *testing.T) {
	cwd := `C:\Projects\app`
	args := buildDockerCommandArgs("npm run build", cwd, "node:lts")
	// The volume mount flag must bind cwd to /workspace.
	expectedMount := cwd + ":/workspace"
	if !containsStringInSlice(args, expectedMount) {
		t.Errorf("expected mount arg %q in docker args; got: %v", expectedMount, args)
	}
}

func TestBuildDockerCommandArgs_UsesProvidedDockerImage(t *testing.T) {
	args := buildDockerCommandArgs("npm run build", `C:\Projects\app`, "node:18")
	if !containsStringInSlice(args, "node:18") {
		t.Errorf("expected image 'node:18' in docker args; got: %v", args)
	}
}

func TestBuildDockerCommandArgs_DefaultsToNodeLTSWhenImageIsEmpty(t *testing.T) {
	args := buildDockerCommandArgs("npm run build", `C:\Projects\app`, "")
	if !containsStringInSlice(args, DefaultDockerImage) {
		t.Errorf("expected default image %q in docker args when image is empty; got: %v", DefaultDockerImage, args)
	}
}

func TestBuildDockerCommandArgs_SetsWorkingDirectoryInsideContainer(t *testing.T) {
	args := buildDockerCommandArgs("npm run build", `C:\Projects\app`, "node:lts")
	if !containsStringInSlice(args, "-w") {
		t.Errorf("expected -w flag in docker args to set working directory; got: %v", args)
	}
	if !containsStringInSlice(args, "/workspace") {
		t.Errorf("expected /workspace as working directory in docker args; got: %v", args)
	}
}

// ── Strategy Resolution ───────────────────────────────────────────────────────

func TestResolveRecommendedStrategy_PrefersWSL2WhenBothAvailable(t *testing.T) {
	availability := EnvironmentAvailability{
		WSL2Available:   true,
		DockerAvailable: true,
	}
	got := resolveRecommendedStrategy(availability)
	if got != StrategyLinuxWSL {
		t.Errorf("expected %q when WSL2 and Docker are both available, got %q", StrategyLinuxWSL, got)
	}
}

func TestResolveRecommendedStrategy_FallsBackToDockerWhenWSL2Unavailable(t *testing.T) {
	availability := EnvironmentAvailability{
		WSL2Available:   false,
		DockerAvailable: true,
	}
	got := resolveRecommendedStrategy(availability)
	if got != StrategyLinuxDocker {
		t.Errorf("expected %q when only Docker is available, got %q", StrategyLinuxDocker, got)
	}
}

func TestResolveRecommendedStrategy_FallsBackToNativeWhenNeitherAvailable(t *testing.T) {
	availability := EnvironmentAvailability{
		WSL2Available:   false,
		DockerAvailable: false,
	}
	got := resolveRecommendedStrategy(availability)
	if got != StrategyNative {
		t.Errorf("expected %q when neither WSL2 nor Docker is available, got %q", StrategyNative, got)
	}
}

// ── Timeout Clamping ──────────────────────────────────────────────────────────

func TestClampTimeout_BelowMinimum_ClampsToOne(t *testing.T) {
	if got := clampTimeout(0); got != 1 {
		t.Errorf("clampTimeout(0) = %d; want 1", got)
	}
}

func TestClampTimeout_NegativeValue_ClampsToOne(t *testing.T) {
	if got := clampTimeout(-50); got != 1 {
		t.Errorf("clampTimeout(-50) = %d; want 1", got)
	}
}

func TestClampTimeout_AboveMaximum_ClampsToMax(t *testing.T) {
	if got := clampTimeout(9999); got != maxEnvironmentTimeoutSec {
		t.Errorf("clampTimeout(9999) = %d; want %d", got, maxEnvironmentTimeoutSec)
	}
}

func TestClampTimeout_WithinRange_PassesThrough(t *testing.T) {
	if got := clampTimeout(300); got != 300 {
		t.Errorf("clampTimeout(300) = %d; want 300", got)
	}
}

func TestClampTimeout_AtMinimumBoundary(t *testing.T) {
	if got := clampTimeout(1); got != 1 {
		t.Errorf("clampTimeout(1) = %d; want 1", got)
	}
}

func TestClampTimeout_AtMaximumBoundary(t *testing.T) {
	if got := clampTimeout(maxEnvironmentTimeoutSec); got != maxEnvironmentTimeoutSec {
		t.Errorf("clampTimeout(%d) = %d; want %d", maxEnvironmentTimeoutSec, got, maxEnvironmentTimeoutSec)
	}
}

// ── Docker Availability Detection ─────────────────────────────────────────────

func TestDetectAvailableEnvironments_DockerAvailable_WhenInfoSucceeds(t *testing.T) {
	runner := newMockCommandRunner(map[string]RunOutput{
		dockerExecutable: {ExitCode: 0, Stdout: "Server: Docker Engine"},
		wslExecutable:    {ExitCode: 1},
	})

	availability := detectAvailableEnvironments(runner)

	if !availability.DockerAvailable {
		t.Error("expected DockerAvailable=true when 'docker info' exits 0")
	}
}

func TestDetectAvailableEnvironments_DockerInstalledButNotRunning_WhenInfoFailsVersionSucceeds(t *testing.T) {
	// Simulate: `docker info` fails (daemon not running), but `docker --version` succeeds.
	callCount := 0
	runner := &callCountingMockRunner{
		onRunCommand: func(name string, args []string) RunOutput {
			if name == dockerExecutable {
				callCount++
				// First call is `docker info` (fails); second is `docker --version` (succeeds).
				if callCount == 1 {
					return RunOutput{ExitCode: 1, Stderr: "Cannot connect to Docker daemon"}
				}
				return RunOutput{ExitCode: 0, Stdout: "Docker version 24.0.0"}
			}
			return RunOutput{ExitCode: 1}
		},
	}

	availability := detectAvailableEnvironments(runner)

	if availability.DockerAvailable {
		t.Error("expected DockerAvailable=false when docker daemon is not running")
	}
	if !availability.DockerInstalledButNotRunning {
		t.Error("expected DockerInstalledButNotRunning=true when daemon is down but binary is present")
	}
	if availability.InstallHint == "" {
		t.Error("expected a non-empty InstallHint when docker daemon is not running")
	}
}

func TestDetectAvailableEnvironments_NeitherAvailable_SetsInstallHint(t *testing.T) {
	runner := newMockCommandRunner(map[string]RunOutput{
		// All commands fail — nothing is installed.
	})

	availability := detectAvailableEnvironments(runner)

	if availability.DockerAvailable || availability.WSL2Available {
		t.Error("expected both DockerAvailable and WSL2Available to be false")
	}
	if availability.InstallHint == "" {
		t.Error("expected a non-empty InstallHint pointing to Docker Desktop download")
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// containsStringInSlice returns true if the target string appears anywhere in the slice.
func containsStringInSlice(slice []string, target string) bool {
	for _, element := range slice {
		if element == target {
			return true
		}
	}
	return false
}

// callCountingMockRunner lets tests control responses with a callback function
// instead of a static map, enabling stateful call-count-dependent responses.
type callCountingMockRunner struct {
	onRunCommand func(name string, args []string) RunOutput
}

func (c *callCountingMockRunner) RunCommand(_ context.Context, name string, args []string) (RunOutput, error) {
	return c.onRunCommand(name, args), nil
}
