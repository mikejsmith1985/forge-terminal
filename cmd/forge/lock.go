package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// acquireSingleInstanceLock ensures only one Forge process runs at a time.
//
// It reads ~/.forge/forge.pid on startup; if the stored PID belongs to a
// live process the call returns an error and the caller should exit.
// Otherwise it writes the current PID and returns a release func that
// removes the file on clean shutdown.
//
// There is a narrow TOCTOU window where two simultaneous launches could
// both pass the check, but that scenario is harmless in practice — the
// port-binding step that follows will still serialize them.
func acquireSingleInstanceLock(forgeDir string) (release func(), err error) {
	pidPath := filepath.Join(forgeDir, "forge.pid")

	if raw, rerr := os.ReadFile(pidPath); rerr == nil {
		pidStr := strings.TrimSpace(string(raw))
		if pid, cerr := strconv.Atoi(pidStr); cerr == nil && pid != os.Getpid() {
			if processIsAlive(pid) {
				return nil, fmt.Errorf(
					"Forge is already running (PID %d).\nClose the existing Forge window before starting a new one.",
					pid,
				)
			}
		}
	}

	_ = os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0644)
	return func() { os.Remove(pidPath) }, nil
}
