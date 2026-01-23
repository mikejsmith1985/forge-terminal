package vision

import (
	"regexp"
	"strings"
	"sync"
)

// UrlDetector detects URLs in terminal output, specifically focusing on image URLs
// that might be embedded in GitHub issue comments or other text.
type UrlDetector struct {
	mu      sync.RWMutex
	enabled bool
}

func NewUrlDetector() *UrlDetector {
	return &UrlDetector{
		enabled: true,
	}
}

func (u *UrlDetector) Name() string {
	return "url"
}

func (u *UrlDetector) Enabled() bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.enabled
}

func (u *UrlDetector) SetEnabled(enabled bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.enabled = enabled
}

func (u *UrlDetector) Detect(buffer []byte) *Match {
	text := string(buffer)
	
	// Pattern to find standard URLs
	// We specifically look for GitHub user content URLs which host images
	// pattern: https://github.com/user-attachments/assets/...
	// or standard image extensions
	
	// Regex for GitHub user attachments (common in issue comments)
	ghPattern := regexp.MustCompile(`https://github\.com/user-attachments/assets/[a-zA-Z0-9-]+`)
	
	// Regex for generic image URLs
	imgPattern := regexp.MustCompile(`https?://[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp|svg)`)

	var foundUrl string
	var matchType string

	// Check GitHub pattern first
	if match := ghPattern.FindString(text); match != "" {
		foundUrl = match
		matchType = "GITHUB_ASSET"
	} else if match := imgPattern.FindString(text); match != "" {
		foundUrl = match
		matchType = "IMAGE_URL"
	}

	if foundUrl == "" {
		return nil
	}

	// Remove any trailing punctuation that might have been caught
	foundUrl = strings.TrimRight(foundUrl, ".,;)")

	return &Match{
		Type: "URL_DETECTED",
		Payload: map[string]interface{}{
			"url":       foundUrl,
			"urlType":   matchType,
			"isImage":   true, // Both patterns imply image content
		},
		Offset: strings.Index(text, foundUrl),
		Length: len(foundUrl),
	}
}
