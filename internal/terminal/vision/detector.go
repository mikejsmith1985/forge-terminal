// Package vision provides stream pattern detection for terminal overlays.
package vision

import (
	"sync"
)

// Match represents a detected pattern in terminal output.
type Match struct {
	Type    string                 // "GIT_STATUS", "JSON_BLOCK", etc.
	Payload map[string]interface{} // Detector-specific parsed data
	Offset  int                    // Position in buffer
	Length  int                    // Match length in bytes
}

// Detector interface for pattern detection.
type Detector interface {
	// Detect analyzes buffer and returns match if pattern found
	Detect(buffer []byte) *Match
	// Name returns detector identifier
	Name() string
	// Enabled returns whether detector is active
	Enabled() bool
	// SetEnabled toggles detector on/off
	SetEnabled(enabled bool)
}

// Registry manages all available detectors.
type Registry struct {
	mu        sync.RWMutex
	detectors []Detector
}

// NewRegistry creates a detector registry with default detectors.
func NewRegistry() *Registry {
	r := &Registry{
		detectors: make([]Detector, 0),
	}
	
	// Register default detectors
	r.Register(NewGitStatusDetector())
	r.Register(NewJSONDetector())
	r.Register(NewFilePathDetector())
	r.Register(NewCompilerErrorDetector())
	r.Register(NewStackTraceDetector())
	
	return r
}

// Register adds a detector to the registry.
func (r *Registry) Register(d Detector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.detectors = append(r.detectors, d)
}

// Detect runs all enabled detectors and returns first match.
func (r *Registry) Detect(buffer []byte) *Match {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	for _, detector := range r.detectors {
		if !detector.Enabled() {
			continue
		}
		
		if match := detector.Detect(buffer); match != nil {
			return match
		}
	}
	
	return nil
}

// GetDetector returns detector by name.
func (r *Registry) GetDetector(name string) Detector {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	for _, d := range r.detectors {
		if d.Name() == name {
			return d
		}
	}
	return nil
}

// ListDetectors returns all registered detector names.
func (r *Registry) ListDetectors() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	names := make([]string, len(r.detectors))
	for i, d := range r.detectors {
		names[i] = d.Name()
	}
	return names
}
