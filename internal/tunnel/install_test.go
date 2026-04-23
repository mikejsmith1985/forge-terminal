package tunnel

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// withTempHome points os.UserHomeDir at a fresh tmpdir for the duration
// of a test. Returned func restores the original env.
func withTempHome(t *testing.T) (home string, cleanup func()) {
	t.Helper()
	home = t.TempDir()
	var restore func()
	if runtime.GOOS == "windows" {
		prev := os.Getenv("USERPROFILE")
		os.Setenv("USERPROFILE", home)
		restore = func() { os.Setenv("USERPROFILE", prev) }
	} else {
		prev := os.Getenv("HOME")
		os.Setenv("HOME", home)
		restore = func() { os.Setenv("HOME", prev) }
	}
	return home, restore
}

// stubRelease swaps the release URL function to point at the supplied
// httptest server, and stubs the HTTP client's timeout to something
// short to keep unit tests fast.
func stubRelease(t *testing.T, url string, tgz bool) func() {
	t.Helper()
	origFn := releaseURLFn
	releaseURLFn = func() (string, bool, error) { return url, tgz, nil }
	return func() { releaseURLFn = origFn }
}

func TestInstall_DownloadsAndAtomicallyPlacesBinary(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	const payload = "FORGE-TEST-CLOUDFLARED-BYTES"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(payload))
	}))
	defer srv.Close()
	defer stubRelease(t, srv.URL, false)()

	res, err := Install(context.Background())
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if res.Status != "installed" {
		t.Errorf("status = %q, want installed", res.Status)
	}
	if res.Path == "" {
		t.Fatal("path empty")
	}
	if filepath.Dir(res.Path) != BinDir() {
		t.Errorf("installed outside BinDir: %q (BinDir=%q)", res.Path, BinDir())
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatalf("read installed binary: %v", err)
	}
	if string(got) != payload {
		t.Errorf("binary contents = %q, want %q", got, payload)
	}
	// No .part left behind.
	if _, err := os.Stat(res.Path + ".part"); !os.IsNotExist(err) {
		t.Errorf("temp .part file leaked: err=%v", err)
	}
}

func TestInstall_IdempotentWhenAlreadyPresent(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	if err := os.MkdirAll(BinDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := filepath.Join(BinDir(), managedBinaryName())
	if err := os.WriteFile(existing, []byte("already-here"), 0o755); err != nil {
		t.Fatal(err)
	}

	// Server that would fail the test if hit.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("installer unexpectedly hit the network")
	}))
	defer srv.Close()
	defer stubRelease(t, srv.URL, false)()

	res, err := Install(context.Background())
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if res.Status != "already_installed" {
		t.Errorf("status = %q, want already_installed", res.Status)
	}
	if res.Path != existing {
		t.Errorf("path = %q, want %q", res.Path, existing)
	}
}

func TestInstall_HTTPErrorLeavesNoArtifact(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer srv.Close()
	defer stubRelease(t, srv.URL, false)()

	if _, err := Install(context.Background()); err == nil {
		t.Fatal("expected install to fail on HTTP 500")
	}
	// No final binary, no lingering .part.
	final := filepath.Join(BinDir(), managedBinaryName())
	if _, err := os.Stat(final); !os.IsNotExist(err) {
		t.Errorf("final binary leaked: err=%v", err)
	}
	if _, err := os.Stat(final + ".part"); !os.IsNotExist(err) {
		t.Errorf(".part leaked: err=%v", err)
	}
}

func TestInstall_ExtractsTarGz(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	const inner = "EXTRACTED-CLOUDFLARED"
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{
		Name:     "cloudflared",
		Mode:     0o755,
		Size:     int64(len(inner)),
		Typeflag: tar.TypeReg,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write([]byte(inner)); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	archive := buf.Bytes()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(archive)
	}))
	defer srv.Close()
	defer stubRelease(t, srv.URL, true)()

	res, err := Install(context.Background())
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != inner {
		t.Errorf("extracted = %q, want %q", got, inner)
	}
}

func TestInstall_TarGzWithoutCloudflaredErrors(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	_ = tw.WriteHeader(&tar.Header{Name: "README", Size: 4, Typeflag: tar.TypeReg, Mode: 0o644})
	_, _ = tw.Write([]byte("nope"))
	_ = tw.Close()
	_ = gz.Close()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(buf.Bytes())
	}))
	defer srv.Close()
	defer stubRelease(t, srv.URL, true)()

	if _, err := Install(context.Background()); err == nil {
		t.Fatal("expected error when archive has no cloudflared entry")
	}
}

func TestResolveManagedPath_OnlyLooksInForgeBin(t *testing.T) {
	_, cleanup := withTempHome(t)
	defer cleanup()

	if got := ResolveManagedPath(); got != "" {
		t.Errorf("ResolveManagedPath with empty BinDir = %q, want empty", got)
	}

	if err := os.MkdirAll(BinDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(BinDir(), managedBinaryName())
	if err := os.WriteFile(want, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := ResolveManagedPath(); got != want {
		t.Errorf("ResolveManagedPath = %q, want %q", got, want)
	}
}
