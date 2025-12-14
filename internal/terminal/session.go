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
	if runtime.GOOS != "windows" {
		cmd = exec.Command(shell, shellArgs...)
		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			"COLORTERM=truecolor",
		)
		// Set working directory if specified
		if workingDir != "" {
			cmd.Dir = workingDir
		}
	}

	// Start PTY (platform specific) - pass shell info for Windows
	var ptmx io.ReadWriteCloser
	var err error
	if runtime.GOOS == "windows" {
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
