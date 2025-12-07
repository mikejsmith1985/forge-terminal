// Package am provides process monitoring for LLM CLI detection.
package am

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// ProcessInfo tracks an active LLM process.
type ProcessInfo struct {
	PID         int       `json:"pid"`
	ConvID      string    `json:"convId"`
	Provider    string    `json:"provider"`
	CommandLine string    `json:"commandLine"`
	StartTime   time.Time `json:"startTime"`
	LastSeen    time.Time `json:"lastSeen"`
}

// ProcessMonitor scans for LLM processes (Layer 3).
type ProcessMonitor struct {
	detector      *llm.Detector
	checkInterval time.Duration
	activeProcs   map[int]*ProcessInfo
	mutex         sync.RWMutex
	amDir         string
}

// NewProcessMonitor creates a new process monitor.
func NewProcessMonitor(detector *llm.Detector, amDir string) *ProcessMonitor {
	return &ProcessMonitor{
		detector:      detector,
		checkInterval: 2 * time.Second,
		activeProcs:   make(map[int]*ProcessInfo),
		amDir:         amDir,
	}
}

// Start begins process monitoring.
func (pm *ProcessMonitor) Start(ctx context.Context) {
	log.Printf("[Process Layer 3] Starting process monitor (interval: %v)", pm.checkInterval)

	// Initial heartbeat
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     3,
		Timestamp: time.Now(),
	})

	ticker := time.NewTicker(pm.checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Process Layer 3] Shutting down")
			return
		case <-ticker.C:
			pm.scanProcesses()
			EventBus.Publish(&LayerEvent{
				Type:      "HEARTBEAT",
				Layer:     3,
				Timestamp: time.Now(),
			})
		}
	}
}

func (pm *ProcessMonitor) scanProcesses() {
	cmd := exec.Command("ps", "aux")
	output, err := cmd.Output()
	if err != nil {
		return
	}

	currentPIDs := make(map[int]bool)
	scanner := bufio.NewScanner(bytes.NewReader(output))
	scanner.Scan() // Skip header

	for scanner.Scan() {
		line := scanner.Text()
		lowerLine := strings.ToLower(line)

		if strings.Contains(lowerLine, "copilot") ||
			strings.Contains(lowerLine, "claude") ||
			strings.Contains(lowerLine, "aider") {

			pid, cmdLine := pm.parseProcessLine(line)
			if pid > 0 {
				currentPIDs[pid] = true
				pm.handleProcess(pid, cmdLine)
			}
		}
	}

	// Detect ended processes
	pm.mutex.Lock()
	for pid, info := range pm.activeProcs {
		if !currentPIDs[pid] {
			log.Printf("[Process Layer 3] Process ended: PID=%d, ConvID=%s", pid, info.ConvID)

			EventBus.Publish(&LayerEvent{
				Type:      "LLM_END",
				Layer:     3,
				ConvID:    info.ConvID,
				Timestamp: time.Now(),
			})

			delete(pm.activeProcs, pid)
		} else {
			info.LastSeen = time.Now()
		}
	}
	pm.mutex.Unlock()
}

func (pm *ProcessMonitor) handleProcess(pid int, cmdLine string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if _, exists := pm.activeProcs[pid]; exists {
		return
	}

	detected := pm.detector.DetectCommand(cmdLine)
	if !detected.Detected {
		return
	}

	convID := fmt.Sprintf("conv-proc-%d-%d", pid, time.Now().Unix())

	info := &ProcessInfo{
		PID:         pid,
		ConvID:      convID,
		Provider:    string(detected.Provider),
		CommandLine: cmdLine,
		StartTime:   time.Now(),
		LastSeen:    time.Now(),
	}

	pm.activeProcs[pid] = info

	log.Printf("[Process Layer 3] New LLM process: PID=%d, Provider=%s", pid, detected.Provider)

	EventBus.Publish(&LayerEvent{
		Type:      "LLM_START",
		Layer:     3,
		ConvID:    convID,
		Provider:  string(detected.Provider),
		Timestamp: time.Now(),
		Metadata: map[string]interface{}{
			"pid":         pid,
			"commandLine": cmdLine,
		},
	})
}

func (pm *ProcessMonitor) parseProcessLine(line string) (int, string) {
	fields := strings.Fields(line)
	if len(fields) < 11 {
		return 0, ""
	}

	var pid int
	fmt.Sscanf(fields[1], "%d", &pid)
	cmdLine := strings.Join(fields[10:], " ")
	return pid, cmdLine
}

// GetActiveProcesses returns currently tracked LLM processes.
func (pm *ProcessMonitor) GetActiveProcesses() map[int]*ProcessInfo {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	result := make(map[int]*ProcessInfo)
	for k, v := range pm.activeProcs {
		result[k] = v
	}
	return result
}
