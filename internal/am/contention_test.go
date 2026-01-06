package am

import (
	"sync"
	"testing"
	"time"
)

// TestLLMLoggerMutexContention tests that LLMLogger operations don't block each other
func TestLLMLoggerMutexContention(t *testing.T) {
	// Create a test logger
	tabID := "test-contention"
	amDir := t.TempDir()
	logger := GetLLMLogger(tabID, amDir)
	if logger == nil {
		t.Fatal("Failed to create LLM logger")
	}
	defer RemoveLLMLogger(tabID)

	// Start a conversation so we have something to work with
	convID := logger.StartConversationFromProcess("github-copilot", "chat", 0)
	if convID == "" {
		t.Fatal("Failed to start conversation")
	}

	// Test that multiple goroutines can call read methods without blocking
	var wg sync.WaitGroup
	start := time.Now()
	concurrency := 100

	// Simulate concurrent reads (should not block)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = logger.GetActiveConversationID()
		}()
	}

	wg.Wait()
	readDuration := time.Since(start)

	// 100 concurrent reads should complete in under 100ms
	if readDuration > 100*time.Millisecond {
		t.Errorf("Concurrent reads took too long: %v (expected <100ms)", readDuration)
	}
	t.Logf("100 concurrent GetActiveConversationID calls: %v", readDuration)
}

// TestLLMLoggerAddUserInputLatency tests that AddUserInput doesn't block excessively
func TestLLMLoggerAddUserInputLatency(t *testing.T) {
	tabID := "test-input-latency"
	amDir := t.TempDir()
	logger := GetLLMLogger(tabID, amDir)
	if logger == nil {
		t.Fatal("Failed to create LLM logger")
	}
	defer RemoveLLMLogger(tabID)

	// Start a conversation
	convID := logger.StartConversationFromProcess("github-copilot", "chat", 0)
	if convID == "" {
		t.Fatal("Failed to start conversation")
	}

	// Measure individual AddUserInput calls
	durations := make([]time.Duration, 10)
	for i := 0; i < 10; i++ {
		start := time.Now()
		logger.AddUserInput("test input")
		durations[i] = time.Since(start)
	}

	// Calculate max and average
	var total time.Duration
	var max time.Duration
	for _, d := range durations {
		total += d
		if d > max {
			max = d
		}
	}
	avg := total / 10

	t.Logf("AddUserInput latency - Avg: %v, Max: %v", avg, max)

	// Each call should be under 10ms
	if max > 10*time.Millisecond {
		t.Errorf("AddUserInput max latency too high: %v (expected <10ms)", max)
	}
}

// TestLLMLoggerConcurrentWriteRead tests read/write contention
func TestLLMLoggerConcurrentWriteRead(t *testing.T) {
	tabID := "test-rw-contention"
	amDir := t.TempDir()
	logger := GetLLMLogger(tabID, amDir)
	if logger == nil {
		t.Fatal("Failed to create LLM logger")
	}
	defer RemoveLLMLogger(tabID)

	// Start a conversation
	convID := logger.StartConversationFromProcess("github-copilot", "chat", 0)
	if convID == "" {
		t.Fatal("Failed to start conversation")
	}

	var wg sync.WaitGroup
	start := time.Now()

	// Writers
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			logger.AddUserInput("input " + string(rune('A'+n%26)))
		}(i)
	}

	// Readers
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = logger.GetActiveConversationID()
		}()
	}

	wg.Wait()
	duration := time.Since(start)

	t.Logf("50 writers + 50 readers completed in: %v", duration)

	// Should complete in under 500ms
	if duration > 500*time.Millisecond {
		t.Errorf("Concurrent R/W took too long: %v (expected <500ms)", duration)
	}
}

// TestGetLLMLoggerContention tests that GetLLMLogger doesn't block
func TestGetLLMLoggerContention(t *testing.T) {
	amDir := t.TempDir()
	var wg sync.WaitGroup
	start := time.Now()

	// Create many loggers concurrently
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			tabID := "tab-" + string(rune('0'+n%10))
			_ = GetLLMLogger(tabID, amDir)
		}(i)
	}

	wg.Wait()
	duration := time.Since(start)

	t.Logf("100 concurrent GetLLMLogger calls: %v", duration)

	// Should complete quickly
	if duration > 200*time.Millisecond {
		t.Errorf("GetLLMLogger contention too high: %v (expected <200ms)", duration)
	}

	// Cleanup
	for i := 0; i < 10; i++ {
		RemoveLLMLogger("tab-" + string(rune('0'+i)))
	}
}

// TestBackspaceSimulation simulates rapid keystrokes like backspace
func TestBackspaceSimulation(t *testing.T) {
	tabID := "test-backspace"
	amDir := t.TempDir()
	logger := GetLLMLogger(tabID, amDir)
	if logger == nil {
		t.Fatal("Failed to create LLM logger")
	}
	defer RemoveLLMLogger(tabID)

	// Start a conversation
	convID := logger.StartConversationFromProcess("github-copilot", "chat", 0)
	if convID == "" {
		t.Fatal("Failed to start conversation")
	}

	// Simulate rapid backspace keypresses
	// Each backspace would trigger an input event
	start := time.Now()
	backspaceCount := 50

	for i := 0; i < backspaceCount; i++ {
		// This simulates what happens when user presses backspace
		// The frontend sends \x7f or \b to the WebSocket
		logger.AddUserInput("\x7f") // Backspace character
	}

	duration := time.Since(start)
	perKey := duration / time.Duration(backspaceCount)

	t.Logf("%d backspace inputs in %v (%.2fms per key)", backspaceCount, duration, float64(perKey.Microseconds())/1000)

	// Each keystroke should take less than 1ms to log
	if perKey > time.Millisecond {
		t.Errorf("Per-keystroke latency too high: %v (expected <1ms)", perKey)
	}
}

// TestAMSystemEnqueuePerformance tests that AM system enqueue is non-blocking
func TestAMSystemEnqueuePerformance(t *testing.T) {
	// Get or create the AM system
	system := GetSystem()
	if system == nil {
		t.Skip("AM system not initialized")
	}

	tabID := "test-enqueue"
	testData := []byte("test keyboard input\x7f\x7f\x7f") // Includes backspaces

	start := time.Now()
	iterations := 1000

	for i := 0; i < iterations; i++ {
		system.EnqueueInput(tabID, testData)
	}

	duration := time.Since(start)
	perCall := duration / time.Duration(iterations)

	t.Logf("%d EnqueueInput calls in %v (%.2fµs per call)", iterations, duration, float64(perCall.Nanoseconds())/1000)

	// EnqueueInput should be nearly instant (no-op currently)
	if perCall > 10*time.Microsecond {
		t.Errorf("EnqueueInput too slow: %v (expected <10µs)", perCall)
	}
}

// TestMutexHoldTime measures how long locks are held during operations
func TestMutexHoldTime(t *testing.T) {
	tabID := "test-mutex-hold"
	amDir := t.TempDir()
	logger := GetLLMLogger(tabID, amDir)
	if logger == nil {
		t.Fatal("Failed to create LLM logger")
	}
	defer RemoveLLMLogger(tabID)

	// Start conversation
	convID := logger.StartConversationFromProcess("github-copilot", "chat", 0)
	if convID == "" {
		t.Fatal("Failed to start conversation")
	}

	// Add some output to process
	logger.AddOutput("This is test output from the LLM that needs to be parsed and stored")
	logger.FlushOutput()

	// Now measure a sequence of operations that a typical keystroke would trigger
	start := time.Now()

	// These operations happen during typing:
	logger.AddUserInput("a")                   // User types 'a'
	_ = logger.GetActiveConversationID()       // UI checks if conversation active
	_ = logger.IsAutoRespond()                 // Check auto-respond state

	duration := time.Since(start)

	t.Logf("Keystroke operation sequence: %v", duration)

	// The sequence should complete in under 5ms
	if duration > 5*time.Millisecond {
		t.Errorf("Keystroke sequence too slow: %v (expected <5ms)", duration)
	}
}
