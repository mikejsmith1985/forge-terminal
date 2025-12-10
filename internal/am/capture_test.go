package am

import (
	"strings"
	"testing"
	"time"
)

func TestCleanUserInput(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		expected string
	}{
		{
			name:     "simple text",
			raw:      "hello world",
			expected: "hello world",
		},
		{
			name:     "with carriage return",
			raw:      "hello world\r",
			expected: "hello world",
		},
		{
			name:     "with backspaces",
			raw:      "helllo\x7f world",
			expected: "helll world",
		},
		{
			name:     "multiple backspaces",
			raw:      "test\x7f\x7f\x7fhello",
			expected: "thello",
		},
		{
			name:     "with ANSI codes",
			raw:      "\x1b[32mhello\x1b[0m world",
			expected: "hello world",
		},
		{
			name:     "with prompt characters",
			raw:      "> hello world",
			expected: "hello world",
		},
		{
			name:     "complex mixed input",
			raw:      "\x1b[?2004h> hello world\r\n",
			expected: "hello world",
		},
		{
			name:     "empty after cleaning",
			raw:      "\x1b[32m\x1b[0m",
			expected: "",
		},
		{
			name:     "control characters",
			raw:      "hello\x00\x01\x02world",
			expected: "helloworld",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanUserInput(tt.raw)
			if result != tt.expected {
				t.Errorf("CleanUserInput(%q) = %q, want %q", tt.raw, result, tt.expected)
			}
		})
	}
}

func TestApplyBackspaces(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "no backspaces",
			input:    "hello",
			expected: "hello",
		},
		{
			name:     "single backspace",
			input:    "helllo\x7f",
			expected: "helll",
		},
		{
			name:     "backspace at start",
			input:    "\x7fhello",
			expected: "hello",
		},
		{
			name:     "multiple consecutive",
			input:    "abc\x7f\x7f\x7f",
			expected: "",
		},
		{
			name:     "BS character",
			input:    "hello\x08o",
			expected: "hello",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := applyBackspaces(tt.input)
			if result != tt.expected {
				t.Errorf("applyBackspaces(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestParseAssistantOutput(t *testing.T) {
	tests := []struct {
		name           string
		raw            string
		provider       string
		expectContent  string
		minConfidence  float64
	}{
		{
			name:          "clean text",
			raw:           "Here is the solution to your problem.",
			provider:      "github-copilot",
			expectContent: "Here is the solution to your problem.",
			minConfidence: 0.8,
		},
		{
			name:          "with ANSI colors",
			raw:           "\x1b[32mSuccess\x1b[0m: Operation completed",
			provider:      "github-copilot",
			expectContent: "Success: Operation completed",
			minConfidence: 0.7,
		},
		{
			name:          "with cursor codes",
			raw:           "\x1b[2J\x1b[HHello World\x1b[10;5H",
			provider:      "github-copilot",
			expectContent: "Hello World",
			minConfidence: 0.5,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			content, confidence := ParseAssistantOutput(tt.raw, tt.provider)
			
			// Check content contains expected (may have extra whitespace)
			if !strings.Contains(content, strings.TrimSpace(tt.expectContent)) && tt.expectContent != "" {
				t.Errorf("ParseAssistantOutput content = %q, want to contain %q", content, tt.expectContent)
			}
			
			if confidence < tt.minConfidence {
				t.Errorf("ParseAssistantOutput confidence = %f, want >= %f", confidence, tt.minConfidence)
			}
		})
	}
}

func TestConversationCapture_InputCapture(t *testing.T) {
	capture := NewConversationCapture("test-tab", "github-copilot")

	var capturedContent string
	var capturedRaw string

	capture.SetCallbacks(
		func(content, raw string) {
			capturedContent = content
			capturedRaw = raw
		},
		nil,
		nil,
	)

	// Simulate user typing
	capture.CaptureInput([]byte("hello"))
	capture.CaptureInput([]byte(" world"))
	capture.CaptureInput([]byte("\r"))

	if capturedContent != "hello world" {
		t.Errorf("Captured content = %q, want %q", capturedContent, "hello world")
	}

	if !strings.Contains(capturedRaw, "hello world") {
		t.Errorf("Captured raw should contain 'hello world', got %q", capturedRaw)
	}

	// Check state transition
	if capture.GetState() != StateWaitingResponse {
		t.Errorf("State = %v, want StateWaitingResponse", capture.GetState())
	}
}

func TestConversationCapture_OutputCapture(t *testing.T) {
	capture := NewConversationCapture("test-tab", "github-copilot")
	capture.state = StateWaitingResponse // Simulate waiting for response

	var capturedContent string
	var capturedConfidence float64

	capture.SetCallbacks(
		nil,
		func(content, raw string, confidence float64) {
			capturedContent = content
			capturedConfidence = confidence
		},
		nil,
	)

	// Simulate assistant output
	capture.CaptureOutput([]byte("Here is the answer to your question."))

	// Should be in responding state
	if capture.GetState() != StateAssistantResponding {
		t.Errorf("State = %v, want StateAssistantResponding", capture.GetState())
	}

	// Trigger timeout-based flush
	capture.lastOutputTime = time.Now().Add(-3 * time.Second)
	capture.CheckResponseEnd(2 * time.Second)

	if capturedContent == "" {
		t.Error("Expected assistant output to be captured")
	}

	if capturedConfidence < 0.5 {
		t.Errorf("Confidence = %f, expected >= 0.5", capturedConfidence)
	}
}

func TestConversationCapture_AutoRespond(t *testing.T) {
	capture := NewConversationCapture("test-tab", "github-copilot")

	// Initially off
	if capture.IsAutoRespond() {
		t.Error("AutoRespond should be off initially")
	}

	// Turn on
	capture.SetAutoRespond(true)
	if !capture.IsAutoRespond() {
		t.Error("AutoRespond should be on after SetAutoRespond(true)")
	}

	// Check metrics
	metrics := capture.GetMetrics()
	if metrics.AutoRespondSessions != 1 {
		t.Errorf("AutoRespondSessions = %d, want 1", metrics.AutoRespondSessions)
	}
}

func TestConversationCapture_LowConfidenceCallback(t *testing.T) {
	capture := NewConversationCapture("test-tab", "github-copilot")
	capture.SetAutoRespond(true)
	capture.state = StateWaitingResponse

	var lowConfidenceRaw string

	capture.SetCallbacks(
		nil,
		func(content, raw string, confidence float64) {},
		func(raw string) {
			lowConfidenceRaw = raw
		},
	)

	// Feed heavily corrupted output that will result in low confidence
	corruptedOutput := "\x1b[?1049h\x1b[22;0;0t\x1b[?1h\x1b=\x1b[?2004h\x1b[?25l"
	capture.CaptureOutput([]byte(corruptedOutput))

	// Force flush
	capture.lastOutputTime = time.Now().Add(-3 * time.Second)
	capture.CheckResponseEnd(2 * time.Second)

	// In auto-respond mode with low confidence, should trigger callback
	if lowConfidenceRaw == "" {
		t.Error("Expected low confidence callback to be triggered for corrupted output")
	}
}

func TestConversationCapture_Metrics(t *testing.T) {
	capture := NewConversationCapture("test-tab", "github-copilot")

	capture.SetCallbacks(
		func(content, raw string) {},
		func(content, raw string, confidence float64) {},
		nil,
	)

	// Capture some input
	capture.CaptureInput([]byte("test input\r"))

	metrics := capture.GetMetrics()
	if metrics.InputBytesCaptured != 11 {
		t.Errorf("InputBytesCaptured = %d, want 11", metrics.InputBytesCaptured)
	}
	if metrics.InputTurnsDetected != 1 {
		t.Errorf("InputTurnsDetected = %d, want 1", metrics.InputTurnsDetected)
	}
}

func TestCalculateParseConfidence(t *testing.T) {
	tests := []struct {
		name          string
		raw           string
		cleaned       string
		minConfidence float64
		maxConfidence float64
	}{
		{
			name:          "identical",
			raw:           "hello world",
			cleaned:       "hello world",
			minConfidence: 0.8,
			maxConfidence: 0.9,
		},
		{
			name:          "moderate cleaning",
			raw:           "\x1b[32mhello world\x1b[0m some more text",
			cleaned:       "hello world some more text",
			minConfidence: 0.7,
			maxConfidence: 1.0,
		},
		{
			name:          "aggressive cleaning",
			raw:           strings.Repeat("\x1b[32m", 100) + "hi",
			cleaned:       "hi",
			minConfidence: 0.0,
			maxConfidence: 0.6,
		},
		{
			name:          "artifacts remaining",
			raw:           "hello [?25h world",
			cleaned:       "hello [?25h world",
			minConfidence: 0.5,
			maxConfidence: 0.9,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			confidence := calculateParseConfidence(tt.raw, tt.cleaned)
			if confidence < tt.minConfidence || confidence > tt.maxConfidence {
				t.Errorf("calculateParseConfidence = %f, want between %f and %f",
					confidence, tt.minConfidence, tt.maxConfidence)
			}
		})
	}
}
