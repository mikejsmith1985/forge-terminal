// build-assets.go - Asset generation for Forge Terminal
// This tool generates Windows .ico files from the Forge logo for branding

//go:build ignore

package main

import (
	"fmt"
	"image"
	"image/png"
	"log"
	"os"
	"path/filepath"

	"github.com/nfnt/resize"
)

const (
	logoPNGPath  = "assets/logo.png"
	outputICODir = "cmd/forge"
	outputICO    = "app.ico"
)

func main() {
	log.Println("=== Forge Terminal Asset Generator ===")

	if err := generateWindowsIcon(); err != nil {
		log.Fatalf("Failed to generate Windows icon: %v", err)
	}

	log.Println("✓ Asset generation complete!")
}

// generateWindowsIcon creates a Windows .ico file from logo.png
func generateWindowsIcon() error {
	log.Printf("Generating Windows icon from %s...", logoPNGPath)

	// Check if logo.png exists
	if _, err := os.Stat(logoPNGPath); os.IsNotExist(err) {
		return fmt.Errorf("logo file not found at %s - please create assets/logo.png first", logoPNGPath)
	}

	// Open and decode the PNG logo
	logoFile, err := os.Open(logoPNGPath)
	if err != nil {
		return fmt.Errorf("failed to open logo: %w", err)
	}
	defer logoFile.Close()

	logoImg, err := png.Decode(logoFile)
	if err != nil {
		return fmt.Errorf("failed to decode PNG: %w", err)
	}

	// Generate multiple icon sizes (Windows standard)
	iconSizes := []uint{16, 32, 48, 64, 128, 256}
	var icons []image.Image

	for _, size := range iconSizes {
		log.Printf("  - Generating %dx%d icon...", size, size)
		resized := resize.Resize(size, size, logoImg, resize.Lanczos3)
		icons = append(icons, resized)
	}

	// Create output directory if it doesn't exist
	if err := os.MkdirAll(outputICODir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Write the .ico file
	outputPath := filepath.Join(outputICODir, outputICO)
	icoFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create .ico file: %w", err)
	}
	defer icoFile.Close()

	if err := encodeICO(icoFile, icons); err != nil {
		return fmt.Errorf("failed to encode .ico: %w", err)
	}

	log.Printf("✓ Windows icon created: %s", outputPath)
	return nil
}

// encodeICO writes multiple images as a Windows .ico file
// ICO format structure:
// - ICONDIR header (6 bytes)
// - ICONDIRENTRY array (16 bytes each)
// - PNG/BMP image data
func encodeICO(file *os.File, images []image.Image) error {
	numImages := uint16(len(images))

	// Write ICONDIR header
	// Reserved (2 bytes) = 0
	// Type (2 bytes) = 1 (icon)
	// Count (2 bytes) = number of images
	header := []byte{0, 0, 1, 0, byte(numImages), byte(numImages >> 8)}
	if _, err := file.Write(header); err != nil {
		return err
	}

	// Calculate offsets for image data
	offset := uint32(6 + 16*numImages) // Header + all ICONDIRENTRY entries

	// Write ICONDIRENTRY for each image
	var imageData [][]byte
	for _, img := range images {
		bounds := img.Bounds()
		width := uint8(bounds.Dx())
		height := uint8(bounds.Dy())

		// Encode image as PNG
		pngBuf := &bytesWriter{data: make([]byte, 0, 1024*1024)}
		if err := png.Encode(pngBuf, img); err != nil {
			return err
		}
		imageData = append(imageData, pngBuf.data)

		size := uint32(len(pngBuf.data))

		// Write ICONDIRENTRY (16 bytes)
		entry := []byte{
			width,             // Width (0 = 256)
			height,            // Height (0 = 256)
			0,                 // Color palette (0 = no palette)
			0,                 // Reserved
			1, 0,              // Color planes
			32, 0,             // Bits per pixel
			byte(size),        // Image size (little-endian)
			byte(size >> 8),
			byte(size >> 16),
			byte(size >> 24),
			byte(offset),      // Image offset (little-endian)
			byte(offset >> 8),
			byte(offset >> 16),
			byte(offset >> 24),
		}
		if _, err := file.Write(entry); err != nil {
			return err
		}

		offset += size
	}

	// Write actual image data
	for _, data := range imageData {
		if _, err := file.Write(data); err != nil {
			return err
		}
	}

	return nil
}

// bytesWriter implements io.Writer for in-memory byte accumulation
type bytesWriter struct {
	data []byte
}

func (w *bytesWriter) Write(p []byte) (n int, err error) {
	w.data = append(w.data, p...)
	return len(p), nil
}
