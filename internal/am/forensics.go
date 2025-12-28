// Package am provides the ForensicsDetector for Vision Forensics feature.
// Monitors for command failures and triggers AI analysis on non-zero exit codes.
package am

import (
	"log"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ForensicsDetector monitors for command failures and triggers analysis.
type ForensicsDetector struct {
	tabID          string
	lastExitCode   int
	lastCommand    string
	snapshotQueue  chan ForensicRequest
	wg             sync.WaitGroup
	stopCh         chan struct{}
	running        bool
	mu             sync.Mutex

	// Rate limiting
	lastAnalysis   time.Time
	minInterval    time.Duration

	// Output buffer for context
	outputBuffer   strings.Builder
	bufferMu       sync.Mutex
	maxBufferSize  int
}

// ForensicRequest represents a triggered forensic analysis request.
type ForensicRequest struct {
	TabID          string
	ExitCode       int
	CleanedText    string    // Last 50 lines from parser_core.go
	Command        string    // The failed command
	Timestamp      time.Time
	TriggerReason  string    // "exit_code", "sigabrt", "panic", "error_pattern"
}

// ForensicInsight contains the result of forensic analysis.
type ForensicInsight struct {
	TabID          string    `json:"tabId"`
	Timestamp      time.Time `json:"timestamp"`
	Command        string    `json:"command"`
	ExitCode       int       `json:"exitCode"`
	Summary        string    `json:"summary"`
	RootCause      string    `json:"rootCause"`
	Suggestion     string    `json:"suggestion"`
	Severity       string    `json:"severity"` // "error", "warning", "info"
	Confidence     float64   `json:"confidence"`
	AnalysisDone   bool      `json:"analysisDone"`
}

// Pre-compiled patterns for exit code detection
var (
	// Bash: $?=127 or just the number after command
	bashExitPattern = regexp.MustCompile(`\$\?\s*[:=]?\s*(\d+)`)
	
	// PowerShell: $LASTEXITCODE = 1
	powershellExitPattern = regexp.MustCompile(`\$LASTEXITCODE\s*[:=]?\s*(\d+)`)
	
	// Common error patterns that indicate failure
	errorPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)^panic:`),
		regexp.MustCompile(`(?i)^fatal:`),
		regexp.MustCompile(`(?i)^error:`),
		regexp.MustCompile(`(?i)SIGSEGV|SIGABRT|SIGKILL`),
		regexp.MustCompile(`(?i)stack trace|traceback`),
		regexp.MustCompile(`(?i)exception in|unhandled exception`),
	}
)

// Forensics configuration
const (
	maxForensicQueue     = 5
	minForensicInterval  = 10 * time.Second // Max 1 analysis per 10s
	maxOutputBuffer      = 50 * 1024        // 50KB output buffer
	lastNLines           = 50               // Capture last 50 lines
)

// Global forensics detectors
var (
	forensicsDetectors   = make(map[string]*ForensicsDetector)
	forensicsDetectorsMu sync.RWMutex
)

// GetForensicsDetector retrieves or creates a ForensicsDetector for a tab.
func GetForensicsDetector(tabID string) *ForensicsDetector {
	forensicsDetectorsMu.RLock()
	detector, exists := forensicsDetectors[tabID]
	forensicsDetectorsMu.RUnlock()

	if exists {
		return detector
	}

	forensicsDetectorsMu.Lock()
	defer forensicsDetectorsMu.Unlock()

	// Double-check after acquiring write lock
	if detector, exists = forensicsDetectors[tabID]; exists {
		return detector
	}

	detector = NewForensicsDetector(tabID)
	forensicsDetectors[tabID] = detector
	detector.Start()

	return detector
}

// CloseForensicsDetector closes a ForensicsDetector for a tab.
func CloseForensicsDetector(tabID string) {
	forensicsDetectorsMu.Lock()
	detector, exists := forensicsDetectors[tabID]
	if exists {
		delete(forensicsDetectors, tabID)
	}
	forensicsDetectorsMu.Unlock()

	if detector != nil {
		detector.Stop()
	}
}

// NewForensicsDetector creates a new forensics detector.
func NewForensicsDetector(tabID string) *ForensicsDetector {
	return &ForensicsDetector{
		tabID:         tabID,
		snapshotQueue: make(chan ForensicRequest, maxForensicQueue),
		stopCh:        make(chan struct{}),
		minInterval:   minForensicInterval,
		maxBufferSize: maxOutputBuffer,
	}
}

// Start begins the forensics analysis goroutine.
func (d *ForensicsDetector) Start() {
	d.mu.Lock()
	if d.running {
		d.mu.Unlock()
		return
	}
	d.running = true
	d.mu.Unlock()

	d.wg.Add(1)
	go d.analysisLoop()

	log.Printf("[Forensics] Started for tab %s", d.tabID)
}

// Stop gracefully shuts down the detector.
func (d *ForensicsDetector) Stop() {
	d.mu.Lock()
	if !d.running {
		d.mu.Unlock()
		return
	}
	d.running = false
	d.mu.Unlock()

	close(d.stopCh)
	d.wg.Wait()

	log.Printf("[Forensics] Stopped for tab %s", d.tabID)
}

// FeedOutput feeds terminal output to the buffer for context.
// Called from the async pipeline - must be fast.
func (d *ForensicsDetector) FeedOutput(data string) {
	d.bufferMu.Lock()
	defer d.bufferMu.Unlock()

	d.outputBuffer.WriteString(data)

	// Trim if too large
	if d.outputBuffer.Len() > d.maxBufferSize {
		content := d.outputBuffer.String()
		d.outputBuffer.Reset()
		d.outputBuffer.WriteString(content[len(content)-d.maxBufferSize/2:])
	}
}

// CheckExitCode is called after detecting a command completion.
// Triggers forensic analysis if exit code is non-zero.
func (d *ForensicsDetector) CheckExitCode(exitCode int, command string) {
	d.mu.Lock()
	d.lastExitCode = exitCode
	d.lastCommand = command
	running := d.running
	d.mu.Unlock()

	if !running {
		return
	}

	if exitCode == 0 {
		// Success - no forensics needed
		return
	}

	// Non-zero exit code - trigger forensics
	d.triggerForensics(exitCode, command, "exit_code")
}

// CheckForErrorPatterns scans output for error patterns.
// Called periodically or on specific triggers.
func (d *ForensicsDetector) CheckForErrorPatterns() bool {
	d.bufferMu.Lock()
	content := d.outputBuffer.String()
	d.bufferMu.Unlock()

	if content == "" {
		return false
	}

	for _, pattern := range errorPatterns {
		if pattern.MatchString(content) {
			// Found error pattern
			d.triggerForensics(-1, d.lastCommand, "error_pattern")
			return true
		}
	}

	return false
}

// triggerForensics queues a forensic analysis request.
func (d *ForensicsDetector) triggerForensics(exitCode int, command, reason string) {
	// Rate limiting
	d.mu.Lock()
	if time.Since(d.lastAnalysis) < d.minInterval {
		d.mu.Unlock()
		return
	}
	d.mu.Unlock()

	// Get cleaned output using parser_core
	d.bufferMu.Lock()
	rawOutput := d.outputBuffer.String()
	d.bufferMu.Unlock()

	// Clean with state machine
	cleanedOutput := StripANSIString(rawOutput)
	cleanedOutput = NormalizeWhitespace(cleanedOutput)

	// Extract last N lines
	lines := strings.Split(cleanedOutput, "\n")
	start := len(lines) - lastNLines
	if start < 0 {
		start = 0
	}
	last50 := strings.Join(lines[start:], "\n")

	req := ForensicRequest{
		TabID:         d.tabID,
		ExitCode:      exitCode,
		CleanedText:   last50,
		Command:       command,
		Timestamp:     time.Now(),
		TriggerReason: reason,
	}

	// Non-blocking send
	select {
	case d.snapshotQueue <- req:
		log.Printf("[Forensics] Queued analysis: exit=%d, cmd=%s, reason=%s",
			exitCode, truncateString(command, 30), reason)
	default:
		log.Printf("[Forensics] Queue full, dropped request")
	}
}

// analysisLoop processes forensic requests in background.
func (d *ForensicsDetector) analysisLoop() {
	defer d.wg.Done()

	for {
		select {
		case <-d.stopCh:
			return
		case req := <-d.snapshotQueue:
			// Rate limiting
			d.mu.Lock()
			elapsed := time.Since(d.lastAnalysis)
			d.mu.Unlock()

			if elapsed < d.minInterval {
				time.Sleep(d.minInterval - elapsed)
			}

			// Perform analysis
			insight := d.analyzeFailure(req)

			// Store insight
			d.storeInsight(insight)

			d.mu.Lock()
			d.lastAnalysis = time.Now()
			d.mu.Unlock()

			log.Printf("[Forensics] Analysis complete: %s - %s",
				req.Command, insight.Summary)
		}
	}
}

// analyzeFailure performs forensic analysis on a failure.
// TODO: Integrate with LLM client (Opus) for deep analysis.
func (d *ForensicsDetector) analyzeFailure(req ForensicRequest) *ForensicInsight {
	insight := &ForensicInsight{
		TabID:        req.TabID,
		Timestamp:    req.Timestamp,
		Command:      req.Command,
		ExitCode:     req.ExitCode,
		AnalysisDone: true,
	}

	// Heuristic-based analysis for now
	// TODO: Replace with Opus LLM call

	// Determine severity based on exit code
	switch {
	case req.ExitCode == 1:
		insight.Severity = "error"
	case req.ExitCode == 2:
		insight.Severity = "error"
	case req.ExitCode >= 126 && req.ExitCode <= 128:
		insight.Severity = "critical"
	case req.ExitCode > 128:
		// Signal-based exit (128 + signal number)
		insight.Severity = "critical"
	default:
		insight.Severity = "warning"
	}

	// Extract error message from output
	summary, rootCause, suggestion := extractErrorInfo(req.CleanedText, req.ExitCode)
	insight.Summary = summary
	insight.RootCause = rootCause
	insight.Suggestion = suggestion
	insight.Confidence = 0.6 // Medium confidence for heuristic

	return insight
}

// extractErrorInfo extracts error information from command output.
func extractErrorInfo(output string, exitCode int) (summary, rootCause, suggestion string) {
	lines := strings.Split(output, "\n")

	// Look for common error patterns
	for _, line := range lines {
		lineLower := strings.ToLower(line)

		if strings.Contains(lineLower, "error:") ||
			strings.Contains(lineLower, "fatal:") ||
			strings.Contains(lineLower, "panic:") {
			summary = strings.TrimSpace(line)
			break
		}

		if strings.Contains(lineLower, "not found") {
			summary = strings.TrimSpace(line)
			rootCause = "Command or resource not found"
			suggestion = "Check if the command exists and is in PATH"
			break
		}

		if strings.Contains(lineLower, "permission denied") {
			summary = strings.TrimSpace(line)
			rootCause = "Insufficient permissions"
			suggestion = "Try running with elevated permissions or check file permissions"
			break
		}

		if strings.Contains(lineLower, "connection refused") {
			summary = strings.TrimSpace(line)
			rootCause = "Network connection failed"
			suggestion = "Check if the target service is running and reachable"
			break
		}
	}

	// Default summary if nothing found
	if summary == "" {
		summary = "Command failed with exit code " + string(rune('0'+exitCode%10))
		if exitCode >= 10 {
			summary = "Command failed with exit code " + strings.TrimSpace(output)[len(output)-20:]
		}
	}

	if rootCause == "" {
		rootCause = "Unknown - review command output for details"
	}

	if suggestion == "" {
		suggestion = "Review the error message and command syntax"
	}

	return summary, rootCause, suggestion
}

// storeInsight persists the forensic insight.
func (d *ForensicsDetector) storeInsight(insight *ForensicInsight) {
	// For now, just log it
	// TODO: Integrate with InsightsTracker from vision package
	log.Printf("[Forensics] Insight: severity=%s, summary=%s, suggestion=%s",
		insight.Severity, insight.Summary, insight.Suggestion)
}

// GetLastExitCode returns the last detected exit code.
func (d *ForensicsDetector) GetLastExitCode() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.lastExitCode
}

// GetLastCommand returns the last executed command.
func (d *ForensicsDetector) GetLastCommand() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.lastCommand
}

// ClearBuffer clears the output buffer.
func (d *ForensicsDetector) ClearBuffer() {
	d.bufferMu.Lock()
	d.outputBuffer.Reset()
	d.bufferMu.Unlock()
}
