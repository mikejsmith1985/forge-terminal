// Package terminal provides PTY-based terminal session management.
package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sync"
)

// TerminalSession represents a single PTY terminal session.
type TerminalSession struct {
	ID       string
	PTY      io.ReadWriteCloser
	Cmd      *exec.Cmd
	
	mu       sync.Mutex
	closed   bool
	doneChan chan struct{}
}

// NewTerminalSession creates a new PTY session.
func NewTerminalSession(id string) (*TerminalSession, error) {
	// Determine shell
	shell := os.Getenv("SHELL")
	if shell == "" {
		if runtime.GOOS == "windows" {
			shell = "powershell.exe"
		} else {
			shell = "/bin/bash"
		}
	}

	// Create command
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command(shell)
	} else {
		cmd = exec.Command(shell, "-l")
	}
	
	// Set environment
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	// Start PTY (platform specific)
	ptmx, err := startPTY(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to start PTY: %w", err)
	}

	session := &TerminalSession{
		ID:       id,
		PTY:      ptmx,
		Cmd:      cmd,
		doneChan: make(chan struct{}),
	}

	// Monitor process exit
	go func() {
		_ = cmd.Wait()
		close(session.doneChan)
	}()

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

// Close terminates the terminal session.
func (s *TerminalSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	if s.Cmd.Process != nil {
		_ = s.Cmd.Process.Kill()
	}
	return s.PTY.Close()
}

// Done returns a channel that's closed when the session terminates.
func (s *TerminalSession) Done() <-chan struct{} {
	return s.doneChan
}
