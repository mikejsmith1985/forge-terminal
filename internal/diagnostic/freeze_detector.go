// Package diagnostic provides freeze detection and system monitoring.
package diagnostic

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// FreezeDetector monitors system state to detect and diagnose freezes.
type FreezeDetector struct {
	mu              sync.RWMutex
	enabled         atomic.Bool
	checkInterval   time.Duration
	stopChan        chan struct{}
	metrics         []FreezeMetrics
	maxMetrics      int
	alertThresholds AlertThresholds
	onAlert         func(alert FreezeAlert)
	logFile         *os.File
	startTime       time.Time
}

// FreezeMetrics captures a snapshot of system state.
type FreezeMetrics struct {
	Timestamp       time.Time `json:"timestamp"`
	GoroutineCount  int       `json:"goroutineCount"`
	HeapAllocMB     float64   `json:"heapAllocMB"`
	HeapSysMB       float64   `json:"heapSysMB"`
	HeapObjectCount uint64    `json:"heapObjects"`
	GCPauseTotalMs  float64   `json:"gcPauseTotalMs"`
	GCNumGC         uint32    `json:"gcNumGC"`
	GCLastPauseMs   float64   `json:"gcLastPauseMs"`
	NumCPU          int       `json:"numCPU"`
	NumCgoCall      int64     `json:"numCgoCall"`
	StackInUseMB    float64   `json:"stackInUseMB"`

	// Derived metrics
	GoroutineDelta   int     `json:"goroutineDelta"`
	HeapGrowthMB     float64 `json:"heapGrowthMB"`
	GCPauseDeltaMs   float64 `json:"gcPauseDeltaMs"`
	TimeSinceLastMs  int64   `json:"timeSinceLastMs"`

	// Alerts triggered
	Alerts []string `json:"alerts,omitempty"`
}

// AlertThresholds defines when to trigger alerts.
type AlertThresholds struct {
	GoroutineMax       int     `json:"goroutineMax"`
	GoroutineGrowth    int     `json:"goroutineGrowth"`    // Delta per check
	HeapMaxMB          float64 `json:"heapMaxMB"`
	HeapGrowthMB       float64 `json:"heapGrowthMB"`       // Delta per check
	GCPauseMaxMs       float64 `json:"gcPauseMaxMs"`
	CheckIntervalMs    int64   `json:"checkIntervalMs"`
}

// FreezeAlert represents a detected issue.
type FreezeAlert struct {
	Timestamp   time.Time     `json:"timestamp"`
	Type        string        `json:"type"`
	Severity    string        `json:"severity"` // "warning", "critical"
	Message     string        `json:"message"`
	Metrics     FreezeMetrics `json:"metrics"`
	StackTrace  string        `json:"stackTrace,omitempty"`
}

// DefaultThresholds returns sensible default alert thresholds.
func DefaultThresholds() AlertThresholds {
	return AlertThresholds{
		GoroutineMax:    500,    // Alert if >500 goroutines
		GoroutineGrowth: 50,     // Alert if +50 goroutines between checks
		HeapMaxMB:       500,    // Alert if heap >500MB
		HeapGrowthMB:    100,    // Alert if heap grows >100MB between checks
		GCPauseMaxMs:    100,    // Alert if GC pause >100ms
		CheckIntervalMs: 3000,   // Check every 3 seconds
	}
}

// NewFreezeDetector creates a new freeze detector.
func NewFreezeDetector(thresholds AlertThresholds) *FreezeDetector {
	if thresholds.CheckIntervalMs == 0 {
		thresholds = DefaultThresholds()
	}

	homeDir, _ := os.UserHomeDir()
	logDir := filepath.Join(homeDir, ".forge", "logs", "freeze-monitor")
	os.MkdirAll(logDir, 0755)

	logPath := filepath.Join(logDir, fmt.Sprintf("freeze-%s.log", time.Now().Format("2006-01-02")))
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("[FreezeDetector] Failed to open log file: %v", err)
	}

	fd := &FreezeDetector{
		checkInterval:   time.Duration(thresholds.CheckIntervalMs) * time.Millisecond,
		stopChan:        make(chan struct{}),
		metrics:         make([]FreezeMetrics, 0, 1000),
		maxMetrics:      1000,
		alertThresholds: thresholds,
		logFile:         logFile,
		startTime:       time.Now(),
	}

	return fd
}

// Start begins monitoring.
func (fd *FreezeDetector) Start() {
	if fd.enabled.Swap(true) {
		return // Already running
	}

	fd.logLine("========================================")
	fd.logLine("FREEZE DETECTOR STARTED")
	fd.logLine("Thresholds: %+v", fd.alertThresholds)
	fd.logLine("========================================")

	go fd.monitorLoop()
	log.Printf("[FreezeDetector] Started with %v interval", fd.checkInterval)
}

// Stop stops monitoring.
func (fd *FreezeDetector) Stop() {
	if !fd.enabled.Swap(false) {
		return // Not running
	}
	close(fd.stopChan)
	if fd.logFile != nil {
		fd.logFile.Close()
	}
	log.Printf("[FreezeDetector] Stopped")
}

// SetAlertCallback sets the callback for alerts.
func (fd *FreezeDetector) SetAlertCallback(cb func(FreezeAlert)) {
	fd.mu.Lock()
	fd.onAlert = cb
	fd.mu.Unlock()
}

func (fd *FreezeDetector) monitorLoop() {
	ticker := time.NewTicker(fd.checkInterval)
	defer ticker.Stop()

	var lastMetrics *FreezeMetrics

	for {
		select {
		case <-fd.stopChan:
			return
		case <-ticker.C:
			metrics := fd.captureMetrics(lastMetrics)
			fd.recordMetrics(metrics)
			fd.checkAlerts(metrics)
			lastMetrics = &metrics
		}
	}
}

func (fd *FreezeDetector) captureMetrics(prev *FreezeMetrics) FreezeMetrics {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	now := time.Now()
	metrics := FreezeMetrics{
		Timestamp:       now,
		GoroutineCount:  runtime.NumGoroutine(),
		HeapAllocMB:     float64(memStats.HeapAlloc) / (1024 * 1024),
		HeapSysMB:       float64(memStats.HeapSys) / (1024 * 1024),
		HeapObjectCount: memStats.HeapObjects,
		GCPauseTotalMs:  float64(memStats.PauseTotalNs) / 1e6,
		GCNumGC:         memStats.NumGC,
		NumCPU:          runtime.NumCPU(),
		NumCgoCall:      runtime.NumCgoCall(),
		StackInUseMB:    float64(memStats.StackInuse) / (1024 * 1024),
	}

	// Calculate GC last pause
	if memStats.NumGC > 0 {
		idx := (memStats.NumGC + 255) % 256
		metrics.GCLastPauseMs = float64(memStats.PauseNs[idx]) / 1e6
	}

	// Calculate deltas
	if prev != nil {
		metrics.GoroutineDelta = metrics.GoroutineCount - prev.GoroutineCount
		metrics.HeapGrowthMB = metrics.HeapAllocMB - prev.HeapAllocMB
		metrics.GCPauseDeltaMs = metrics.GCPauseTotalMs - prev.GCPauseTotalMs
		metrics.TimeSinceLastMs = now.Sub(prev.Timestamp).Milliseconds()
	}

	return metrics
}

func (fd *FreezeDetector) recordMetrics(m FreezeMetrics) {
	fd.mu.Lock()
	defer fd.mu.Unlock()

	if len(fd.metrics) >= fd.maxMetrics {
		fd.metrics = fd.metrics[1:]
	}
	fd.metrics = append(fd.metrics, m)
}

func (fd *FreezeDetector) checkAlerts(m FreezeMetrics) {
	var alerts []FreezeAlert
	th := fd.alertThresholds

	// Check goroutine count
	if m.GoroutineCount > th.GoroutineMax {
		alerts = append(alerts, FreezeAlert{
			Timestamp: m.Timestamp,
			Type:      "GOROUTINE_LEAK",
			Severity:  "critical",
			Message:   fmt.Sprintf("Goroutine count %d exceeds max %d", m.GoroutineCount, th.GoroutineMax),
			Metrics:   m,
		})
		m.Alerts = append(m.Alerts, "GOROUTINE_LEAK")
	}

	// Check goroutine growth
	if m.GoroutineDelta > th.GoroutineGrowth {
		alerts = append(alerts, FreezeAlert{
			Timestamp: m.Timestamp,
			Type:      "GOROUTINE_SPIKE",
			Severity:  "warning",
			Message:   fmt.Sprintf("Goroutine growth +%d exceeds threshold %d", m.GoroutineDelta, th.GoroutineGrowth),
			Metrics:   m,
		})
		m.Alerts = append(m.Alerts, "GOROUTINE_SPIKE")
	}

	// Check heap size
	if m.HeapAllocMB > th.HeapMaxMB {
		alerts = append(alerts, FreezeAlert{
			Timestamp: m.Timestamp,
			Type:      "HEAP_OVERFLOW",
			Severity:  "critical",
			Message:   fmt.Sprintf("Heap %.1fMB exceeds max %.1fMB", m.HeapAllocMB, th.HeapMaxMB),
			Metrics:   m,
		})
		m.Alerts = append(m.Alerts, "HEAP_OVERFLOW")
	}

	// Check heap growth
	if m.HeapGrowthMB > th.HeapGrowthMB {
		alerts = append(alerts, FreezeAlert{
			Timestamp: m.Timestamp,
			Type:      "HEAP_SPIKE",
			Severity:  "warning",
			Message:   fmt.Sprintf("Heap growth +%.1fMB exceeds threshold %.1fMB", m.HeapGrowthMB, th.HeapGrowthMB),
			Metrics:   m,
		})
		m.Alerts = append(m.Alerts, "HEAP_SPIKE")
	}

	// Check GC pause
	if m.GCLastPauseMs > th.GCPauseMaxMs {
		alerts = append(alerts, FreezeAlert{
			Timestamp: m.Timestamp,
			Type:      "GC_STALL",
			Severity:  "critical",
			Message:   fmt.Sprintf("GC pause %.1fms exceeds max %.1fms", m.GCLastPauseMs, th.GCPauseMaxMs),
			Metrics:   m,
		})
		m.Alerts = append(m.Alerts, "GC_STALL")
	}

	// Check if check interval was exceeded (indicates main loop stall)
	expectedInterval := fd.checkInterval.Milliseconds()
	if m.TimeSinceLastMs > 0 && m.TimeSinceLastMs > expectedInterval*2 {
		alerts = append(alerts, FreezeAlert{
			Timestamp:  m.Timestamp,
			Type:       "MAIN_THREAD_STALL",
			Severity:   "critical",
			Message:    fmt.Sprintf("Check interval %dms exceeded expected %dms (2x threshold)", m.TimeSinceLastMs, expectedInterval),
			Metrics:    m,
			StackTrace: fd.captureAllGoroutines(),
		})
		m.Alerts = append(m.Alerts, "MAIN_THREAD_STALL")
	}

	// Log metrics (always, not just alerts)
	fd.logMetrics(m)

	// Fire alert callbacks
	for _, alert := range alerts {
		fd.logAlert(alert)
		fd.mu.RLock()
		cb := fd.onAlert
		fd.mu.RUnlock()
		if cb != nil {
			cb(alert)
		}
	}
}

func (fd *FreezeDetector) captureAllGoroutines() string {
	buf := make([]byte, 1024*1024)      // 1MB buffer
	stackSize := runtime.Stack(buf, true) // true = all goroutines
	return string(buf[:stackSize])
}

func (fd *FreezeDetector) logLine(format string, args ...interface{}) {
	if fd.logFile == nil {
		return
	}
	line := fmt.Sprintf("[%s] %s\n", time.Now().Format("15:04:05.000"), fmt.Sprintf(format, args...))
	fd.logFile.WriteString(line)
}

func (fd *FreezeDetector) logMetrics(m FreezeMetrics) {
	if fd.logFile == nil {
		return
	}

	alertStr := ""
	if len(m.Alerts) > 0 {
		alertStr = fmt.Sprintf(" | ALERTS: %v", m.Alerts)
	}

	line := fmt.Sprintf("[%s] Goroutines: %d (Δ%+d) | Heap: %.1fMB (Δ%+.1fMB) | GC: %.1fms | Objects: %d%s\n",
		m.Timestamp.Format("15:04:05.000"),
		m.GoroutineCount, m.GoroutineDelta,
		m.HeapAllocMB, m.HeapGrowthMB,
		m.GCLastPauseMs,
		m.HeapObjectCount,
		alertStr,
	)
	fd.logFile.WriteString(line)
}

func (fd *FreezeDetector) logAlert(alert FreezeAlert) {
	if fd.logFile == nil {
		return
	}

	fd.logLine("!!! ALERT: %s [%s] - %s", alert.Type, alert.Severity, alert.Message)
	if alert.StackTrace != "" {
		fd.logLine("Stack trace:\n%s", alert.StackTrace)
	}
}

// GetMetrics returns recent metrics.
func (fd *FreezeDetector) GetMetrics(count int) []FreezeMetrics {
	fd.mu.RLock()
	defer fd.mu.RUnlock()

	if count <= 0 || count > len(fd.metrics) {
		count = len(fd.metrics)
	}

	start := len(fd.metrics) - count
	if start < 0 {
		start = 0
	}

	result := make([]FreezeMetrics, len(fd.metrics)-start)
	copy(result, fd.metrics[start:])
	return result
}

// GetCurrentMetrics captures and returns current metrics without recording.
func (fd *FreezeDetector) GetCurrentMetrics() FreezeMetrics {
	var prev *FreezeMetrics
	fd.mu.RLock()
	if len(fd.metrics) > 0 {
		prev = &fd.metrics[len(fd.metrics)-1]
	}
	fd.mu.RUnlock()
	return fd.captureMetrics(prev)
}

// GetGoroutineProfile returns a summary of goroutine states.
func (fd *FreezeDetector) GetGoroutineProfile() map[string]int {
	buf := make([]byte, 1024*1024)
	stackSize := runtime.Stack(buf, true)
	stacks := string(buf[:stackSize])

	profile := make(map[string]int)

	// Parse goroutine states
	for _, block := range strings.Split(stacks, "\n\n") {
		lines := strings.Split(block, "\n")
		if len(lines) < 1 {
			continue
		}

		// First line is like "goroutine 1 [running]:" or "goroutine 5 [IO wait]:"
		firstLine := lines[0]
		if !strings.HasPrefix(firstLine, "goroutine") {
			continue
		}

		// Extract state from brackets
		start := strings.Index(firstLine, "[")
		end := strings.Index(firstLine, "]")
		if start >= 0 && end > start {
			state := firstLine[start+1 : end]
			// Simplify state (remove duration)
			if comma := strings.Index(state, ","); comma > 0 {
				state = state[:comma]
			}
			profile[state]++
		}
	}

	return profile
}

// ForceGC triggers garbage collection and returns stats.
func (fd *FreezeDetector) ForceGC() map[string]interface{} {
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)

	start := time.Now()
	runtime.GC()
	debug.FreeOSMemory()
	duration := time.Since(start)

	runtime.ReadMemStats(&after)

	return map[string]interface{}{
		"duration_ms":     duration.Milliseconds(),
		"heap_before_mb":  float64(before.HeapAlloc) / (1024 * 1024),
		"heap_after_mb":   float64(after.HeapAlloc) / (1024 * 1024),
		"freed_mb":        float64(before.HeapAlloc-after.HeapAlloc) / (1024 * 1024),
		"objects_before":  before.HeapObjects,
		"objects_after":   after.HeapObjects,
		"objects_freed":   before.HeapObjects - after.HeapObjects,
	}
}

// GetRuntimeStats returns comprehensive runtime statistics.
func (fd *FreezeDetector) GetRuntimeStats() map[string]interface{} {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	goroutineProfile := fd.GetGoroutineProfile()

	// Sort goroutine states by count
	type stateCount struct {
		State string
		Count int
	}
	var states []stateCount
	for s, c := range goroutineProfile {
		states = append(states, stateCount{s, c})
	}
	sort.Slice(states, func(i, j int) bool {
		return states[i].Count > states[j].Count
	})

	return map[string]interface{}{
		"goroutines": map[string]interface{}{
			"total":   runtime.NumGoroutine(),
			"profile": goroutineProfile,
			"sorted":  states,
		},
		"memory": map[string]interface{}{
			"heap_alloc_mb":    float64(m.HeapAlloc) / (1024 * 1024),
			"heap_sys_mb":      float64(m.HeapSys) / (1024 * 1024),
			"heap_idle_mb":     float64(m.HeapIdle) / (1024 * 1024),
			"heap_inuse_mb":    float64(m.HeapInuse) / (1024 * 1024),
			"heap_released_mb": float64(m.HeapReleased) / (1024 * 1024),
			"heap_objects":     m.HeapObjects,
			"stack_inuse_mb":   float64(m.StackInuse) / (1024 * 1024),
			"mspan_inuse_mb":   float64(m.MSpanInuse) / (1024 * 1024),
			"mcache_inuse_mb":  float64(m.MCacheInuse) / (1024 * 1024),
			"sys_mb":           float64(m.Sys) / (1024 * 1024),
		},
		"gc": map[string]interface{}{
			"num_gc":          m.NumGC,
			"pause_total_ms":  float64(m.PauseTotalNs) / 1e6,
			"last_pause_ms":   float64(m.PauseNs[(m.NumGC+255)%256]) / 1e6,
			"gc_cpu_fraction": m.GCCPUFraction,
			"next_gc_mb":      float64(m.NextGC) / (1024 * 1024),
		},
		"runtime": map[string]interface{}{
			"num_cpu":       runtime.NumCPU(),
			"gomaxprocs":    runtime.GOMAXPROCS(0),
			"num_cgo_call":  runtime.NumCgoCall(),
			"version":       runtime.Version(),
			"uptime_sec":    time.Since(fd.startTime).Seconds(),
		},
	}
}

// Global freeze detector instance
var globalFreezeDetector *FreezeDetector
var freezeDetectorOnce sync.Once

// GetFreezeDetector returns the global freeze detector instance.
func GetFreezeDetector() *FreezeDetector {
	freezeDetectorOnce.Do(func() {
		globalFreezeDetector = NewFreezeDetector(DefaultThresholds())
		globalFreezeDetector.Start()
	})
	return globalFreezeDetector
}
