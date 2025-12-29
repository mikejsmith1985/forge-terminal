// Package terminal provides the ChatPTYBridge for connecting Chat UI to PTY sessions.
package terminal

import (
	"context"
	"fmt"
	"io"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ChatPTYBridge connects the Chat UI to an existing PTY session.
// Instead of running CLI commands in a subprocess, it injects commands
// into the same PTY that the terminal view uses.
//
// This ensures:
// - Same session state between Terminal and Chat views
// - Auto-respond works (watching the same PTY output)
// - Interactive prompts are visible and answerable from Chat
// - No context pollution between tabs
type ChatPTYBridge struct {
	sessionID string
	pty       io.ReadWriteCloser

	// Output handling
	outputHandler func([]byte)
	outputMu      sync.RWMutex

	// Auto-respond state
	autoRespond   bool
	autoRespondMu sync.RWMutex

	// Prompt detection patterns
	yesNoPattern    *regexp.Regexp
	continuePattern *regexp.Regexp

	// State tracking
	isReading bool
	readMu    sync.Mutex

	// Response accumulation for Chat display
	responseBuffer strings.Builder
	responseMu     sync.Mutex
	lastActivity   time.Time
}

// NewChatPTYBridge creates a bridge to an existing PTY session.
func NewChatPTYBridge(pty io.ReadWriteCloser) *ChatPTYBridge {
	return &ChatPTYBridge{
		pty:             pty,
		yesNoPattern:    regexp.MustCompile(`\[Y/n\]|\[y/N\]|\(y/n\)|\(Y/N\)`),
		continuePattern: regexp.MustCompile(`Press Enter to continue|continue\?|proceed\?`),
		lastActivity:    time.Now(),
	}
}

// NewChatPTYBridgeWithSession creates a bridge with session tracking.
func NewChatPTYBridgeWithSession(sessionID string, pty io.ReadWriteCloser) *ChatPTYBridge {
	bridge := NewChatPTYBridge(pty)
	bridge.sessionID = sessionID
	return bridge
}

// SendMessage writes a message to the PTY, simulating user typing.
// The message is sent with a newline to execute it.
func (b *ChatPTYBridge) SendMessage(msg string) error {
	if b.pty == nil {
		return fmt.Errorf("PTY not connected")
	}

	// Write message with newline
	_, err := b.pty.Write([]byte(msg + "\n"))
	if err != nil {
		log.Printf("[ChatPTYBridge] Write error: %v", err)
		return err
	}

	log.Printf("[ChatPTYBridge] Sent message to PTY: %s", truncateForLog(msg, 50))
	return nil
}

// SendCLICommand constructs and sends a CLI command with model selection.
// This is used when the Chat UI needs to invoke copilot or claude with
// a specific model selected by the SLM routing.
func (b *ChatPTYBridge) SendCLICommand(cli, model, prompt string) error {
	if b.pty == nil {
		return fmt.Errorf("PTY not connected")
	}

	// Escape the prompt for shell
	escapedPrompt := escapeForShell(prompt)

	var cmd string
	switch cli {
	case "copilot":
		if model != "" {
			cmd = fmt.Sprintf("copilot --model %s -p %s", model, escapedPrompt)
		} else {
			cmd = fmt.Sprintf("copilot -p %s", escapedPrompt)
		}
	case "claude":
		if model != "" {
			cmd = fmt.Sprintf("claude --model %s -p %s", model, escapedPrompt)
		} else {
			cmd = fmt.Sprintf("claude -p %s", escapedPrompt)
		}
	default:
		cmd = fmt.Sprintf("%s %s", cli, escapedPrompt)
	}

	// Add newline to execute
	cmd += "\n"

	_, err := b.pty.Write([]byte(cmd))
	if err != nil {
		log.Printf("[ChatPTYBridge] CLI command write error: %v", err)
		return err
	}

	log.Printf("[ChatPTYBridge] Sent CLI command: %s %s (model: %s)", cli, truncateForLog(prompt, 30), model)
	return nil
}

// OnOutput registers a handler for PTY output.
// This handler receives all output from the PTY and can process it
// for display in the Chat UI.
func (b *ChatPTYBridge) OnOutput(handler func([]byte)) {
	b.outputMu.Lock()
	defer b.outputMu.Unlock()
	b.outputHandler = handler
}

// SetAutoRespond enables/disables automatic response to prompts.
func (b *ChatPTYBridge) SetAutoRespond(enabled bool) {
	b.autoRespondMu.Lock()
	defer b.autoRespondMu.Unlock()
	b.autoRespond = enabled
	log.Printf("[ChatPTYBridge] Auto-respond set to: %v", enabled)
}

// IsAutoRespond returns whether auto-respond is enabled.
func (b *ChatPTYBridge) IsAutoRespond() bool {
	b.autoRespondMu.RLock()
	defer b.autoRespondMu.RUnlock()
	return b.autoRespond
}

// StartReading begins reading from the PTY and forwarding to handlers.
// This should be called in a goroutine.
func (b *ChatPTYBridge) StartReading(ctx context.Context) {
	b.readMu.Lock()
	if b.isReading {
		b.readMu.Unlock()
		return
	}
	b.isReading = true
	b.readMu.Unlock()

	defer func() {
		b.readMu.Lock()
		b.isReading = false
		b.readMu.Unlock()
	}()

	buf := make([]byte, 4096)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[ChatPTYBridge] Reading stopped: context cancelled")
			return
		default:
			n, err := b.pty.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("[ChatPTYBridge] Read error: %v", err)
				}
				return
			}

			if n > 0 {
				data := buf[:n]
				b.lastActivity = time.Now()

				// Accumulate for response parsing
				b.responseMu.Lock()
				b.responseBuffer.Write(data)
				b.responseMu.Unlock()

				// Forward to output handler
				b.outputMu.RLock()
				handler := b.outputHandler
				b.outputMu.RUnlock()

				if handler != nil {
					handler(data)
				}

				// Check for auto-respond triggers
				b.checkAutoRespond(data)
			}
		}
	}
}

// checkAutoRespond checks output for prompts and responds automatically.
func (b *ChatPTYBridge) checkAutoRespond(data []byte) {
	if !b.IsAutoRespond() {
		return
	}

	text := string(data)

	// Check for Y/n prompts
	if b.yesNoPattern.MatchString(text) {
		log.Printf("[ChatPTYBridge] Auto-responding 'y' to prompt")
		b.pty.Write([]byte("y\n"))
		return
	}

	// Check for continue prompts
	if b.continuePattern.MatchString(text) {
		log.Printf("[ChatPTYBridge] Auto-responding Enter to continue prompt")
		b.pty.Write([]byte("\n"))
		return
	}
}

// GetAccumulatedResponse returns accumulated output since last clear.
func (b *ChatPTYBridge) GetAccumulatedResponse() string {
	b.responseMu.Lock()
	defer b.responseMu.Unlock()
	return b.responseBuffer.String()
}

// ClearResponseBuffer clears the accumulated response.
func (b *ChatPTYBridge) ClearResponseBuffer() {
	b.responseMu.Lock()
	defer b.responseMu.Unlock()
	b.responseBuffer.Reset()
}

// LastActivityTime returns when the last PTY activity occurred.
func (b *ChatPTYBridge) LastActivityTime() time.Time {
	return b.lastActivity
}

// Helper functions

func truncateForLog(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func escapeForShell(s string) string {
	// Basic shell escaping - wrap in quotes and escape internal quotes
	escaped := strings.ReplaceAll(s, `"`, `\"`)
	return `"` + escaped + `"`
}
