package tunnel

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestIsSensitiveTunnelFile(t *testing.T) {
	cases := map[string]bool{
		"cert.pem":                                          true,
		"config.yml":                                        true,
		"state.json":                                        true,
		"preference.json":                                   true,
		"aaaabbbb-cccc-dddd-eeee-ffff11112222.json":         true,
		"README.md":                                         false,
		"random-file.txt":                                   false,
		"too-short.json":                                    false,
		"12345678-1234-1234-1234-123456789012.txt":          false,
	}
	for name, want := range cases {
		if got := isSensitiveTunnelFile(name); got != want {
			t.Errorf("%s: want %v got %v", name, want, got)
		}
	}
}

func TestHardenTunnelDirNoOpIfAbsent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	if err := HardenTunnelDir(); err != nil {
		t.Fatalf("HardenTunnelDir on missing dir should be nil, got %v", err)
	}
}

func TestHardenTunnelDirChmods(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX mode bits are no-op on Windows; covered by icacls path in manual tests")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	dir := filepath.Join(home, ".forge", "tunnel")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// Seed with one sensitive + one irrelevant file.
	sensitive := filepath.Join(dir, "cert.pem")
	irrelevant := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(sensitive, []byte("x"), 0o644); err != nil {
		t.Fatalf("write cert: %v", err)
	}
	if err := os.WriteFile(irrelevant, []byte("x"), 0o644); err != nil {
		t.Fatalf("write notes: %v", err)
	}

	if err := HardenTunnelDir(); err != nil {
		t.Fatalf("harden: %v", err)
	}

	dirInfo, _ := os.Stat(dir)
	if dirInfo.Mode().Perm() != 0o700 {
		t.Errorf("dir perms want 0700 got %o", dirInfo.Mode().Perm())
	}
	certInfo, _ := os.Stat(sensitive)
	if certInfo.Mode().Perm() != 0o600 {
		t.Errorf("cert.pem perms want 0600 got %o", certInfo.Mode().Perm())
	}
	// Irrelevant file should NOT be touched.
	notesInfo, _ := os.Stat(irrelevant)
	if notesInfo.Mode().Perm() != 0o644 {
		t.Errorf("notes.txt perms should be unchanged, got %o", notesInfo.Mode().Perm())
	}
}
