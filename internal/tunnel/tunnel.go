// Package tunnel manages a cloudflared quick-tunnel subprocess.
// It spawns "cloudflared tunnel --url http://localhost:PORT", parses the
// assigned trycloudflare.com URL from the process output, and calls the
// provided callback so callers can propagate the URL to remote services.
package tunnel

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sync"
)

var urlPattern = regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)

// BinDir returns the ~/.forge/bin directory where Forge stores downloaded tools.
func BinDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".forge", "bin")
}

// ResolvePath returns the full path to the cloudflared binary, checking
// ~/.forge/bin first then falling back to PATH.  Empty string means not found.
func ResolvePath() string {
	candidate := filepath.Join(BinDir(), "cloudflared")
	if runtime.GOOS == "windows" {
		candidate += ".exe"
	}
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p
	}
	return ""
}


// Manager owns a single cloudflared subprocess.
type Manager struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	cancel  context.CancelFunc
	url     string
	running bool
	lastErr string
}

// Start launches cloudflared pointing at localPort.
// onURL is called (in a goroutine) each time a trycloudflare.com URL is
// detected in the subprocess output.  Returns an error immediately if
// cloudflared is not found in PATH or the process cannot be started.
func (m *Manager) Start(localPort int, onURL func(url string)) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("tunnel already running")
	}

	bin := ResolvePath()
	if bin == "" {
		return fmt.Errorf("cloudflared not found — install it or use the Forge setup wizard")
	}

	ctx, cancel := context.WithCancel(context.Background())

	// cloudflared writes the URL to stderr; pipe stdout+stderr together.
	pr, pw := io.Pipe()
	cmd := exec.CommandContext(ctx, bin, "tunnel", "--url",
		fmt.Sprintf("http://localhost:%d", localPort), "--no-autoupdate")
	cmd.Stdout = pw
	cmd.Stderr = pw
	hideWindow(cmd)

	if err := cmd.Start(); err != nil {
		cancel()
		pr.Close()
		pw.Close()
		return fmt.Errorf("cloudflared start failed (is it installed?): %w", err)
	}

	m.cmd = cmd
	m.cancel = cancel
	m.running = true
	m.url = ""
	m.lastErr = ""

	// Parse URL from process output.
	go func() {
		defer pr.Close()
		scanner := bufio.NewScanner(pr)
		for scanner.Scan() {
			line := scanner.Text()
			if match := urlPattern.FindString(line); match != "" {
				m.mu.Lock()
				m.url = match
				m.mu.Unlock()
				if onURL != nil {
					go onURL(match)
				}
			}
		}
	}()

	// Close the write-end of the pipe when the process exits, so the scanner above exits.
	go func() {
		_ = cmd.Wait()
		pw.Close()
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
	}()

	return nil
}

// Stop kills the cloudflared process.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.running = false
	m.url = ""
}

// Status returns a snapshot of the current tunnel state.
func (m *Manager) Status() (running bool, url string, lastErr string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running, m.url, m.lastErr
}

// SetError records an error string (used by the handler layer).
func (m *Manager) SetError(e string) {
	m.mu.Lock()
	m.lastErr = e
	m.mu.Unlock()
}

// IsRunning returns true if the tunnel process is alive.
func (m *Manager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running
}
