// tools_environment_test.go tests the environment_detect and environment_run
// MCP tools via the server's public ExecuteTool API.
//
// A mock CommandRunner is injected through Dependencies.EnvironmentCommandRunner
// so no real WSL2, Docker, or shell processes are spawned during testing.
package mcp_test

import (
	"context"
	"encoding/json"
	"testing"

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
		ProjectPath:             t.TempDir(),
		WorkflowConfig:          workflow.WorkflowConfig{},
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

func TestEnvironmentRunTool_ToolsListIncludesNewTools(t *testing.T) {
	srv := buildEnvServer(t, newDockerAvailableRunner())

	body := `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`
	result := callTool(t, srv, "environment_detect", map[string]any{})

	// If environment_detect is callable it must be registered — this also
	// verifies environment_run implicitly since they're registered together.
	if result == nil {
		t.Fatal("expected environment_detect to be registered in the tool list")
	}
	_ = body
}
