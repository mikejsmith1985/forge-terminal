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
	runner             CommandRunner
	jobManager         *EnvironmentJobManager
	resolveProjectPath projectRootResolver
}

func newEnvironmentRunTool(runner CommandRunner, jobManager *EnvironmentJobManager, resolveProjectPath projectRootResolver) ToolHandler {
	return &environmentRunTool{runner: runner, jobManager: jobManager, resolveProjectPath: resolveProjectPath}
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
					"description": "Working directory for the command. Defaults to the project of the tab named by tab_id; refused when neither identifies a directory."
				},
				"tab_id": {
					"type": "string",
					"description": "Your Forge tab's ID (FORGE_SESSION_ID). Used to find the project when cwd is omitted."
				},
				"image": {
					"type": "string",
					"description": "Docker image to use when environment is 'linux-docker'. Defaults to 'node:lts'."
				},
				"timeout_seconds": {
					"type": "number",
					"description": "Maximum seconds the command may run. Blocking: 1–600, default 120. Detached: 1–3600, default 1800."
				},
				"detach": {
					"type": "boolean",
					"description": "When true, starts a recoverable background job and returns job_id plus log_path immediately."
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
	if parsedArgs.WorkingDirectory == "" && t.resolveProjectPath != nil {
		parsedArgs.WorkingDirectory = t.resolveProjectPath(readAliasedStringArgument(args, "tab_id", "sessionId"))
	}
	// Refused rather than defaulted: the only other directory available is
	// Forge's launch folder, which is where builds used to land by mistake.
	if parsedArgs.WorkingDirectory == "" {
		return errorContent(noWorkingDirectoryMessage), nil
	}
	if parsedArgs.Detach {
		return t.startDetachedJob(parsedArgs)
	}

	timeout := time.Duration(parsedArgs.TimeoutSeconds) * time.Second
	runCtx, cancelRun := context.WithTimeout(context.Background(), timeout)
	defer cancelRun()

	runResult, runErr := runInEnvironment(runCtx, t.runner, RunOptions{
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

func (t *environmentRunTool) startDetachedJob(parsedArgs environmentRunArgs) (*CallToolResult, error) {
	if t.jobManager == nil {
		return errorContent("environment job manager is not configured"), nil
	}
	job, startErr := t.jobManager.StartJob(EnvironmentJobCreateOptions{
		Command:              parsedArgs.Command,
		RequestedEnvironment: parsedArgs.Environment,
		WorkingDirectory:     parsedArgs.WorkingDirectory,
		DockerImage:          parsedArgs.DockerImage,
		TimeoutSeconds:       parsedArgs.TimeoutSeconds,
	})
	if startErr != nil {
		return errorContent("starting detached environment job: " + startErr.Error()), nil
	}
	startResponse := environmentJobStartResponse{
		JobID:    job.JobID,
		Status:   job.Status,
		LogPath:  job.LogPath,
		Detached: true,
		Job:      *job,
	}
	output, marshalErr := json.MarshalIndent(startResponse, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising detached job result: " + marshalErr.Error()), nil
	}
	return textContent(string(output)), nil
}

// ── Argument Parsing ──────────────────────────────────────────────────────────

// noWorkingDirectoryMessage says why environment_run refused and how to fix it.
const noWorkingDirectoryMessage = "environment_run needs a directory: pass cwd, or tab_id (your FORGE_SESSION_ID) " +
	"from a Forge tab open inside the project"

// environmentRunArgs holds the validated, normalised arguments for one environment_run call.
type environmentRunArgs struct {
	Command          string
	Environment      string
	WorkingDirectory string
	DockerImage      string
	TimeoutSeconds   int
	Detach           bool
}

// parseEnvironmentRunArgs extracts and validates the caller's arguments,
// applying defaults for optional fields.
func parseEnvironmentRunArgs(args map[string]any) (environmentRunArgs, error) {
	parsed := environmentRunArgs{
		Environment: StrategyAuto,
		DockerImage: DefaultDockerImage,
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

	if rawDetach, hasDetach := args["detach"]; hasDetach {
		detachValue, isBool := rawDetach.(bool)
		if !isBool {
			return parsed, fmt.Errorf("detach must be a boolean")
		}
		parsed.Detach = detachValue
	}

	requestedTimeout := 0
	if floatVal, isFloat := args["timeout_seconds"].(float64); isFloat {
		requestedTimeout = int(floatVal)
	}
	parsed.TimeoutSeconds = resolveRunTimeout(requestedTimeout, parsed.Detach)

	return parsed, nil
}

// resolveRunTimeout applies the default and cap for the kind of run: detached
// jobs get the long rules, blocking calls the short ones. Zero means "not given".
func resolveRunTimeout(requestedSeconds int, isDetached bool) int {
	if isDetached {
		return defaultJobTimeout(requestedSeconds)
	}
	if requestedSeconds == 0 {
		return defaultEnvironmentTimeoutSec
	}
	return clampTimeout(requestedSeconds)
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

// ── environment job recovery tools ────────────────────────────────────────────

type environmentJobStartResponse struct {
	JobID    string         `json:"job_id"`
	Status   string         `json:"status"`
	LogPath  string         `json:"log_path"`
	Detached bool           `json:"detached"`
	Job      EnvironmentJob `json:"job"`
}

type environmentJobsTool struct {
	jobManager *EnvironmentJobManager
}

func newEnvironmentJobsTool(jobManager *EnvironmentJobManager) ToolHandler {
	return &environmentJobsTool{jobManager: jobManager}
}

func (t *environmentJobsTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "environment_jobs",
		Description: "List recoverable adaptive build jobs persisted for this project. Use after session resume to discover running or completed detached builds.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {},
			"required": []
		}`),
	}
}

func (t *environmentJobsTool) Execute(_ map[string]any) (*CallToolResult, error) {
	if t.jobManager == nil {
		return errorContent("environment job manager is not configured"), nil
	}
	jobs, listErr := t.jobManager.ListJobs()
	if listErr != nil {
		return errorContent("listing environment jobs: " + listErr.Error()), nil
	}
	output, marshalErr := json.MarshalIndent(map[string]any{"jobs": jobs, "count": len(jobs)}, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising environment jobs: " + marshalErr.Error()), nil
	}
	return textContent(string(output)), nil
}

type environmentReadJobTool struct {
	jobManager *EnvironmentJobManager
}

func newEnvironmentReadJobTool(jobManager *EnvironmentJobManager) ToolHandler {
	return &environmentReadJobTool{jobManager: jobManager}
}

func (t *environmentReadJobTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "environment_read_job",
		Description: "Read one recoverable adaptive build job and its persisted log output by job_id.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"job_id": {
					"type": "string",
					"description": "The job_id returned by environment_run with detach=true."
				},
				"max_log_bytes": {
					"type": "number",
					"description": "Maximum log bytes to return from the tail. Defaults to 20000."
				}
			},
			"required": ["job_id"]
		}`),
	}
}

func (t *environmentReadJobTool) Execute(args map[string]any) (*CallToolResult, error) {
	if t.jobManager == nil {
		return errorContent("environment job manager is not configured"), nil
	}
	jobID, maxLogBytes, parseErr := parseEnvironmentReadJobArgs(args)
	if parseErr != nil {
		return errorContent(parseErr.Error()), nil
	}
	job, logText, readErr := t.jobManager.ReadJob(jobID, maxLogBytes)
	if readErr != nil {
		return errorContent("reading environment job: " + readErr.Error()), nil
	}
	output, marshalErr := json.MarshalIndent(map[string]any{"job": job, "log": logText}, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising environment job: " + marshalErr.Error()), nil
	}
	return textContent(string(output)), nil
}

func parseEnvironmentReadJobArgs(args map[string]any) (string, int, error) {
	rawJobID, hasJobID := args["job_id"]
	if !hasJobID {
		return "", 0, fmt.Errorf("job_id is required")
	}
	jobID, isString := rawJobID.(string)
	if !isString || jobID == "" {
		return "", 0, fmt.Errorf("job_id must be a non-empty string")
	}
	maxLogBytes := buildOutputMaxBytes
	if rawMaxLogBytes, hasMaxLogBytes := args["max_log_bytes"]; hasMaxLogBytes {
		if floatVal, isFloat := rawMaxLogBytes.(float64); isFloat && floatVal > 0 {
			maxLogBytes = int(floatVal)
		}
	}
	return jobID, maxLogBytes, nil
}
