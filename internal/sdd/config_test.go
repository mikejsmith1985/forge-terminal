// config_test.go — verifies the notify endpoint honors its env override and falls back to
// the documented local default.
package sdd

import (
	"strings"
	"testing"
)

func TestNotifyURL_DefaultAndOverride(t *testing.T) {
	t.Setenv(notifyURLEnvVar, "")
	if got := notifyURL(); got != defaultNotifyURL {
		t.Errorf("default notifyURL = %q, want %q", got, defaultNotifyURL)
	}

	t.Setenv(notifyURLEnvVar, "http://localhost:9999/hook")
	if got := notifyURL(); got != "http://localhost:9999/hook" {
		t.Errorf("override notifyURL = %q, want the env value", got)
	}
}

func TestStateDir_UnderForgeHome(t *testing.T) {
	dir, err := stateDir()
	if err != nil {
		t.Skipf("no home dir in this environment: %v", err)
	}
	if !strings.HasSuffix(strings.ReplaceAll(dir, "\\", "/"), ".forge/"+stateDirName) {
		t.Errorf("stateDir = %q, want it to end with .forge/%s", dir, stateDirName)
	}
}
