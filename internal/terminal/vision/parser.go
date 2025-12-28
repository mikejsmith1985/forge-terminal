package vision

import (
	"fmt"
	"sync"
	"time"
)

// Parser manages a ring buffer for stream analysis with debouncing.
type Parser struct {
	mu              sync.RWMutex
	buffer          []byte
	maxSize         int
	registry        *Registry
	lastDetection   time.Time
	debounceTime    time.Duration
	enabled         bool
	insightsTracker *InsightsTracker // Optional insights tracking

	// Image summary for multimodal context bridge
	lastImageSummary     string
	lastImageSummaryTime time.Time
	imageSummaryTTL      time.Duration // How long to keep the summary valid (0 = forever)
}

// NewParser creates a stream parser with specified buffer size.
func NewParser(maxSize int, registry *Registry) *Parser {
	return &Parser{
		buffer:          make([]byte, 0, maxSize),
		maxSize:         maxSize,
		registry:        registry,
		debounceTime:    200 * time.Millisecond, // Wait for output to stabilize
		enabled:         false,                   // Disabled by default (Dev Mode)
		imageSummaryTTL: 5 * time.Minute,        // Image context valid for 5 minutes
	}
}

// SetEnabled toggles parser on/off.
func (p *Parser) SetEnabled(enabled bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.enabled = enabled
}

// Enabled returns whether parser is active.
func (p *Parser) Enabled() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.enabled
}

// Feed adds data to buffer and returns match if detected.
// This is non-blocking and safe to call from PTY read loop.
func (p *Parser) Feed(data []byte) *Match {
	p.mu.Lock()
	defer p.mu.Unlock()
	
	// Skip if disabled
	if !p.enabled {
		return nil
	}
	
	// Append to ring buffer
	p.buffer = append(p.buffer, data...)
	if len(p.buffer) > p.maxSize {
		// Keep most recent data
		p.buffer = p.buffer[len(p.buffer)-p.maxSize:]
	}
	
	// Debounce: only detect if output has stabilized
	now := time.Now()
	if now.Sub(p.lastDetection) < p.debounceTime {
		return nil
	}
	
	// Run detection (fast path - should complete in <1ms)
	match := p.registry.Detect(p.buffer)
	if match != nil {
		p.lastDetection = now
		
		// Record insight if tracker is enabled
		if p.insightsTracker != nil {
			p.recordInsight(match)
		}
		
		// Clear buffer after successful detection to avoid re-triggering
		p.buffer = make([]byte, 0, p.maxSize)
	}
	
	return match
}

// recordInsight converts a match to an insight and records it.
func (p *Parser) recordInsight(match *Match) {
	severity := classifySeverity(match.Type)
	message := generateInsightMessage(match)
	p.insightsTracker.AddInsight(match.Type, severity, message, match.Payload)
}

// SetInsightsTracker attaches an insights tracker to the parser.
func (p *Parser) SetInsightsTracker(tracker *InsightsTracker) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.insightsTracker = tracker
}

// GetInsightsTracker returns the current insights tracker.
func (p *Parser) GetInsightsTracker() *InsightsTracker {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.insightsTracker
}

// classifySeverity determines severity based on match type.
func classifySeverity(matchType string) Severity {
	switch matchType {
	case "COMPILER_ERROR", "STACKTRACE":
		return SeverityError
	case "GIT_CONFLICT":
		return SeverityCritical
	case "GIT_STATUS":
		return SeverityInfo
	case "JSON_BLOCK", "FILE_PATH":
		return SeverityInfo
	default:
		return SeverityWarning
	}
}

// generateInsightMessage creates a human-readable message for an insight.
func generateInsightMessage(match *Match) string {
	switch match.Type {
	case "COMPILER_ERROR":
		if file, ok := match.Payload["file"].(string); ok {
			if line, ok := match.Payload["line"].(int); ok {
				return fmt.Sprintf("Compiler error in %s:%d", file, line)
			}
			return fmt.Sprintf("Compiler error in %s", file)
		}
		return "Compiler error detected"
	case "STACKTRACE":
		if lang, ok := match.Payload["language"].(string); ok {
			return fmt.Sprintf("%s stack trace detected", lang)
		}
		return "Stack trace detected"
	case "GIT_STATUS":
		return "Git status output detected"
	case "GIT_CONFLICT":
		return "Git merge conflict detected"
	case "JSON_BLOCK":
		return "JSON data detected"
	case "FILE_PATH":
		return "File path detected"
	default:
		return fmt.Sprintf("Pattern detected: %s", match.Type)
	}
}

// Clear resets the buffer.
func (p *Parser) Clear() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.buffer = make([]byte, 0, p.maxSize)
}

// SetLastImageSummary stores a summary from image analysis.
// This is used by the multimodal context bridge to give "blind"
// CLI tools (like Copilot) visual context.
func (p *Parser) SetLastImageSummary(summary string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastImageSummary = summary
	p.lastImageSummaryTime = time.Now()
}

// GetLastImageSummary returns the most recent image summary if still valid.
// Returns empty string if no summary exists or if it has expired.
func (p *Parser) GetLastImageSummary() string {
	p.mu.RLock()
	defer p.mu.RUnlock()

	// Check if summary exists
	if p.lastImageSummary == "" {
		return ""
	}

	// Check if summary is still valid (within TTL)
	if p.imageSummaryTTL > 0 && time.Since(p.lastImageSummaryTime) > p.imageSummaryTTL {
		return "" // Expired
	}

	return p.lastImageSummary
}

// ClearImageSummary clears the stored image summary.
func (p *Parser) ClearImageSummary() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastImageSummary = ""
}

// SetImageSummaryTTL sets how long image summaries remain valid.
// Use 0 for no expiration.
func (p *Parser) SetImageSummaryTTL(ttl time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.imageSummaryTTL = ttl
}
