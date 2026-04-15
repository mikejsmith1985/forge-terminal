// launcher.go manages the fterm.exe child process lifecycle for the forge-debug
// diagnostic tool. It launches fterm.exe as a child process, captures stdout and
// stderr output with timestamps, and provides graceful shutdown with tree-kill
// support on Windows.
package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

// ── Constants ──

// MaxScannerBufferBytes is the maximum buffer size for reading output lines
// from the child process. Set to 1 MB to handle exceptionally long lines
// without truncation (e.g., base64 payloads or serialized JSON).
const MaxScannerBufferBytes = 1024 * 1024

// ProcessStopTimeoutSeconds is the maximum number of seconds to wait for the
// child process to exit gracefully after sending a kill signal, before
// resorting to a forced kill.
const ProcessStopTimeoutSeconds = 5

// FtermExecutableName is the filename of the production binary we launch.
const FtermExecutableName = "fterm.exe"

// ── Types ──

// TimestampedLogLine records a single line of output from fterm.exe with its capture time.
type TimestampedLogLine struct {
	Timestamp time.Time `json:"timestamp"`
	Stream    string    `json:"stream"` // "stdout" or "stderr"
	Text      string    `json:"text"`
}

// ProcessLauncher manages the fterm.exe child process lifecycle, including
// launching, capturing output, and graceful shutdown.
type ProcessLauncher struct {
	executablePath string
	port           int
	process        *exec.Cmd
	logLines       []TimestampedLogLine
	logMu          sync.Mutex
	isRunning      bool
	startedAt      time.Time
	exitCode       int
	exitError      string
	doneChan       chan struct{} // closed when the child process exits
}

// ── Constructor ──

// createProcessLauncher builds a new ProcessLauncher configured to launch the
// given executable on the specified port. The doneChan is initialised so callers
// can select on it to detect process exit.
func createProcessLauncher(executablePath string, port int) *ProcessLauncher {
	return &ProcessLauncher{
		executablePath: executablePath,
		port:           port,
		doneChan:       make(chan struct{}),
	}
}

// ── Executable Resolution ──

// findExecutable locates the fterm.exe binary by checking three locations in
// order: (1) the explicitly configured path, (2) the current working directory,
// and (3) the directory containing the forge-debug binary itself. This search
// order lets users override the path while providing sensible defaults.
func (launcher *ProcessLauncher) findExecutable() (string, error) {
	// Priority 1: explicitly configured path
	if launcher.executablePath != "" {
		if fileExists(launcher.executablePath) {
			return launcher.executablePath, nil
		}
		return "", fmt.Errorf("configured executable not found at %s", launcher.executablePath)
	}

	// Priority 2: current working directory
	cwdPath, cwdError := findExecutableInWorkingDirectory()
	if cwdError == nil {
		return cwdPath, nil
	}

	// Priority 3: same directory as forge-debug.exe itself
	selfDirPath, selfDirError := findExecutableBesideSelf()
	if selfDirError == nil {
		return selfDirPath, nil
	}

	return "", fmt.Errorf(
		"could not locate %s: not in working directory (%v) and not beside forge-debug (%v)",
		FtermExecutableName, cwdError, selfDirError,
	)
}

// findExecutableInWorkingDirectory checks whether fterm.exe exists in the
// current working directory and returns its absolute path if found.
func findExecutableInWorkingDirectory() (string, error) {
	workingDirectory, directoryError := os.Getwd()
	if directoryError != nil {
		return "", fmt.Errorf("unable to determine working directory: %w", directoryError)
	}

	candidatePath := filepath.Join(workingDirectory, FtermExecutableName)
	if fileExists(candidatePath) {
		return candidatePath, nil
	}
	return "", fmt.Errorf("%s not found in %s", FtermExecutableName, workingDirectory)
}

// findExecutableBesideSelf checks whether fterm.exe exists in the same
// directory as the currently running forge-debug binary.
func findExecutableBesideSelf() (string, error) {
	selfPath, selfError := os.Executable()
	if selfError != nil {
		return "", fmt.Errorf("unable to determine own executable path: %w", selfError)
	}

	selfDirectory := filepath.Dir(selfPath)
	candidatePath := filepath.Join(selfDirectory, FtermExecutableName)
	if fileExists(candidatePath) {
		return candidatePath, nil
	}
	return "", fmt.Errorf("%s not found in %s", FtermExecutableName, selfDirectory)
}

// fileExists reports whether the given path points to an existing regular file.
func fileExists(path string) bool {
	fileInfo, statError := os.Stat(path)
	if statError != nil {
		return false
	}
	return !fileInfo.IsDir()
}

// ── Process Launch ──

// launchProcess starts fterm.exe as a child process with the configured port,
// wires up stdout/stderr capture goroutines, and begins monitoring for exit.
// Returns an error if the executable cannot be found or the process fails to
// start.
func (launcher *ProcessLauncher) launchProcess() error {
	resolvedPath, findError := launcher.findExecutable()
	if findError != nil {
		return fmt.Errorf("cannot launch process: %w", findError)
	}

	portArgument := strconv.Itoa(launcher.port)
	launcher.process = exec.Command(resolvedPath, "-port", portArgument)

	stdoutPipe, stdoutError := launcher.process.StdoutPipe()
	if stdoutError != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", stdoutError)
	}

	stderrPipe, stderrError := launcher.process.StderrPipe()
	if stderrError != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", stderrError)
	}

	if startError := launcher.process.Start(); startError != nil {
		return fmt.Errorf("failed to start %s: %w", FtermExecutableName, startError)
	}

	launcher.logMu.Lock()
	launcher.isRunning = true
	launcher.startedAt = time.Now()
	launcher.logMu.Unlock()

	// Capture stdout and stderr concurrently in background goroutines
	go launcher.captureOutputStream(stdoutPipe, "stdout")
	go launcher.captureOutputStream(stderrPipe, "stderr")

	// Monitor for process exit in a background goroutine
	go launcher.waitForProcessExit()

	return nil
}

// waitForProcessExit blocks until the child process terminates, then records
// the exit code and signals completion via doneChan. This runs in its own
// goroutine so the caller is not blocked.
func (launcher *ProcessLauncher) waitForProcessExit() {
	waitError := launcher.process.Wait()

	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()

	launcher.isRunning = false

	if waitError != nil {
		launcher.exitError = waitError.Error()
		// Extract the numeric exit code from the ExitError if available
		if exitErr, isExitError := waitError.(*exec.ExitError); isExitError {
			launcher.exitCode = exitErr.ExitCode()
		} else {
			launcher.exitCode = -1
		}
	} else {
		launcher.exitCode = 0
	}

	close(launcher.doneChan)
}

// ── Output Capture ──

// captureOutputStream reads lines from the given reader (a stdout or stderr
// pipe) and appends each line as a TimestampedLogLine. The scanner is given a
// 1 MB buffer to handle long lines such as serialised JSON or base64 payloads.
func (launcher *ProcessLauncher) captureOutputStream(reader io.Reader, streamName string) {
	scanner := bufio.NewScanner(reader)
	scannerBuffer := make([]byte, 0, MaxScannerBufferBytes)
	scanner.Buffer(scannerBuffer, MaxScannerBufferBytes)

	for scanner.Scan() {
		logEntry := TimestampedLogLine{
			Timestamp: time.Now(),
			Stream:    streamName,
			Text:      scanner.Text(),
		}

		launcher.logMu.Lock()
		launcher.logLines = append(launcher.logLines, logEntry)
		launcher.logMu.Unlock()
	}
	// Scanner errors are silently consumed — the pipe closing on process exit
	// is the expected termination signal, not a fault condition.
}

// ── Process Stop ──

// stopProcess gracefully terminates the child process. On Windows it uses
// taskkill with /T (tree kill) to ensure child processes are also stopped.
// If the process does not exit within ProcessStopTimeoutSeconds, it is
// forcefully killed via Process.Kill as a last resort.
func (launcher *ProcessLauncher) stopProcess() error {
	launcher.logMu.Lock()
	isCurrentlyRunning := launcher.isRunning
	launcher.logMu.Unlock()

	if !isCurrentlyRunning {
		return nil
	}

	if launcher.process == nil || launcher.process.Process == nil {
		return fmt.Errorf("process reference is nil — cannot stop")
	}

	targetPID := launcher.process.Process.Pid

	// Windows tree-kill: terminate the process and all its children by PID.
	// We use the explicit PID (never a wildcard name match) to avoid killing
	// unrelated processes — especially the agent's own session.
	treeKillError := executeWindowsTreeKill(targetPID)
	if treeKillError != nil {
		return fmt.Errorf("taskkill failed for PID %d: %w", targetPID, treeKillError)
	}

	// Wait for the process to fully exit within the timeout window
	if hasExitedInTime := launcher.waitForExit(); hasExitedInTime {
		return nil
	}

	// Last resort: force kill the process directly
	if killError := launcher.process.Process.Kill(); killError != nil {
		return fmt.Errorf("force kill failed for PID %d: %w", targetPID, killError)
	}

	return nil
}

// executeWindowsTreeKill runs taskkill with /PID, /T (tree), and /F (force)
// flags to terminate a process and its entire child tree by explicit PID.
func executeWindowsTreeKill(targetPID int) error {
	pidString := strconv.Itoa(targetPID)
	killCommand := exec.Command("taskkill", "/PID", pidString, "/T", "/F")
	return killCommand.Run()
}

// waitForExit blocks until the child process exits or the stop timeout
// elapses. Returns true if the process exited within the timeout, false
// if the timeout was reached and the process is still running.
func (launcher *ProcessLauncher) waitForExit() bool {
	stopTimeout := time.Duration(ProcessStopTimeoutSeconds) * time.Second

	select {
	case <-launcher.doneChan:
		return true
	case <-time.After(stopTimeout):
		return false
	}
}

// ── Log Access ──

// getLogLines returns a thread-safe copy of all captured log lines. The caller
// receives an independent slice that will not be affected by future appends.
func (launcher *ProcessLauncher) getLogLines() []TimestampedLogLine {
	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()

	logLinesCopy := make([]TimestampedLogLine, len(launcher.logLines))
	copy(logLinesCopy, launcher.logLines)
	return logLinesCopy
}

// getRecentLogLines returns the last maxLines captured log lines in a
// thread-safe manner. If fewer lines exist than requested, all lines are
// returned.
func (launcher *ProcessLauncher) getRecentLogLines(maxLines int) []TimestampedLogLine {
	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()

	totalLines := len(launcher.logLines)
	startIndex := totalLines - maxLines
	if startIndex < 0 {
		startIndex = 0
	}

	recentSlice := launcher.logLines[startIndex:]
	logLinesCopy := make([]TimestampedLogLine, len(recentSlice))
	copy(logLinesCopy, recentSlice)
	return logLinesCopy
}

// ── Status Queries ──

// isProcessRunning reports whether the child process is currently alive.
func (launcher *ProcessLauncher) isProcessRunning() bool {
	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()
	return launcher.isRunning
}

// getProcessUptime returns how long the child process has been running. If the
// process has not been started yet, it returns zero.
func (launcher *ProcessLauncher) getProcessUptime() time.Duration {
	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()

	if launcher.startedAt.IsZero() {
		return 0
	}
	return time.Since(launcher.startedAt)
}
