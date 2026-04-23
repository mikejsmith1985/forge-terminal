//go:build windows

package tunnel

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
)

// hardenWindowsACL replaces the default inherited ACL on dir with a
// user-only ACL using icacls. Falls back to a warning-log-and-continue
// flow if icacls is absent (vanishingly rare on modern Windows).
//
// The sequence:
//   1. Disable inheritance (/inheritance:r) — drops Authenticated
//      Users and BUILTIN\Users from the DACL.
//   2. Grant the current user full control (/grant:r <user>:F).
//   3. Grant SYSTEM full control so Windows services/updates keep
//      working (/grant:r SYSTEM:F).
//
// Each file inside is re-ACLed with the same logic, because files can
// pick up inherited ACEs when created before the directory was
// hardened.
func hardenWindowsACL(dir string) error {
	u, err := user.Current()
	if err != nil {
		return fmt.Errorf("current user: %w", err)
	}
	principal := u.Username
	if principal == "" {
		return fmt.Errorf("current user has no username")
	}

	if err := runICACLS(dir, principal); err != nil {
		return err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		if !isSensitiveTunnelFile(ent.Name()) {
			continue
		}
		if err := runICACLS(filepath.Join(dir, ent.Name()), principal); err != nil {
			return err
		}
	}
	return nil
}

func runICACLS(path, principal string) error {
	icacls, err := exec.LookPath("icacls")
	if err != nil {
		// icacls is shipped with every supported Windows SKU; treat
		// its absence as a non-fatal warning (caller may log).
		return fmt.Errorf("icacls not found: %w", err)
	}

	// Step 1: remove inheritance + drop any groups currently on ACL.
	cmd := exec.Command(icacls, path, "/inheritance:r")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("icacls inheritance:r: %w: %s", err, strings.TrimSpace(string(out)))
	}

	// Step 2: grant current user full control.
	cmd = exec.Command(icacls, path, "/grant:r", principal+":F")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("icacls grant user: %w: %s", err, strings.TrimSpace(string(out)))
	}

	// Step 3: keep SYSTEM so service updates still work.
	cmd = exec.Command(icacls, path, "/grant:r", "SYSTEM:F")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("icacls grant SYSTEM: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
