package tunnel

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// installHTTPClient is overridable in tests.
var installHTTPClient = &http.Client{Timeout: 90 * time.Second}

// releaseURLFn is overridable in tests so the installer can be driven
// against a local httptest server.
var releaseURLFn = cloudflaredReleaseURL

// cloudflaredReleaseURL returns the platform-specific download URL for the
// latest cloudflared release. Supports darwin (tgz, amd64/arm64), linux
// (raw binary, amd64/arm64), and windows (exe, amd64/arm64).
func cloudflaredReleaseURL() (url string, isTarGz bool, err error) {
	const base = "https://github.com/cloudflare/cloudflared/releases/latest/download/"
	switch runtime.GOOS {
	case "windows":
		switch runtime.GOARCH {
		case "amd64":
			return base + "cloudflared-windows-amd64.exe", false, nil
		case "arm64":
			return base + "cloudflared-windows-arm64.exe", false, nil
		case "386":
			return base + "cloudflared-windows-386.exe", false, nil
		}
	case "darwin":
		switch runtime.GOARCH {
		case "amd64":
			return base + "cloudflared-darwin-amd64.tgz", true, nil
		case "arm64":
			return base + "cloudflared-darwin-arm64.tgz", true, nil
		}
	case "linux":
		switch runtime.GOARCH {
		case "amd64":
			return base + "cloudflared-linux-amd64", false, nil
		case "arm64":
			return base + "cloudflared-linux-arm64", false, nil
		case "arm":
			return base + "cloudflared-linux-arm", false, nil
		case "386":
			return base + "cloudflared-linux-386", false, nil
		}
	}
	return "", false, fmt.Errorf("cloudflared: no prebuilt binary for %s/%s", runtime.GOOS, runtime.GOARCH)
}

// managedBinaryName is the on-disk filename for the Forge-managed
// cloudflared copy.
func managedBinaryName() string {
	if runtime.GOOS == "windows" {
		return "cloudflared.exe"
	}
	return "cloudflared"
}

// ResolveManagedPath returns the path to the Forge-managed cloudflared
// binary in ~/.forge/bin/, IF it exists. Unlike ResolvePath() it does
// NOT fall back to PATH — callers that need to know "did we install
// this ourselves" use this variant.
func ResolveManagedPath() string {
	p := filepath.Join(BinDir(), managedBinaryName())
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// InstallResult describes the outcome of Install.
type InstallResult struct {
	Path    string `json:"path"`
	Status  string `json:"status"` // "installed" | "already_installed"
	Version string `json:"version,omitempty"`
}

// Install downloads the platform-appropriate cloudflared release into
// ~/.forge/bin/ atomically. If a managed copy already exists the call
// is a no-op.
//
// Atomic write: the binary is streamed into a sibling temp file,
// fsync'd, closed, then renamed into place. This guarantees that a
// mid-download crash never leaves a half-written executable at the
// final path.
//
// On darwin the release artifact is a tarball that contains a single
// "cloudflared" binary at the root — we extract it in-memory so the
// caller sees the same two-step "download+place" contract as the
// other platforms.
func Install(ctx context.Context) (InstallResult, error) {
	if p := ResolveManagedPath(); p != "" {
		return InstallResult{Path: p, Status: "already_installed"}, nil
	}

	binDir := BinDir()
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return InstallResult{}, fmt.Errorf("create bin dir: %w", err)
	}

	url, isTarGz, err := releaseURLFn()
	if err != nil {
		return InstallResult{}, err
	}

	finalPath := filepath.Join(binDir, managedBinaryName())
	tmpPath := finalPath + ".part"

	// Clean up any stale .part from a previous failed run.
	_ = os.Remove(tmpPath)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return InstallResult{}, fmt.Errorf("build request: %w", err)
	}
	resp, err := installHTTPClient.Do(req)
	if err != nil {
		return InstallResult{}, fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return InstallResult{}, fmt.Errorf("download: HTTP %d", resp.StatusCode)
	}

	var src io.Reader = resp.Body
	if isTarGz {
		binR, err := extractCloudflaredFromTarGz(resp.Body)
		if err != nil {
			return InstallResult{}, fmt.Errorf("extract tgz: %w", err)
		}
		defer binR.Close()
		src = binR
	}

	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return InstallResult{}, fmt.Errorf("open temp: %w", err)
	}
	if _, err := io.Copy(f, src); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		return InstallResult{}, fmt.Errorf("write: %w", err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		return InstallResult{}, fmt.Errorf("fsync: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return InstallResult{}, fmt.Errorf("close: %w", err)
	}

	// Windows Rename will not overwrite; since we already guarded on
	// ResolveManagedPath above this shouldn't matter, but be defensive.
	if _, err := os.Stat(finalPath); err == nil {
		_ = os.Remove(finalPath)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return InstallResult{}, fmt.Errorf("rename: %w", err)
	}
	// Re-apply exec bit after rename (rename preserves but be explicit).
	_ = os.Chmod(finalPath, 0o755)

	return InstallResult{Path: finalPath, Status: "installed"}, nil
}

// tarReadCloser pairs a tar file reader with its backing gzip reader so
// both are closed together.
type tarReadCloser struct {
	io.Reader
	closers []io.Closer
}

func (t *tarReadCloser) Close() error {
	var firstErr error
	for _, c := range t.closers {
		if err := c.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// extractCloudflaredFromTarGz finds the "cloudflared" entry inside a
// .tgz stream and returns an io.ReadCloser positioned at its contents.
// Only the first matching regular-file entry is returned.
func extractCloudflaredFromTarGz(body io.Reader) (io.ReadCloser, error) {
	gz, err := gzip.NewReader(body)
	if err != nil {
		return nil, err
	}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			gz.Close()
			return nil, err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		name := filepath.Base(hdr.Name)
		if strings.EqualFold(name, "cloudflared") {
			return &tarReadCloser{Reader: tr, closers: []io.Closer{gz}}, nil
		}
	}
	gz.Close()
	return nil, errors.New("cloudflared binary not found in archive")
}
