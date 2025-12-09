// Package am provides health monitoring for the AM system.
package am

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
	// Content validation metrics
	ConversationsValidated int       `json:"conversationsValidated"`
	ConversationsCorrupted int       `json:"conversationsCorrupted"`
	LastValidationTime     time.Time `json:"lastValidationTime"`
	ValidationErrors       []string  `json:"validationErrors,omitempty"`
}

// ContentValidation represents validation results for conversation content.
type ContentValidation struct {
	TotalFiles     int      `json:"totalFiles"`
	ValidFiles     int      `json:"validFiles"`
	CorruptedFiles int      `json:"corruptedFiles"`
	Errors         []string `json:"errors,omitempty"`
}

// SystemHealth represents the complete health status.
type SystemHealth struct {
	Layers     []*LayerStatus     `json:"layers"`
	Metrics    *HealthMetrics     `json:"metrics"`
	Status     string             `json:"status"`
	Validation *ContentValidation `json:"validation,omitempty"`
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

	log.Printf("[Health Monitor] ═══ EVENT RECEIVED ═══")
	log.Printf("[Health Monitor] Type: %s, Layer: %d, TabID: %s", event.Type, event.Layer, event.TabID)
	if event.ConvID != "" {
		log.Printf("[Health Monitor] ConversationID: %s, Provider: %s", event.ConvID, event.Provider)
	}

	if layer, exists := hm.layers[event.Layer]; exists {
		layer.LastHeartbeat = time.Now()
		layer.EventCount++
		if layer.Status != "HEALTHY" {
			layer.Status = "HEALTHY"
			log.Printf("[Health Monitor] Layer %d (%s) is now HEALTHY", event.Layer, layer.Name)
		}
		log.Printf("[Health Monitor] Layer %d event count: %d", event.Layer, layer.EventCount)
	} else {
		log.Printf("[Health Monitor] ⚠️ Layer %d not found in layers map", event.Layer)
	}

	hm.metrics.TotalEventsProcessed++

	switch event.Type {
	case "LLM_START":
		hm.metrics.ConversationsStarted++
		hm.metrics.ActiveConversations++
		log.Printf("[Health Monitor] ✓ LLM_START: Total started=%d, Active=%d", 
			hm.metrics.ConversationsStarted, hm.metrics.ActiveConversations)
	case "LLM_END":
		hm.metrics.ConversationsCompleted++
		if hm.metrics.ActiveConversations > 0 {
			hm.metrics.ActiveConversations--
		}
		log.Printf("[Health Monitor] ✓ LLM_END: Total completed=%d, Active=%d", 
			hm.metrics.ConversationsCompleted, hm.metrics.ActiveConversations)
	}
	
	log.Printf("[Health Monitor] Metrics: events=%d, convStarted=%d, convCompleted=%d, active=%d",
		hm.metrics.TotalEventsProcessed, hm.metrics.ConversationsStarted, 
		hm.metrics.ConversationsCompleted, hm.metrics.ActiveConversations)
	log.Printf("[Health Monitor] ═══ END EVENT ═══")
}

func (hm *HealthMonitor) performHealthCheck() {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	now := time.Now()
	operationalCount := 0

	log.Printf("[Health Monitor] ═══ HEALTH CHECK ═══")
	log.Printf("[Health Monitor] Active conversations: %d", hm.metrics.ActiveConversations)
	log.Printf("[Health Monitor] Total started: %d, completed: %d", 
		hm.metrics.ConversationsStarted, hm.metrics.ConversationsCompleted)

	for layerID, status := range hm.layers {
		if layerID == 5 {
			operationalCount++
			continue
		}

		timeSinceHeartbeat := now.Sub(status.LastHeartbeat)

		if status.Status == "UNKNOWN" {
			log.Printf("[Health Monitor] Layer %d (%s): UNKNOWN status", layerID, status.Name)
			continue
		}

		log.Printf("[Health Monitor] Layer %d (%s): status=%s, heartbeat=%s ago, events=%d", 
			layerID, status.Name, status.Status, timeSinceHeartbeat.Round(time.Second), status.EventCount)

		if timeSinceHeartbeat > hm.alertThreshold {
			if status.Status == "HEALTHY" {
				status.Status = "DEGRADED"
				log.Printf("[Health Monitor] ⚠️ Layer %d (%s) is DEGRADED (no heartbeat for %s)", 
					layerID, status.Name, timeSinceHeartbeat.Round(time.Second))
			} else if timeSinceHeartbeat > 2*hm.alertThreshold && status.Status == "DEGRADED" {
				status.Status = "FAILED"
				log.Printf("[Health Monitor] ❌ Layer %d (%s) has FAILED (no heartbeat for %s)", 
					layerID, status.Name, timeSinceHeartbeat.Round(time.Second))
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

	log.Printf("[Health Monitor] Layers operational: %d/%d", operationalCount, len(hm.layers))
	log.Printf("[Health Monitor] Overall status: %s", hm.computeOverallStatus())
	log.Printf("[Health Monitor] ═══ END HEALTH CHECK ═══")

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
	totalRelevant := 0

	for layerID, status := range hm.layers {
		// Skip Layer 5 (self) only — include Layer 2 (Shell Hooks) in overall computation
		if layerID == 5 {
			continue
		}
		totalRelevant++
		if status.Status == "HEALTHY" {
			operational++
		}
	}

	if operational == 0 {
		return "CRITICAL"
	} else if operational == 1 {
		return "DEGRADED"
	} else if operational < totalRelevant {
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

// RecordShellHooksHeartbeat records a heartbeat for Layer 2 (Shell Hooks).
func (hm *HealthMonitor) RecordShellHooksHeartbeat() {
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     2,
		Timestamp: time.Now(),
	})
}

// ANSI artifact patterns that indicate corrupted content
var ansiArtifacts = regexp.MustCompile(`\[\??[0-9;]*[a-zA-Z]|\x1b`)

// ValidateConversationContent checks if a conversation file has valid, clean content.
func ValidateConversationContent(filePath string) (bool, string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return false, "failed to read file: " + err.Error()
	}

	var conv struct {
		Turns []struct {
			Content string `json:"content"`
		} `json:"turns"`
	}

	if err := json.Unmarshal(data, &conv); err != nil {
		return false, "failed to parse JSON: " + err.Error()
	}

	if len(conv.Turns) == 0 {
		return false, "no conversation turns found"
	}

	// Check each turn for ANSI artifacts
	for i, turn := range conv.Turns {
		if len(turn.Content) == 0 {
			continue
		}
		if ansiArtifacts.MatchString(turn.Content) {
			return false, "turn " + string(rune('0'+i)) + " contains ANSI artifacts"
		}
	}

	// Check for minimum content quality
	totalContent := 0
	for _, turn := range conv.Turns {
		totalContent += len(strings.TrimSpace(turn.Content))
	}
	if totalContent < 10 {
		return false, "insufficient content (less than 10 characters)"
	}

	return true, ""
}

// ValidateAllConversations scans all conversation files and returns validation results.
func (hm *HealthMonitor) ValidateAllConversations(amDir string) *ContentValidation {
	validation := &ContentValidation{
		Errors: make([]string, 0),
	}

	files, err := filepath.Glob(filepath.Join(amDir, "llm-conv-*.json"))
	if err != nil {
		validation.Errors = append(validation.Errors, "failed to list files: "+err.Error())
		return validation
	}

	validation.TotalFiles = len(files)
	for _, file := range files {
		valid, errMsg := ValidateConversationContent(file)
		if valid {
			validation.ValidFiles++
		} else {
			validation.CorruptedFiles++
			validation.Errors = append(validation.Errors, filepath.Base(file)+": "+errMsg)
		}
	}

	// Update health metrics
	hm.mutex.Lock()
	hm.metrics.ConversationsValidated = validation.ValidFiles
	hm.metrics.ConversationsCorrupted = validation.CorruptedFiles
	hm.metrics.LastValidationTime = time.Now()
	if len(validation.Errors) > 5 {
		hm.metrics.ValidationErrors = validation.Errors[:5] // Keep first 5 errors
	} else {
		hm.metrics.ValidationErrors = validation.Errors
	}
	hm.mutex.Unlock()

	log.Printf("[Health Monitor] Content validation complete: %d valid, %d corrupted out of %d files",
		validation.ValidFiles, validation.CorruptedFiles, validation.TotalFiles)

	return validation
}
