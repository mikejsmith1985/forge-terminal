// Package tunnel manages a cloudflared or Tailscale Funnel subprocess.
// It supports three modes:
//   - ModeEphemeral:  spawns "cloudflared tunnel --url http://localhost:PORT" and
//     parses the randomly-assigned trycloudflare.com URL from process output.
//   - ModePersistent: spawns "cloudflared tunnel run --token TOKEN" for a
//     Cloudflare named tunnel with a stable, user-configured public hostname.
//   - ModeTailscale:  calls "tailscale funnel <PORT>" (managed by Tailscale
//     daemon) and reads the stable device URL from "tailscale status --json".
package tunnel

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Mode controls which tunnel backend is used.
type Mode int

const (
	// ModeEphemeral starts a Cloudflare quick tunnel (random trycloudflare.com URL).
	ModeEphemeral Mode = iota
	// ModePersistent starts a Cloudflare named tunnel via token; public URL is
	// stable and configured by the user in the Cloudflare Zero Trust dashboard.
	ModePersistent
	// ModeTailscale uses Tailscale Funnel to expose the local port at a stable
	// persistent URL tied to the device's Tailscale hostname (e.g. https://mypc.tail1234.ts.net).
	ModeTailscale
)

// StartConfig holds all options needed to start the tunnel.
type StartConfig struct {
	Mode      Mode
	LocalPort int    // used in ModeEphemeral and ModeTailscale
	Token     string // ModePersistent only: Cloudflare named tunnel token
	Hostname  string // ModePersistent only: stable public URL configured in Cloudflare
}

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
// ResolveTailscalePath returns the full path to the tailscale binary,
// checking common install locations then falling back to PATH.
// Returns empty string if not found.
func ResolveTailscalePath() string {
	if runtime.GOOS == "windows" {
		for _, candidate := range []string{
			filepath.Join(os.Getenv("ProgramFiles"), "Tailscale", "tailscale.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Tailscale", "tailscale.exe"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}
	if p, err := exec.LookPath("tailscale"); err == nil {
		return p
	}
	return ""
}


type Manager struct {
	mu      sync.Mutex
	cmd     *exec.Cmd          // cloudflared subprocess (nil for Tailscale)
	cancel  context.CancelFunc // cloudflared context cancel (nil for Tailscale)
	stopFn  func()             // Tailscale stop function (nil for cloudflared)
	url     string
	running bool
	lastErr string
}

// Start launches the tunnel according to cfg.
// Dispatches to startCloudflared or startTailscale based on cfg.Mode.
func (m *Manager) Start(cfg StartConfig, onURL func(url string)) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("tunnel already running")
	}

	if cfg.Mode == ModeTailscale {
		return m.startTailscale(cfg, onURL)
	}
	return m.startCloudflared(cfg, onURL)
}

// startCloudflared handles ModeEphemeral and ModePersistent.
// Must be called with m.mu held.
func (m *Manager) startCloudflared(cfg StartConfig, onURL func(url string)) error {
	bin := ResolvePath()
	if bin == "" {
		return fmt.Errorf("cloudflared not found — install it or use the Forge setup wizard")
	}

	if cfg.Mode == ModePersistent && cfg.Token == "" {
		return fmt.Errorf("persistent tunnel requires a Cloudflare tunnel token")
	}
	if cfg.Mode == ModePersistent && cfg.Hostname == "" {
		return fmt.Errorf("persistent tunnel requires a public hostname (configured in Cloudflare Zero Trust)")
	}

	ctx, cancel := context.WithCancel(context.Background())

	pr, pw := io.Pipe()

	var cmd *exec.Cmd
	if cfg.Mode == ModePersistent {
		cmd = exec.CommandContext(ctx, bin, "tunnel", "run", "--token", cfg.Token, "--no-autoupdate")
	} else {
		cmd = exec.CommandContext(ctx, bin, "tunnel", "--url",
			fmt.Sprintf("http://localhost:%d", cfg.LocalPort), "--no-autoupdate")
	}
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
	m.stopFn = nil
	m.running = true
	m.lastErr = ""

	if cfg.Mode == ModePersistent {
		m.url = cfg.Hostname
		if onURL != nil {
			go onURL(cfg.Hostname)
		}
		go func() {
			defer pr.Close()
			scanner := bufio.NewScanner(pr)
			for scanner.Scan() {
				// discard — URL already reported
			}
		}()
	} else {
		m.url = ""
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
	}

	go func() {
		_ = cmd.Wait()
		pw.Close()
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
	}()

	return nil
}

// startTailscale handles ModeTailscale.
// Verifies the Tailscale daemon is running, calls "tailscale funnel <port>"
// to enable the funnel (a stateful config change managed by the daemon — exits
// quickly), then reads the stable device URL from "tailscale status --json".
// All subcommands run with a 30-second timeout to prevent indefinite hangs
// when the daemon is unresponsive.
// Must be called with m.mu held.
func (m *Manager) startTailscale(cfg StartConfig, onURL func(url string)) error {
	bin := ResolveTailscalePath()
	if bin == "" {
		return fmt.Errorf("tailscale not found — install Tailscale from https://tailscale.com/download")
	}

	portStr := strconv.Itoa(cfg.LocalPort)

	// Step 1: verify the daemon is running and the user is signed in.
	// Use a short timeout so we fail fast if the daemon is not responding.
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		checkCmd := exec.CommandContext(ctx, bin, "status", "--json")
		hideWindow(checkCmd)
		checkOut, checkErr := checkCmd.Output()
		if checkErr != nil {
			if ctx.Err() == context.DeadlineExceeded {
				return fmt.Errorf("tailscale daemon is not responding — open the Tailscale app and make sure it is running, then try again")
			}
			return fmt.Errorf("tailscale is not running — open the Tailscale app, sign in, and try again")
		}
		var checkStatus struct {
			BackendState string `json:"BackendState"`
			Self         struct {
				DNSName string `json:"DNSName"`
			} `json:"Self"`
		}
		if err := json.Unmarshal(checkOut, &checkStatus); err == nil {
			if checkStatus.BackendState != "" && checkStatus.BackendState != "Running" {
				return fmt.Errorf("tailscale is not connected (state: %s) — open the Tailscale app and sign in first", checkStatus.BackendState)
			}
			if checkStatus.Self.DNSName == "" {
				return fmt.Errorf("tailscale is not signed in — open the Tailscale app and sign in first")
			}
		}
	}

	// Step 2: reset any existing funnel config first to avoid "listener already exists" errors,
	// then enable Funnel for the local port.
	// Run with a 30-second timeout — the command should exit in under a second
	// once the daemon is running; the timeout guards against daemon hangs.
	resetCtx, resetCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer resetCancel()
	exec.CommandContext(resetCtx, bin, "funnel", "--reset").Run() //nolint:errcheck

	funnelCtx, funnelCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer funnelCancel()

	funnelCmd := exec.CommandContext(funnelCtx, bin, "funnel", portStr)
	hideWindow(funnelCmd)
	funnelOut, funnelErr := funnelCmd.CombinedOutput()

	if funnelErr != nil {
		if funnelCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("tailscale funnel timed out — make sure Tailscale is running and HTTPS certificates are enabled at https://login.tailscale.com/admin/dns")
		}
		msg := strings.TrimSpace(string(funnelOut))
		if strings.Contains(msg, "not enabled") || strings.Contains(msg, "login.tailscale.com/f/funnel") {
			// Extract the enable URL if Tailscale provided one
			for _, line := range strings.Split(msg, "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "https://login.tailscale.com/f/funnel") {
					return fmt.Errorf("Tailscale Funnel is not enabled on your tailnet — visit this URL to enable it: %s", line)
				}
			}
			return fmt.Errorf("Tailscale Funnel is not enabled on your tailnet — visit https://login.tailscale.com/admin/settings/acls to enable it")
		}
		if strings.Contains(msg, "HTTPS") || strings.Contains(msg, "https") || strings.Contains(msg, "certificate") {
			return fmt.Errorf("tailscale funnel requires HTTPS certificates — enable HTTPS in your Tailscale admin console at https://login.tailscale.com/admin/dns then try again")
		}
		if msg == "" {
			return fmt.Errorf("tailscale funnel failed — make sure Tailscale is running and HTTPS certificates are enabled")
		}
		return fmt.Errorf("tailscale funnel failed: %s", msg)
	}

	// Step 3: read the stable device hostname from status.
	statusCtx, statusCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer statusCancel()
	statusCmd := exec.CommandContext(statusCtx, bin, "status", "--json")
	hideWindow(statusCmd)
	statusOut, err := statusCmd.Output()
	if err != nil {
		resetTailscaleFunnel(bin)
		return fmt.Errorf("tailscale status failed: %w", err)
	}

	var tsStatus struct {
		Self struct {
			DNSName string `json:"DNSName"`
		} `json:"Self"`
	}
	if err := json.Unmarshal(statusOut, &tsStatus); err != nil || tsStatus.Self.DNSName == "" {
		resetTailscaleFunnel(bin)
		return fmt.Errorf("could not read Tailscale device URL — is Tailscale signed in?")
	}

	tunnelURL := "https://" + strings.TrimSuffix(tsStatus.Self.DNSName, ".")

	m.cmd = nil
	m.cancel = nil
	m.stopFn = func() { resetTailscaleFunnel(bin) }
	m.url = tunnelURL
	m.running = true
	m.lastErr = ""

	if onURL != nil {
		go onURL(tunnelURL)
	}

	return nil
}

// resetTailscaleFunnel disables the Tailscale Funnel configuration for this device.
func resetTailscaleFunnel(bin string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, bin, "funnel", "--reset").Run(); err != nil {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel2()
		exec.CommandContext(ctx2, bin, "funnel", "reset").Run() //nolint:errcheck
	}
}

// Stop kills the cloudflared process or resets the Tailscale funnel.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	if m.stopFn != nil {
		go m.stopFn()
		m.stopFn = nil
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
