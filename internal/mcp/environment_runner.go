// environment_runner.go provides the CommandRunner interface and the platform
// detection + execution logic that powers the environment_detect and
// environment_run MCP tools.
//
// Three execution strategies are supported:
//   - native     — runs the command in the host OS shell (cmd.exe on Windows, bash elsewhere)
//   - linux-wsl  — runs the command inside WSL2 via wsl.exe, converting Windows paths to /mnt/
//   - linux-docker — runs the command in an ephemeral Docker container with the project mounted
//
// The "auto" strategy probes availability and picks the best Linux option,
// falling back to native when neither WSL2 nor Docker is reachable.
package mcp

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	// DefaultDockerImage is used when the caller does not specify an image.
	// node:lts covers the most common use case: JavaScript/TypeScript builds.
	DefaultDockerImage = "node:lts"

	// defaultEnvironmentTimeoutSec is used when the caller omits timeout_seconds.
	// 120 seconds covers most npm installs and incremental builds.
	defaultEnvironmentTimeoutSec = 120

	// maxEnvironmentTimeoutSec is the hard upper limit — 10 minutes for large builds.
	maxEnvironmentTimeoutSec = 600

	// wslExecutable is the WSL2 launcher binary on Windows.
	wslExecutable = "wsl.exe"

	// dockerExecutable is the Docker CLI binary name.
	dockerExecutable = "docker"

	// dockerInfoSubcommand probes whether the Docker daemon is reachable.
	dockerInfoSubcommand = "info"

	// dockerVersionSubcommand probes whether the Docker binary is installed
	// (succeeds even when the daemon is not running).
	dockerVersionSubcommand = "--version"

	// wslStatusSubcommand probes whether WSL2 is installed and configured.
	wslStatusSubcommand = "--status"
)

// ── Environment Strategy Names ────────────────────────────────────────────────

// These constants are the valid values for the environment_run "environment" argument.
const (
	StrategyAuto        = "auto"
	StrategyNative      = "native"
	StrategyLinuxWSL    = "linux-wsl"
	StrategyLinuxDocker = "linux-docker"
)

// ── CommandRunner Interface ───────────────────────────────────────────────────

// CommandRunner abstracts OS process execution.
// All environment tools use this interface so unit tests can inject a mock
// without spawning real processes or requiring WSL2 / Docker to be installed.
type CommandRunner interface {
	// RunCommand executes the named binary with the given arguments.
	// A non-zero ExitCode in the returned RunOutput is NOT an error —
	// it means the command ran but reported failure. Only process-level
	// failures (binary not found, permission denied) return a non-nil error.
	RunCommand(ctx context.Context, name string, args []string) (RunOutput, error)
}

// RunOutput holds the result of a single command execution.
type RunOutput struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// ── Real CommandRunner ─────────────────────────────────────────────────────────

// realCommandRunner executes commands using the OS process API.
// Tests use mockCommandRunner or testCommandRunner instead.
type realCommandRunner struct{}

// RunCommand forks a child process, captures stdout and stderr separately,
// and returns them along with the exit code.
//
// suppressConsoleWindow is called before Start so that wsl.exe and cmd.exe
// do not pop a visible terminal window when Forge itself is the terminal.
func (r *realCommandRunner) RunCommand(ctx context.Context, name string, args []string) (RunOutput, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	suppressConsoleWindow(cmd) // platform-specific; no-op on non-Windows

	var stdoutBuffer, stderrBuffer bytes.Buffer
	cmd.Stdout = &stdoutBuffer
	cmd.Stderr = &stderrBuffer

	runErr := cmd.Run()

	output := RunOutput{
		Stdout: stdoutBuffer.String(),
		Stderr: stderrBuffer.String(),
	}

	if runErr != nil {
		// Distinguish between "command exited non-zero" and "command could not start".
		if exitErr, isExitError := runErr.(*exec.ExitError); isExitError {
			output.ExitCode = exitErr.ExitCode()
			return output, nil // Non-zero exit is reported via ExitCode, not error.
		}
		return output, fmt.Errorf("could not execute %q: %w", name, runErr)
	}

	return output, nil
}

// ── Environment Availability ──────────────────────────────────────────────────

// EnvironmentAvailability reports which Linux execution environments are
// reachable on the current machine. The Recommended field gives agents a
// single concrete strategy to use without needing to interpret the flags.
type EnvironmentAvailability struct {
	WSL2Available                bool   `json:"wsl2_available"`
	DockerAvailable              bool   `json:"docker_available"`
	DockerInstalledButNotRunning bool   `json:"docker_installed_but_not_running"`
	Recommended                  string `json:"recommended"`
	InstallHint                  string `json:"install_hint,omitempty"`
}

// detectAvailableEnvironments probes the host for WSL2 and Docker.
// Detection happens at call time so the result reflects the current runtime
// state — not a snapshot from server startup.
func detectAvailableEnvironments(runner CommandRunner) EnvironmentAvailability {
	// Use a short probe timeout so a hung daemon doesn't block the caller.
	probeCtx, cancelProbe := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelProbe()

	availability := EnvironmentAvailability{}

	// WSL2 probe: wsl.exe --status exits 0 when WSL2 is installed and configured.
	wslOutput, wslErr := runner.RunCommand(probeCtx, wslExecutable, []string{wslStatusSubcommand})
	availability.WSL2Available = wslErr == nil && wslOutput.ExitCode == 0

	// Docker daemon probe: docker info exits 0 only when the daemon is reachable.
	dockerInfoOutput, dockerInfoErr := runner.RunCommand(probeCtx, dockerExecutable, []string{dockerInfoSubcommand})
	availability.DockerAvailable = dockerInfoErr == nil && dockerInfoOutput.ExitCode == 0

	if !availability.DockerAvailable {
		// Secondary probe: docker --version succeeds even when the daemon is down.
		// This distinguishes "not installed" from "installed but daemon not running".
		versionOutput, versionErr := runner.RunCommand(probeCtx, dockerExecutable, []string{dockerVersionSubcommand})
		if versionErr == nil && versionOutput.ExitCode == 0 {
			availability.DockerInstalledButNotRunning = true
			availability.InstallHint = "Start Docker Desktop from your system tray or Start menu."
		} else {
			availability.InstallHint = "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
		}
	}

	availability.Recommended = resolveRecommendedStrategy(availability)
	return availability
}

// resolveRecommendedStrategy picks the best concrete strategy given availability.
// WSL2 is preferred over Docker because it starts instantly with no container overhead.
// Docker is the standard fallback for Windows machines without WSL2.
func resolveRecommendedStrategy(availability EnvironmentAvailability) string {
	if availability.WSL2Available {
		return StrategyLinuxWSL
	}
	if availability.DockerAvailable {
		return StrategyLinuxDocker
	}
	return StrategyNative
}

// ── Strategy Resolution ───────────────────────────────────────────────────────

// resolveConcreteStrategy converts "auto" to a specific strategy by probing
// availability. Non-auto strategies are returned unchanged.
func resolveConcreteStrategy(requested string, runner CommandRunner) string {
	if requested != StrategyAuto {
		return requested
	}
	availability := detectAvailableEnvironments(runner)
	return availability.Recommended
}

// ── WSL Path Conversion ───────────────────────────────────────────────────────

// convertWindowsPathToWSLMount converts a Windows absolute path to the WSL2
// mount path so Linux tools can access files on the Windows filesystem.
//
// Examples:
//
//	C:\Projects\foo   → /mnt/c/Projects/foo
//	D:\Work\project\  → /mnt/d/Work/project
func convertWindowsPathToWSLMount(windowsPath string) string {
	// Normalise separators and strip any trailing separator.
	normalised := strings.ReplaceAll(
		strings.TrimRight(windowsPath, `\/`),
		`\`, `/`,
	)

	// Windows drive paths begin with a letter followed by a colon (e.g. "C:/…").
	// WSL mounts them at /mnt/<lowercase-letter>/<rest>.
	if len(normalised) >= 2 && normalised[1] == ':' {
		driveLetter := strings.ToLower(string(normalised[0]))
		pathAfterDrive := normalised[2:] // everything after "C:"
		return "/mnt/" + driveLetter + pathAfterDrive
	}

	// UNC paths and already-unix paths pass through unchanged.
	return normalised
}

// ── Command Argument Builders ─────────────────────────────────────────────────

// buildWSLCommandArgs constructs the wsl.exe argument list for running a shell
// command inside WSL2 from a Windows working directory.
func buildWSLCommandArgs(command, workingDirectory string) []string {
	wslWorkingDirectory := convertWindowsPathToWSLMount(workingDirectory)

	// cd to the converted path first so relative paths in the command resolve correctly.
	shellScript := fmt.Sprintf("cd %s && %s", shellQuotePath(wslWorkingDirectory), command)
	return []string{"-e", "bash", "-c", shellScript}
}

// buildDockerCommandArgs constructs the docker run argument list for running a
// command in an ephemeral container with the project directory mounted.
func buildDockerCommandArgs(command, workingDirectory, image string) []string {
	if image == "" {
		image = DefaultDockerImage
	}

	// --rm: remove the container when the command finishes (ephemeral, no cleanup needed).
	// -v: mount the host working directory at /workspace inside the container.
	// -w: set /workspace as the container's working directory.
	return []string{
		"run", "--rm",
		"-v", workingDirectory + ":/workspace",
		"-w", "/workspace",
		image,
		"bash", "-c", command,
	}
}

// buildNativeCommandArgs returns the executable and arguments for running a
// command in the host OS shell — cmd.exe on Windows, bash everywhere else.
func buildNativeCommandArgs(command string) (executable string, args []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c", command}
	}
	return "bash", []string{"-c", command}
}

// shellQuotePath wraps a filesystem path in single quotes and escapes any
// embedded single quotes so the path is safe inside a bash -c argument.
func shellQuotePath(path string) string {
	return "'" + strings.ReplaceAll(path, "'", `'\''`) + "'"
}

// ── Execution ─────────────────────────────────────────────────────────────────

// RunOptions holds all parameters for a single runInEnvironment call.
type RunOptions struct {
	Command          string
	Environment      string // "auto" | "native" | "linux-wsl" | "linux-docker"
	WorkingDirectory string
	DockerImage      string
}

// EnvironmentRunResult carries the output of a completed environment run.
type EnvironmentRunResult struct {
	ExitCode        int     `json:"exit_code"`
	Stdout          string  `json:"stdout"`
	Stderr          string  `json:"stderr"`
	EnvironmentUsed string  `json:"environment_used"`
	DurationSeconds float64 `json:"duration_seconds"`
}

// runInEnvironment executes the command described by opts using the appropriate
// strategy, returning structured output including the exit code and timing.
func runInEnvironment(ctx context.Context, runner CommandRunner, opts RunOptions) (EnvironmentRunResult, error) {
	startTime := time.Now()

	strategy := resolveConcreteStrategy(opts.Environment, runner)

	workingDirectory := opts.WorkingDirectory
	if workingDirectory == "" {
		// Fall back to the current process working directory when none is specified.
		if cwd, cwdErr := os.Getwd(); cwdErr == nil {
			workingDirectory = cwd
		}
	}

	var (
		runOutput RunOutput
		runErr    error
	)

	switch strategy {
	case StrategyLinuxWSL:
		wslArgs := buildWSLCommandArgs(opts.Command, workingDirectory)
		runOutput, runErr = runner.RunCommand(ctx, wslExecutable, wslArgs)

	case StrategyLinuxDocker:
		dockerArgs := buildDockerCommandArgs(opts.Command, workingDirectory, opts.DockerImage)
		runOutput, runErr = runner.RunCommand(ctx, dockerExecutable, dockerArgs)

	default: // StrategyNative — also the fallback when "auto" finds nothing better
		executable, nativeArgs := buildNativeCommandArgs(opts.Command)
		runOutput, runErr = runner.RunCommand(ctx, executable, nativeArgs)
		strategy = StrategyNative // Normalise "auto → native" for the result field.
	}

	if runErr != nil {
		return EnvironmentRunResult{}, runErr
	}

	return EnvironmentRunResult{
		ExitCode:        runOutput.ExitCode,
		Stdout:          truncateKeepEnd(runOutput.Stdout, buildOutputMaxBytes),
		Stderr:          truncateKeepEnd(runOutput.Stderr, buildOutputMaxBytes),
		EnvironmentUsed: strategy,
		DurationSeconds: time.Since(startTime).Seconds(),
	}, nil
}

// buildOutputMaxBytes is the per-field cap for stdout and stderr in a run result.
// Build output tends to be large; we keep the tail because errors appear at the end.
const buildOutputMaxBytes = 20 * 1024 // 20 KiB per field

// truncateKeepEnd returns up to maxBytes from the end of s.
// When truncation occurs, a notice is prepended so the agent knows output was cut.
func truncateKeepEnd(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	return "[output truncated — showing last portion]\n" + s[len(s)-maxBytes:]
}

// clampTimeout ensures the caller's requested timeout falls within 1–600 seconds.
func clampTimeout(requestedSeconds int) int {
	if requestedSeconds < 1 {
		return 1
	}
	if requestedSeconds > maxEnvironmentTimeoutSec {
		return maxEnvironmentTimeoutSec
	}
	return requestedSeconds
}
