package terminal

import (
	"testing"
	"time"
)

func TestScreenBuffer_BasicWrite(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write simple text
	sb.Write([]byte("Hello, World!"))

	line := sb.GetLine(0)
	if line != "Hello, World!" {
		t.Errorf("Expected 'Hello, World!', got '%s'", line)
	}
}

func TestScreenBuffer_NewLine(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	sb.Write([]byte("Line 1\r\nLine 2\r\nLine 3"))

	if line := sb.GetLine(0); line != "Line 1" {
		t.Errorf("Line 0: expected 'Line 1', got '%s'", line)
	}
	if line := sb.GetLine(1); line != "Line 2" {
		t.Errorf("Line 1: expected 'Line 2', got '%s'", line)
	}
	if line := sb.GetLine(2); line != "Line 3" {
		t.Errorf("Line 2: expected 'Line 3', got '%s'", line)
	}
}

func TestScreenBuffer_CarriageReturn(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write, then overwrite with CR
	sb.Write([]byte("First\rSecond"))

	line := sb.GetLine(0)
	if line != "Second" {
		t.Errorf("Expected 'Second', got '%s'", line)
	}
}

func TestScreenBuffer_ANSICodes(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write text with ANSI color codes
	sb.Write([]byte("\x1b[31mRed\x1b[0m Text"))

	line := sb.GetLine(0)
	// The buffer should strip ANSI codes and just show text
	if line != "Red Text" {
		t.Errorf("Expected 'Red Text', got '%s'", line)
	}
}

func TestScreenBuffer_CursorMovement(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write, move cursor back, overwrite
	sb.Write([]byte("ABCDE"))
	sb.Write([]byte("\x1b[3D")) // Move back 3
	sb.Write([]byte("XYZ"))

	line := sb.GetLine(0)
	if line != "ABXYZ" {
		t.Errorf("Expected 'ABXYZ', got '%s'", line)
	}
}

func TestScreenBuffer_ClearToEndOfLine(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	sb.Write([]byte("Hello World"))
	sb.Write([]byte("\x1b[6G"))  // Move to column 6 (0-indexed: 5)
	sb.Write([]byte("\x1b[0K")) // Clear to end of line

	line := sb.GetLine(0)
	if line != "Hello" {
		t.Errorf("Expected 'Hello', got '%s'", line)
	}
}

func TestScreenBuffer_AlternateBufferEnter(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write to main buffer
	sb.Write([]byte("Main buffer content"))

	// Enter alternate buffer
	sb.Write([]byte("\x1b[?1049h"))

	if !sb.IsAlternateBuffer() {
		t.Error("Expected to be in alternate buffer")
	}

	// Alternate buffer should be clear
	line := sb.GetLine(0)
	if line != "" {
		t.Errorf("Alternate buffer should be empty, got '%s'", line)
	}
}

func TestScreenBuffer_AlternateBufferExit(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Write to main buffer
	sb.Write([]byte("Main buffer content"))

	// Enter and exit alternate buffer
	sb.Write([]byte("\x1b[?1049h"))
	sb.Write([]byte("TUI content"))
	sb.Write([]byte("\x1b[?1049l"))

	if sb.IsAlternateBuffer() {
		t.Error("Should not be in alternate buffer")
	}

	// Main buffer content should be restored
	line := sb.GetLine(0)
	if line != "Main buffer content" {
		t.Errorf("Expected 'Main buffer content', got '%s'", line)
	}
}

func TestScreenBuffer_GetLastNonEmptyLine(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	sb.Write([]byte("Line 1\r\nLine 2\r\n"))

	row, line := sb.GetLastNonEmptyLine()
	if row != 1 {
		t.Errorf("Expected row 1, got %d", row)
	}
	if line != "Line 2" {
		t.Errorf("Expected 'Line 2', got '%s'", line)
	}
}

func TestScreenBuffer_FilePathWithSlashes(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// This is the key test - file paths should render correctly
	sb.Write([]byte("Edit /home/user/project/file.go? [Y/n]"))

	line := sb.GetLine(0)
	expected := "Edit /home/user/project/file.go? [Y/n]"
	if line != expected {
		t.Errorf("Expected '%s', got '%s'", expected, line)
	}
}

func TestScreenBuffer_FilePathWithBackslashes(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Windows-style paths
	sb.Write([]byte("Edit C:\\Users\\user\\project\\file.go? [Y/n]"))

	line := sb.GetLine(0)
	expected := "Edit C:\\Users\\user\\project\\file.go? [Y/n]"
	if line != expected {
		t.Errorf("Expected '%s', got '%s'", expected, line)
	}
}

func TestScreenBuffer_ProgressBarRewrite(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Simulate a progress bar that rewrites the same line
	sb.Write([]byte("Progress: 10%"))
	sb.Write([]byte("\rProgress: 20%"))
	sb.Write([]byte("\rProgress: 50%"))
	sb.Write([]byte("\rProgress: 100%"))

	line := sb.GetLine(0)
	// Final state should be the last write
	if line != "Progress: 100%" {
		t.Errorf("Expected 'Progress: 100%%', got '%s'", line)
	}
}

func TestScreenBuffer_SpinnerRewrite(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Simulate a spinner
	sb.Write([]byte("Loading..."))
	sb.Write([]byte("\rLoading...|"))
	sb.Write([]byte("\rLoading.../"))
	sb.Write([]byte("\rLoading...-"))
	sb.Write([]byte("\rLoading...\\"))
	sb.Write([]byte("\rLoading...Done!"))

	line := sb.GetLine(0)
	if line != "Loading...Done!" {
		t.Errorf("Expected 'Loading...Done!', got '%s'", line)
	}
}

// ScreenAnalyzer Tests

func TestScreenAnalyzer_InteractivePrompt(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var detectedPrompt string
	sa.SetCallbacks(
		func(prompt string) { detectedPrompt = prompt },
		nil, nil, nil,
	)

	// Write content with interactive prompt
	sa.Write([]byte("Edit /path/to/file.go? [Y/n]"))

	// Analyze
	sa.Analyze()

	// Give callback time to fire
	time.Sleep(10 * time.Millisecond)

	if detectedPrompt == "" {
		t.Error("Expected interactive prompt to be detected")
	}
	if detectedPrompt != "Edit /path/to/file.go? [Y/n]" {
		t.Errorf("Expected full prompt text, got '%s'", detectedPrompt)
	}
}

func TestScreenAnalyzer_ShellPrompt(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var shellDetected bool
	sa.SetCallbacks(
		nil,
		func() { shellDetected = true },
		nil, nil,
	)

	// Write shell prompt
	sa.Write([]byte("user@host:~/project$ "))

	sa.Analyze()
	time.Sleep(10 * time.Millisecond)

	if !shellDetected {
		t.Error("Expected shell prompt to be detected")
	}
}

func TestScreenAnalyzer_PowerShellPrompt(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var shellDetected bool
	sa.SetCallbacks(
		nil,
		func() { shellDetected = true },
		nil, nil,
	)

	// Write PowerShell prompt
	sa.Write([]byte("PS C:\\Users\\user\\project> "))

	sa.Analyze()
	time.Sleep(10 * time.Millisecond)

	if !shellDetected {
		t.Error("Expected PowerShell prompt to be detected")
	}
}

func TestScreenAnalyzer_TUIMode(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var tuiEntered, tuiExited bool
	sa.SetCallbacks(
		nil, nil,
		func() { tuiEntered = true },
		func() { tuiExited = true },
	)

	// Enter TUI mode
	sa.Write([]byte("\x1b[?1049h"))
	time.Sleep(10 * time.Millisecond)

	if !tuiEntered {
		t.Error("Expected TUI enter callback")
	}
	if !sa.IsInTUI() {
		t.Error("Expected IsInTUI to be true")
	}

	// Exit TUI mode
	sa.Write([]byte("\x1b[?1049l"))
	time.Sleep(10 * time.Millisecond)

	if !tuiExited {
		t.Error("Expected TUI exit callback")
	}
	if sa.IsInTUI() {
		t.Error("Expected IsInTUI to be false")
	}
}

func TestScreenAnalyzer_NoPromptInTUIMode(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var promptDetected bool
	sa.SetCallbacks(
		func(string) { promptDetected = true },
		func() { promptDetected = true },
		nil, nil,
	)

	// Enter TUI mode
	sa.Write([]byte("\x1b[?1049h"))

	// Write what looks like a prompt
	sa.Write([]byte("[Y/n]"))

	// Analyze should not detect prompt in TUI mode
	sa.Analyze()
	time.Sleep(10 * time.Millisecond)

	if promptDetected {
		t.Error("Prompt should not be detected in TUI mode")
	}
}

func TestScreenAnalyzer_ComplexANSIPrompt(t *testing.T) {
	sa := NewScreenAnalyzer(80, 24)

	var detectedPrompt string
	sa.SetCallbacks(
		func(prompt string) { detectedPrompt = prompt },
		nil, nil, nil,
	)

	// Write prompt with colors and formatting (like GitHub Copilot CLI)
	sa.Write([]byte("\x1b[1;33mApply to /path/to/file.js?\x1b[0m \x1b[32m[Y/n]\x1b[0m"))

	sa.Analyze()
	time.Sleep(10 * time.Millisecond)

	// The rendered content should have stripped ANSI
	if detectedPrompt == "" {
		t.Error("Expected prompt to be detected even with ANSI codes")
	}
}

func TestScreenBuffer_BackspaceHandling(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	// Type, then backspace
	sb.Write([]byte("Hello\b\b\b\b\bWorld"))

	line := sb.GetLine(0)
	if line != "World" {
		t.Errorf("Expected 'World', got '%s'", line)
	}
}

func TestScreenBuffer_TabHandling(t *testing.T) {
	sb := NewScreenBuffer(80, 24)

	sb.Write([]byte("A\tB\tC"))

	line := sb.GetLine(0)
	// A at 0, tab moves to 8, B at 8, tab moves to 16, C at 16
	expected := "A       B       C"
	if line != expected {
		t.Errorf("Expected '%s', got '%s'", expected, line)
	}
}

func TestScreenBuffer_Scrolling(t *testing.T) {
	sb := NewScreenBuffer(80, 5) // Small height for testing scroll

	// Write more lines than the screen height
	sb.Write([]byte("Line 1\r\nLine 2\r\nLine 3\r\nLine 4\r\nLine 5\r\nLine 6"))

	// First line should have scrolled off
	if line := sb.GetLine(0); line != "Line 2" {
		t.Errorf("Line 0: expected 'Line 2', got '%s'", line)
	}
	if line := sb.GetLine(4); line != "Line 6" {
		t.Errorf("Line 4: expected 'Line 6', got '%s'", line)
	}
}
