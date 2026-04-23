package tunnel

import (
	"context"
	"runtime"
	"testing"
)

func TestQueryServiceNonWindows(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("non-Windows behaviour")
	}
	st, err := QueryService(context.Background())
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if st.Supported {
		t.Fatalf("non-Windows should report Supported=false")
	}
	if st.Detail == "" {
		t.Fatalf("detail should explain why it's unsupported")
	}
}

func TestInstallServiceNonWindows(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("non-Windows behaviour")
	}
	if err := InstallService(context.Background()); err == nil {
		t.Fatalf("install should error on non-Windows")
	}
	if err := UninstallService(context.Background()); err == nil {
		t.Fatalf("uninstall should error on non-Windows")
	}
}

func TestInstallServiceRequiresBinaryAndConfig(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows-only path")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	// No cloudflared binary in an empty home directory; error
	// message should make that clear.
	err := InstallService(context.Background())
	if err == nil {
		t.Fatalf("expected error when cloudflared missing")
	}
	// Either cloudflared-missing or tunnel-not-configured is fine;
	// both are correct preconditions.
}
