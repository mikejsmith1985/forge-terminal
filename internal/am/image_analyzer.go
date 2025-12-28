// Package am provides image analysis for the Agent Optical Nerve feature.
// Background AI analysis of pasted images with context injection.
// All analysis runs in dedicated goroutines to avoid blocking the PTY loop.
package am

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"
)

// ImageAnalyzer provides background AI analysis of pasted images.
// All analysis runs in a dedicated goroutine to avoid blocking.
type ImageAnalyzer struct {
	analysisQueue chan ImageAnalysisRequest
	resultStore   sync.Map // imageHash -> *ImageSummary
	recentImages  sync.Map // tabID -> *ImageSummary (most recent per tab)
	wg            sync.WaitGroup
	stopCh        chan struct{}
	running       bool
	mu            sync.Mutex

	// Rate limiting
	lastAnalysis time.Time
	minInterval  time.Duration
}

// ImageAnalysisRequest represents a queued image for analysis.
type ImageAnalysisRequest struct {
	ImageData   []byte
	ImageHash   string
	Format      string
	TabID       string
	Timestamp   time.Time
	Detection   ImageDetectionResult
}

// ImageSummary contains the AI-generated description of an image.
type ImageSummary struct {
	Hash          string    `json:"hash"`
	Description   string    `json:"description"`   // AI-generated summary
	ContentType   string    `json:"contentType"`   // "screenshot", "diagram", "code", "photo"
	Dimensions    string    `json:"dimensions"`    // "1920x1080" if detectable
	Format        string    `json:"format"`        // "png", "jpeg", etc.
	Size          int       `json:"size"`          // bytes
	Confidence    float64   `json:"confidence"`    // 0.0-1.0
	GeneratedAt   time.Time `json:"generatedAt"`
	AnalysisDone  bool      `json:"analysisDone"`  // true when AI analysis complete
	TabID         string    `json:"tabId"`
}

const (
	// Queue settings - drop oldest if full to prevent blocking
	maxAnalysisQueue = 10
	
	// Rate limiting - max 1 analysis per second
	minAnalysisInterval = 1 * time.Second
	
	// Memory limits
	maxImageSizeForAnalysis = 10 * 1024 * 1024 // 10MB
	maxStoredSummaries      = 50
	
	// Recent image timeout
	recentImageTimeout = 5 * time.Minute
)

// Global singleton image analyzer
var (
	globalImageAnalyzer   *ImageAnalyzer
	globalImageAnalyzerMu sync.Mutex
)

// GetImageAnalyzer returns the global image analyzer, creating it if needed.
func GetImageAnalyzer() *ImageAnalyzer {
	globalImageAnalyzerMu.Lock()
	defer globalImageAnalyzerMu.Unlock()

	if globalImageAnalyzer == nil {
		globalImageAnalyzer = NewImageAnalyzer()
		globalImageAnalyzer.Start()
	}
	return globalImageAnalyzer
}

// StopImageAnalyzer stops the global image analyzer.
func StopImageAnalyzer() {
	globalImageAnalyzerMu.Lock()
	defer globalImageAnalyzerMu.Unlock()

	if globalImageAnalyzer != nil {
		globalImageAnalyzer.Stop()
		globalImageAnalyzer = nil
	}
}

// NewImageAnalyzer creates a new image analyzer.
func NewImageAnalyzer() *ImageAnalyzer {
	return &ImageAnalyzer{
		analysisQueue: make(chan ImageAnalysisRequest, maxAnalysisQueue),
		stopCh:        make(chan struct{}),
		minInterval:   minAnalysisInterval,
	}
}

// Start begins the background analysis goroutine.
func (a *ImageAnalyzer) Start() {
	a.mu.Lock()
	if a.running {
		a.mu.Unlock()
		return
	}
	a.running = true
	a.mu.Unlock()

	a.wg.Add(1)
	go a.analysisLoop()
	
	log.Printf("[ImageAnalyzer] Started background analysis goroutine")
}

// Stop gracefully shuts down the analyzer.
func (a *ImageAnalyzer) Stop() {
	a.mu.Lock()
	if !a.running {
		a.mu.Unlock()
		return
	}
	a.running = false
	a.mu.Unlock()

	close(a.stopCh)
	a.wg.Wait()
	
	log.Printf("[ImageAnalyzer] Stopped")
}

// QueueImage queues an image for background analysis.
// Non-blocking: drops if queue is full.
// Returns the image hash for tracking.
func (a *ImageAnalyzer) QueueImage(tabID string, data []byte, detection ImageDetectionResult) string {
	// Compute hash for deduplication
	hash := computeImageHash(data)
	
	// Check if already analyzed
	if _, exists := a.resultStore.Load(hash); exists {
		log.Printf("[ImageAnalyzer] Image already analyzed: %s", hash[:12])
		return hash
	}
	
	// Check size limit
	if len(data) > maxImageSizeForAnalysis {
		log.Printf("[ImageAnalyzer] Image too large for analysis: %d bytes", len(data))
		return hash
	}
	
	req := ImageAnalysisRequest{
		ImageData: copyBytes(data),
		ImageHash: hash,
		Format:    detection.Format,
		TabID:     tabID,
		Timestamp: time.Now(),
		Detection: detection,
	}
	
	// Non-blocking send - drop oldest if full
	select {
	case a.analysisQueue <- req:
		log.Printf("[ImageAnalyzer] Queued image for analysis: %s (%s, %d bytes)",
			hash[:12], detection.Format, len(data))
	default:
		// Queue full - try to drain oldest and add new
		select {
		case <-a.analysisQueue:
			a.analysisQueue <- req
			log.Printf("[ImageAnalyzer] Dropped oldest, queued new: %s", hash[:12])
		default:
			log.Printf("[ImageAnalyzer] Queue full, dropped image: %s", hash[:12])
		}
	}
	
	// Store preliminary summary (before AI analysis)
	summary := &ImageSummary{
		Hash:         hash,
		Format:       detection.Format,
		Size:         len(data),
		TabID:        tabID,
		GeneratedAt:  time.Now(),
		AnalysisDone: false,
		Description:  generateBasicDescription(detection, len(data)),
		Confidence:   0.3, // Low confidence before AI analysis
	}
	a.resultStore.Store(hash, summary)
	a.recentImages.Store(tabID, summary)
	
	return hash
}

// GetSummary retrieves the analysis summary for an image hash.
func (a *ImageAnalyzer) GetSummary(hash string) *ImageSummary {
	if val, ok := a.resultStore.Load(hash); ok {
		return val.(*ImageSummary)
	}
	return nil
}

// GetRecentSummary retrieves the most recent image summary for a tab.
// Used for context injection ("whispering").
func (a *ImageAnalyzer) GetRecentSummary(tabID string) *ImageSummary {
	if val, ok := a.recentImages.Load(tabID); ok {
		summary := val.(*ImageSummary)
		// Check if still recent enough
		if time.Since(summary.GeneratedAt) < recentImageTimeout {
			return summary
		}
		// Expired - clean up
		a.recentImages.Delete(tabID)
	}
	return nil
}

// ClearRecentSummary clears the recent image for a tab (after whisper injection).
func (a *ImageAnalyzer) ClearRecentSummary(tabID string) {
	a.recentImages.Delete(tabID)
}

// analysisLoop processes images in background, never blocking hot path.
func (a *ImageAnalyzer) analysisLoop() {
	defer a.wg.Done()
	
	for {
		select {
		case <-a.stopCh:
			return
		case req := <-a.analysisQueue:
			// Rate limiting
			elapsed := time.Since(a.lastAnalysis)
			if elapsed < a.minInterval {
				time.Sleep(a.minInterval - elapsed)
			}
			
			// Perform analysis
			summary := a.analyzeImage(req)
			
			// Store result
			a.resultStore.Store(req.ImageHash, summary)
			a.recentImages.Store(req.TabID, summary)
			a.lastAnalysis = time.Now()
			
			log.Printf("[ImageAnalyzer] Analysis complete: %s - %s",
				req.ImageHash[:12], truncateString(summary.Description, 50))
		}
	}
}

// analyzeImage performs the actual image analysis.
// TODO: Integrate with LLM client (Haiku tier) for AI analysis.
// For now, uses heuristic-based analysis.
func (a *ImageAnalyzer) analyzeImage(req ImageAnalysisRequest) *ImageSummary {
	summary := &ImageSummary{
		Hash:         req.ImageHash,
		Format:       req.Format,
		Size:         len(req.ImageData),
		TabID:        req.TabID,
		GeneratedAt:  time.Now(),
		AnalysisDone: true,
	}
	
	// Detect content type from image characteristics
	contentType := detectContentType(req.ImageData, req.Format)
	summary.ContentType = contentType
	
	// Extract dimensions if possible
	summary.Dimensions = extractDimensions(req.ImageData, req.Format)
	
	// Generate description
	// TODO: Replace with actual LLM call to Haiku
	summary.Description = generateDescription(summary, req.Detection)
	summary.Confidence = 0.7 // Medium confidence for heuristic analysis
	
	return summary
}

// Helper functions

func computeImageHash(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func generateBasicDescription(detection ImageDetectionResult, size int) string {
	sizeStr := formatSize(size)
	if detection.IsBase64 {
		return "Base64-encoded " + detection.Format + " image (" + sizeStr + ")"
	}
	return detection.Format + " image (" + sizeStr + ")"
}

func generateDescription(summary *ImageSummary, detection ImageDetectionResult) string {
	var desc string
	
	switch summary.ContentType {
	case "screenshot":
		desc = "Screenshot of terminal or application interface"
	case "diagram":
		desc = "Technical diagram or flowchart"
	case "code":
		desc = "Image containing code or text"
	case "photo":
		desc = "Photograph or natural image"
	default:
		desc = "Image content"
	}
	
	if summary.Dimensions != "" {
		desc += " (" + summary.Dimensions + ")"
	}
	
	desc += " - " + summary.Format + " format, " + formatSize(summary.Size)
	
	return desc
}

func detectContentType(data []byte, format string) string {
	// Simple heuristics for now
	// TODO: Use image analysis for better detection
	
	// Check for common screenshot dimensions
	dims := extractDimensions(data, format)
	if dims != "" {
		// Common screenshot resolutions
		if dims == "1920x1080" || dims == "2560x1440" || dims == "3840x2160" ||
			dims == "1280x720" || dims == "1366x768" {
			return "screenshot"
		}
	}
	
	// PNG with transparency often indicates diagrams/screenshots
	if format == "png" {
		return "screenshot"
	}
	
	// JPEG typically indicates photos
	if format == "jpeg" || format == "jpg" {
		return "photo"
	}
	
	return "image"
}

func extractDimensions(data []byte, format string) string {
	if len(data) < 32 {
		return ""
	}
	
	switch format {
	case "png":
		// PNG dimensions at bytes 16-23 (IHDR chunk)
		if len(data) >= 24 {
			width := int(data[16])<<24 | int(data[17])<<16 | int(data[18])<<8 | int(data[19])
			height := int(data[20])<<24 | int(data[21])<<16 | int(data[22])<<8 | int(data[23])
			if width > 0 && width < 100000 && height > 0 && height < 100000 {
				return formatDimensions(width, height)
			}
		}
	case "jpeg", "jpg":
		// JPEG dimensions require parsing SOF markers - complex
		// Skip for now
		return ""
	case "gif":
		// GIF dimensions at bytes 6-9
		if len(data) >= 10 {
			width := int(data[6]) | int(data[7])<<8
			height := int(data[8]) | int(data[9])<<8
			if width > 0 && width < 100000 && height > 0 && height < 100000 {
				return formatDimensions(width, height)
			}
		}
	}
	
	return ""
}

func formatDimensions(width, height int) string {
	return fmt.Sprintf("%dx%d", width, height)
}

func formatSize(bytes int) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
