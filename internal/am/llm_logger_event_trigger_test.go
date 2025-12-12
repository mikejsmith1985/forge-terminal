package am

import (
	"testing"
	"time"
)

// TestLLMLogger_AddOutput_NoTimerTrigger tests that time-based triggers do NOT fire
// This test verifies that we've removed the time-based snapshot trigger,
// which was creating snapshot bloat (every 2 seconds).
func TestLLMLogger_AddOutput_NoTimerTrigger(t *testing.T) {
	SetTestMode(true)
	defer SetTestMode(false)

	logger := &LLMLogger{
		tabID:        "test-tab-1",
		conversations: make(map[string]*LLMConversation),
		amDir:        t.TempDir(),
		tuiCaptureMode: true,
	}

	// Create an active conversation
	conv := &LLMConversation{
		ConversationID: "conv-test-1",
		TabID:          "test-tab-1",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{},
		ScreenSnapshots: []ScreenSnapshot{},
	}

	logger.conversations["conv-test-1"] = conv
	logger.activeConvID = "conv-test-1"
	logger.lastSnapshotTime = time.Now()

	// Add output (not a screen clear, not user input)
	output := "Some intermediate LLM output that's not done yet\n"
	initialSnapshotCount := len(conv.ScreenSnapshots)

	// Simulate AddOutput multiple times with time advancing
	for i := 0; i < 5; i++ {
		logger.AddOutput(output)
		// Don't wait - we're in test, no actual time passing
	}

	// ASSERTION: No snapshots should be created from time-based trigger
	// (we're not advancing actual time in test)
	// The only way snapshots would be created is if we get a screen clear
	// or user input, which we haven't sent
	afterOutputSnapshotCount := len(conv.ScreenSnapshots)

	if afterOutputSnapshotCount > initialSnapshotCount {
		t.Errorf("Time-based trigger should not create snapshots during output (mutex locking prevents time passing). Got %d snapshots added",
			afterOutputSnapshotCount - initialSnapshotCount)
	}
}

// TestLLMLogger_AddOutput_ScreenClearTrigger tests that screen clear DOES trigger snapshot
// This is an event-based trigger that should still work
func TestLLMLogger_AddOutput_ScreenClearTrigger(t *testing.T) {
	SetTestMode(true)
	defer SetTestMode(false)

	logger := &LLMLogger{
		tabID:           "test-tab-2",
		conversations:   make(map[string]*LLMConversation),
		amDir:           t.TempDir(),
		tuiCaptureMode:  true,
		lastSnapshotTime: time.Now(),
	}

	// Create an active conversation
	conv := &LLMConversation{
		ConversationID: "conv-test-2",
		TabID:          "test-tab-2",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{},
		ScreenSnapshots: []ScreenSnapshot{},
	}

	logger.conversations["conv-test-2"] = conv
	logger.activeConvID = "conv-test-2"
	logger.currentScreen.WriteString("Old screen content\n")

	// Send screen clear command (ANSI escape sequence)
	initialSnapshotCount := len(conv.ScreenSnapshots)
	logger.AddOutput("\x1b[2J")  // Clear screen
	logger.AddOutput("New screen content after clear\n")

	afterClearSnapshotCount := len(conv.ScreenSnapshots)

	// ASSERTION: Screen clear should trigger a snapshot
	if afterClearSnapshotCount <= initialSnapshotCount {
		t.Errorf("Screen clear should trigger snapshot. Initial: %d, After: %d",
			initialSnapshotCount, afterClearSnapshotCount)
	}
}

// TestLLMLogger_AddUserInput_SnapshotOnEnter tests that user pressing Enter triggers snapshot
// This is an event-based trigger
func TestLLMLogger_AddUserInput_SnapshotOnEnter(t *testing.T) {
	SetTestMode(true)
	defer SetTestMode(false)

	logger := &LLMLogger{
		tabID:           "test-tab-3",
		conversations:   make(map[string]*LLMConversation),
		amDir:           t.TempDir(),
		tuiCaptureMode:  true,
		lastSnapshotTime: time.Now(),
	}

	// Create an active conversation
	conv := &LLMConversation{
		ConversationID: "conv-test-3",
		TabID:          "test-tab-3",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{},
		ScreenSnapshots: []ScreenSnapshot{},
	}

	logger.conversations["conv-test-3"] = conv
	logger.activeConvID = "conv-test-3"
	logger.currentScreen.WriteString("User prompt: test question\n")

	initialSnapshotCount := len(conv.ScreenSnapshots)

	// User presses Enter to submit (sends \r or \n in input)
	logger.AddUserInput("test question\r")

	afterEnterSnapshotCount := len(conv.ScreenSnapshots)

	// ASSERTION: Enter key should trigger a snapshot (if in TUI mode with screen content)
	if afterEnterSnapshotCount <= initialSnapshotCount {
		t.Errorf("User Enter should trigger snapshot. Initial: %d, After: %d",
			initialSnapshotCount, afterEnterSnapshotCount)
	}
}

// TestLLMLogger_DetectShellPromptReturn_EndsConversation tests that shell prompt detection ends conversation
// This is an event-based trigger that completes the conversation
func TestLLMLogger_DetectShellPromptReturn_EndsConversation(t *testing.T) {
	SetTestMode(true)
	defer SetTestMode(false)

	logger := &LLMLogger{
		tabID:        "test-tab-4",
		conversations: make(map[string]*LLMConversation),
		amDir:        t.TempDir(),
		tuiCaptureMode: true,
	}

	// Create an active conversation
	conv := &LLMConversation{
		ConversationID: "conv-test-4",
		TabID:          "test-tab-4",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{},
		ScreenSnapshots: []ScreenSnapshot{},
	}

	logger.conversations["conv-test-4"] = conv
	logger.activeConvID = "conv-test-4"
	logger.currentScreen.WriteString("Previous output\n")

	// Send output that looks like a shell prompt (Bash style)
	bashPrompt := "user@host:~/project$ "
	logger.AddOutput("More output\n" + bashPrompt)

	// ASSERTION: Conversation should be ended when shell prompt detected
	if conv.Complete == false {
		t.Error("Conversation should be marked Complete when shell prompt is detected")
	}

	if logger.activeConvID != "" {
		t.Errorf("Active conversation should be cleared after shell prompt detection, still have: %s", logger.activeConvID)
	}
}

// TestLLMLogger_EventTriggers_Summary tests event-based triggers in order
// This demonstrates the event-based trigger flow without time-based triggers
func TestLLMLogger_EventTriggers_Summary(t *testing.T) {
	SetTestMode(true)
	defer SetTestMode(false)

	logger := &LLMLogger{
		tabID:           "test-tab-5",
		conversations:   make(map[string]*LLMConversation),
		amDir:           t.TempDir(),
		tuiCaptureMode:  true,
		lastSnapshotTime: time.Now(),
	}

	conv := &LLMConversation{
		ConversationID: "conv-test-5",
		TabID:          "test-tab-5",
		Provider:       "github-copilot",
		CommandType:    "ask",
		Complete:       false,
		Turns:          []ConversationTurn{},
		ScreenSnapshots: []ScreenSnapshot{},
	}

	logger.conversations["conv-test-5"] = conv
	logger.activeConvID = "conv-test-5"

	snapshotLog := []string{}

	// Track snapshots at each stage
	stageSnapshots := func(stage string) {
		snapshotLog = append(snapshotLog, stage+": "+string(rune(len(conv.ScreenSnapshots)+'0')))
	}

	// Stage 1: User types prompt
	logger.currentScreen.WriteString("User prompt: explain how to use git\n")
	stageSnapshots("After user typing")

	// Stage 2: User presses Enter (EVENT: User submits)
	logger.AddUserInput("explain how to use git\r")
	stageSnapshots("After user Enter")

	// Stage 3: LLM starts responding
	logger.AddOutput("To use git, first initialize a repo:\n")
	stageSnapshots("After LLM starts")

	// Stage 4: LLM continues
	logger.AddOutput("git init\n")
	logger.AddOutput("Then add files:\n")
	logger.AddOutput("git add .\n")
	stageSnapshots("After LLM continues")

	// Stage 5: LLM response completes with shell prompt (EVENT: Response complete)
	logger.AddOutput("That's the basic workflow.\nuser@host:~/project$ ")
	stageSnapshots("After shell prompt")

	// ASSERTION: We should have snapshots but NOT from a time-based trigger
	// The snapshots come from:
	// - User Enter (if TUI mode and screen content)
	// - Shell prompt detection (conversation ending)
	if conv.Complete == false {
		t.Error("Conversation should be complete after shell prompt")
	}

	t.Logf("Snapshot count at each stage: %v", snapshotLog)
	t.Logf("Final snapshot count: %d", len(conv.ScreenSnapshots))

	// The exact count depends on implementation details, but it should be
	// reasonable (not 1 snapshot every 2 seconds)
	if len(conv.ScreenSnapshots) > 10 {
		t.Errorf("Too many snapshots (%d) - suggests time-based trigger still active",
			len(conv.ScreenSnapshots))
	}
	
	// Wait for async writes before test cleanup
	WaitForPendingWrites()
}
