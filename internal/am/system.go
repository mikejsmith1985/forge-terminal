// Package am provides the main AM system orchestration.
package am

import (
	"log"
	"os"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// System is the main AM system orchestrator.
// Uses async pipeline for non-blocking capture to prevent UI freezes.
type System struct {
	Detector      *llm.Detector
	HealthMonitor *HealthMonitor
	Pipeline      *AsyncPipeline // Async non-blocking pipeline
	AMDir         string
	enabled       bool
}

// NewSystem creates and initializes the AM system.
func NewSystem(amDir string) *System {
	return &System{
		Detector: llm.NewDetector(),
		AMDir:    amDir,
		enabled:  false,
	}
}

// Start initializes the AM system.
func (s *System) Start() error {
	if s.enabled {
		return nil
	}

	log.Printf("[AM System] Initializing Artificial Memory")

	// Ensure AM directory exists
	if err := os.MkdirAll(s.AMDir, 0755); err != nil {
		log.Printf("[AM System] Failed to create AM directory: %v", err)
		return err
	}

	// Health Monitor (simplified - tracks capture metrics)
	s.HealthMonitor = NewHealthMonitor()
	log.Printf("[AM System] Health monitor initialized")

	// Initialize async pipeline for non-blocking capture
	s.Pipeline = NewAsyncPipeline(DefaultPipelineConfig())
	s.Pipeline.Start(s)
	log.Printf("[AM System] Async pipeline initialized")

	s.enabled = true
	log.Printf("[AM System] Initialized (dir: %s)", s.AMDir)

	return nil
}

// Stop shuts down the AM system.
func (s *System) Stop() {
	if !s.enabled {
		return
	}

	log.Printf("[AM System] Shutting down")
	
	// Stop the async pipeline first
	if s.Pipeline != nil {
		s.Pipeline.Stop()
		s.Pipeline = nil
	}
	
	s.enabled = false
	log.Printf("[AM System] Shutdown complete")
}

// IsEnabled returns whether the AM system is running.
func (s *System) IsEnabled() bool {
	return s.enabled
}

// GetLLMLogger returns an LLM logger for a specific tab.
func (s *System) GetLLMLogger(tabID string) *LLMLogger {
	if !s.enabled {
		return nil
	}
	return GetLLMLogger(tabID, s.AMDir)
}

// GetHealth returns current system health.
func (s *System) GetHealth() *SystemHealth {
	if s.HealthMonitor == nil {
		return &SystemHealth{
			Status: "NOT_INITIALIZED",
		}
	}
	return s.HealthMonitor.GetSystemHealth()
}

// GetActiveConversations returns all active LLM conversations.
func (s *System) GetActiveConversations() map[string]*LLMConversation {
	return GetActiveConversations()
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-BLOCKING PRODUCER METHODS
// These are called from the PTY read loop and MUST NOT block.
// ═══════════════════════════════════════════════════════════════════════════════

// EnqueueInput sends input data to the async pipeline without blocking.
// Safe to call from the PTY read loop - will drop data if pipeline is full.
func (s *System) EnqueueInput(tabID string, data []byte) bool {
	if !s.enabled || s.Pipeline == nil {
		return false
	}
	return s.Pipeline.EnqueueInput(tabID, data)
}

// EnqueueOutput sends output data to the async pipeline without blocking.
// Safe to call from the PTY read loop - will drop data if pipeline is full.
func (s *System) EnqueueOutput(tabID string, data []byte) bool {
	if !s.enabled || s.Pipeline == nil {
		return false
	}
	return s.Pipeline.EnqueueOutput(tabID, data)
}

// EnqueueCommand sends a command for LLM detection without blocking.
// Safe to call from the PTY read loop - will drop data if pipeline is full.
func (s *System) EnqueueCommand(tabID string, command string) bool {
	if !s.enabled || s.Pipeline == nil {
		return false
	}
	return s.Pipeline.EnqueueCommand(tabID, command)
}

// GetPipelineStats returns pipeline statistics (processed, dropped).
func (s *System) GetPipelineStats() (processed, dropped int64) {
	if s.Pipeline == nil {
		return 0, 0
	}
	return s.Pipeline.GetStats()
}

// DefaultAMDir returns the default AM directory path.
func DefaultAMDir() string {
	return storage.GetAMDir()
}

// Global AM system instance
var globalSystem *System

// GetSystem returns the global AM system instance.
func GetSystem() *System {
	return globalSystem
}

// InitSystem initializes the global AM system.
func InitSystem(amDir string) *System {
	globalSystem = NewSystem(amDir)
	return globalSystem
}
