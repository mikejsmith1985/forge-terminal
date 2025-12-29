// Package terminal provides tests for prompt detection.
// TDD: Tests define the expected behavior BEFORE implementation.
package terminal

import (
	"testing"
	"time"
)

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 TESTS: OSC 133 Shell Integration (Gold Standard)
// ══════════════════════════════════════════════════════════════════════════════

func TestOSC133PromptStartDetection(t *testing.T) {
	// GIVEN: A prompt detector
	detector := NewPromptDetector()
	
	// WHEN: OSC 133;A is received (prompt start)
	detector.ProcessOutput([]byte("\x1b]133;A\x07"))
	
	// THEN: Should be in "prompt" state
	if detector.State() != PromptStatePrompting {
		t.Errorf("Expected PromptStatePrompting, got %v", detector.State())
	}
}

func TestOSC133PromptEndDetection(t *testing.T) {
	// GIVEN: A detector that received prompt start
	detector := NewPromptDetector()
	detector.ProcessOutput([]byte("\x1b]133;A\x07user@host:~$ "))
	
	// WHEN: OSC 133;B is received (prompt end, user input starts)
	detector.ProcessOutput([]byte("\x1b]133;B\x07"))
	
	// THEN: Should be in "waiting for input" state
	if detector.State() != PromptStateWaitingForInput {
		t.Errorf("Expected PromptStateWaitingForInput, got %v", detector.State())
	}
}

func TestOSC133CommandOutputDetection(t *testing.T) {
	// GIVEN: A detector in waiting state
	detector := NewPromptDetector()
	detector.ProcessOutput([]byte("\x1b]133;A\x07user@host:~$ \x1b]133;B\x07"))
	
	// WHEN: OSC 133;C is received (command output starts)
	detector.ProcessOutput([]byte("\x1b]133;C\x07"))
	
	// THEN: Should be in "command executing" state
	if detector.State() != PromptStateExecuting {
		t.Errorf("Expected PromptStateExecuting, got %v", detector.State())
	}
}

func TestOSC133CommandCompleteDetection(t *testing.T) {
	// GIVEN: A detector in executing state
	detector := NewPromptDetector()
	detector.ProcessOutput([]byte("\x1b]133;C\x07output here\n"))
	
	// WHEN: OSC 133;D is received (command output ends)
	detector.ProcessOutput([]byte("\x1b]133;D\x07"))
	
	// THEN: Should fire command complete callback
	var commandComplete bool
	detector.OnCommandComplete(func() { commandComplete = true })
	detector.ProcessOutput([]byte("\x1b]133;D\x07"))
	
	// Wait for callback
	time.Sleep(10 * time.Millisecond)
	
	if !commandComplete {
		t.Error("Expected command complete callback to fire")
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 TESTS: Alternate Buffer Detection (TUI Mode)
// ══════════════════════════════════════════════════════════════════════════════

func TestAlternateBufferEnterDetection(t *testing.T) {
	// GIVEN: A prompt detector
	detector := NewPromptDetector()
	
	// WHEN: Alternate screen buffer sequence is received (?1049h)
	detector.ProcessOutput([]byte("\x1b[?1049h"))
	
	// THEN: Should be in TUI mode
	if !detector.IsAlternateBuffer() {
		t.Error("Expected IsAlternateBuffer to be true")
	}
	if detector.State() != PromptStateTUI {
		t.Errorf("Expected PromptStateTUI, got %v", detector.State())
	}
}

func TestAlternateBufferExitDetection(t *testing.T) {
	// GIVEN: A detector in TUI mode
	detector := NewPromptDetector()
	detector.ProcessOutput([]byte("\x1b[?1049h")) // Enter TUI
	
	// WHEN: Exit alternate buffer (?1049l)
	detector.ProcessOutput([]byte("\x1b[?1049l"))
	
	// THEN: Should no longer be in TUI mode
	if detector.IsAlternateBuffer() {
		t.Error("Expected IsAlternateBuffer to be false")
	}
}

func TestTUIModeDisablesPromptDetection(t *testing.T) {
	// GIVEN: A detector in TUI mode
	detector := NewPromptDetector()
	detector.ProcessOutput([]byte("\x1b[?1049h"))
	
	// WHEN: Text that looks like a prompt arrives
	detector.ProcessOutput([]byte("user@host:~$ "))
	
	// THEN: Should remain in TUI state (not prompt detection)
	if detector.State() != PromptStateTUI {
		t.Errorf("Expected PromptStateTUI during TUI mode, got %v", detector.State())
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 3 TESTS: Heuristic Detection (Fallback)
// ══════════════════════════════════════════════════════════════════════════════

func TestQuiescenceTriggersPromptCheck(t *testing.T) {
	// GIVEN: A detector with heuristic mode enabled
	detector := NewPromptDetector()
	detector.SetHeuristicMode(true)
	
	var promptDetected bool
	detector.OnPromptDetected(func() { promptDetected = true })
	
	// WHEN: Output arrives then stream goes silent
	detector.ProcessOutput([]byte("user@host:~$ "))
	
	// AND: Quiescence period passes (100ms)
	time.Sleep(150 * time.Millisecond)
	detector.CheckQuiescence()
	
	// Wait for async callback
	time.Sleep(20 * time.Millisecond)
	
	// THEN: Should detect prompt heuristically
	if !promptDetected {
		t.Error("Expected prompt detection after quiescence")
	}
}

func TestStreamActivityResetsQuiescenceTimer(t *testing.T) {
	// GIVEN: A detector waiting for quiescence
	detector := NewPromptDetector()
	detector.SetHeuristicMode(true)
	
	var promptDetected bool
	detector.OnPromptDetected(func() { promptDetected = true })
	
	// WHEN: Output arrives
	detector.ProcessOutput([]byte("user@host:~$ "))
	
	// AND: More output arrives before quiescence
	time.Sleep(50 * time.Millisecond)
	detector.ProcessOutput([]byte("more output"))
	
	// AND: We check before new quiescence period
	time.Sleep(50 * time.Millisecond)
	detector.CheckQuiescence()
	
	// THEN: Should NOT have detected prompt yet
	if promptDetected {
		t.Error("Should not detect prompt while stream is active")
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS: Interactive CLI Prompts
// ══════════════════════════════════════════════════════════════════════════════

func TestCopilotConfirmationPromptDetection(t *testing.T) {
	// GIVEN: A detector watching copilot output
	detector := NewPromptDetector()
	detector.SetHeuristicMode(true)
	
	var waitingForInput bool
	detector.OnWaitingForInput(func() { waitingForInput = true })
	
	// WHEN: Copilot outputs a confirmation prompt
	detector.ProcessOutput([]byte("Do you want to apply these changes? [Y/n] "))
	
	// AND: Stream goes silent
	time.Sleep(150 * time.Millisecond)
	detector.CheckQuiescence()
	
	// Wait for async callback
	time.Sleep(20 * time.Millisecond)
	
	// THEN: Should detect waiting for input
	if !waitingForInput {
		t.Error("Expected to detect waiting for input on [Y/n] prompt")
	}
}

func TestClaudeToolApprovalDetection(t *testing.T) {
	// GIVEN: A detector watching claude output
	detector := NewPromptDetector()
	detector.SetHeuristicMode(true)
	
	var waitingForInput bool
	detector.OnWaitingForInput(func() { waitingForInput = true })
	
	// WHEN: Claude outputs a tool approval prompt
	detector.ProcessOutput([]byte("Claude wants to run: bash\n> Allow? (y/n) "))
	
	// AND: Stream goes silent
	time.Sleep(150 * time.Millisecond)
	detector.CheckQuiescence()
	
	// Wait for async callback
	time.Sleep(20 * time.Millisecond)
	
	// THEN: Should detect waiting for input
	if !waitingForInput {
		t.Error("Expected to detect waiting for input on approval prompt")
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// RESPONSE COMPLETION TESTS
// ══════════════════════════════════════════════════════════════════════════════

func TestResponseCompleteOnNewPrompt(t *testing.T) {
	// GIVEN: A detector that was in executing state
	detector := NewPromptDetector()
	detector.SetState(PromptStateExecuting)
	
	var responseComplete bool
	detector.OnResponseComplete(func(response string) {
		responseComplete = true
	})
	
	// WHEN: A new prompt appears (via OSC 133)
	detector.ProcessOutput([]byte("\x1b]133;A\x07user@host:~$ "))
	
	// Wait for async callback
	time.Sleep(20 * time.Millisecond)
	
	// THEN: Should fire response complete
	if !responseComplete {
		t.Error("Expected response complete when new prompt appears")
	}
}

func TestResponseAccumulation(t *testing.T) {
	// GIVEN: A detector accumulating response
	detector := NewPromptDetector()
	detector.SetState(PromptStateExecuting)
	detector.StartResponseCapture()
	
	// WHEN: Output streams in
	detector.ProcessOutput([]byte("Line 1\n"))
	detector.ProcessOutput([]byte("Line 2\n"))
	detector.ProcessOutput([]byte("Line 3\n"))
	
	// THEN: Response should be accumulated
	response := detector.GetAccumulatedResponse()
	expected := "Line 1\nLine 2\nLine 3\n"
	
	if response != expected {
		t.Errorf("Expected response %q, got %q", expected, response)
	}
}
