// Package terminal provides tests for Chat→PTY bridge integration.
// TDD: These tests define the expected behavior BEFORE implementation.
package terminal

import (
	"bytes"
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1: Chat input must be written to PTY session
// ══════════════════════════════════════════════════════════════════════════════

func TestChatInputWritesToPTY(t *testing.T) {
	// GIVEN: A mock PTY that records what's written to it
	mockPTY := &MockPTY{
		writeBuffer: &bytes.Buffer{},
	}
	
	// AND: A ChatPTYBridge connected to that PTY
	bridge := NewChatPTYBridge(mockPTY)
	
	// WHEN: We send a chat message through the bridge
	err := bridge.SendMessage("hello world")
	
	// THEN: The message should be written to the PTY
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	
	written := mockPTY.writeBuffer.String()
	if !strings.Contains(written, "hello world") {
		t.Errorf("Expected PTY to receive 'hello world', got: %q", written)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: PTY output must be captured and forwarded to Chat
// ══════════════════════════════════════════════════════════════════════════════

func TestPTYOutputForwardedToChat(t *testing.T) {
	// GIVEN: A mock PTY that produces output
	mockPTY := &MockPTY{
		readData: []byte("Command output from terminal\n"),
	}
	
	// AND: A ChatPTYBridge with an output handler
	var capturedOutput []byte
	var mu sync.Mutex
	
	bridge := NewChatPTYBridge(mockPTY)
	bridge.OnOutput(func(data []byte) {
		mu.Lock()
		capturedOutput = append(capturedOutput, data...)
		mu.Unlock()
	})
	
	// WHEN: We start reading from the PTY
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	
	go bridge.StartReading(ctx)
	
	// Allow time for read
	time.Sleep(50 * time.Millisecond)
	
	// THEN: The output handler should receive the data
	mu.Lock()
	defer mu.Unlock()
	
	if !bytes.Contains(capturedOutput, []byte("Command output from terminal")) {
		t.Errorf("Expected to capture output, got: %q", string(capturedOutput))
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3: Auto-respond must trigger on PTY prompts (same as terminal)
// ══════════════════════════════════════════════════════════════════════════════

func TestAutoRespondTriggersFromChatPTY(t *testing.T) {
	// GIVEN: A mock PTY that outputs a tool confirmation prompt
	mockPTY := &MockPTY{
		readData:    []byte("Do you want to apply these changes? [Y/n] "),
		writeBuffer: &bytes.Buffer{},
	}
	
	// AND: A ChatPTYBridge with auto-respond enabled
	bridge := NewChatPTYBridge(mockPTY)
	bridge.SetAutoRespond(true)
	
	// WHEN: We start reading and the prompt is detected
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	
	go bridge.StartReading(ctx)
	
	// Allow time for read and auto-respond
	time.Sleep(100 * time.Millisecond)
	
	// THEN: Auto-respond should have written 'y\n' to the PTY
	written := mockPTY.writeBuffer.String()
	if !strings.Contains(written, "y") {
		t.Errorf("Expected auto-respond to write 'y', got: %q", written)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4: Interactive prompts visible in Chat output
// ══════════════════════════════════════════════════════════════════════════════

func TestInteractivePromptsVisibleInChat(t *testing.T) {
	// GIVEN: A mock PTY that outputs an interactive prompt
	promptText := "Select an option:\n> Option 1\n  Option 2\n  Option 3\n"
	mockPTY := &MockPTY{
		readData: []byte(promptText),
	}
	
	// AND: A ChatPTYBridge with output capture
	var outputs []string
	var mu sync.Mutex
	
	bridge := NewChatPTYBridge(mockPTY)
	bridge.OnOutput(func(data []byte) {
		mu.Lock()
		outputs = append(outputs, string(data))
		mu.Unlock()
	})
	
	// WHEN: We read from PTY
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	
	go bridge.StartReading(ctx)
	time.Sleep(50 * time.Millisecond)
	
	// THEN: The prompt should be visible in outputs
	mu.Lock()
	defer mu.Unlock()
	
	combined := strings.Join(outputs, "")
	if !strings.Contains(combined, "Select an option") {
		t.Errorf("Expected prompt to be visible, got: %q", combined)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5: User can respond to prompts from Chat input
// ══════════════════════════════════════════════════════════════════════════════

func TestUserCanRespondToPromptsFromChat(t *testing.T) {
	// GIVEN: A mock PTY in a state where it's waiting for input
	mockPTY := &MockPTY{
		readData:    []byte("Enter your choice: "),
		writeBuffer: &bytes.Buffer{},
	}
	
	bridge := NewChatPTYBridge(mockPTY)
	
	// WHEN: User sends a response through Chat
	err := bridge.SendMessage("2")
	
	// THEN: The response should be written to PTY
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	
	written := mockPTY.writeBuffer.String()
	if !strings.Contains(written, "2") {
		t.Errorf("Expected user response '2' to be written to PTY, got: %q", written)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 6: Same session state between Terminal and Chat views
// ══════════════════════════════════════════════════════════════════════════════

func TestSameSessionStateBetweenViews(t *testing.T) {
	// GIVEN: A single PTY session
	mockPTY := &MockPTY{
		writeBuffer: &bytes.Buffer{},
		readData:    []byte("PS C:\\Projects> "),
	}
	
	// AND: Both a Terminal interface and Chat bridge connected to it
	bridge := NewChatPTYBridge(mockPTY)
	
	// WHEN: Chat sends a command
	bridge.SendMessage("cd subdir")
	
	// AND: Terminal sends a command (simulated by direct PTY write)
	mockPTY.Write([]byte("ls\n"))
	
	// THEN: Both commands should be in the same write buffer (same session)
	written := mockPTY.writeBuffer.String()
	if !strings.Contains(written, "cd subdir") {
		t.Errorf("Expected Chat command in buffer, got: %q", written)
	}
	if !strings.Contains(written, "ls") {
		t.Errorf("Expected Terminal command in buffer, got: %q", written)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 7: CLI command injection with model selection
// ══════════════════════════════════════════════════════════════════════════════

func TestChatInjectsCLICommandWithModel(t *testing.T) {
	// GIVEN: A mock PTY
	mockPTY := &MockPTY{
		writeBuffer: &bytes.Buffer{},
	}
	
	bridge := NewChatPTYBridge(mockPTY)
	
	// WHEN: Chat sends a message that should invoke copilot with a specific model
	err := bridge.SendCLICommand("copilot", "claude-sonnet-4", "explain this code")
	
	// THEN: The correct copilot command with model flag should be written
	if err != nil {
		t.Fatalf("SendCLICommand failed: %v", err)
	}
	
	written := mockPTY.writeBuffer.String()
	
	// Should contain the model flag
	if !strings.Contains(written, "--model") || !strings.Contains(written, "claude-sonnet-4") {
		t.Errorf("Expected --model claude-sonnet-4 in command, got: %q", written)
	}
	
	// Should contain the prompt
	if !strings.Contains(written, "explain this code") {
		t.Errorf("Expected prompt in command, got: %q", written)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCK IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════════════════════

// MockPTY simulates a PTY for testing
type MockPTY struct {
	readData    []byte
	readPos     int
	writeBuffer *bytes.Buffer
	mu          sync.Mutex
}

func (m *MockPTY) Read(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	if m.readPos >= len(m.readData) {
		return 0, io.EOF
	}
	
	n := copy(p, m.readData[m.readPos:])
	m.readPos += n
	return n, nil
}

func (m *MockPTY) Write(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	return m.writeBuffer.Write(p)
}

func (m *MockPTY) Close() error {
	return nil
}
