// tools_environment_test.go tests the environment_detect and environment_run
// MCP tools via the server's public ExecuteTool API.
//
// A mock CommandRunner is injected through Dependencies.EnvironmentCommandRunner
// so no real WSL2, Docker, or shell processes are spawned during testing.
package mcp_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// ── Mock CommandRunner ────────────────────────────────────────────────────────

// testCommandRunner is a simple mock that implements mcp.CommandRunner.
// It returns canned responses keyed by executable name.
type testCommandRunner struct {
	responsesByExecutable map[string]mcp.RunOutput
}

func (m *testCommandRunner) RunCommand(_ context.Context, name string, _ []string) (mcp.RunOutput, error) {
	if output, hasOutput := m.responsesByExecutable[name]; hasOutput {
		return output, nil
	}
	return mcp.RunOutput{ExitCode: 1, Stderr: "mock: no response for " + name}, nil
}

// newDockerAvailableRunner returns a mock where docker is running and WSL2 is absent.
// This represents the most common Windows dev machine setup.
func newDockerAvailableRunner() *testCommandRunner {
	return &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"docker": {ExitCode: 0, Stdout: "Server: Docker Engine"},
		},
	}
}

// newSuccessRunner returns a mock where any command reports success with sample output.
func newSuccessRunner(executable string) *testCommandRunner {
	return &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			executable: {ExitCode: 0, Stdout: "build complete"},
		},
	}
}

// buildEnvServer creates an MCP server with the given mock runner injected.
func buildEnvServer(t *testing.T, runner mcp.CommandRunner) *mcp.Server {
	t.Helper()
	return mcp.NewServer("tok", mcp.Dependencies{
		ProjectPath:              t.TempDir(),
		WorkflowConfig:           workflow.WorkflowConfig{},
		EnvironmentCommandRunner: runner,
	})
}

// ── environment_detect tests ─────────────────────────────────────────────────

func TestEnvironmentDetectTool_ReturnsValidJSON(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())
	result := callTool(t, srv, "environment_detect", map[string]any{})

	if result.IsError {
		t.Fatalf("expected no error from environment_detect, got: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected at least one content item in environment_detect response")
	}

	var availability map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &availability); err != nil {
		t.Fatalf("environment_detect response is not valid JSON: %v — got: %s", err, result.Content[0].Text)
	}
}

func TestEnvironmentDetectTool_ReportsDockerAvailableWhenDaemonIsRunning(t *testing.T) {
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"docker": {ExitCode: 0, Stdout: "Server: Docker Engine"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_detect", map[string]any{})

	var availability map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &availability); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	if availability["docker_available"] != true {
		t.Errorf("expected docker_available=true when docker daemon responds, got: %v", availability["docker_available"])
	}
}

func TestEnvironmentDetectTool_ReportsDockerNotAvailableWhenDaemonIsDown(t *testing.T) {
	// All docker calls fail — simulates Docker not installed at all.
	runner := &testCommandRunner{responsesByExecutable: map[string]mcp.RunOutput{}}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_detect", map[string]any{})

	var availability map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &availability); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	if availability["docker_available"] == true {
		t.Error("expected docker_available=false when docker commands fail")
	}
}

func TestEnvironmentDetectTool_ReturnsRecommendedField(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())
	result := callTool(t, srv, "environment_detect", map[string]any{})

	var availability map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &availability); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	recommended, hasRecommended := availability["recommended"].(string)
	if !hasRecommended || recommended == "" {
		t.Errorf("expected a non-empty 'recommended' field, got: %v", availability["recommended"])
	}
}

// ── environment_run tests — argument validation ────────────────────────────────

func TestEnvironmentRunTool_MissingCommand_ReturnsError(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())
	result := callTool(t, srv, "environment_run", map[string]any{
		"environment": "native",
	})

	if !result.IsError {
		t.Error("expected IsError=true when 'command' is missing")
	}
}

func TestEnvironmentRunTool_EmptyCommand_ReturnsError(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())
	result := callTool(t, srv, "environment_run", map[string]any{
		"command": "",
	})

	if !result.IsError {
		t.Error("expected IsError=true when 'command' is an empty string")
	}
}

func TestEnvironmentRunTool_InvalidEnvironmentStrategy_ReturnsError(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "npm run build",
		"environment": "invalid-strategy",
	})

	if !result.IsError {
		t.Error("expected IsError=true for an unrecognised environment strategy")
	}
}

// ── environment_run tests — happy path ────────────────────────────────────────

func TestEnvironmentRunTool_NativeStrategy_ReturnsJSONWithExitCode(t *testing.T) {
	// Use "cmd" on Windows or "bash" on Linux/macOS as the expected executable.
	// The mock responds to both so this test is cross-platform.
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"cmd":  {ExitCode: 0, Stdout: "hello from native"},
			"bash": {ExitCode: 0, Stdout: "hello from native"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "echo hello",
		"environment": "native",
	})

	if result.IsError {
		t.Fatalf("expected no error for native strategy, got: %v", result.Content)
	}

	var runResult map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &runResult); err != nil {
		t.Fatalf("environment_run response is not valid JSON: %v — got: %s", err, result.Content[0].Text)
	}

	if _, hasExitCode := runResult["exit_code"]; !hasExitCode {
		t.Error("expected 'exit_code' field in environment_run result JSON")
	}
	if _, hasEnvUsed := runResult["environment_used"]; !hasEnvUsed {
		t.Error("expected 'environment_used' field in environment_run result JSON")
	}
}

func TestEnvironmentRunTool_DockerStrategy_ReturnsEnvironmentUsedField(t *testing.T) {
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"docker": {ExitCode: 0, Stdout: "build successful"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "npm run build",
		"environment": "linux-docker",
		"cwd":         t.TempDir(),
	})

	if result.IsError {
		t.Fatalf("expected no error for linux-docker strategy, got: %v", result.Content)
	}

	var runResult map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &runResult); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if runResult["environment_used"] != "linux-docker" {
		t.Errorf("expected environment_used='linux-docker', got: %v", runResult["environment_used"])
	}
}

func TestEnvironmentRunTool_WSLStrategy_ReturnsEnvironmentUsedField(t *testing.T) {
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"wsl.exe": {ExitCode: 0, Stdout: "build successful"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "npm run build",
		"environment": "linux-wsl",
		"cwd":         `C:\Projects\app`,
	})

	if result.IsError {
		t.Fatalf("expected no error for linux-wsl strategy, got: %v", result.Content)
	}

	var runResult map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &runResult); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if runResult["environment_used"] != "linux-wsl" {
		t.Errorf("expected environment_used='linux-wsl', got: %v", runResult["environment_used"])
	}
}

func TestEnvironmentRunTool_AutoStrategy_UsesDockerWhenOnlyDockerAvailable(t *testing.T) {
	// Docker responds; WSL does not — auto should pick linux-docker.
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"docker": {ExitCode: 0, Stdout: "build output"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "npm run build",
		"environment": "auto",
		"cwd":         t.TempDir(),
	})

	if result.IsError {
		t.Fatalf("expected no error for auto strategy with Docker available, got: %v", result.Content)
	}

	var runResult map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &runResult); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if runResult["environment_used"] != "linux-docker" {
		t.Errorf("expected auto to select 'linux-docker', got: %v", runResult["environment_used"])
	}
}

func TestEnvironmentRunTool_NonZeroExitCode_IsNotAnError(t *testing.T) {
	// A command that exits non-zero is a build failure, not a tool failure.
	// IsError should be false; the exit_code should reflect the actual code.
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"cmd":  {ExitCode: 1, Stderr: "build failed"},
			"bash": {ExitCode: 1, Stderr: "build failed"},
		},
	}
	srv := buildEnvServer(t, runner)
	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "npm run build",
		"environment": "native",
	})

	// The tool itself should succeed (IsError=false) — it's the command that failed.
	if result.IsError {
		t.Error("expected IsError=false for a command with non-zero exit code — that's a build failure, not a tool failure")
	}

	var runResult map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &runResult); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if runResult["exit_code"] == float64(0) {
		t.Error("expected exit_code to reflect the non-zero exit from the command")
	}
}

func TestEnvironmentRunTool_DetachReturnsRecoverableJob(t *testing.T) {
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"cmd":  {ExitCode: 0, Stdout: "detached build complete"},
			"bash": {ExitCode: 0, Stdout: "detached build complete"},
		},
	}
	srv := buildEnvServer(t, runner)

	result := callTool(t, srv, "environment_run", map[string]any{
		"command":     "echo detached",
		"environment": "native",
		"detach":      true,
	})
	if result.IsError {
		t.Fatalf("expected detach start to succeed, got: %v", result.Content)
	}

	var startResponse map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &startResponse); err != nil {
		t.Fatalf("detach response is not valid JSON: %v", err)
	}
	jobID, hasJobID := startResponse["job_id"].(string)
	if !hasJobID || jobID == "" {
		t.Fatalf("expected detach response to include job_id, got: %v", startResponse)
	}
	if startResponse["detached"] != true {
		t.Fatalf("expected detached=true in response, got: %v", startResponse["detached"])
	}

	readResponse := waitForEnvironmentReadToolStatus(t, srv, jobID, "completed")
	logText, hasLogText := readResponse["log"].(string)
	if !hasLogText || logText == "" {
		t.Fatalf("expected environment_read_job to return captured log text, got: %v", readResponse)
	}
	if !strings.Contains(logText, "detached build complete") {
		t.Fatalf("expected log to include command output, got: %q", logText)
	}
}

func TestEnvironmentJobsTool_ListsDetachedJobsForRecovery(t *testing.T) {
	runner := &testCommandRunner{
		responsesByExecutable: map[string]mcp.RunOutput{
			"cmd":  {ExitCode: 0, Stdout: "recovered build complete"},
			"bash": {ExitCode: 0, Stdout: "recovered build complete"},
		},
	}
	srv := buildEnvServer(t, runner)
	startResult := callTool(t, srv, "environment_run", map[string]any{
		"command":     "echo recover",
		"environment": "native",
		"detach":      true,
	})

	var startResponse map[string]any
	if err := json.Unmarshal([]byte(startResult.Content[0].Text), &startResponse); err != nil {
		t.Fatalf("detach response is not valid JSON: %v", err)
	}
	jobID := startResponse["job_id"].(string)
	waitForEnvironmentReadToolStatus(t, srv, jobID, "completed")

	listResult := callTool(t, srv, "environment_jobs", map[string]any{})
	if listResult.IsError {
		t.Fatalf("expected environment_jobs to succeed, got: %v", listResult.Content)
	}
	var listResponse map[string]any
	if err := json.Unmarshal([]byte(listResult.Content[0].Text), &listResponse); err != nil {
		t.Fatalf("environment_jobs response is not valid JSON: %v", err)
	}
	jobs, hasJobs := listResponse["jobs"].([]any)
	if !hasJobs || len(jobs) == 0 {
		t.Fatalf("expected jobs list to include detached job, got: %v", listResponse)
	}
}

func TestEnvironmentRunTool_ToolsListIncludesNewTools(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())

	status := srv.GetUIStatus()
	requiredTools := []string{
		"environment_detect",
		"environment_run",
		"environment_jobs",
		"environment_read_job",
	}
	for _, requiredTool := range requiredTools {
		if !sliceContainsString(status.ActiveTools, requiredTool) {
			t.Fatalf("expected tool list to include %q; got %v", requiredTool, status.ActiveTools)
		}
	}
}

func waitForEnvironmentReadToolStatus(t *testing.T, srv *mcp.Server, jobID string, expectedStatus string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		readResult := callTool(t, srv, "environment_read_job", map[string]any{
			"job_id": jobID,
		})
		if readResult.IsError {
			t.Fatalf("environment_read_job returned error: %v", readResult.Content)
		}
		var readResponse map[string]any
		if err := json.Unmarshal([]byte(readResult.Content[0].Text), &readResponse); err != nil {
			t.Fatalf("environment_read_job response is not valid JSON: %v", err)
		}
		job, hasJob := readResponse["job"].(map[string]any)
		if hasJob && job["status"] == expectedStatus {
			return readResponse
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job %s did not reach status %q", jobID, expectedStatus)
	return nil
}

func sliceContainsString(values []string, expectedValue string) bool {
	for _, value := range values {
		if value == expectedValue {
			return true
		}
	}
	return false
}
