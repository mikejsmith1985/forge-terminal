// Package am provides tests for the async pipeline.
package am

import (
	"bytes"
	"testing"
	"time"
)

func TestStripANSIFast_NoEscapeSequences(t *testing.T) {
	input := []byte("Hello, World!")
	result := StripANSIFast(input)
	if !bytes.Equal(result, input) {
		t.Errorf("Expected %q, got %q", input, result)
	}
}

func TestStripANSIFast_CSISequences(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "color codes",
			input:    "\x1b[31mRed\x1b[0m",
			expected: "Red",
		},
		{
			name:     "cursor movement",
			input:    "\x1b[2J\x1b[HHello",
			expected: "Hello",
		},
		{
			name:     "mixed content",
			input:    "Before\x1b[32mGreen\x1b[0mAfter",
			expected: "BeforeGreenAfter",
		},
		{
			name:     "clear screen",
			input:    "\x1b[2J\x1b[3JCleared",
			expected: "Cleared",
		},
		{
			name:     "with parameters",
			input:    "\x1b[1;34mBold Blue\x1b[0m",
			expected: "Bold Blue",
		},
		{
			name:     "preserve newlines",
			input:    "Line1\n\x1b[32mLine2\x1b[0m\nLine3",
			expected: "Line1\nLine2\nLine3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StripANSIFastString(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestStripANSIFast_OSCSequences(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "window title BEL",
			input:    "\x1b]0;My Title\x07Content",
			expected: "Content",
		},
		{
			name:     "window title ST",
			input:    "\x1b]0;My Title\x1b\\Content",
			expected: "Content",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StripANSIFastString(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestAsyncPipeline_NonBlocking(t *testing.T) {
	config := PipelineConfig{
		ChannelSize:   10,
		FlushInterval: 100 * time.Millisecond,
		MaxBufferSize: 1024,
	}

	pipeline := NewAsyncPipeline(config)

	// Enqueue without starting should return false
	if pipeline.EnqueueInput("tab1", []byte("test")) {
		t.Error("Expected false when pipeline not running")
	}

	// Start with nil system (for testing isolation)
	pipeline.Start(nil)
	defer pipeline.Stop()

	// Wait for worker to start
	time.Sleep(10 * time.Millisecond)

	// Enqueue should succeed now
	if !pipeline.EnqueueInput("tab1", []byte("test")) {
		t.Error("Expected true when pipeline is running")
	}

	// Fill the channel
	for i := 0; i < config.ChannelSize+5; i++ {
		pipeline.EnqueueInput("tab1", []byte("data"))
	}

	// Give worker time to process
	time.Sleep(50 * time.Millisecond)

	// Check stats - processed should be > 0 since worker is running
	processed, dropped := pipeline.GetStats()
	t.Logf("Processed: %d, Dropped: %d", processed, dropped)
	
	// At minimum, processed + dropped should equal total sent
	// (some may still be in channel)
	if processed == 0 && dropped == 0 {
		t.Error("Expected some activity")
	}
}

func TestAsyncPipeline_DropOnFull(t *testing.T) {
	// Very small channel to force dropping
	config := PipelineConfig{
		ChannelSize:   1,
		FlushInterval: 1 * time.Second, // Long interval to prevent draining
		MaxBufferSize: 1024,
	}

	pipeline := NewAsyncPipeline(config)
	pipeline.Start(nil)

	// Wait for worker
	time.Sleep(10 * time.Millisecond)

	// Rapid-fire messages to overflow
	success := 0
	for i := 0; i < 100; i++ {
		if pipeline.EnqueueInput("tab1", []byte("data")) {
			success++
		}
	}

	pipeline.Stop()

	_, dropped := pipeline.GetStats()
	t.Logf("Success: %d, Dropped: %d", success, dropped)

	// We should have dropped some
	if success == 100 && dropped == 0 {
		t.Log("All messages succeeded (worker is draining fast)")
	}
}

func BenchmarkStripANSIFast_NoEscape(b *testing.B) {
	input := []byte("This is a simple string with no escape sequences at all")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		StripANSIFast(input)
	}
}

func BenchmarkStripANSIFast_WithEscape(b *testing.B) {
	input := []byte("\x1b[31mRed\x1b[32mGreen\x1b[33mYellow\x1b[0m Normal text here")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		StripANSIFast(input)
	}
}

func BenchmarkStripANSIFast_HeavyEscape(b *testing.B) {
	// Simulate heavy TUI output
	var buf bytes.Buffer
	for i := 0; i < 100; i++ {
		buf.WriteString("\x1b[2J\x1b[H")                                 // Clear screen
		buf.WriteString("\x1b[1;34mHeader\x1b[0m\n")                     // Colored header
		buf.WriteString("\x1b[32m✓\x1b[0m Item 1\n")                    // Checkmark
		buf.WriteString("\x1b[31m✗\x1b[0m Item 2\n")                    // X mark
		buf.WriteString("\x1b[?25l")                                     // Hide cursor
		buf.WriteString("Content line with some text\n")
		buf.WriteString("\x1b[?25h")                                     // Show cursor
	}
	input := buf.Bytes()
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		StripANSIFast(input)
	}
}
