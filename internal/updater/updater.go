package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Version is set at build time via ldflags
var Version = "1.20.13"

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
	assetName := getAssetName()
	var downloadURL string
	var assetSize int64

	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			assetSize = asset.Size
			break
		}
	}

	if downloadURL == "" {
		return nil, fmt.Errorf("no binary available for %s/%s", runtime.GOOS, runtime.GOARCH)
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

// DownloadUpdate downloads the new binary to a temp location
func DownloadUpdate(info *UpdateInfo) (string, error) {
	if !info.Available || info.DownloadURL == "" {
		return "", fmt.Errorf("no update available")
	}

	// Create temp file
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, "forge-update"+getExeSuffix())

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(info.DownloadURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	out, err := os.Create(tmpFile)
	if err != nil {
		return "", err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		os.Remove(tmpFile)
		return "", err
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

func getAssetName() string {
	goos := runtime.GOOS
	arch := runtime.GOARCH

	name := fmt.Sprintf("forge-%s-%s", goos, arch)
	if goos == "windows" {
		name += ".exe"
	}
	return name
}

func getExeSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

func compareVersions(v1, v2 string) int {
	// Simple semver comparison
	// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
	parts1 := strings.Split(v1, ".")
	parts2 := strings.Split(v2, ".")

	for i := 0; i < 3; i++ {
		var n1, n2 int
		if i < len(parts1) {
			fmt.Sscanf(parts1[i], "%d", &n1)
		}
		if i < len(parts2) {
			fmt.Sscanf(parts2[i], "%d", &n2)
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
