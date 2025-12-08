package vision

import (
	"sync"
	"time"
)

// Parser manages a ring buffer for stream analysis with debouncing.
type Parser struct {
	mu            sync.RWMutex
	buffer        []byte
	maxSize       int
	registry      *Registry
	lastDetection time.Time
	debounceTime  time.Duration
	enabled       bool
}

// NewParser creates a stream parser with specified buffer size.
func NewParser(maxSize int, registry *Registry) *Parser {
	return &Parser{
		buffer:       make([]byte, 0, maxSize),
		maxSize:      maxSize,
		registry:     registry,
		debounceTime: 200 * time.Millisecond, // Wait for output to stabilize
		enabled:      false,                   // Disabled by default (Dev Mode)
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
		// Clear buffer after successful detection to avoid re-triggering
		p.buffer = make([]byte, 0, p.maxSize)
	}
	
	return match
}

// Clear resets the buffer.
func (p *Parser) Clear() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.buffer = make([]byte, 0, p.maxSize)
}
