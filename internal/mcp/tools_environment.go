// tools_environment.go implements two Forge MCP environment tools:
//
//   - environment_detect — probes WSL2 and Docker availability on the host
//   - environment_run    — executes a command in the best available Linux environment
//
// These tools give AI agents a first-class way to run Linux-required builds
// (OpenNext, Turbopack, etc.) from a Windows host without resorting to
// GitHub Actions workflows or manually configuring CI secrets.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ── environment_detect ────────────────────────────────────────────────────────

// environmentDetectTool probes the host and reports which Linux execution
// environments are available, so agents can choose a strategy before calling
// environment_run.
type environmentDetectTool struct {
	runner CommandRunner
}

func newEnvironmentDetectTool(runner CommandRunner) ToolHandler {
	return &environmentDetectTool{runner: runner}
}

// Definition returns the MCP tool descriptor for environment_detect.
func (t *environmentDetectTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "environment_detect",
		Description: "Reports which Linux execution environments (WSL2, Docker) are available on " +
			"the host machine. Use this before calling environment_run to understand what strategies " +
			"are available. Returns recommended strategy and any install hints if nothing is available.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

// Execute probes for WSL2 and Docker, then returns availability as JSON.
func (t *environmentDetectTool) Execute(_ map[string]any) (*CallToolResult, error) {
	availability := detectAvailableEnvironments(t.runner)

	output, marshalErr := json.MarshalIndent(availability, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising availability result: " + marshalErr.Error()), nil
	}

	return textContent(string(output)), nil
}

// ── environment_run ───────────────────────────────────────────────────────────

// environmentRunTool executes a shell command inside the requested Linux environment
// and returns the exit code, stdout, stderr, and timing as structured JSON.
type environmentRunTool struct {
	runner CommandRunner
}

func newEnvironmentRunTool(runner CommandRunner) ToolHandler {
	return &environmentRunTool{runner: runner}
}

// Definition returns the MCP tool descriptor for environment_run.
func (t *environmentRunTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name: "environment_run",
		Description: "Run a shell command in the specified environment (native, linux-wsl, linux-docker, or auto). " +
			"Use 'auto' on Windows to automatically select WSL2 or Docker for Linux-compatible builds — this " +
			"avoids Windows path issues with tools like Turbopack or OpenNext without needing GitHub Actions. " +
			"Returns exit_code, stdout, stderr, environment_used, and duration_seconds.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"command": {
					"type": "string",
					"description": "The shell command to execute (e.g. 'npm run build')."
				},
				"environment": {
					"type": "string",
					"enum": ["auto", "native", "linux-wsl", "linux-docker"],
					"description": "Execution environment. Use 'auto' to let Forge pick the best available Linux environment. Defaults to 'auto'."
				},
				"cwd": {
					"type": "string",
					"description": "Working directory for the command. Defaults to the current Forge project directory if omitted."
				},
				"image": {
					"type": "string",
					"description": "Docker image to use when environment is 'linux-docker'. Defaults to 'node:lts'."
				},
				"timeout_seconds": {
					"type": "number",
					"description": "Maximum seconds to wait for the command to finish (1–600). Default: 120."
				}
			},
			"required": ["command"]
		}`),
	}
}

// Execute validates arguments, runs the command in the requested environment,
// and returns the result as structured JSON text content.
func (t *environmentRunTool) Execute(args map[string]any) (*CallToolResult, error) {
	parsedArgs, parseErr := parseEnvironmentRunArgs(args)
	if parseErr != nil {
		return errorContent(parseErr.Error()), nil
	}

	timeout := time.Duration(parsedArgs.TimeoutSeconds) * time.Second
	runCtx, cancelRun := context.WithTimeout(context.Background(), timeout)
	defer cancelRun()

	runResult, runErr := RunInEnvironment(runCtx, t.runner, RunOptions{
		Command:          parsedArgs.Command,
		Environment:      parsedArgs.Environment,
		WorkingDirectory: parsedArgs.WorkingDirectory,
		DockerImage:      parsedArgs.DockerImage,
	})
	if runErr != nil {
		return errorContent(fmt.Sprintf("environment run failed: %v", runErr)), nil
	}

	output, marshalErr := json.MarshalIndent(runResult, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising run result: " + marshalErr.Error()), nil
	}

	return textContent(string(output)), nil
}

// ── Argument Parsing ──────────────────────────────────────────────────────────

// environmentRunArgs holds the validated, normalised arguments for one environment_run call.
type environmentRunArgs struct {
	Command          string
	Environment      string
	WorkingDirectory string
	DockerImage      string
	TimeoutSeconds   int
}

// parseEnvironmentRunArgs extracts and validates the caller's arguments,
// applying defaults for optional fields.
func parseEnvironmentRunArgs(args map[string]any) (environmentRunArgs, error) {
	parsed := environmentRunArgs{
		Environment:    StrategyAuto,
		DockerImage:    DefaultDockerImage,
		TimeoutSeconds: defaultEnvironmentTimeoutSec,
	}

	// command is the only required field.
	rawCommand, hasCommand := args["command"]
	if !hasCommand {
		return parsed, fmt.Errorf("command is required")
	}
	commandStr, isString := rawCommand.(string)
	if !isString || commandStr == "" {
		return parsed, fmt.Errorf("command must be a non-empty string")
	}
	parsed.Command = commandStr

	if rawEnv, hasEnv := args["environment"]; hasEnv {
		envStr, isEnvString := rawEnv.(string)
		if !isEnvString {
			return parsed, fmt.Errorf("environment must be a string")
		}
		if !isValidEnvironmentStrategy(envStr) {
			return parsed, fmt.Errorf(
				"environment must be one of: %s, %s, %s, %s",
				StrategyAuto, StrategyNative, StrategyLinuxWSL, StrategyLinuxDocker,
			)
		}
		parsed.Environment = envStr
	}

	if rawCwd, hasCwd := args["cwd"]; hasCwd {
		if cwdStr, isCwdString := rawCwd.(string); isCwdString && cwdStr != "" {
			parsed.WorkingDirectory = cwdStr
		}
	}

	if rawImage, hasImage := args["image"]; hasImage {
		if imageStr, isImageString := rawImage.(string); isImageString && imageStr != "" {
			parsed.DockerImage = imageStr
		}
	}

	if rawTimeout, hasTimeout := args["timeout_seconds"]; hasTimeout {
		if floatVal, isFloat := rawTimeout.(float64); isFloat {
			parsed.TimeoutSeconds = clampTimeout(int(floatVal))
		}
	}

	return parsed, nil
}

// isValidEnvironmentStrategy returns true if the given strategy name is one
// of the four recognised values accepted by environment_run.
func isValidEnvironmentStrategy(strategy string) bool {
	switch strategy {
	case StrategyAuto, StrategyNative, StrategyLinuxWSL, StrategyLinuxDocker:
		return true
	}
	return false
}
