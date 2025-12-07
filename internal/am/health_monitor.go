// Package am provides health monitoring for the AM system.
package am

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"
)

// LayerStatus represents the status of a single layer.
type LayerStatus struct {
	LayerID       int       `json:"layerId"`
	Name          string    `json:"name"`
	Status        string    `json:"status"`
	LastHeartbeat time.Time `json:"lastHeartbeat"`
	EventCount    int64     `json:"eventCount"`
}

// HealthMetrics tracks overall system metrics.
type HealthMetrics struct {
	TotalEventsProcessed   int64     `json:"totalEventsProcessed"`
	ActiveConversations    int       `json:"activeConversations"`
	LayersOperational      int       `json:"layersOperational"`
	LayersTotal            int       `json:"layersTotal"`
	UptimeSeconds          int64     `json:"uptimeSeconds"`
	LastFullScan           time.Time `json:"lastFullScan"`
	ConversationsStarted   int64     `json:"conversationsStarted"`
	ConversationsCompleted int64     `json:"conversationsCompleted"`
}

// SystemHealth represents the complete health status.
type SystemHealth struct {
	Layers  []*LayerStatus `json:"layers"`
	Metrics *HealthMetrics `json:"metrics"`
	Status  string         `json:"status"`
}

// HealthMonitor tracks the health of all AM layers (Layer 5).
type HealthMonitor struct {
	layers         map[int]*LayerStatus
	mutex          sync.RWMutex
	alertThreshold time.Duration
	metrics        *HealthMetrics
	startTime      time.Time
}

// NewHealthMonitor creates a new health monitor.
func NewHealthMonitor() *HealthMonitor {
	hm := &HealthMonitor{
		layers:         make(map[int]*LayerStatus),
		alertThreshold: 30 * time.Second,
		metrics:        &HealthMetrics{},
		startTime:      time.Now(),
	}

	hm.layers[1] = &LayerStatus{LayerID: 1, Name: "PTY Interceptor", Status: "UNKNOWN"}
	hm.layers[2] = &LayerStatus{LayerID: 2, Name: "Shell Hooks", Status: "UNKNOWN"}
	hm.layers[3] = &LayerStatus{LayerID: 3, Name: "Process Monitor", Status: "UNKNOWN"}
	hm.layers[4] = &LayerStatus{LayerID: 4, Name: "FS Watcher", Status: "UNKNOWN"}
	hm.layers[5] = &LayerStatus{LayerID: 5, Name: "Health Monitor", Status: "HEALTHY", LastHeartbeat: time.Now()}

	return hm
}

// Start begins health monitoring.
func (hm *HealthMonitor) Start(ctx context.Context) {
	log.Printf("[Health Layer 5] Starting health monitor")

	EventBus.Subscribe(hm.handleLayerEvent)

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Health Layer 5] Shutting down")
			return
		case <-ticker.C:
			hm.performHealthCheck()
		}
	}
}

func (hm *HealthMonitor) handleLayerEvent(event *LayerEvent) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	if layer, exists := hm.layers[event.Layer]; exists {
		layer.LastHeartbeat = time.Now()
		layer.EventCount++
		if layer.Status != "HEALTHY" {
			layer.Status = "HEALTHY"
			log.Printf("[Health Layer 5] Layer %d (%s) is now HEALTHY", event.Layer, layer.Name)
		}
	}

	hm.metrics.TotalEventsProcessed++

	switch event.Type {
	case "LLM_START":
		hm.metrics.ConversationsStarted++
		hm.metrics.ActiveConversations++
	case "LLM_END":
		hm.metrics.ConversationsCompleted++
		if hm.metrics.ActiveConversations > 0 {
			hm.metrics.ActiveConversations--
		}
	}
}

func (hm *HealthMonitor) performHealthCheck() {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	now := time.Now()
	operationalCount := 0

	for layerID, status := range hm.layers {
		if layerID == 5 {
			operationalCount++
			continue
		}

		timeSinceHeartbeat := now.Sub(status.LastHeartbeat)

		if status.Status == "UNKNOWN" {
			continue
		}

		if timeSinceHeartbeat > hm.alertThreshold {
			if status.Status == "HEALTHY" {
				status.Status = "DEGRADED"
				log.Printf("[Health Layer 5] Layer %d (%s) is DEGRADED", layerID, status.Name)
			} else if timeSinceHeartbeat > 2*hm.alertThreshold && status.Status == "DEGRADED" {
				status.Status = "FAILED"
				log.Printf("[Health Layer 5] Layer %d (%s) has FAILED", layerID, status.Name)
			}
		}

		if status.Status == "HEALTHY" {
			operationalCount++
		}
	}

	hm.metrics.LayersOperational = operationalCount
	hm.metrics.LayersTotal = len(hm.layers)
	hm.metrics.LastFullScan = now
	hm.metrics.UptimeSeconds = int64(now.Sub(hm.startTime).Seconds())

	// Update Layer 5 heartbeat
	hm.layers[5].LastHeartbeat = now
	hm.layers[5].EventCount++
}

// GetSystemHealth returns the current system health.
func (hm *HealthMonitor) GetSystemHealth() *SystemHealth {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()

	layers := make([]*LayerStatus, 0, len(hm.layers))
	for i := 1; i <= 5; i++ {
		if status, exists := hm.layers[i]; exists {
			layers = append(layers, status)
		}
	}

	status := hm.computeOverallStatus()

	return &SystemHealth{
		Layers:  layers,
		Metrics: hm.metrics,
		Status:  status,
	}
}

// GetLayerStatus returns status for a specific layer.
func (hm *HealthMonitor) GetLayerStatus(layerID int) *LayerStatus {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	return hm.layers[layerID]
}

// GetMetrics returns current metrics.
func (hm *HealthMonitor) GetMetrics() *HealthMetrics {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	return hm.metrics
}

func (hm *HealthMonitor) computeOverallStatus() string {
	operational := 0
	for layerID, status := range hm.layers {
		if layerID == 5 {
			continue
		}
		if status.Status == "HEALTHY" {
			operational++
		}
	}

	if operational == 0 {
		return "CRITICAL"
	} else if operational < 2 {
		return "DEGRADED"
	} else if operational < hm.metrics.LayersTotal-1 {
		return "WARNING"
	}
	return "HEALTHY"
}

// ExportHealthReport writes health data to a file.
func (hm *HealthMonitor) ExportHealthReport(path string) error {
	health := hm.GetSystemHealth()
	data, err := json.MarshalIndent(health, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// RecordPTYHeartbeat records a heartbeat from Layer 1.
func (hm *HealthMonitor) RecordPTYHeartbeat() {
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     1,
		Timestamp: time.Now(),
	})
}
