// Package am provides the main AM system orchestration.
package am

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// System is the main AM system orchestrator.
type System struct {
	Detector            *llm.Detector
	ShellHooksMonitor   *ShellHooksMonitor
	ProcessMonitor      *ProcessMonitor
	FSWatcher           *FSWatcher
	HealthMonitor       *HealthMonitor
	AMDir               string
	enabled             bool
	ctx                 context.Context
	cancel              context.CancelFunc
}

// NewSystem creates and initializes the AM system.
func NewSystem(amDir string) *System {
	return &System{
		Detector: llm.NewDetector(),
		AMDir:    amDir,
		enabled:  false,
	}
}

// Start initializes and starts all AM layers.
func (s *System) Start() error {
	if s.enabled {
		return nil
	}

	log.Printf("[AM System] Initializing Artificial Memory - Multi-Layer System")

	// Ensure AM directory exists
	if err := os.MkdirAll(s.AMDir, 0755); err != nil {
		log.Printf("[AM System] Failed to create AM directory: %v", err)
		return err
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())

	// Layer 2: Shell Hooks Monitor
	s.ShellHooksMonitor = NewShellHooksMonitor()
	go s.ShellHooksMonitor.Start(s.ctx)
	log.Printf("[AM System] Layer 2 (Shell Hooks) started")

	// Layer 3: Process Monitor
	s.ProcessMonitor = NewProcessMonitor(s.Detector, s.AMDir)
	go s.ProcessMonitor.Start(s.ctx)
	log.Printf("[AM System] Layer 3 (Process Monitor) started")

	// Layer 4: FS Watcher
	var err error
	s.FSWatcher, err = NewFSWatcher(s.AMDir)
	if err != nil {
		log.Printf("[AM System] Layer 4 (FS Watcher) failed to start: %v", err)
	} else {
		go s.FSWatcher.Start(s.ctx)
		log.Printf("[AM System] Layer 4 (FS Watcher) started")
	}

	// Layer 5: Health Monitor
	s.HealthMonitor = NewHealthMonitor()
	go s.HealthMonitor.Start(s.ctx)
	log.Printf("[AM System] Layer 5 (Health Monitor) started")

	s.enabled = true
	log.Printf("[AM System] Multi-Layer System initialized (dir: %s)", s.AMDir)

	return nil
}

// Stop shuts down all AM layers.
func (s *System) Stop() {
	if !s.enabled {
		return
	}

	log.Printf("[AM System] Shutting down")

	if s.cancel != nil {
		s.cancel()
	}

	if s.FSWatcher != nil {
		s.FSWatcher.Close()
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

// DefaultAMDir returns the default AM directory path.
func DefaultAMDir() string {
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, ".forge", "am")
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
