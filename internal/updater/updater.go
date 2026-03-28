package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Version is set at build time via ldflags
var Version = "4.1.1"

// GitHub repo info
const (
	repoOwner = "mikejsmith1985"
	repoName  = "forge-terminal"
)

// Release represents a GitHub release
type Release struct {
	TagName     string  `json:"tag_name"`
	Name        string  `json:"name"`
	Body        string  `json:"body"`
	PublishedAt string  `json:"published_at"`
	Assets      []Asset `json:"assets"`
}

// Asset represents a release asset (binary)
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// UpdateInfo contains information about an available update
type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseNotes   string `json:"releaseNotes"`
	DownloadURL    string `json:"downloadUrl"`
	AssetName      string `json:"assetName"`
	AssetSize      int64  `json:"assetSize"`
}

// CheckForUpdate checks GitHub for a newer version
func CheckForUpdate() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", repoOwner, repoName)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Forge-Terminal-Updater")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		// No releases yet
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: Version,
		}, nil
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}

	// Parse version (remove 'v' prefix if present)
	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion := strings.TrimPrefix(Version, "v")

	// Simple version comparison - assumes semver format
	isNewer := compareVersions(latestVersion, currentVersion) > 0

	if !isNewer {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: Version,
			LatestVersion:  release.TagName,
		}, nil
	}

	// Find the right asset for this platform
	assetNames := getAssetNames()
	var downloadURL string
	var assetSize int64
	var assetName string

	for _, name := range assetNames {
		for _, asset := range release.Assets {
			// Case-insensitive match for Windows .exe extension
			match := false
			if runtime.GOOS == "windows" {
				match = strings.EqualFold(asset.Name, name)
			} else {
				match = asset.Name == name
			}

			if match {
				downloadURL = asset.BrowserDownloadURL
				assetSize = asset.Size
				assetName = name
				break
			}
		}
		if downloadURL != "" {
			break
		}
	}

	if downloadURL == "" {
		return nil, fmt.Errorf("no binary available for %s/%s (tried: %v)", runtime.GOOS, runtime.GOARCH, assetNames)
	}

	return &UpdateInfo{
		Available:      true,
		CurrentVersion: Version,
		LatestVersion:  release.TagName,
		ReleaseNotes:   release.Body,
		DownloadURL:    downloadURL,
		AssetName:      assetName,
		AssetSize:      assetSize,
	}, nil
}

// DownloadUpdate downloads the new binary to a temp location with retry logic
func DownloadUpdate(info *UpdateInfo) (string, error) {
	return DownloadUpdateWithRetries(info, 3) // Default to 3 retries
}

// DownloadUpdateWithRetries downloads the new binary with configurable retry count
func DownloadUpdateWithRetries(info *UpdateInfo, maxRetries int) (string, error) {
	if !info.Available || info.DownloadURL == "" {
		return "", fmt.Errorf("no update available")
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 1s, 2s, 4s
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			if backoff > 10*time.Second {
				backoff = 10 * time.Second
			}
			time.Sleep(backoff)
		}
		
		tmpFile, err := downloadUpdateAttempt(info, attempt)
		if err == nil {
			return tmpFile, nil
		}
		lastErr = err
		
		// Log retry attempt
		if attempt < maxRetries {
			fmt.Printf("[Updater] Download attempt %d failed: %v, retrying...\n", attempt+1, err)
		}
	}
	
	return "", fmt.Errorf("download failed after %d attempts: %w", maxRetries+1, lastErr)
}

// downloadUpdateAttempt performs a single download attempt
func downloadUpdateAttempt(info *UpdateInfo, attempt int) (string, error) {
	// Create temp file
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, "forge-update"+getExeSuffix())

	// Use a transport based on DefaultTransport with adjusted timeouts
	// v3.12.2: Separate transport per attempt to avoid connection reuse issues
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:          (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          10,
		MaxIdleConnsPerHost:   2,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second, // Allow time for GitHub redirect
		DisableKeepAlives:     false,            // Enable keep-alives for better performance
	}
	
	// v3.12.2: Custom redirect handling to apply timeouts to redirects too
	client := &http.Client{
		Transport: transport,
		Timeout:   0, // No overall timeout - let the body download take as long as needed
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			// Copy headers to redirect request
			req.Header.Set("User-Agent", "Forge-Terminal-Updater/"+Version)
			return nil
		},
	}

	// Create request with context for cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	
	req, err := http.NewRequestWithContext(ctx, "GET", info.DownloadURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Forge-Terminal-Updater/"+Version)
	req.Header.Set("Accept", "application/octet-stream")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	// v3.12.2: Handle various HTTP status codes
	switch {
	case resp.StatusCode == 200:
		// Success, continue
	case resp.StatusCode == 302 || resp.StatusCode == 301:
		// Should have been followed automatically, but handle just in case
		return "", fmt.Errorf("unexpected redirect (status %d)", resp.StatusCode)
	case resp.StatusCode == 404:
		return "", fmt.Errorf("release asset not found (404) - release may not be ready yet")
	case resp.StatusCode >= 500:
		return "", fmt.Errorf("GitHub server error (status %d) - try again later", resp.StatusCode)
	default:
		return "", fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	out, err := os.Create(tmpFile)
	if err != nil {
		return "", err
	}
	defer out.Close()

	// Wrap response body with timeout reader - timeout after 60 seconds of no data
	// This prevents hanging if the connection stalls during download
	timeoutReader, downloadCtx := newTimeoutReader(ctx, resp.Body, 60*time.Second)
	defer timeoutReader.Close()

	// Copy with stall detection
	written, err := io.Copy(out, timeoutReader)
	if err != nil {
		os.Remove(tmpFile)
		return "", fmt.Errorf("download interrupted after %d bytes: %w", written, err)
	}

	// Check if context was cancelled due to stall
	if downloadCtx.Err() != nil {
		os.Remove(tmpFile)
		return "", fmt.Errorf("download stalled after %d bytes (no data for 60 seconds)", written)
	}

	// Verify download size if known
	if info.AssetSize > 0 && written != info.AssetSize {
		os.Remove(tmpFile)
		return "", fmt.Errorf("download incomplete: got %d bytes, expected %d", written, info.AssetSize)
	}

	// Make executable on Unix
	if runtime.GOOS != "windows" {
		os.Chmod(tmpFile, 0755)
	}

	return tmpFile, nil
}

// ApplyUpdate replaces the current binary with the new one
func ApplyUpdate(newBinaryPath string) error {
	currentPath, err := os.Executable()
	if err != nil {
		return err
	}

	// Resolve symlinks
	currentPath, err = filepath.EvalSymlinks(currentPath)
	if err != nil {
		return err
	}

	// On Windows, we can't replace a running binary directly
	// We need to rename it first, then copy the new one
	if runtime.GOOS == "windows" {
		oldPath := currentPath + ".old"
		// Remove old backup if exists
		os.Remove(oldPath)
		// Rename current to .old
		if err := os.Rename(currentPath, oldPath); err != nil {
			return fmt.Errorf("failed to backup current binary: %w", err)
		}
		// Copy new binary to current path
		if err := copyFile(newBinaryPath, currentPath); err != nil {
			// Restore backup
			os.Rename(oldPath, currentPath)
			return fmt.Errorf("failed to install new binary: %w", err)
		}
		// Clean up
		os.Remove(newBinaryPath)
		// Note: .old file will be cleaned up on next update
	} else {
		// On Unix, we can do atomic replace
		if err := os.Rename(newBinaryPath, currentPath); err != nil {
			// Fallback to copy
			if err := copyFile(newBinaryPath, currentPath); err != nil {
				return fmt.Errorf("failed to install new binary: %w", err)
			}
			os.Remove(newBinaryPath)
		}
		os.Chmod(currentPath, 0755)
	}

	return nil
}

// GetVersion returns the current version
func GetVersion() string {
	return Version
}

// ReleaseInfo represents a simplified release for the versions list
type ReleaseInfo struct {
	Version      string `json:"version"`
	Name         string `json:"name"`
	PublishedAt  string `json:"publishedAt"`
	ReleaseNotes string `json:"releaseNotes"`
	DownloadURL  string `json:"downloadUrl"`
	IsCurrent    bool   `json:"isCurrent"`
}

// ListReleases returns the last N releases for rollback
func ListReleases(limit int) ([]ReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases?per_page=%d", repoOwner, repoName, limit)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Forge-Terminal-Updater")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var releases []Release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}

	assetName := getAssetName()
	currentVersion := strings.TrimPrefix(Version, "v")
	result := make([]ReleaseInfo, 0, len(releases))

	for _, release := range releases {
		var downloadURL string
		for _, asset := range release.Assets {
			if asset.Name == assetName {
				downloadURL = asset.BrowserDownloadURL
				break
			}
		}

		version := strings.TrimPrefix(release.TagName, "v")
		result = append(result, ReleaseInfo{
			Version:      release.TagName,
			Name:         release.Name,
			PublishedAt:  release.PublishedAt,
			ReleaseNotes: release.Body,
			DownloadURL:  downloadURL,
			IsCurrent:    version == currentVersion,
		})
	}

	return result, nil
}

// Helper functions

// getAssetNames returns a list of asset names to try, in priority order
// Windows: Try new name (fterm.exe) first, fallback to old name for transition
func getAssetNames() []string {
	goos := runtime.GOOS
	arch := runtime.GOARCH

	if goos == "windows" {
		// Try new name first, fallback to old name for backward compatibility
		return []string{"fterm.exe", "forge-windows-amd64.exe"}
	}

	return []string{fmt.Sprintf("forge-%s-%s", goos, arch)}
}

func getAssetName() string {
	// Keep for compatibility - returns first preference
	return getAssetNames()[0]
}

func getExeSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

func compareVersions(v1, v2 string) int {
	parts1 := parseVersion(v1)
	parts2 := parseVersion(v2)

	maxParts := len(parts1)
	if len(parts2) > maxParts {
		maxParts = len(parts2)
	}

	for i := 0; i < maxParts; i++ {
		var n1, n2 int
		if i < len(parts1) {
			n1 = parts1[i]
		}
		if i < len(parts2) {
			n2 = parts2[i]
		}
		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	return 0
}

func parseVersion(v string) []int {
	parts := strings.Split(v, ".")
	result := make([]int, 0, len(parts))

	for _, part := range parts {
		var num int
		_, _ = fmt.Sscanf(part, "%d", &num)
		result = append(result, num)
	}

	return result
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// timeoutReader wraps an io.Reader and cancels if no data is received within the timeout
type timeoutReader struct {
	reader      io.Reader
	timeout     time.Duration
	cancel      context.CancelFunc
	mu          sync.Mutex
	lastRead    time.Time
	totalBytes  int64
	checkTicker *time.Ticker
	done        chan struct{}
}

func newTimeoutReader(ctx context.Context, r io.Reader, timeout time.Duration) (*timeoutReader, context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	tr := &timeoutReader{
		reader:      r,
		timeout:     timeout,
		cancel:      cancel,
		lastRead:    time.Now(),
		checkTicker: time.NewTicker(timeout / 2),
		done:        make(chan struct{}),
	}
	
	// Background goroutine to check for stalled reads
	go func() {
		defer tr.checkTicker.Stop()
		for {
			select {
			case <-tr.done:
				return
			case <-tr.checkTicker.C:
				tr.mu.Lock()
				elapsed := time.Since(tr.lastRead)
				tr.mu.Unlock()
				if elapsed > tr.timeout {
					tr.cancel()
					return
				}
			}
		}
	}()
	
	return tr, ctx
}

func (tr *timeoutReader) Read(p []byte) (int, error) {
	n, err := tr.reader.Read(p)
	if n > 0 {
		tr.mu.Lock()
		tr.lastRead = time.Now()
		tr.totalBytes += int64(n)
		tr.mu.Unlock()
	}
	return n, err
}

func (tr *timeoutReader) Close() {
	close(tr.done)
}
