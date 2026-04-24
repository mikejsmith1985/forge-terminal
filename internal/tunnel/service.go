// Package tunnel — opt-in Windows service installation.
//
// cloudflared ships a built-in service installer (`cloudflared service
// install`) that registers a Windows Service running the tunnel with
// the user's config.yml. Forge exposes this behind a toggle in the
// setup wizard so the tunnel survives PC reboots without Forge being
// open — the "scan once, forever" promise hinges on it.
//
// On non-Windows platforms every function returns an explicit "not
// supported" error so the HTTP layer can surface the toggle correctly
// without an OS-specific build graph.
package tunnel

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ServiceStatus is a minimal snapshot of the system-service state.
// Installed is true whenever the Windows Service Control Manager has a
// `cloudflared` service registered — regardless of whether it is
// running.
type ServiceStatus struct {
	Supported bool   `json:"supported"`
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Detail    string `json:"detail,omitempty"`
}

// InstallService registers `cloudflared` as a Windows service pointing
// at the tunnel config.yml the wizard wrote. Idempotent: calling it
// when already installed returns nil.
func InstallService(ctx context.Context) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("service installation is Windows-only in this release")
	}

	bin := ResolvePath()
	if bin == "" {
		return fmt.Errorf("cloudflared not installed — run the setup wizard first")
	}
	// config.yml must exist before service install, otherwise the
	// service will start and immediately crash.
	st := LoadWizardState()
	if !st.Created || st.Config == nil {
		return fmt.Errorf("tunnel not configured yet — complete the setup wizard before enabling the service")
	}

	if status, _ := QueryService(ctx); status.Installed {
		return nil
	}

	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, bin, "--config", st.Config.ConfigPath,
		"service", "install")
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("cloudflared service install failed: %w: %s",
			err, strings.TrimSpace(string(out)))
	}
	return nil
}

// UninstallService removes the Windows service. Safe to call when it is
// not installed — exits cleanly.
func UninstallService(ctx context.Context) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("service uninstall is Windows-only in this release")
	}
	bin := ResolvePath()
	if bin == "" {
		return fmt.Errorf("cloudflared binary missing — cannot uninstall service")
	}

	status, _ := QueryService(ctx)
	if !status.Installed {
		return nil
	}

	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, bin, "service", "uninstall")
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("cloudflared service uninstall failed: %w: %s",
			err, strings.TrimSpace(string(out)))
	}
	return nil
}

// QueryService reports whether the Windows service is installed and
// running. On non-Windows platforms it returns Supported=false so the
// UI can grey out the toggle without a separate capability endpoint.
func QueryService(ctx context.Context) (ServiceStatus, error) {
	if runtime.GOOS != "windows" {
		return ServiceStatus{Supported: false,
			Detail: "startup persistence is Windows-only in this release"}, nil
	}

	sc, err := exec.LookPath("sc")
	if err != nil {
		// Fall back to detecting a service entry via the cloudflared
		// binary's own query if sc.exe is somehow missing.
		return ServiceStatus{Supported: true,
			Detail: "sc.exe not found; assuming not installed"}, nil
	}

	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, sc, "query", "cloudflared")
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		// sc query returns nonzero when the service doesn't exist.
		return ServiceStatus{Supported: true, Installed: false,
			Detail: strings.TrimSpace(string(out))}, nil
	}

	text := strings.ToLower(string(out))
	running := strings.Contains(text, "running")
	return ServiceStatus{Supported: true, Installed: true, Running: running,
		Detail: strings.TrimSpace(string(out))}, nil
}

// safeGetenv is a tiny helper used by tests that need to temporarily
// override behaviour driven by env vars. Defined here to keep the
// main API surface focused.
//
//nolint:unused
func safeGetenv(key string) string {
	return os.Getenv(key)
}
