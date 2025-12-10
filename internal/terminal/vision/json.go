package vision

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
)

// JSONDetector detects JSON blocks in terminal output
type JSONDetector struct {
	mu      sync.RWMutex
	enabled bool
	minSize int // Minimum size threshold (default 30)
}

func NewJSONDetector() *JSONDetector {
	return &JSONDetector{
		enabled: true,
		minSize: 30,
	}
}

// SetMinSize sets the minimum JSON size threshold
func (j *JSONDetector) SetMinSize(minSize int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.minSize = minSize
}

func (j *JSONDetector) Name() string {
	return "json"
}

func (j *JSONDetector) Enabled() bool {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.enabled
}

func (j *JSONDetector) SetEnabled(enabled bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.enabled = enabled
}

func (j *JSONDetector) Detect(buffer []byte) *Match {
	text := string(buffer)
	cleanText := stripAnsi(text)
	
	// Look for JSON object or array patterns
	jsonPattern := regexp.MustCompile(`(\{[\s\S]*?\}|\[[\s\S]*?\])`)
	matches := jsonPattern.FindAllString(cleanText, -1)
	
	if len(matches) == 0 {
		return nil
	}
	
	// Try to parse the largest JSON block
	var largestJSON string
	var largestSize int
	
	for _, match := range matches {
		if len(match) > largestSize {
			// Validate it's actual JSON
			var temp interface{}
			if err := json.Unmarshal([]byte(match), &temp); err == nil {
				largestJSON = match
				largestSize = len(match)
			}
		}
	}
	
	if largestJSON == "" {
		return nil
	}
	
	// Get configured minimum size
	j.mu.RLock()
	minSize := j.minSize
	j.mu.RUnlock()
	
	// Ignore trivial JSON like {} or []
	if largestSize < minSize {
		return nil
	}
	
	// Pretty-print the JSON
	var prettyJSON interface{}
	if err := json.Unmarshal([]byte(largestJSON), &prettyJSON); err != nil {
		return nil
	}
	
	prettyBytes, err := json.MarshalIndent(prettyJSON, "", "  ")
	if err != nil {
		return nil
	}
	
	// Detect JSON type
	jsonType := "object"
	if strings.HasPrefix(strings.TrimSpace(largestJSON), "[") {
		jsonType = "array"
	}
	
	return &Match{
		Type: "JSON_BLOCK",
		Payload: map[string]interface{}{
			"raw":    largestJSON,
			"pretty": string(prettyBytes),
			"type":   jsonType,
			"size":   len(largestJSON),
		},
		Offset: strings.Index(text, largestJSON),
		Length: len(largestJSON),
	}
}
