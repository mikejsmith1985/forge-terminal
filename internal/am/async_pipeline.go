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
		EnableDebugLogs: false,
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
	config   PipelineConfig
	inputCh  chan PipelineMessage
	running  atomic.Bool
	wg       sync.WaitGroup
	stopCh   chan struct{}
	
	// Stats for monitoring
	droppedMessages atomic.Int64
	processedMessages atomic.Int64
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

// tabBuffer holds per-tab buffers for batching input/output.
type tabBuffer struct {
	input      bytes.Buffer
	output     bytes.Buffer
	lastFlush  time.Time
	lastInput  time.Time
	lastOutput time.Time
}

// worker is the background goroutine that processes all AM data.
// ALL LLM Parsing, ANSI Stripping, and JSON Serialization happens here.
func (p *AsyncPipeline) worker(amSystem *System) {
	defer p.wg.Done()
	
	// Per-tab buffers for batching
	buffers := make(map[string]*tabBuffer)
	
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
			
			// Get or create buffer for this tab
			buf, ok := buffers[msg.TabID]
			if !ok {
				buf = &tabBuffer{
					lastFlush:  time.Now(),
					lastInput:  time.Now(),
					lastOutput: time.Now(),
				}
				buffers[msg.TabID] = buf
			}
			
			switch msg.Type {
			case MsgTypeInput:
				buf.input.Write(msg.Data)
				buf.lastInput = msg.Timestamp
				
			case MsgTypeOutput:
				buf.output.Write(msg.Data)
				buf.lastOutput = msg.Timestamp
				
			case MsgTypeCommand:
				// Process command for LLM detection
				p.processCommand(amSystem, msg.TabID, string(msg.Data))
				
			case MsgTypeEndConversation:
				// Flush and end conversation
				p.flushTabBuffer(amSystem, msg.TabID, buf)
				if logger := amSystem.GetLLMLogger(msg.TabID); logger != nil {
					logger.EndConversation()
				}
			}
			
			// Check if buffer exceeds max size
			if buf.output.Len() > p.config.MaxBufferSize {
				p.flushTabBuffer(amSystem, msg.TabID, buf)
			}
			
		case <-flushTicker.C:
			// Periodic flush of all buffers
			p.flushAllBuffers(amSystem, buffers)
		}
	}
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
func (p *AsyncPipeline) flushTabBuffer(amSystem *System, tabID string, buf *tabBuffer) {
	if amSystem == nil {
		return
	}
	
	logger := amSystem.GetLLMLogger(tabID)
	if logger == nil {
		return
	}
	
	// Only flush if there's an active conversation
	if logger.GetActiveConversationID() == "" {
		buf.input.Reset()
		buf.output.Reset()
		return
	}
	
	// Flush input
	if buf.input.Len() > 0 {
		logger.AddUserInput(buf.input.String())
		buf.input.Reset()
	}
	
	// Flush output (using optimized ANSI stripping)
	if buf.output.Len() > 0 {
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
// OPTIMIZED ANSI STRIPPING - State machine approach, zero allocations in hot path
// ═══════════════════════════════════════════════════════════════════════════════

// StripANSIFast removes ANSI escape sequences using a state machine.
// This is optimized for high-frequency stream processing without regex.
func StripANSIFast(input []byte) []byte {
	if len(input) == 0 {
		return input
	}
	
	// Fast path: check if there are any escape sequences
	hasEscape := false
	for _, b := range input {
		if b == 0x1b {
			hasEscape = true
			break
		}
	}
	if !hasEscape {
		return input
	}
	
	// State machine for ANSI parsing
	const (
		stateNormal = iota
		stateEscape       // Saw ESC (0x1b)
		stateCSI          // Saw ESC [ (CSI sequence)
		stateOSC          // Saw ESC ] (OSC sequence)
		stateOSCString    // Inside OSC string
	)
	
	result := make([]byte, 0, len(input))
	state := stateNormal
	
	for i := 0; i < len(input); i++ {
		b := input[i]
		
		switch state {
		case stateNormal:
			if b == 0x1b {
				state = stateEscape
			} else if b >= 32 || b == '\n' || b == '\t' || b == '\r' {
				result = append(result, b)
			}
			
		case stateEscape:
			switch b {
			case '[':
				state = stateCSI
			case ']':
				state = stateOSC
			case '(':
				// Skip next byte (charset designation)
				if i+1 < len(input) {
					i++
				}
				state = stateNormal
			default:
				// Single-character escape sequence
				if b >= 0x40 && b <= 0x5f {
					state = stateNormal
				} else {
					state = stateNormal
				}
			}
			
		case stateCSI:
			// CSI sequence ends with letter (0x40-0x7e)
			if b >= 0x40 && b <= 0x7e {
				state = stateNormal
			}
			// Stay in CSI state for parameter bytes (0x30-0x3f) and intermediate (0x20-0x2f)
			
		case stateOSC:
			if b == 0x07 { // BEL terminates OSC
				state = stateNormal
			} else if b == 0x1b {
				// Check for ST (ESC \)
				if i+1 < len(input) && input[i+1] == '\\' {
					i++
					state = stateNormal
				}
			}
			// Stay in OSC state otherwise
		}
	}
	
	return result
}

// StripANSIFastString is a string wrapper for StripANSIFast.
func StripANSIFastString(input string) string {
	if len(input) == 0 {
		return input
	}
	result := StripANSIFast([]byte(input))
	return string(result)
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
