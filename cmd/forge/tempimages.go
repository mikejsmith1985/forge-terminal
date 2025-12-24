package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Session temp directory - created once per app session, cleaned on startup
var sessionTempDir string

func initSessionTempDir() error {
	// Create temp dir in OS temp folder
	baseTemp := os.TempDir()
	sessionTempDir = filepath.Join(baseTemp, "forge-terminal-session")
	
	// Remove old session dir if it exists
	os.RemoveAll(sessionTempDir)
	
	// Create fresh session dir
	if err := os.MkdirAll(sessionTempDir, 0755); err != nil {
		return fmt.Errorf("failed to create session temp dir: %w", err)
	}
	
	log.Printf("[TempDir] Session temp directory initialized: %s", sessionTempDir)
	
	return nil
}

func handleTempImageUpload(w http.ResponseWriter, r *http.Request) {
	// Add recovery to prevent crashes
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[TempDir] PANIC in handleTempImageUpload: %v", rec)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Validate session temp dir exists
	if sessionTempDir == "" {
		log.Printf("[TempDir] Session temp directory not initialized")
		http.Error(w, "Temp directory not initialized", http.StatusInternalServerError)
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB max
		log.Printf("[TempDir] Failed to parse multipart form: %v", err)
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		log.Printf("[TempDir] Failed to get form file: %v", err)
		http.Error(w, "No image provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate header
	if header == nil {
		log.Printf("[TempDir] Form file header is nil")
		http.Error(w, "Invalid file upload", http.StatusBadRequest)
		return
	}

	// Validate it's an image
	if !isImageFile(header.Filename) {
		log.Printf("[TempDir] Invalid image file type: %s", header.Filename)
		http.Error(w, "File must be an image", http.StatusBadRequest)
		return
	}

	// Generate timestamp-based filename
	timestamp := time.Now().Format("20060102-150405")
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("screenshot-%s%s", timestamp, ext)
	
	// Save to session temp dir
	destPath := filepath.Join(sessionTempDir, filename)
	
	dst, err := os.Create(destPath)
	if err != nil {
		log.Printf("[TempDir] Failed to create temp file: %v", err)
		http.Error(w, "Failed to save image", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("[TempDir] Failed to write temp file: %v", err)
		http.Error(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	log.Printf("[TempDir] Temp image saved: %s (%d bytes)", destPath, header.Size)

	// Use json.Marshal to properly escape Windows paths
	response := map[string]string{
		"filePath": destPath,
		"filename": filename,
	}
	
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("[TempDir] Failed to encode JSON response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func isImageFile(filename string) bool {
	ext := filepath.Ext(filename)
	imageExts := []string{".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}
	
	for _, validExt := range imageExts {
		if ext == validExt {
			return true
		}
	}
	
	return false
}
