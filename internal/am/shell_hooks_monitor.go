// Package am provides shell hooks monitoring for Layer 2.
package am

import (
	"context"
	"log"
	"time"
)

// ShellHooksMonitor monitors shell hook activity (Layer 2).
type ShellHooksMonitor struct {
	heartbeatInterval time.Duration
}

// NewShellHooksMonitor creates a new shell hooks monitor.
func NewShellHooksMonitor() *ShellHooksMonitor {
	return &ShellHooksMonitor{
		heartbeatInterval: 10 * time.Second,
	}
}

// Start begins shell hooks monitoring.
func (shm *ShellHooksMonitor) Start(ctx context.Context) {
	log.Printf("[Shell Layer 2] Starting shell hooks monitor")

	// Initial heartbeat
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     2,
		Timestamp: time.Now(),
	})

	ticker := time.NewTicker(shm.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Shell Layer 2] Shutting down")
			return
		case <-ticker.C:
			EventBus.Publish(&LayerEvent{
				Type:      "HEARTBEAT",
				Layer:     2,
				Timestamp: time.Now(),
			})
		}
	}
}
