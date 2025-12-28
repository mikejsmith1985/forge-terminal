package terminal

import (
	"regexp"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSequenceEngine_SettleTime(t *testing.T) {
	var executed atomic.Bool

	se := NewSequenceEngine(func(data []byte) error {
		executed.Store(true)
		return nil
	})
	se.SetEnabled(true)

	// Add a test sequence with short settle time
	se.sequences = []*Sequence{
		{
			Name:       "test-yn",
			Pattern:    regexp.MustCompile(`\[Y/n\]`),
			SettleTime: 100 * time.Millisecond,
			Actions: []Action{
				{Type: ActionKey, Key: 'y'},
			},
		},
	}

	// Pattern appears but not settled
	se.ProcessOutput([]byte("[Y/n]"))
	if executed.Load() {
		t.Error("Should not execute before settle time")
	}

	// Wait less than settle time
	time.Sleep(50 * time.Millisecond)
	se.CheckSettle()
	if executed.Load() {
		t.Error("Should not execute before settle time (50ms)")
	}

	// Wait full settle time
	time.Sleep(100 * time.Millisecond)
	se.CheckSettle()

	// Give execution goroutine time to run
	time.Sleep(50 * time.Millisecond)

	if !executed.Load() {
		t.Error("Should execute after settle time")
	}
}

func TestSequenceEngine_AbortOnUserInput(t *testing.T) {
	var executed atomic.Bool

	se := NewSequenceEngine(func(data []byte) error {
		executed.Store(true)
		return nil
	})
	se.SetEnabled(true)

	// Add a test sequence
	se.sequences = []*Sequence{
		{
			Name:       "test-yn",
			Pattern:    regexp.MustCompile(`\[Y/n\]`),
			SettleTime: 100 * time.Millisecond,
			Actions: []Action{
				{Type: ActionKey, Key: 'y'},
			},
		},
	}

	// Start settling a pattern
	se.ProcessOutput([]byte("[Y/n]"))

	// User types - abort!
	se.AbortOnUserInput()

	// Wait full settle time
	time.Sleep(150 * time.Millisecond)
	se.CheckSettle()

	// Give time for any execution
	time.Sleep(50 * time.Millisecond)

	// Should NOT execute because user aborted
	if executed.Load() {
		t.Error("Should not execute after user abort")
	}
}

func TestSequenceEngine_PatternChange(t *testing.T) {
	var executed atomic.Bool

	se := NewSequenceEngine(func(data []byte) error {
		executed.Store(true)
		return nil
	})
	se.SetEnabled(true)

	// Add test sequences
	se.sequences = []*Sequence{
		{
			Name:       "test-yn",
			Pattern:    regexp.MustCompile(`\[Y/n\]\s*$`),
			SettleTime: 100 * time.Millisecond,
			Actions: []Action{
				{Type: ActionKey, Key: 'y'},
			},
		},
	}

	// Pattern appears
	se.ProcessOutput([]byte("[Y/n]"))

	// Wait partial time
	time.Sleep(50 * time.Millisecond)

	// Pattern changes (more output arrives that breaks the pattern)
	se.ProcessOutput([]byte("extra text"))

	// Wait more
	time.Sleep(100 * time.Millisecond)
	se.CheckSettle()

	// Give time for any execution
	time.Sleep(50 * time.Millisecond)

	// Should NOT execute because pattern changed
	if executed.Load() {
		t.Error("Should not execute when pattern changes")
	}
}

func TestSequenceEngine_ActionTypes(t *testing.T) {
	var received []byte
	var mu sync.Mutex

	se := NewSequenceEngine(func(data []byte) error {
		mu.Lock()
		received = append(received, data...)
		mu.Unlock()
		return nil
	})
	se.SetEnabled(true)

	// Add a sequence with multiple action types
	se.sequences = []*Sequence{
		{
			Name:       "test-complex",
			Pattern:    regexp.MustCompile(`test-trigger`),
			SettleTime: 10 * time.Millisecond,
			Actions: []Action{
				{Type: ActionKey, Key: 'a'},
				{Type: ActionSleep, Duration: 10 * time.Millisecond},
				{Type: ActionText, Text: "bc"},
				{Type: ActionKey, Key: '\r'},
			},
		},
	}

	// Trigger the sequence
	se.ProcessOutput([]byte("test-trigger"))

	// Wait for settle time, then check
	time.Sleep(20 * time.Millisecond)
	se.CheckSettle()

	// Wait for execution to complete (actions + sleeps)
	time.Sleep(300 * time.Millisecond)

	// Check received data
	mu.Lock()
	got := string(received)
	mu.Unlock()

	expected := "abc\r"
	if got != expected {
		t.Errorf("Expected '%s', got '%s'", expected, got)
	}
}

func TestSequenceEngine_Disabled(t *testing.T) {
	var executed atomic.Bool

	se := NewSequenceEngine(func(data []byte) error {
		executed.Store(true)
		return nil
	})
	// NOT enabled

	se.sequences = []*Sequence{
		{
			Name:       "test-yn",
			Pattern:    regexp.MustCompile(`\[Y/n\]`),
			SettleTime: 10 * time.Millisecond,
			Actions: []Action{
				{Type: ActionKey, Key: 'y'},
			},
		},
	}

	se.ProcessOutput([]byte("[Y/n]"))
	time.Sleep(50 * time.Millisecond)
	se.CheckSettle()
	time.Sleep(50 * time.Millisecond)

	if executed.Load() {
		t.Error("Should not execute when disabled")
	}
}

func TestSequenceEngine_Stats(t *testing.T) {
	se := NewSequenceEngine(func(data []byte) error { return nil })
	se.SetEnabled(true)

	stats := se.GetStats()

	if !stats["enabled"].(bool) {
		t.Error("Stats should show enabled=true")
	}

	if stats["sequenceCount"].(int) != len(DefaultSequences) {
		t.Errorf("Expected %d sequences, got %d", len(DefaultSequences), stats["sequenceCount"])
	}
}

func TestDefaultSequences_Patterns(t *testing.T) {
	testCases := []struct {
		name    string
		input   string
		pattern string
	}{
		{"copilot-yn", "[Y/n] ", `\[Y/n\]\s*$`},
		{"copilot-yN", "[y/N] ", `\[y/N\]\s*$`},
		{"npm-proceed", "Ok to proceed? (y)", `Ok to proceed\?\s*\(y\)`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			re := regexp.MustCompile(tc.pattern)
			if !re.MatchString(tc.input) {
				t.Errorf("Pattern '%s' should match '%s'", tc.pattern, tc.input)
			}
		})
	}
}
