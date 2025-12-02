// Package forge provides PTY-based terminal session management.
// This enables WebSocket-based terminal access with hybrid path resolution.
package forge

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/creack/pty"
)

// TerminalSession represents a single PTY terminal session.
type TerminalSession struct {
	ID            string
	UserID        int
	PTY           *os.File
	Cmd           *exec.Cmd
	WorkspacePath string // Resolved workspace path

	mu       sync.Mutex
	closed   bool
	doneChan chan struct{}
}

// TerminalAPIKeys holds the GitHub token to inject into the terminal environment.
// Note: LLM API keys (Anthropic, OpenAI) are NOT injected here.
// Users authenticate Claude CLI via its built-in OAuth flow.
type TerminalAPIKeys struct {
	GitHubToken string // Injected for gh CLI and git operations
}

// GetWorkspacePath returns the configured workspace path from environment.
// Priority: FORGE_WORKSPACE > WORKSPACE_MOUNT_PATH > /workspace
// Note: WORKSPACE_PATH contains the HOST path (e.g., /home/mike/projects) which doesn't exist in container.
// WORKSPACE_MOUNT_PATH contains the CONTAINER path (e.g., /workspace) where files are actually mounted.
func GetWorkspacePath() string {
	// First check for explicit forge workspace setting
	if path := os.Getenv("FORGE_WORKSPACE"); path != "" {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Use container mount path (not host path)
	if path := os.Getenv("WORKSPACE_MOUNT_PATH"); path != "" {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Default to /workspace mount point
	if _, err := os.Stat("/workspace"); err == nil {
		return "/workspace"
	}

	// Fallback to user's home directory if nothing else works
	home := os.Getenv("HOME")
	if home != "" {
		return home
	}

	return "/workspace"
}

// ResolvePath implements hybrid path resolution for cross-platform support.
// Priority 1: Check if path exists via Docker volume mount
// Priority 2: Translate common path patterns (WSL, Windows, macOS)
// Priority 3: Flag for WebSocket file fallback
type PathResolution struct {
	ResolvedPath   string // The actual path to use
	OriginalPath   string // The path as provided
	IsMounted      bool   // True if path exists on mounted volume
	NeedsFallback  bool   // True if WebSocket file operations needed
	TranslatedFrom string // Original format if translation was applied
}

// ResolvePath takes a user-provided path and resolves it for use in the container.
func ResolvePath(userPath string) *PathResolution {
	result := &PathResolution{
		OriginalPath: userPath,
	}

	workspaceMountPath := os.Getenv("WORKSPACE_MOUNT_PATH")
	if workspaceMountPath == "" {
		workspaceMountPath = "/workspace"
	}

	// Priority 1: Check if path exists directly (Docker volume mount)
	if info, err := os.Stat(userPath); err == nil {
		result.ResolvedPath = userPath
		result.IsMounted = true
		if info.IsDir() {
			return result
		}
	}

	// Priority 2: Translate common path patterns
	translatedPath := translatePath(userPath, workspaceMountPath)
	if translatedPath != userPath {
		if info, err := os.Stat(translatedPath); err == nil {
			result.ResolvedPath = translatedPath
			result.IsMounted = true
			result.TranslatedFrom = detectPathFormat(userPath)
			if info.IsDir() {
				return result
			}
		}
	}

	// Priority 3: Use workspace mount as base
	basePath := filepath.Join(workspaceMountPath, filepath.Base(userPath))
	if info, err := os.Stat(basePath); err == nil && info.IsDir() {
		result.ResolvedPath = basePath
		result.IsMounted = true
		return result
	}

	// Fallback: Use original path, flag for WebSocket fallback
	result.ResolvedPath = userPath
	result.NeedsFallback = true
	return result
}

// translatePath translates path formats between different OS conventions.
func translatePath(userPath, workspaceMountPath string) string {
	// WSL path: /mnt/c/Users/... -> translate to /workspace if mounted
	if strings.HasPrefix(userPath, "/mnt/") {
		// Extract the path part after drive letter
		parts := strings.SplitN(userPath, "/", 4)
		if len(parts) >= 4 {
			// Try to map to workspace mount
			return filepath.Join(workspaceMountPath, parts[3])
		}
	}

	// Windows path: C:\Users\... -> translate to /workspace
	if len(userPath) >= 3 && userPath[1] == ':' && (userPath[2] == '\\' || userPath[2] == '/') {
		// Replace backslashes and remove drive letter
		unixPath := strings.ReplaceAll(userPath[2:], "\\", "/")
		return filepath.Join(workspaceMountPath, unixPath)
	}

	// macOS /Users/... path - try mapping to workspace
	if strings.HasPrefix(userPath, "/Users/") {
		parts := strings.SplitN(userPath, "/", 4)
		if len(parts) >= 4 {
			return filepath.Join(workspaceMountPath, parts[3])
		}
	}

	// Linux /home/... path - try mapping to workspace
	if strings.HasPrefix(userPath, "/home/") {
		parts := strings.SplitN(userPath, "/", 4)
		if len(parts) >= 4 {
			return filepath.Join(workspaceMountPath, parts[3])
		}
	}

	return userPath
}

// detectPathFormat identifies the original path format.
func detectPathFormat(path string) string {
	if strings.HasPrefix(path, "/mnt/") {
		return "wsl"
	}
	if len(path) >= 3 && path[1] == ':' {
		return "windows"
	}
	if strings.HasPrefix(path, "/Users/") {
		return "macos"
	}
	if strings.HasPrefix(path, "/home/") {
		return "linux"
	}
	return "unix"
}

// NewTerminalSession creates a new PTY session with the user's shell.
func NewTerminalSession(sessionID string, userID int, apiKeys *TerminalAPIKeys, customWorkDir string) (*TerminalSession, error) {
	// Determine working directory
	workDir := GetWorkspacePath()

	// If custom workdir provided, try to resolve it
	if customWorkDir != "" {
		resolution := ResolvePath(customWorkDir)
		if resolution.IsMounted {
			workDir = resolution.ResolvedPath
		}
	}

	// Validate working directory exists - critical for PTY to start
	if _, err := os.Stat(workDir); os.IsNotExist(err) {
		// Fall back to home directory
		home := os.Getenv("HOME")
		if home != "" {
			workDir = home
		} else {
			workDir = "/tmp"
		}
	}

	// Get user's shell or default to bash
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}

	// Ensure npm-global bin is in PATH for CLI tools (claude, gh, etc.)
	// This is critical because login shells may not read .bashrc
	npmGlobalBin := "/home/appuser/.npm-global/bin"
	currentPath := os.Getenv("PATH")
	if !strings.Contains(currentPath, npmGlobalBin) {
		currentPath = npmGlobalBin + ":" + currentPath
	}

	// Verify shell exists
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		// Try /bin/sh as fallback
		if _, err := os.Stat("/bin/sh"); err == nil {
			shell = "/bin/sh"
		} else {
			return nil, fmt.Errorf("no shell found: %s not found", shell)
		}
	}

	// Create the command with login shell for proper env setup
	//nolint:gosec // G204 - shell is a trusted value from getShell(), not user input
	cmd := exec.Command(shell, "-l")
	cmd.Dir = workDir

	// Set up environment with terminal capabilities
	// Explicitly set PATH to include npm-global bin for CLI tools
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"LANG=en_US.UTF-8",
		"LC_ALL=en_US.UTF-8",
		"SHELL="+shell,
		"HOME="+os.Getenv("HOME"),
		"USER="+os.Getenv("USER"),
		"PATH="+currentPath,
		"DEVSMITH_FORGE=true",
		fmt.Sprintf("DEVSMITH_WORKSPACE=%s", workDir),
	)

	// Inject GitHub token for gh CLI and git operations
	if apiKeys != nil && apiKeys.GitHubToken != "" {
		cmd.Env = append(cmd.Env, "GITHUB_TOKEN="+apiKeys.GitHubToken)
		cmd.Env = append(cmd.Env, "GH_TOKEN="+apiKeys.GitHubToken)
	}

	// Start command with pseudo-terminal
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to start PTY: %w", err)
	}

	session := &TerminalSession{
		ID:            sessionID,
		UserID:        userID,
		PTY:           ptmx,
		Cmd:           cmd,
		WorkspacePath: workDir,
		doneChan:      make(chan struct{}),
	}

	// Monitor process exit
	go func() {
		_ = cmd.Wait()
		close(session.doneChan)
	}()

	return session, nil
}

// Read reads output from the PTY (terminal output).
func (s *TerminalSession) Read(p []byte) (int, error) {
	return s.PTY.Read(p)
}

// Write writes data to the PTY (user input).
func (s *TerminalSession) Write(p []byte) (int, error) {
	return s.PTY.Write(p)
}

// Resize changes the terminal size.
func (s *TerminalSession) Resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return io.ErrClosedPipe
	}
	return pty.Setsize(s.PTY, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
}

// Close terminates the terminal session.
func (s *TerminalSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	// Kill the process if still running
	if s.Cmd.Process != nil {
		_ = s.Cmd.Process.Kill()
	}

	// Close the PTY
	return s.PTY.Close()
}

// Done returns a channel that's closed when the session terminates.
func (s *TerminalSession) Done() <-chan struct{} {
	return s.doneChan
}

// IsClosed returns whether the session has been closed.
func (s *TerminalSession) IsClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// GetOSInfo returns the current OS information (for client display).
func GetOSInfo() string {
	return runtime.GOOS
}
