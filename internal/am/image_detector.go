// Package am provides image/binary detection for the async pipeline.
// This prevents parsing binary data as text, which would corrupt output.
package am

import (
	"bytes"
	"encoding/base64"
)

// Image format magic bytes (first few bytes of common formats)
var (
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	pngMagic = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	// JPEG: FF D8 FF
	jpegMagic = []byte{0xFF, 0xD8, 0xFF}
	// GIF: 47 49 46 38
	gifMagic = []byte{0x47, 0x49, 0x46, 0x38}
	// WebP: 52 49 46 46 ... 57 45 42 50
	webpMagic = []byte{0x52, 0x49, 0x46, 0x46}
	// BMP: 42 4D
	bmpMagic = []byte{0x42, 0x4D}
)

// Base64 prefixes for data URIs
var base64Prefixes = [][]byte{
	[]byte("data:image/png;base64,"),
	[]byte("data:image/jpeg;base64,"),
	[]byte("data:image/jpg;base64,"),
	[]byte("data:image/gif;base64,"),
	[]byte("data:image/webp;base64,"),
	[]byte("data:image/bmp;base64,"),
	[]byte("data:image/svg+xml;base64,"),
	[]byte("data:application/octet-stream;base64,"),
}

// ImageDetectionResult contains the result of image detection.
type ImageDetectionResult struct {
	IsImage     bool
	IsBinary    bool
	IsBase64    bool
	Format      string // "png", "jpeg", "gif", "webp", "bmp", "unknown"
	DataStart   int    // Where the actual data starts (after prefix)
	Confidence  float64
}

// DetectImageData performs high-performance detection of image/binary data.
// This runs in the hot path, so it must be fast.
func DetectImageData(data []byte) ImageDetectionResult {
	if len(data) < 8 {
		return ImageDetectionResult{}
	}

	// Check for raw image magic bytes first (fastest check)
	if bytes.HasPrefix(data, pngMagic) {
		return ImageDetectionResult{
			IsImage:    true,
			IsBinary:   true,
			Format:     "png",
			Confidence: 1.0,
		}
	}
	if bytes.HasPrefix(data, jpegMagic) {
		return ImageDetectionResult{
			IsImage:    true,
			IsBinary:   true,
			Format:     "jpeg",
			Confidence: 1.0,
		}
	}
	if bytes.HasPrefix(data, gifMagic) {
		return ImageDetectionResult{
			IsImage:    true,
			IsBinary:   true,
			Format:     "gif",
			Confidence: 1.0,
		}
	}
	if bytes.HasPrefix(data, webpMagic) && len(data) >= 12 {
		// WebP needs additional check for "WEBP" at offset 8
		if bytes.Equal(data[8:12], []byte{0x57, 0x45, 0x42, 0x50}) {
			return ImageDetectionResult{
				IsImage:    true,
				IsBinary:   true,
				Format:     "webp",
				Confidence: 1.0,
			}
		}
	}
	if bytes.HasPrefix(data, bmpMagic) {
		return ImageDetectionResult{
			IsImage:    true,
			IsBinary:   true,
			Format:     "bmp",
			Confidence: 1.0,
		}
	}

	// Check for base64-encoded data URI
	for _, prefix := range base64Prefixes {
		if bytes.HasPrefix(data, prefix) {
			format := extractFormatFromPrefix(prefix)
			return ImageDetectionResult{
				IsImage:    true,
				IsBase64:   true,
				Format:     format,
				DataStart:  len(prefix),
				Confidence: 1.0,
			}
		}
	}

	// Check for base64-encoded raw data (no data URI prefix)
	// This is a heuristic check - look for base64 characteristics
	if isLikelyBase64Image(data) {
		return ImageDetectionResult{
			IsImage:    true,
			IsBase64:   true,
			Format:     "unknown",
			Confidence: 0.8,
		}
	}

	// Check for high ratio of non-printable bytes (binary data)
	if isBinaryData(data) {
		return ImageDetectionResult{
			IsBinary:   true,
			Confidence: 0.9,
		}
	}

	return ImageDetectionResult{}
}

// extractFormatFromPrefix extracts image format from data URI prefix.
func extractFormatFromPrefix(prefix []byte) string {
	s := string(prefix)
	switch {
	case bytes.Contains(prefix, []byte("png")):
		return "png"
	case bytes.Contains(prefix, []byte("jpeg")) || bytes.Contains(prefix, []byte("jpg")):
		return "jpeg"
	case bytes.Contains(prefix, []byte("gif")):
		return "gif"
	case bytes.Contains(prefix, []byte("webp")):
		return "webp"
	case bytes.Contains(prefix, []byte("bmp")):
		return "bmp"
	case bytes.Contains(prefix, []byte("svg")):
		return "svg"
	default:
		_ = s // suppress unused
		return "unknown"
	}
}

// isLikelyBase64Image checks if data looks like base64-encoded image.
// Checks first 256 bytes for base64 characteristics + decodes to check magic.
func isLikelyBase64Image(data []byte) bool {
	if len(data) < 32 {
		return false
	}

	// Check first 256 bytes for base64 characteristics
	checkLen := 256
	if len(data) < checkLen {
		checkLen = len(data)
	}

	base64Chars := 0
	for i := 0; i < checkLen; i++ {
		b := data[i]
		if (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') ||
			(b >= '0' && b <= '9') || b == '+' || b == '/' || b == '=' {
			base64Chars++
		} else if b != '\n' && b != '\r' && b != ' ' {
			// Non-base64, non-whitespace character
			return false
		}
	}

	// Must be mostly base64 characters
	if float64(base64Chars)/float64(checkLen) < 0.9 {
		return false
	}

	// Try to decode first chunk and check for image magic
	decoded := make([]byte, 32)
	decodeLen := 48
	if len(data) < decodeLen {
		decodeLen = len(data)
	}
	n, err := base64.StdEncoding.Decode(decoded, data[:decodeLen])
	if err != nil || n < 8 {
		return false
	}

	// Check decoded data for image magic
	if bytes.HasPrefix(decoded[:n], pngMagic) ||
		bytes.HasPrefix(decoded[:n], jpegMagic) ||
		bytes.HasPrefix(decoded[:n], gifMagic) ||
		bytes.HasPrefix(decoded[:n], bmpMagic) {
		return true
	}

	return false
}

// isBinaryData checks if data has high ratio of non-printable bytes.
func isBinaryData(data []byte) bool {
	if len(data) < 32 {
		return false
	}

	// Check first 512 bytes
	checkLen := 512
	if len(data) < checkLen {
		checkLen = len(data)
	}

	nonPrintable := 0
	for i := 0; i < checkLen; i++ {
		b := data[i]
		// Non-printable: not in range 0x20-0x7E and not common whitespace
		if b < 0x20 && b != '\n' && b != '\r' && b != '\t' {
			nonPrintable++
		} else if b > 0x7E && b < 0xC0 {
			// High bytes that aren't valid UTF-8 continuation
			nonPrintable++
		}
	}

	// More than 10% non-printable = binary
	return float64(nonPrintable)/float64(checkLen) > 0.10
}

// minInt returns the minimum of two integers.
// Named minInt to avoid conflict with builtin min in Go 1.21+
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
