// Package slm provides automatic model downloading for embedded SLM.
// This eliminates external dependencies like Ollama.
package slm

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Model configuration for auto-download
// Using SmolLM2-135M - a tiny but capable instruct model (~100MB quantized)
const (
	// Model details - SmolLM2-135M-Instruct Q4_K_M
	// This is one of the smallest usable LLMs for classification tasks
	DefaultModelName = "smollm2-135m-instruct-q4_k_m.gguf"
	DefaultModelURL  = "https://huggingface.co/lmstudio-community/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf"
	DefaultModelSize = 98_000_000 // ~98MB
	
	// Llama.cpp CLI binary URLs (pre-built releases)
	LlamaCliVersion = "b4547"
	LlamaCliBaseURL = "https://github.com/ggerganov/llama.cpp/releases/download/" + LlamaCliVersion
)

// GetModelDir returns the directory where models are stored.
func GetModelDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".forge/models"
	}
	return filepath.Join(home, ".forge", "models")
}

// GetBinDir returns the directory where binaries are stored.
func GetBinDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".forge/bin"
	}
	return filepath.Join(home, ".forge", "bin")
}

// GetExpectedModelPath returns the full path to the expected model file.
func GetExpectedModelPath() string {
	return filepath.Join(GetModelDir(), DefaultModelName)
}

// GetExpectedBinaryPath returns the full path to llama-cli binary.
func GetExpectedBinaryPath() string {
	binaryName := "llama-cli"
	if runtime.GOOS == "windows" {
		binaryName = "llama-cli.exe"
	}
	return filepath.Join(GetBinDir(), binaryName)
}

// ModelExists checks if the model is already downloaded.
func ModelExists() bool {
	path := GetExpectedModelPath()
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	// Check if file is reasonably sized (at least 50MB)
	return info.Size() > 50_000_000
}

// BinaryExists checks if llama-cli binary exists.
func BinaryExists() bool {
	path := GetExpectedBinaryPath()
	_, err := os.Stat(path)
	return err == nil
}

// DownloadProgress tracks download progress
type DownloadProgress struct {
	Total      int64
	Downloaded int64
	Percent    float64
	Speed      float64 // bytes per second
}

// ProgressCallback is called during download with progress updates
type ProgressCallback func(progress DownloadProgress)

// DownloadModel downloads the SLM model to the local cache.
func DownloadModel(progressCb ProgressCallback) error {
	modelPath := GetExpectedModelPath()
	modelDir := GetModelDir()

	// Create directory if needed
	if err := os.MkdirAll(modelDir, 0755); err != nil {
		return fmt.Errorf("failed to create model directory: %w", err)
	}

	log.Printf("[SLM/Downloader] Downloading model to %s", modelPath)
	log.Printf("[SLM/Downloader] URL: %s", DefaultModelURL)

	// Create temp file for download
	tempPath := modelPath + ".tmp"
	out, err := os.Create(tempPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer out.Close()

	// Start download
	resp, err := http.Get(DefaultModelURL)
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to download model: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		os.Remove(tempPath)
		return fmt.Errorf("download failed with status: %s", resp.Status)
	}

	total := resp.ContentLength
	if total <= 0 {
		total = DefaultModelSize
	}

	// Download with progress tracking
	startTime := time.Now()
	var downloaded int64
	buf := make([]byte, 32*1024) // 32KB buffer

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			_, writeErr := out.Write(buf[:n])
			if writeErr != nil {
				os.Remove(tempPath)
				return fmt.Errorf("failed to write model: %w", writeErr)
			}
			downloaded += int64(n)

			// Report progress
			if progressCb != nil {
				elapsed := time.Since(startTime).Seconds()
				speed := float64(downloaded) / elapsed
				progressCb(DownloadProgress{
					Total:      total,
					Downloaded: downloaded,
					Percent:    float64(downloaded) / float64(total) * 100,
					Speed:      speed,
				})
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			os.Remove(tempPath)
			return fmt.Errorf("download interrupted: %w", err)
		}
	}

	// Move temp file to final location
	out.Close()
	if err := os.Rename(tempPath, modelPath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to finalize model: %w", err)
	}

	log.Printf("[SLM/Downloader] Model downloaded successfully: %d bytes", downloaded)
	return nil
}

// DownloadBinary downloads the llama-cli binary for the current platform.
func DownloadBinary(progressCb ProgressCallback) error {
	binPath := GetExpectedBinaryPath()
	binDir := GetBinDir()

	// Create directory if needed
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}

	// Determine platform-specific binary URL
	var binaryURL string
	var zipFileName string
	switch runtime.GOOS {
	case "windows":
		zipFileName = "llama-" + LlamaCliVersion + "-bin-win-avx2-x64.zip"
		binaryURL = LlamaCliBaseURL + "/" + zipFileName
	case "darwin":
		if runtime.GOARCH == "arm64" {
			zipFileName = "llama-" + LlamaCliVersion + "-bin-macos-arm64.zip"
		} else {
			zipFileName = "llama-" + LlamaCliVersion + "-bin-macos-x64.zip"
		}
		binaryURL = LlamaCliBaseURL + "/" + zipFileName
	case "linux":
		zipFileName = "llama-" + LlamaCliVersion + "-bin-ubuntu-x64.zip"
		binaryURL = LlamaCliBaseURL + "/" + zipFileName
	default:
		return fmt.Errorf("unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	log.Printf("[SLM/Downloader] Downloading llama-cli from %s", binaryURL)

	// Download the zip file
	zipPath := filepath.Join(binDir, zipFileName)
	if err := downloadFile(binaryURL, zipPath, progressCb); err != nil {
		return fmt.Errorf("failed to download binary: %w", err)
	}

	// Extract llama-cli from the zip
	log.Printf("[SLM/Downloader] Extracting llama-cli from %s", zipPath)
	if err := extractLlamaCli(zipPath, binPath); err != nil {
		os.Remove(zipPath)
		return fmt.Errorf("failed to extract binary: %w", err)
	}

	// Clean up zip file
	os.Remove(zipPath)

	// Make binary executable on Unix
	if runtime.GOOS != "windows" {
		if err := os.Chmod(binPath, 0755); err != nil {
			log.Printf("[SLM/Downloader] Warning: failed to set executable permission: %v", err)
		}
	}

	log.Printf("[SLM/Downloader] Binary installed successfully at %s", binPath)
	return nil
}

// downloadFile downloads a file from URL to the specified path with progress.
func downloadFile(url, destPath string, progressCb ProgressCallback) error {
	// Create temp file
	tempPath := destPath + ".tmp"
	out, err := os.Create(tempPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer out.Close()

	// Start download
	resp, err := http.Get(url)
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		os.Remove(tempPath)
		return fmt.Errorf("download failed with status: %s", resp.Status)
	}

	total := resp.ContentLength
	startTime := time.Now()
	var downloaded int64
	buf := make([]byte, 32*1024)

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			_, writeErr := out.Write(buf[:n])
			if writeErr != nil {
				os.Remove(tempPath)
				return fmt.Errorf("failed to write: %w", writeErr)
			}
			downloaded += int64(n)

			if progressCb != nil && total > 0 {
				elapsed := time.Since(startTime).Seconds()
				speed := float64(downloaded) / elapsed
				progressCb(DownloadProgress{
					Total:      total,
					Downloaded: downloaded,
					Percent:    float64(downloaded) / float64(total) * 100,
					Speed:      speed,
				})
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			os.Remove(tempPath)
			return fmt.Errorf("download interrupted: %w", err)
		}
	}

	out.Close()
	if err := os.Rename(tempPath, destPath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to finalize download: %w", err)
	}

	return nil
}

// VerifyModel checks the model file integrity.
func VerifyModel() error {
	path := GetExpectedModelPath()
	
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("model not found: %w", err)
	}

	// Basic size check
	if info.Size() < 50_000_000 {
		return fmt.Errorf("model file too small: %d bytes", info.Size())
	}

	log.Printf("[SLM/Downloader] Model verified: %s (%d MB)", path, info.Size()/1_000_000)
	return nil
}

// ComputeFileHash computes SHA256 hash of a file.
func ComputeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// EnsureModelAvailable downloads the model if not present.
// This is the main entry point called during SLM initialization.
func EnsureModelAvailable(progressCb ProgressCallback) error {
	if ModelExists() {
		log.Printf("[SLM/Downloader] Model already exists at %s", GetExpectedModelPath())
		return nil
	}

	log.Printf("[SLM/Downloader] Model not found, downloading...")
	return DownloadModel(progressCb)
}

// EnsureBinaryAvailable downloads the llama-cli binary if not present.
func EnsureBinaryAvailable(progressCb ProgressCallback) error {
	if BinaryExists() {
		log.Printf("[SLM/Downloader] Binary already exists at %s", GetExpectedBinaryPath())
		return nil
	}

	log.Printf("[SLM/Downloader] Binary not found, downloading...")
	return DownloadBinary(progressCb)
}

// EnsureSLMReady downloads both model and binary if needed.
func EnsureSLMReady(progressCb ProgressCallback) error {
	// Download model first
	if err := EnsureModelAvailable(progressCb); err != nil {
		return fmt.Errorf("model download failed: %w", err)
	}

	// Then download binary
	if err := EnsureBinaryAvailable(progressCb); err != nil {
		return fmt.Errorf("binary download failed: %w", err)
	}

	return nil
}

// extractLlamaCli extracts the llama-cli binary from a zip file.
func extractLlamaCli(zipPath, destPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	// Target binary name
	targetName := "llama-cli"
	if runtime.GOOS == "windows" {
		targetName = "llama-cli.exe"
	}

	// Search for the binary in the zip
	for _, f := range r.File {
		// Check if this is the llama-cli binary
		baseName := filepath.Base(f.Name)
		if baseName != targetName {
			continue
		}

		// Skip directories
		if f.FileInfo().IsDir() {
			continue
		}

		log.Printf("[SLM/Downloader] Found %s in zip at: %s", targetName, f.Name)

		// Open the file in the zip
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("failed to open %s in zip: %w", f.Name, err)
		}
		defer rc.Close()

		// Create destination file
		outFile, err := os.Create(destPath)
		if err != nil {
			return fmt.Errorf("failed to create output file: %w", err)
		}
		defer outFile.Close()

		// Copy content
		if _, err := io.Copy(outFile, rc); err != nil {
			return fmt.Errorf("failed to extract %s: %w", f.Name, err)
		}

		log.Printf("[SLM/Downloader] Extracted %s to %s", targetName, destPath)
		return nil
	}

	// List what we found for debugging
	var files []string
	for _, f := range r.File {
		if !f.FileInfo().IsDir() && strings.Contains(f.Name, "llama") {
			files = append(files, f.Name)
		}
	}
	log.Printf("[SLM/Downloader] Searched for %s but only found: %v", targetName, files)

	return fmt.Errorf("%s not found in zip archive", targetName)
}

// GetInstallationStatus returns a detailed status of SLM installation.
type InstallationStatus struct {
	ModelExists     bool   `json:"model_exists"`
	ModelPath       string `json:"model_path"`
	ModelSizeMB     int64  `json:"model_size_mb,omitempty"`
	BinaryExists    bool   `json:"binary_exists"`
	BinaryPath      string `json:"binary_path"`
	Ready           bool   `json:"ready"`
	ModelName       string `json:"model_name"`
	Platform        string `json:"platform"`
	DownloadURLs    struct {
		Model  string `json:"model"`
		Binary string `json:"binary"`
	} `json:"download_urls"`
}

// GetInstallationStatus returns the current SLM installation status.
func GetInstallationStatus() InstallationStatus {
	status := InstallationStatus{
		ModelExists:  ModelExists(),
		ModelPath:    GetExpectedModelPath(),
		BinaryExists: BinaryExists(),
		BinaryPath:   GetExpectedBinaryPath(),
		ModelName:    DefaultModelName,
		Platform:     runtime.GOOS + "/" + runtime.GOARCH,
	}

	status.Ready = status.ModelExists && status.BinaryExists

	// Get model size if exists
	if info, err := os.Stat(status.ModelPath); err == nil {
		status.ModelSizeMB = info.Size() / 1_000_000
	}

	// Set download URLs
	status.DownloadURLs.Model = DefaultModelURL

	switch runtime.GOOS {
	case "windows":
		status.DownloadURLs.Binary = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-win-avx2-x64.zip"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			status.DownloadURLs.Binary = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-macos-arm64.zip"
		} else {
			status.DownloadURLs.Binary = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-macos-x64.zip"
		}
	case "linux":
		status.DownloadURLs.Binary = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-ubuntu-x64.zip"
	}

	return status
}
