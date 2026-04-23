// Package tunnel — credential hardening helpers.
//
// The named-tunnel wizard writes cert.pem, <uuid>.json, and config.yml
// to `~/.forge/tunnel/`. These files grant anyone who can read them the
// ability to impersonate the user's Cloudflare tunnel, so the directory
// is tightened to 0700 and each file to 0600 immediately after write.
//
// Windows does not honour POSIX mode bits; the equivalent — restricting
// the ACL to the current user — is attempted best-effort via icacls.
// Failures are logged but non-fatal: the user can still operate, just
// with a wider ACL than we'd prefer, and they'll get a startup warning
// next time they launch Forge.
package tunnel

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// HardenTunnelDir applies tight permissions to the `~/.forge/tunnel/`
// directory and every credential-bearing file within it. Safe to call
// repeatedly and from any phase of the wizard.
//
// On POSIX: dir → 0700, cert.pem/<uuid>.json/config.yml/state.json → 0600.
// On Windows: delegates to hardenWindowsACL (best-effort icacls).
// Files that don't exist are skipped silently.
func HardenTunnelDir() error {
	// Escape hatch for test suites that use t.TempDir() — icacls
	// /inheritance:r on transient dirs can confuse RemoveAll cleanup
	// because the TempDir parent retains inherited perms while the
	// tunnel dir does not. The wizard test helper sets this env var.
	if os.Getenv("FORGE_TUNNEL_SKIP_HARDEN") == "1" {
		return nil
	}
	dir := DefaultForgeTunnelDir()
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat tunnel dir: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", dir)
	}

	if runtime.GOOS == "windows" {
		return hardenWindowsACL(dir)
	}

	// POSIX path — dir 0700, sensitive files 0600.
	if err := os.Chmod(dir, 0o700); err != nil {
		return fmt.Errorf("chmod dir: %w", err)
	}
	return hardenFilesIn(dir)
}

// hardenFilesIn walks dir one level deep (no recursion — wizard only
// writes flat files) and chmods every known-sensitive file to 0600.
// Unknown files are ignored to avoid locking the user out of their own
// additions (e.g. a backup they dropped in the directory).
func hardenFilesIn(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read tunnel dir: %w", err)
	}
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if !isSensitiveTunnelFile(name) {
			continue
		}
		path := filepath.Join(dir, name)
		if err := os.Chmod(path, 0o600); err != nil {
			return fmt.Errorf("chmod %s: %w", name, err)
		}
	}
	return nil
}

// isSensitiveTunnelFile returns true for filenames the wizard writes
// that must never be world-readable. A short allow-list is safer than
// a pattern-match because it won't accidentally relax perms on the
// user's own drop-ins.
func isSensitiveTunnelFile(name string) bool {
	switch name {
	case "cert.pem", "config.yml", "state.json", preferenceFilename:
		return true
	}
	// <uuid>.json credential files follow the cloudflared naming
	// convention — 36-char hex with hyphens. Cheap check.
	if len(name) == 41 && filepath.Ext(name) == ".json" &&
		name[8] == '-' && name[13] == '-' && name[18] == '-' && name[23] == '-' {
		return true
	}
	return false
}
