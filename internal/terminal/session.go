// Package terminal provides PTY-based terminal session management.
package terminal

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/vault"
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

	// Output-activity instrumentation, used by the macro injection endpoint
	// (cmd/forge/handlers_macro.go) to wait for the receiving CLI to be
	// "quiet" before pasting a workflow prompt.  Without this, a fixed
	// timeout has to guess how long copilot/claude takes to render their
	// first prompt — and guesses are wrong often enough that the macro
	// either lands inside startup output or arrives too late.
	//
	// activityMu guards all fields below independently of the main mu so
	// the macro endpoint can poll without contending with PTY writes.
	activityMu             sync.RWMutex
	lastOutputAt           time.Time
	recentOutput           []byte // ring buffer of the last ~16 KB of PTY output
	// isBracketedPasteEnabled is set permanently the moment we observe the
	// DECSET 2004 enable sequence (\x1b[?2004h) in PTY output.  Unlike
	// scanning the evictable ring buffer, this flag is never cleared — so
	// a CLI that emits the sequence once during startup is always injected
	// via bracketed paste even after its startup banner scrolls off the
	// ring buffer.
	isBracketedPasteEnabled bool
}

// recentOutputCapacity is the size of the per-session output ring buffer.
// 16 KB gives enough headroom to retain ANSI mode-set sequences
// (e.g. `\x1b[?2004h` for bracketed paste) even when a CLI emits a verbose
// startup banner.  The persistent isBracketedPasteEnabled flag (set in
// recordOutput) is the primary detection path; the ring buffer is a
// secondary fallback for CLIs that did not emit the sequence before the
// macro request arrived but do so during the wait window.
const recentOutputCapacity = 16384

// NewTerminalSession creates a new PTY session with default shell.
func NewTerminalSession(id string) (*TerminalSession, error) {
	return NewTerminalSessionWithConfig(id, nil)
}

// forgeSessionEnv augments the base process environment with the standard Forge
// variables and the per-tab identity FORGE_SESSION_ID. The identity lets SDD
// phase signals, gate-checks, and dashboard updates be scoped to exactly one
// terminal session (specs/010-sdd-authoritative-state, FR-003). Extracted as a
// pure function so the injection can be unit-tested without spawning a PTY
// (constitution Article V).
//
// An empty sessionID injects no FORGE_SESSION_ID: a session without a real
// identity is handled by the unbound path (FR-011a), never by a blank variable.
// The base environment is preserved unchanged — the augmentation is additive.
func forgeSessionEnv(baseEnv []string, sessionID string) []string {
	augmented := append([]string{}, baseEnv...)
	augmented = append(augmented,
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		fmt.Sprintf("FORGE_INSTANCE_PID=%d", os.Getpid()),
		fmt.Sprintf("FORGE_INSTANCE_PORT=%d", getForgePort()),
	)
	if binaryPath := forgeBinaryPath(); binaryPath != "" {
		augmented = append(augmented, "FORGE_BIN="+binaryPath)
	}
	if sessionID != "" {
		augmented = append(augmented, fmt.Sprintf("FORGE_SESSION_ID=%s", sessionID))
	}
	return augmented
}

// forgeBinaryPath is the running Forge executable, exported into every tab as
// FORGE_BIN so the pre-commit hook can call the program that is actually
// running rather than whatever PATH calls "forge" — an unrelated npm package
// answered to that name on one machine and the gate silently ran nothing.
// Empty when the path cannot be determined; the hook then falls back to PATH.
func forgeBinaryPath() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	return executable
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
	
	// Prepare environment variables. forgeSessionEnv adds the standard Forge vars
	// plus the per-tab identity FORGE_SESSION_ID (FR-003), used by the Unix PTY
	// via cmd.Env below. (On Windows, ConPTY ignores cmd.Env, so the identity is
	// written into the shell by startPTYWithShell instead.)
	env := forgeSessionEnv(os.Environ(), id)

	// Inject active debug session ID if present
	if debugSessionID := GetActiveDebugSession(); debugSessionID != "" {
		env = append(env, fmt.Sprintf("FORGE_DEBUG_SESSION_ID=%s", debugSessionID))
	}

	// Inject vault secrets flagged for auto-inject (non-interactive, fully transparent).
	// Values never appear in terminal output — they are silently prepended to the PTY env.
	if globalVault := vault.GetGlobal(); globalVault != nil {
		env = append(env, globalVault.GetAutoInjectEnv()...)
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
		// Validate that the working directory exists before spawning ConPTY.
		// If the saved psHome/cmdHome path no longer exists (deleted, renamed, on a
		// different machine, permission denied, or network unavailable), CreateProcess
		// returns ERROR_DIRECTORY and the session fails. Falling back to the default
		// directory lets the terminal open cleanly.
		if workingDir != "" {
			info, statErr := os.Stat(workingDir)
			if statErr != nil {
				// ANY error (not just IsNotExist) means we can't use this directory.
				// Common errors: path not found, permission denied, network unavailable,
				// path too long, invalid characters, etc.
				log.Printf("[Terminal] Working directory %q is invalid (%v) — falling back to default", workingDir, statErr)
				workingDir = ""
			} else if !info.IsDir() {
				// Path exists but is a file, not a directory
				log.Printf("[Terminal] Working directory %q is a file, not a directory — falling back to default", workingDir)
				workingDir = ""
			}
		}

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

		// Inject vault auto-inject secrets into the Windows process environment.
		// ConPTY inherits the parent process env, so os.Setenv propagates to the child.
		// Known limitation: this is process-wide (same race risk as the debug session ID above).
		// Mitigated by: secrets are already on disk (the vault.enc) and values are not new info
		// to an attacker who can read process memory. A future refactor will pass env to startPTYWithShell.
		if globalVault := vault.GetGlobal(); globalVault != nil {
			for _, envVar := range globalVault.GetAutoInjectEnv() {
				parts := strings.SplitN(envVar, "=", 2)
				if len(parts) == 2 {
					os.Setenv(parts[0], parts[1])
				}
			}
		}
		
		ptmx, err = startPTYWithShell(shell, shellArgs, workingDir, id)
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

// Read reads output from the PTY.  Every successful read is recorded in
// the session's activity tracker so the macro injection endpoint can
// detect a quiet window before pasting.
func (s *TerminalSession) Read(p []byte) (int, error) {
	bytesRead, err := s.PTY.Read(p)
	if bytesRead > 0 {
		s.recordOutput(p[:bytesRead])
	}
	return bytesRead, err
}

// recordOutput is the single write-point for the activity tracker.  It is
// intentionally cheap so it does not slow down the main PTY read loop.
func (s *TerminalSession) recordOutput(chunk []byte) {
	s.activityMu.Lock()
	defer s.activityMu.Unlock()

	s.lastOutputAt = time.Now()

	// Append to the ring, dropping the oldest bytes once we exceed the cap.
	// We always keep the most recent recentOutputCapacity bytes so callers
	// can sniff for ANSI escape sequences (e.g. `\x1b[?2004h` for bracketed
	// paste mode) without scanning the entire session history.
	s.recentOutput = append(s.recentOutput, chunk...)
	if len(s.recentOutput) > recentOutputCapacity {
		s.recentOutput = s.recentOutput[len(s.recentOutput)-recentOutputCapacity:]
	}

	// Once the CLI announces bracketed-paste support, remember it permanently.
	// The ring buffer is evictable, so this flag is the authoritative record
	// that the sequence was ever seen — even after verbose startup output
	// scrolls the sequence off the ring.
	if !s.isBracketedPasteEnabled && containsBracketedPasteEnableSeq(chunk) {
		s.isBracketedPasteEnabled = true
	}
}

// LastOutputAt returns the timestamp of the most recent PTY output.  Zero
// value means the PTY has not produced anything yet.
func (s *TerminalSession) LastOutputAt() time.Time {
	s.activityMu.RLock()
	defer s.activityMu.RUnlock()
	return s.lastOutputAt
}

// RecentOutput returns a copy of the last ~recentOutputCapacity bytes of
// PTY output.  The copy is safe for the caller to scan without holding any
// lock; the underlying ring buffer continues to mutate.
func (s *TerminalSession) RecentOutput() []byte {
	s.activityMu.RLock()
	defer s.activityMu.RUnlock()
	if len(s.recentOutput) == 0 {
		return nil
	}
	out := make([]byte, len(s.recentOutput))
	copy(out, s.recentOutput)
	return out
}

// IsBracketedPasteEnabled reports whether this session's PTY process has
// ever emitted the DECSET 2004 enable sequence (\x1b[?2004h).  Once true
// it never returns to false — the flag is a permanent record that the CLI
// supports bracketed-paste mode regardless of ring-buffer eviction.
func (s *TerminalSession) IsBracketedPasteEnabled() bool {
	s.activityMu.RLock()
	defer s.activityMu.RUnlock()
	return s.isBracketedPasteEnabled
}

// bracketedPasteEnableBytes is the 8-byte ANSI sequence a TUI sends to
// enable bracketed-paste mode.  Defined here (rather than only in
// handlers_macro.go) so recordOutput can detect it inline without a
// package-level import cycle.
var bracketedPasteEnableBytes = []byte{0x1b, '[', '?', '2', '0', '0', '4', 'h'}

// containsBracketedPasteEnableSeq reports whether the given chunk contains
// the DECSET 2004 enable sequence.  Called from recordOutput on every PTY
// read, so it must be allocation-free and fast.
func containsBracketedPasteEnableSeq(chunk []byte) bool {
	return bytes.Contains(chunk, bracketedPasteEnableBytes)
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

	bytesWritten, err := s.PTY.Write(data)
	if err != nil {
		log.Printf("[Terminal] WriteToPty error for session %s: %v", s.ID, err)
		return bytesWritten, err
	}

	log.Printf("[Terminal] WriteToPty: wrote %d bytes to session %s", bytesWritten, s.ID)
	return bytesWritten, nil
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
