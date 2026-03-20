// Package terminal provides PTY-based terminal session management.
package terminal

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Global forge port variable (set by main)
var forgePort int

// Global active debug session ID (for injecting into new terminals)
var activeDebugSessionID string
var activeDebugSessionMu sync.RWMutex

// SetActiveDebugSession sets the global debug session ID
func SetActiveDebugSession(id string) {
	activeDebugSessionMu.Lock()
	defer activeDebugSessionMu.Unlock()
	activeDebugSessionID = id
	log.Printf("[Terminal] Active debug session set to: %s", id)
}

// GetActiveDebugSession gets the global debug session ID
func GetActiveDebugSession() string {
	activeDebugSessionMu.RLock()
	defer activeDebugSessionMu.RUnlock()
	return activeDebugSessionID
}

// SetForgePort stores the port for environment variable injection
func SetForgePort(port int) {
	forgePort = port
}

func getForgePort() int {
	return forgePort
}

// ShellConfig contains shell configuration options
type ShellConfig struct {
	ShellType      string // "cmd", "powershell", or "wsl"
	WSLDistro      string // WSL distribution name (e.g., "Ubuntu-24.04")
	WSLHomePath    string // WSL home directory (e.g., "/home/mikej")
	CmdHomePath    string // CMD home directory (e.g., "C:\ProjectsWin")
	PSHomePath     string // PowerShell home directory (e.g., "C:\ProjectsWin")
}

// TerminalSession represents a single PTY terminal session.
type TerminalSession struct {
	ID  string
	PTY io.ReadWriteCloser
	Cmd *exec.Cmd // nil on Windows (ConPTY manages process internally)

	mu       sync.Mutex
	closed   bool
	doneChan chan struct{}
}

// NewTerminalSession creates a new PTY session with default shell.
func NewTerminalSession(id string) (*TerminalSession, error) {
	return NewTerminalSessionWithConfig(id, nil)
}

// convertWSLPath converts a Windows UNC path to a Linux path for WSL
// e.g., "\\wsl.localhost\Ubuntu-24.04\home\mikej\projects" -> "/home/mikej/projects"
// or "\\wsl$\Ubuntu\home\user" -> "/home/user"
func convertWSLPath(windowsPath string) string {
	path := windowsPath

	// Handle \\wsl.localhost\Distro\path or \\wsl$\Distro\path
	if strings.HasPrefix(path, `\\wsl.localhost\`) || strings.HasPrefix(path, `\\wsl$\`) {
		// Remove the \\wsl.localhost\ or \\wsl$\ prefix
		if strings.HasPrefix(path, `\\wsl.localhost\`) {
			path = strings.TrimPrefix(path, `\\wsl.localhost\`)
		} else {
			path = strings.TrimPrefix(path, `\\wsl$\`)
		}

		// Remove the distro name (first path component)
		parts := strings.SplitN(path, `\`, 2)
		if len(parts) == 2 {
			path = parts[1]
		} else {
			return "~" // Just distro name, go to home
		}

		// Convert backslashes to forward slashes
		path = strings.ReplaceAll(path, `\`, `/`)

		// Ensure it starts with /
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}

		return path
	}

	// Already a Linux path or other format, return as-is
	return path
}

// NewTerminalSessionWithConfig creates a new PTY session with specified shell config.
func NewTerminalSessionWithConfig(id string, config *ShellConfig) (*TerminalSession, error) {
	// Determine shell
	shell := os.Getenv("SHELL")
	shellArgs := []string{}
	workingDir := ""

	if runtime.GOOS == "windows" {
		// Windows shell selection
		if config != nil && config.ShellType == "wsl" {
			shell = "wsl.exe"
			if config.WSLDistro != "" {
				shellArgs = append(shellArgs, "-d", config.WSLDistro)
			}
			if config.WSLHomePath != "" {
				// Convert Windows UNC path to Linux path
				linuxPath := convertWSLPath(config.WSLHomePath)
				shellArgs = append(shellArgs, "--cd", linuxPath)
			} else {
				shellArgs = append(shellArgs, "--cd", "~")
			}
			shellArgs = append(shellArgs, "-e", "bash", "-l")
		} else if config != nil && config.ShellType == "powershell" {
			shell = "powershell.exe"
			// Set working directory for PowerShell
			if config.PSHomePath != "" {
				workingDir = config.PSHomePath
			}
		} else {
			shell = "cmd.exe"
			// Set working directory for CMD
			if config.CmdHomePath != "" {
				workingDir = config.CmdHomePath
			}
		}
	} else {
		// Unix shell (including WSL running natively)
		if shell == "" {
			shell = "/bin/bash"
		}
		shellArgs = []string{"-l"}

		// Use WSL home path as working directory if provided
		if config != nil && config.WSLHomePath != "" {
			workingDir = convertWSLPath(config.WSLHomePath)
		}
	}

	// Create command (only used on Unix)
	var cmd *exec.Cmd
	
	// Prepare environment variables
	env := os.Environ()
	env = append(env,
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		fmt.Sprintf("FORGE_INSTANCE_PID=%d", os.Getpid()),
		fmt.Sprintf("FORGE_INSTANCE_PORT=%d", getForgePort()),
	)

	// Inject active debug session ID if present
	if sessionID := GetActiveDebugSession(); sessionID != "" {
		env = append(env, fmt.Sprintf("FORGE_DEBUG_SESSION_ID=%s", sessionID))
	}

	if runtime.GOOS != "windows" {
		cmd = exec.Command(shell, shellArgs...)
		cmd.Env = env
		// Set working directory if specified
		if workingDir != "" {
			cmd.Dir = workingDir
		}
	}

	// Start PTY (platform specific) - pass shell info for Windows
	var ptmx io.ReadWriteCloser
	var err error
	if runtime.GOOS == "windows" {
		// Windows: ConPTY needs env vars too?
		// Note: pty_windows.go implementation of startPTYWithShell might need updating if it doesn't inherit or set env
		// But usually it inherits parent env. We can set process env temporarily or rely on SetEnvironmentVariable
		// For now, let's try setting the env var in the current process before spawning (if safe)
		// Or better, let's update pty_windows.go signature in a future refactor.
		// For now, on Windows, we'll set the env var on the command if we were using exec.Command, but startPTYWithShell uses syscalls.
		
		// v3.12.16: Inject env var for Windows ConPTY
		if sessionID := GetActiveDebugSession(); sessionID != "" {
			os.Setenv("FORGE_DEBUG_SESSION_ID", sessionID)
			// Defer unset? No, concurrent spawns might need it. 
			// But setting process-wide env is risky for concurrent differing sessions.
			// However, ActiveDebugSessionID is global anyway, so it represents "current focus".
			// Ideally we pass env to startPTYWithShell.
		} else {
			os.Unsetenv("FORGE_DEBUG_SESSION_ID")
		}
		
		ptmx, err = startPTYWithShell(shell, shellArgs, workingDir)
	} else {
		ptmx, err = startPTY(cmd)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to start PTY: %w", err)
	}

	session := &TerminalSession{
		ID:       id,
		PTY:      ptmx,
		Cmd:      cmd,
		doneChan: make(chan struct{}),
	}

	// Monitor process exit (only on Unix where we have cmd)
	if cmd != nil {
		go func() {
			_ = cmd.Wait()
			// Use select to safely close channel (avoid double-close panic)
			session.mu.Lock()
			if !session.closed {
				select {
				case <-session.doneChan:
					// Already closed
				default:
					close(session.doneChan)
				}
			}
			session.mu.Unlock()
		}()
	}

	return session, nil
}

// Read reads output from the PTY.
func (s *TerminalSession) Read(p []byte) (int, error) {
	return s.PTY.Read(p)
}

// Write writes data to the PTY.
func (s *TerminalSession) Write(p []byte) (int, error) {
	return s.PTY.Write(p)
}

// WriteToPty safely writes data to the PTY with mutex protection.
// This method is used by injection handlers to force text into the terminal.
// Returns the number of bytes written and any error encountered.
func (s *TerminalSession) WriteToPty(data []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return 0, fmt.Errorf("session is closed")
	}

	if s.PTY == nil {
		return 0, fmt.Errorf("PTY is nil")
	}

	n, err := s.PTY.Write(data)
	if err != nil {
		log.Printf("[Terminal] WriteToPty error for session %s: %v", s.ID, err)
		return n, err
	}

	log.Printf("[Terminal] WriteToPty: wrote %d bytes to session %s", n, s.ID)
	return n, nil
}

// Resize changes the terminal size.
func (s *TerminalSession) Resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return io.ErrClosedPipe
	}
	return resizePTY(s.PTY, cols, rows)
}

// Close terminates the terminal session and cleans up all resources.
func (s *TerminalSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	// Kill process if we have one
	if s.Cmd != nil && s.Cmd.Process != nil {
		pid := s.Cmd.Process.Pid
		log.Printf("[Terminal] Cleaning up process (PID %d) for session %s", pid, s.ID)
		
		// Attempt graceful termination first
		if err := s.Cmd.Process.Kill(); err != nil {
			log.Printf("[Terminal] Warning: Failed to kill process (PID %d): %v", pid, err)
		} else {
			log.Printf("[Terminal] Process (PID %d) terminated", pid)
		}
		
		// Wait for process to exit (with timeout)
		done := make(chan error, 1)
		go func() {
			_, err := s.Cmd.Process.Wait()
			done <- err
		}()
		
		select {
		case <-done:
			// Process exited
		case <-time.After(2 * time.Second):
			// Timeout - process might still be running
			log.Printf("[Terminal] Process cleanup timeout for PID %d", pid)
		}
	}
	
	// Close PTY (will release file descriptors)
	if s.PTY != nil {
		log.Printf("[Terminal] Closing PTY for session %s", s.ID)
		if err := s.PTY.Close(); err != nil {
			log.Printf("[Terminal] Warning: Failed to close PTY: %v", err)
			return err
		}
		log.Printf("[Terminal] PTY closed successfully for session %s", s.ID)
	}
	
	// Signal that session is done
	select {
	case <-s.doneChan:
		// Already closed
	default:
		close(s.doneChan)
	}
	
	return nil
}

// Done returns a channel that's closed when the session terminates.
func (s *TerminalSession) Done() <-chan struct{} {
	return s.doneChan
}

// IsDone returns true if the session's PTY process has exited.
func (s *TerminalSession) IsDone() bool {
	select {
	case <-s.doneChan:
		return true
	default:
		return false
	}
}

// IsClosed returns true if Close() has been called on this session.
func (s *TerminalSession) IsClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}
