// Package slm provides automatic model downloading for embedded SLM.
// This eliminates external dependencies like Ollama.
package slm

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
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
	switch runtime.GOOS {
	case "windows":
		binaryURL = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-win-avx2-x64.zip"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			binaryURL = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-macos-arm64.zip"
		} else {
			binaryURL = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-macos-x64.zip"
		}
	case "linux":
		binaryURL = LlamaCliBaseURL + "/llama-" + LlamaCliVersion + "-bin-ubuntu-x64.zip"
	default:
		return fmt.Errorf("unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	log.Printf("[SLM/Downloader] Downloading llama-cli from %s", binaryURL)

	// For now, just log that we need the binary
	// Full implementation would download and extract the zip
	log.Printf("[SLM/Downloader] Binary download not yet implemented")
	log.Printf("[SLM/Downloader] Please download llama-cli manually from: %s", binaryURL)
	log.Printf("[SLM/Downloader] And place it at: %s", binPath)

	return fmt.Errorf("automatic binary download not yet implemented - please install llama-cli manually")
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
