// Package am provides the async non-blocking pipeline for AM capture.
// This decouples PTY I/O from LLM detection and logging to prevent UI freezes.
package am

import (
	"bytes"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// PipelineConfig configures the async pipeline behavior.
type PipelineConfig struct {
	ChannelSize     int           // Size of buffered channel (default 1024)
	FlushInterval   time.Duration // How often to flush to disk (default 5s)
	MaxBufferSize   int           // Max buffer size before forced flush (default 8KB)
	EnableDebugLogs bool          // Enable debug logging (disabled in hot path)
}

// DefaultPipelineConfig returns sensible defaults.
func DefaultPipelineConfig() PipelineConfig {
	return PipelineConfig{
		ChannelSize:     1024,
		FlushInterval:   5 * time.Second,
		MaxBufferSize:   8 * 1024, // 8KB
		EnableDebugLogs: false, // Disabled for production
	}
}

// PipelineMessage represents data flowing through the async pipeline.
type PipelineMessage struct {
	Type      PipelineMessageType
	TabID     string
	Data      []byte
	Timestamp time.Time
}

// PipelineMessageType identifies the message type.
type PipelineMessageType int

const (
	MsgTypeInput PipelineMessageType = iota
	MsgTypeOutput
	MsgTypeCommand
	MsgTypeEndConversation
)

// AsyncPipeline provides a non-blocking capture pipeline.
// It decouples the PTY read loop from LLM detection and logging.
type AsyncPipeline struct {
	config  PipelineConfig
	inputCh chan PipelineMessage
	running atomic.Bool
	wg      sync.WaitGroup
	stopCh  chan struct{}

	// Stats for monitoring
	droppedMessages   atomic.Int64
	processedMessages atomic.Int64
	binaryMessages    atomic.Int64 // Count of binary/image data skipped
}

// NewAsyncPipeline creates a new async pipeline.
func NewAsyncPipeline(config PipelineConfig) *AsyncPipeline {
	if config.ChannelSize == 0 {
		config.ChannelSize = 1024
	}
	if config.FlushInterval == 0 {
		config.FlushInterval = 5 * time.Second
	}
	if config.MaxBufferSize == 0 {
		config.MaxBufferSize = 8 * 1024
	}
	
	return &AsyncPipeline{
		config:  config,
		inputCh: make(chan PipelineMessage, config.ChannelSize),
		stopCh:  make(chan struct{}),
	}
}

// Start begins the async worker goroutine.
func (p *AsyncPipeline) Start(amSystem *System) {
	if p.running.Swap(true) {
		return // Already running
	}
	
	p.wg.Add(1)
	go p.worker(amSystem)
	
	log.Printf("[AsyncPipeline] Started with channel size %d, flush interval %v",
		p.config.ChannelSize, p.config.FlushInterval)
}

// Stop gracefully shuts down the pipeline.
func (p *AsyncPipeline) Stop() {
	if !p.running.Swap(false) {
		return // Not running
	}
	
	close(p.stopCh)
	p.wg.Wait()
	
	log.Printf("[AsyncPipeline] Stopped. Processed: %d, Dropped: %d",
		p.processedMessages.Load(), p.droppedMessages.Load())
}

// EnqueueInput sends input data to the pipeline without blocking.
// Returns false if the channel is full and data was dropped.
func (p *AsyncPipeline) EnqueueInput(tabID string, data []byte) bool {
	if !p.running.Load() {
		return false
	}
	
	msg := PipelineMessage{
		Type:      MsgTypeInput,
		TabID:     tabID,
		Data:      copyBytes(data),
		Timestamp: time.Now(),
	}
	
	// Non-blocking send - drop if channel full
	select {
	case p.inputCh <- msg:
		return true
	default:
		p.droppedMessages.Add(1)
		return false
	}
}

// EnqueueOutput sends output data to the pipeline without blocking.
func (p *AsyncPipeline) EnqueueOutput(tabID string, data []byte) bool {
	if !p.running.Load() {
		return false
	}
	
	msg := PipelineMessage{
		Type:      MsgTypeOutput,
		TabID:     tabID,
		Data:      copyBytes(data),
		Timestamp: time.Now(),
	}
	
	select {
	case p.inputCh <- msg:
		return true
	default:
		p.droppedMessages.Add(1)
		return false
	}
}

// EnqueueCommand sends a command (newline-terminated input) for LLM detection.
func (p *AsyncPipeline) EnqueueCommand(tabID string, command string) bool {
	if !p.running.Load() {
		return false
	}
	
	msg := PipelineMessage{
		Type:      MsgTypeCommand,
		TabID:     tabID,
		Data:      []byte(command),
		Timestamp: time.Now(),
	}
	
	select {
	case p.inputCh <- msg:
		return true
	default:
		p.droppedMessages.Add(1)
		return false
	}
}

// GetStats returns pipeline statistics.
func (p *AsyncPipeline) GetStats() (processed, dropped int64) {
	return p.processedMessages.Load(), p.droppedMessages.Load()
}

// GetExtendedStats returns extended pipeline statistics including binary count.
func (p *AsyncPipeline) GetExtendedStats() PipelineStats {
	processed := p.processedMessages.Load()
	dropped := p.droppedMessages.Load()
	binary := p.binaryMessages.Load()
	total := processed + dropped
	var dropRate float64
	if total > 0 {
		dropRate = float64(dropped) / float64(total)
	}
	return PipelineStats{
		Processed:    processed,
		Dropped:      dropped,
		Binary:       binary,
		ChannelDepth: len(p.inputCh),
		DropRate:     dropRate,
	}
}

// PipelineStats holds extended pipeline statistics.
type PipelineStats struct {
	Processed    int64
	Dropped      int64
	Binary       int64
	ChannelDepth int
	DropRate     float64
}

// tabBuffer holds per-tab buffers for batching input/output.
// Uses pooled buffers to reduce GC pressure.
type tabBuffer struct {
	input      *bytes.Buffer
	output     *bytes.Buffer
	lastFlush  time.Time
	lastInput  time.Time
	lastOutput time.Time
}

// newTabBuffer creates a new tabBuffer with pooled buffers.
func newTabBuffer() *tabBuffer {
	return &tabBuffer{
		input:      GetBuffer(),
		output:     GetBuffer(),
		lastFlush:  time.Now(),
		lastInput:  time.Now(),
		lastOutput: time.Now(),
	}
}

// release returns buffers to the pool.
func (tb *tabBuffer) release() {
	if tb.input != nil {
		PutBuffer(tb.input)
		tb.input = nil
	}
	if tb.output != nil {
		PutBuffer(tb.output)
		tb.output = nil
	}
}

// ProcessLoop is the main processing goroutine that handles all AM data.
// This is the renamed worker function following the ProcessLoop pattern.
// ALL LLM Parsing, ANSI Stripping, and JSON Serialization happens here.
// Image/binary data is detected and routed to side-channel to prevent text parsing.
func (p *AsyncPipeline) ProcessLoop(amSystem *System) {
	defer p.wg.Done()

	// Per-tab buffers for batching (using pooled buffers)
	buffers := make(map[string]*tabBuffer)
	defer func() {
		// Release all pooled buffers on shutdown
		for _, buf := range buffers {
			buf.release()
		}
	}()

	flushTicker := time.NewTicker(p.config.FlushInterval)
	defer flushTicker.Stop()

	for {
		select {
		case <-p.stopCh:
			// Final flush before shutdown
			p.flushAllBuffers(amSystem, buffers)
			return

		case msg := <-p.inputCh:
			p.processedMessages.Add(1)

			// Image/Binary detection - route to side channel immediately
			if msg.Type == MsgTypeOutput && len(msg.Data) >= 8 {
				detection := DetectImageData(msg.Data)
				if detection.IsImage || detection.IsBinary {
					p.handleBinaryData(amSystem, msg.TabID, msg.Data, detection)
					continue // Don't process as text
				}
			}

			// Get or create buffer for this tab
			buf, ok := buffers[msg.TabID]
			if !ok {
				buf = newTabBuffer()
				buffers[msg.TabID] = buf
				log.Printf("[AsyncPipeline] Created new buffer for tab %s", msg.TabID)
			}

			switch msg.Type {
			case MsgTypeInput:
				buf.input.Write(msg.Data)
				buf.lastInput = msg.Timestamp
				if p.config.EnableDebugLogs {
					log.Printf("[AsyncPipeline] Tab %s: Buffered INPUT (%d bytes, total: %d)", 
						msg.TabID, len(msg.Data), buf.input.Len())
				}

			case MsgTypeOutput:
				buf.output.Write(msg.Data)
				buf.lastOutput = msg.Timestamp
				if p.config.EnableDebugLogs {
					log.Printf("[AsyncPipeline] Tab %s: Buffered OUTPUT (%d bytes, total: %d)", 
						msg.TabID, len(msg.Data), buf.output.Len())
				}

			case MsgTypeCommand:
				// Process command for LLM detection
				log.Printf("[AsyncPipeline] Tab %s: Processing COMMAND: %s", msg.TabID, string(msg.Data))
				p.processCommand(amSystem, msg.TabID, string(msg.Data))

			case MsgTypeEndConversation:
				// Flush and end conversation
				log.Printf("[AsyncPipeline] Tab %s: Ending conversation", msg.TabID)
				p.flushTabBuffer(amSystem, msg.TabID, buf)
				if logger := amSystem.GetLLMLogger(msg.TabID); logger != nil {
					logger.EndConversation()
				}
			}

			// Check if buffer exceeds max size
			if buf.output.Len() > p.config.MaxBufferSize {
				log.Printf("[AsyncPipeline] Tab %s: Buffer full (%d bytes), flushing", 
					msg.TabID, buf.output.Len())
				p.flushTabBuffer(amSystem, msg.TabID, buf)
			}

		case <-flushTicker.C:
			// Periodic flush of all buffers
			p.flushAllBuffers(amSystem, buffers)
		}
	}
}

// handleBinaryData routes binary/image data to appropriate handler.
// This prevents attempting to parse binary as text which would corrupt output.
// Industrial Phase 2: Routes to ImageAnalyzer for background AI analysis.
func (p *AsyncPipeline) handleBinaryData(amSystem *System, tabID string, data []byte, detection ImageDetectionResult) {
	// Log detection for debugging (minimal logging in hot path)
	if p.config.EnableDebugLogs {
		log.Printf("[AsyncPipeline] Binary data detected: format=%s isBase64=%v size=%d",
			detection.Format, detection.IsBase64, len(data))
	}

	// Route to ImageAnalyzer for background processing (Agent Optical Nerve)
	if detection.IsImage {
		analyzer := GetImageAnalyzer()
		if analyzer != nil {
			analyzer.QueueImage(tabID, data, detection)
		}
	}

	// Increment binary message counter
	p.binaryMessages.Add(1)
}

// worker is an alias for ProcessLoop for backwards compatibility.
// Deprecated: Use ProcessLoop directly.
func (p *AsyncPipeline) worker(amSystem *System) {
	p.ProcessLoop(amSystem)
}

// processCommand handles LLM command detection in the background.
func (p *AsyncPipeline) processCommand(amSystem *System, tabID string, command string) {
	if amSystem == nil || amSystem.Detector == nil {
		return
	}
	
	logger := amSystem.GetLLMLogger(tabID)
	if logger == nil {
		return
	}
	
	// Only detect if no active conversation
	if logger.GetActiveConversationID() != "" {
		return
	}
	
	detected := amSystem.Detector.DetectCommand(command)
	if detected.Detected {
		isTUITool := detected.Provider == "github-copilot" || detected.Provider == "claude"
		if isTUITool {
			logger.StartConversationFromProcess(
				string(detected.Provider),
				string(detected.Type),
				0,
			)
		} else {
			logger.StartConversation(detected)
		}
	}
}

// flushTabBuffer flushes a single tab's buffer to the LLM logger.
// Also captures snapshots for Time-Travel Scrubber (Industrial Phase 2).
func (p *AsyncPipeline) flushTabBuffer(amSystem *System, tabID string, buf *tabBuffer) {
	if amSystem == nil {
		return
	}
	
	logger := amSystem.GetLLMLogger(tabID)
	if logger == nil {
		if buf.input.Len() > 0 || buf.output.Len() > 0 {
			log.Printf("[AsyncPipeline] Tab %s: No logger, discarding %d input + %d output bytes",
				tabID, buf.input.Len(), buf.output.Len())
		}
		return
	}
	
	// Capture snapshot for Time-Travel (non-blocking, <1ms)
	if buf.output.Len() > 0 {
		outputContent := buf.output.String()
		cleanedContent := StripANSIString(outputContent)
		
		// Get StateStore and capture snapshot
		store := GetStateStore(tabID)
		if store != nil {
			ctx := SnapshotContext{
				WorkingDirectory: "", // TODO: Extract from terminal state
				LastCommand:      "", // TODO: Extract from recent commands
				LastExitCode:     0,
			}
			store.CaptureSnapshot(cleanedContent, ctx)
		}
		
		// Feed to Forensics detector for exit code monitoring
		detector := GetForensicsDetector(tabID)
		if detector != nil {
			detector.FeedOutput(cleanedContent)
		}
	}
	
	// Only flush to logger if there's an active conversation
	activeConvID := logger.GetActiveConversationID()
	if activeConvID == "" {
		if buf.input.Len() > 0 || buf.output.Len() > 0 {
			log.Printf("[AsyncPipeline] Tab %s: No active conversation, discarding %d input + %d output bytes",
				tabID, buf.input.Len(), buf.output.Len())
		}
		buf.input.Reset()
		buf.output.Reset()
		return
	}
	
	log.Printf("[AsyncPipeline] Tab %s: Flushing to conversation %s (input: %d bytes, output: %d bytes)",
		tabID, activeConvID, buf.input.Len(), buf.output.Len())
	
	// Check for image context to inject ("whisper")
	analyzer := GetImageAnalyzer()
	var imageContext string
	if analyzer != nil {
		if summary := analyzer.GetRecentSummary(tabID); summary != nil {
			imageContext = summary.Description
			// Clear after use to avoid repeated injection
			analyzer.ClearRecentSummary(tabID)
		}
	}
	
	// Flush input with optional image context
	if buf.input.Len() > 0 {
		inputContent := buf.input.String()
		log.Printf("[AsyncPipeline] Tab %s: Adding USER INPUT (%d bytes)", tabID, len(inputContent))
		if imageContext != "" {
			// Prepend image context as a "whisper"
			logger.AddUserInputWithContext(inputContent, imageContext)
		} else {
			logger.AddUserInput(inputContent)
		}
		buf.input.Reset()
	}
	
	// Flush output (using optimized ANSI stripping)
	if buf.output.Len() > 0 {
		log.Printf("[AsyncPipeline] Tab %s: Adding ASSISTANT OUTPUT (%d bytes)", tabID, buf.output.Len())
		logger.AddOutput(buf.output.String())
		buf.output.Reset()
	}
	
	buf.lastFlush = time.Now()
}

// flushAllBuffers flushes all tab buffers.
func (p *AsyncPipeline) flushAllBuffers(amSystem *System, buffers map[string]*tabBuffer) {
	for tabID, buf := range buffers {
		p.flushTabBuffer(amSystem, tabID, buf)
	}
}

// copyBytes makes a copy of the byte slice to avoid data races.
func copyBytes(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}
	cp := make([]byte, len(data))
	copy(cp, data)
	return cp
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIZED ANSI STRIPPING - Delegates to parser_core state machine
// ═══════════════════════════════════════════════════════════════════════════════

// StripANSIFast removes ANSI escape sequences using the state machine from parser_core.
// This is optimized for high-frequency stream processing without regex.
// Deprecated: Use StripANSIBytes from parser_core.go directly for new code.
func StripANSIFast(input []byte) []byte {
	return StripANSIBytes(input)
}

// StripANSIFastString is a string wrapper for StripANSIFast.
// Deprecated: Use StripANSIString from parser_core.go directly for new code.
func StripANSIFastString(input string) string {
	return StripANSIString(input)
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL PIPELINE INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

var (
	globalPipeline     *AsyncPipeline
	globalPipelineMu   sync.Mutex
	globalPipelineOnce sync.Once
)

// GetAsyncPipeline returns the global async pipeline instance.
func GetAsyncPipeline() *AsyncPipeline {
	globalPipelineMu.Lock()
	defer globalPipelineMu.Unlock()
	return globalPipeline
}

// InitAsyncPipeline initializes the global async pipeline.
func InitAsyncPipeline(amSystem *System) *AsyncPipeline {
	globalPipelineMu.Lock()
	defer globalPipelineMu.Unlock()
	
	if globalPipeline != nil {
		return globalPipeline
	}
	
	globalPipeline = NewAsyncPipeline(DefaultPipelineConfig())
	globalPipeline.Start(amSystem)
	
	return globalPipeline
}

// StopAsyncPipeline stops the global async pipeline.
func StopAsyncPipeline() {
	globalPipelineMu.Lock()
	defer globalPipelineMu.Unlock()
	
	if globalPipeline != nil {
		globalPipeline.Stop()
		globalPipeline = nil
	}
}
