// Package terminal provides a virtual terminal screen buffer for accurate prompt detection.
// Instead of regex pattern matching on raw ANSI streams, this uses a proper VT emulator
// to render the screen state, then analyzes the rendered content.
//
// Architecture:
//   PTY Stream → ANSI Parser → Screen Buffer → Screen Analyzer → Prompt Detection
//
// This approach handles:
//   - File paths with / or \ that would break naive regex
//   - ANSI escape codes embedded in text
//   - TUI cursor movements and line rewrites
//   - Progress bars and spinners that rewrite the same line
package terminal

import (
	"bytes"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/x/ansi"
)

// ScreenBuffer maintains an in-memory representation of the terminal screen.
// It processes ANSI escape sequences to update a 2D character grid.
type ScreenBuffer struct {
	mu sync.RWMutex

	// Screen dimensions
	width  int
	height int

	// The actual screen grid - each cell is a rune
	cells [][]rune

	// Cursor position
	cursorX int
	cursorY int

	// Alternate buffer state (for TUI mode detection)
	alternateBuffer     bool
	mainCells           [][]rune // Saved main buffer when in alternate
	mainCursorX         int
	mainCursorY         int

	// ANSI parser with handler
	parser *ansi.Parser

	// Last activity tracking for stability detection
	lastWrite     time.Time
	stableAt      time.Time
	stabilityDelay time.Duration

	// Callbacks
	onStable      func(lastRow string)
	onAlternateEnter func()
	onAlternateExit  func()
}

// NewScreenBuffer creates a new virtual terminal screen buffer.
// Default size is 80x24, but will auto-resize if larger content is written.
func NewScreenBuffer(width, height int) *ScreenBuffer {
	if width <= 0 {
		width = 80
	}
	if height <= 0 {
		height = 24
	}

	sb := &ScreenBuffer{
		width:          width,
		height:         height,
		stabilityDelay: 100 * time.Millisecond,
		parser:         ansi.NewParser(),
	}
	sb.initCells()
	sb.setupHandler()
	return sb
}

// initCells initializes the cell grid with spaces.
func (sb *ScreenBuffer) initCells() {
	sb.cells = make([][]rune, sb.height)
	for y := 0; y < sb.height; y++ {
		sb.cells[y] = make([]rune, sb.width)
		for x := 0; x < sb.width; x++ {
			sb.cells[y][x] = ' '
		}
	}
	sb.cursorX = 0
	sb.cursorY = 0
}

// setupHandler configures the ANSI parser handler callbacks.
func (sb *ScreenBuffer) setupHandler() {
	sb.parser.SetHandler(ansi.Handler{
		Print: func(r rune) {
			sb.putChar(r)
		},
		Execute: func(b byte) {
			sb.handleControl(b)
		},
		HandleCsi: func(cmd ansi.Cmd, params ansi.Params) {
			sb.handleCSI(cmd, params)
		},
		HandleEsc: func(cmd ansi.Cmd) {
			sb.handleESC(cmd)
		},
		HandleOsc: func(cmd int, data []byte) {
			// OSC sequences (title, clipboard) - no screen effect
		},
	})
}

// Write processes raw PTY output through the ANSI parser and updates the screen buffer.
// This is the main entry point for PTY data.
func (sb *ScreenBuffer) Write(data []byte) {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	sb.lastWrite = time.Now()
	sb.parser.Parse(data)
}

// handleControl processes control characters (CR, LF, BS, etc.).
func (sb *ScreenBuffer) handleControl(ctrl byte) {
	switch ctrl {
	case '\r': // Carriage Return
		sb.cursorX = 0

	case '\n': // Line Feed
		sb.lineFeed()

	case '\b': // Backspace
		if sb.cursorX > 0 {
			sb.cursorX--
		}

	case '\t': // Tab
		// Move to next tab stop (every 8 columns)
		sb.cursorX = (sb.cursorX + 8) &^ 7
		if sb.cursorX >= sb.width {
			sb.cursorX = sb.width - 1
		}

	case '\a': // Bell
		// Ignore

	case 0x0F: // Shift In (SI)
		// Character set - ignore for now

	case 0x0E: // Shift Out (SO)
		// Character set - ignore for now
	}
}

// handleCSI processes CSI (Control Sequence Introducer) sequences.
func (sb *ScreenBuffer) handleCSI(cmd ansi.Cmd, params ansi.Params) {
	// Get command character (final byte of sequence)
	cmdByte := cmd.Final()

	// Get parameters with defaults
	p1 := 1
	if len(params) > 0 {
		if v, _, ok := params.Param(0, 1); ok {
			p1 = v
		}
	}

	p2 := 1
	if len(params) > 1 {
		if v, _, ok := params.Param(1, 1); ok {
			p2 = v
		}
	}

	switch cmdByte {
	case 'A': // Cursor Up
		sb.cursorY -= p1
		if sb.cursorY < 0 {
			sb.cursorY = 0
		}

	case 'B': // Cursor Down
		sb.cursorY += p1
		if sb.cursorY >= sb.height {
			sb.cursorY = sb.height - 1
		}

	case 'C': // Cursor Forward
		sb.cursorX += p1
		if sb.cursorX >= sb.width {
			sb.cursorX = sb.width - 1
		}

	case 'D': // Cursor Backward
		sb.cursorX -= p1
		if sb.cursorX < 0 {
			sb.cursorX = 0
		}

	case 'E': // Cursor Next Line
		sb.cursorX = 0
		sb.cursorY += p1
		if sb.cursorY >= sb.height {
			sb.cursorY = sb.height - 1
		}

	case 'F': // Cursor Previous Line
		sb.cursorX = 0
		sb.cursorY -= p1
		if sb.cursorY < 0 {
			sb.cursorY = 0
		}

	case 'G': // Cursor Horizontal Absolute
		sb.cursorX = p1 - 1
		if sb.cursorX < 0 {
			sb.cursorX = 0
		}
		if sb.cursorX >= sb.width {
			sb.cursorX = sb.width - 1
		}

	case 'H', 'f': // Cursor Position
		sb.cursorY = p1 - 1
		sb.cursorX = p2 - 1
		sb.clampCursor()

	case 'J': // Erase in Display
		switch p1 {
		case 0: // Erase from cursor to end of screen
			sb.clearToEndOfScreen()
		case 1: // Erase from start to cursor
			sb.clearFromStartOfScreen()
		case 2, 3: // Erase entire screen
			sb.clearScreen()
		}

	case 'K': // Erase in Line
		switch p1 {
		case 0: // Erase from cursor to end of line
			sb.clearToEndOfLine()
		case 1: // Erase from start of line to cursor
			sb.clearFromStartOfLine()
		case 2: // Erase entire line
			sb.clearLine()
		}

	case 'L': // Insert Lines
		sb.insertLines(p1)

	case 'M': // Delete Lines
		sb.deleteLines(p1)

	case 'P': // Delete Characters
		sb.deleteChars(p1)

	case '@': // Insert Characters
		sb.insertChars(p1)

	case 'm': // SGR (Select Graphic Rendition)
		// Colors and styles - we don't track these for prompt detection
		// but we could add Cell styling if needed later

	case 'h': // Set Mode
		sb.handleMode(params, true)

	case 'l': // Reset Mode
		sb.handleMode(params, false)

	case 'r': // Set Scrolling Region
		// Could track scroll regions if needed

	case 's': // Save Cursor Position
		// Could save cursor if needed

	case 'u': // Restore Cursor Position
		// Could restore cursor if needed
	}
}

// handleMode processes mode set/reset sequences, especially for alternate buffer.
func (sb *ScreenBuffer) handleMode(params ansi.Params, set bool) {
	for i := 0; i < len(params); i++ {
		p, _, ok := params.Param(i, 0)
		if !ok {
			continue
		}

		// Check for alternate buffer modes
		// Note: These are DEC private modes, indicated by '?' prefix
		switch p {
		case 47, 1047, 1049: // Alternate Screen Buffer
			if set {
				sb.enterAlternateBuffer()
			} else {
				sb.exitAlternateBuffer()
			}
		}
	}
}

// handleESC processes simple ESC sequences.
func (sb *ScreenBuffer) handleESC(cmd ansi.Cmd) {
	cmdByte := cmd.Final()

	switch cmdByte {
	case '7': // Save Cursor (DECSC)
		// Could save cursor and attributes

	case '8': // Restore Cursor (DECRC)
		// Could restore cursor and attributes

	case 'c': // Full Reset (RIS)
		sb.initCells()

	case 'M': // Reverse Index
		if sb.cursorY > 0 {
			sb.cursorY--
		} else {
			sb.scrollDown()
		}
	}
}

// putChar places a character at the current cursor position.
func (sb *ScreenBuffer) putChar(r rune) {
	if sb.cursorX >= sb.width {
		// Auto-wrap
		sb.cursorX = 0
		sb.lineFeed()
	}

	if sb.cursorY >= 0 && sb.cursorY < sb.height &&
		sb.cursorX >= 0 && sb.cursorX < sb.width {
		sb.cells[sb.cursorY][sb.cursorX] = r
	}

	sb.cursorX++
}

// lineFeed moves cursor down, scrolling if needed.
func (sb *ScreenBuffer) lineFeed() {
	sb.cursorY++
	if sb.cursorY >= sb.height {
		sb.scrollUp()
		sb.cursorY = sb.height - 1
	}
}

// scrollUp scrolls the screen up one line.
func (sb *ScreenBuffer) scrollUp() {
	// Move all lines up
	for y := 0; y < sb.height-1; y++ {
		copy(sb.cells[y], sb.cells[y+1])
	}
	// Clear bottom line
	for x := 0; x < sb.width; x++ {
		sb.cells[sb.height-1][x] = ' '
	}
}

// scrollDown scrolls the screen down one line.
func (sb *ScreenBuffer) scrollDown() {
	// Move all lines down
	for y := sb.height - 1; y > 0; y-- {
		copy(sb.cells[y], sb.cells[y-1])
	}
	// Clear top line
	for x := 0; x < sb.width; x++ {
		sb.cells[0][x] = ' '
	}
}

// clampCursor ensures cursor is within bounds.
func (sb *ScreenBuffer) clampCursor() {
	if sb.cursorX < 0 {
		sb.cursorX = 0
	}
	if sb.cursorX >= sb.width {
		sb.cursorX = sb.width - 1
	}
	if sb.cursorY < 0 {
		sb.cursorY = 0
	}
	if sb.cursorY >= sb.height {
		sb.cursorY = sb.height - 1
	}
}

// Clear operations
func (sb *ScreenBuffer) clearScreen() {
	for y := 0; y < sb.height; y++ {
		for x := 0; x < sb.width; x++ {
			sb.cells[y][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) clearLine() {
	if sb.cursorY >= 0 && sb.cursorY < sb.height {
		for x := 0; x < sb.width; x++ {
			sb.cells[sb.cursorY][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) clearToEndOfLine() {
	if sb.cursorY >= 0 && sb.cursorY < sb.height {
		for x := sb.cursorX; x < sb.width; x++ {
			sb.cells[sb.cursorY][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) clearFromStartOfLine() {
	if sb.cursorY >= 0 && sb.cursorY < sb.height {
		for x := 0; x <= sb.cursorX && x < sb.width; x++ {
			sb.cells[sb.cursorY][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) clearToEndOfScreen() {
	sb.clearToEndOfLine()
	for y := sb.cursorY + 1; y < sb.height; y++ {
		for x := 0; x < sb.width; x++ {
			sb.cells[y][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) clearFromStartOfScreen() {
	sb.clearFromStartOfLine()
	for y := 0; y < sb.cursorY; y++ {
		for x := 0; x < sb.width; x++ {
			sb.cells[y][x] = ' '
		}
	}
}

// Insert/delete operations
func (sb *ScreenBuffer) insertLines(n int) {
	if sb.cursorY < 0 || sb.cursorY >= sb.height {
		return
	}
	for i := 0; i < n; i++ {
		// Shift lines down
		for y := sb.height - 1; y > sb.cursorY; y-- {
			copy(sb.cells[y], sb.cells[y-1])
		}
		// Clear current line
		for x := 0; x < sb.width; x++ {
			sb.cells[sb.cursorY][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) deleteLines(n int) {
	if sb.cursorY < 0 || sb.cursorY >= sb.height {
		return
	}
	for i := 0; i < n; i++ {
		// Shift lines up
		for y := sb.cursorY; y < sb.height-1; y++ {
			copy(sb.cells[y], sb.cells[y+1])
		}
		// Clear bottom line
		for x := 0; x < sb.width; x++ {
			sb.cells[sb.height-1][x] = ' '
		}
	}
}

func (sb *ScreenBuffer) insertChars(n int) {
	if sb.cursorY < 0 || sb.cursorY >= sb.height {
		return
	}
	// Shift chars right
	for i := 0; i < n; i++ {
		for x := sb.width - 1; x > sb.cursorX; x-- {
			sb.cells[sb.cursorY][x] = sb.cells[sb.cursorY][x-1]
		}
		if sb.cursorX < sb.width {
			sb.cells[sb.cursorY][sb.cursorX] = ' '
		}
	}
}

func (sb *ScreenBuffer) deleteChars(n int) {
	if sb.cursorY < 0 || sb.cursorY >= sb.height {
		return
	}
	// Shift chars left
	for i := 0; i < n; i++ {
		for x := sb.cursorX; x < sb.width-1; x++ {
			sb.cells[sb.cursorY][x] = sb.cells[sb.cursorY][x+1]
		}
		sb.cells[sb.cursorY][sb.width-1] = ' '
	}
}

// Alternate buffer operations
func (sb *ScreenBuffer) enterAlternateBuffer() {
	if sb.alternateBuffer {
		return // Already in alternate
	}

	log.Printf("[ScreenBuffer] Entering alternate buffer (TUI mode)")
	sb.alternateBuffer = true

	// Save main buffer
	sb.mainCells = make([][]rune, sb.height)
	for y := 0; y < sb.height; y++ {
		sb.mainCells[y] = make([]rune, sb.width)
		copy(sb.mainCells[y], sb.cells[y])
	}
	sb.mainCursorX = sb.cursorX
	sb.mainCursorY = sb.cursorY

	// Clear alternate buffer
	sb.clearScreen()
	sb.cursorX = 0
	sb.cursorY = 0

	if sb.onAlternateEnter != nil {
		go sb.onAlternateEnter()
	}
}

func (sb *ScreenBuffer) exitAlternateBuffer() {
	if !sb.alternateBuffer {
		return // Not in alternate
	}

	log.Printf("[ScreenBuffer] Exiting alternate buffer")
	sb.alternateBuffer = false

	// Restore main buffer
	if sb.mainCells != nil {
		for y := 0; y < sb.height && y < len(sb.mainCells); y++ {
			copy(sb.cells[y], sb.mainCells[y])
		}
		sb.cursorX = sb.mainCursorX
		sb.cursorY = sb.mainCursorY
		sb.mainCells = nil
	}

	if sb.onAlternateExit != nil {
		go sb.onAlternateExit()
	}
}

// IsAlternateBuffer returns whether we're in alternate (TUI) mode.
func (sb *ScreenBuffer) IsAlternateBuffer() bool {
	sb.mu.RLock()
	defer sb.mu.RUnlock()
	return sb.alternateBuffer
}

// GetLine returns the content of a specific line (0-indexed).
func (sb *ScreenBuffer) GetLine(y int) string {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	if y < 0 || y >= sb.height {
		return ""
	}

	return strings.TrimRight(string(sb.cells[y]), " ")
}

// GetLastNonEmptyLine returns the last line that has non-whitespace content.
func (sb *ScreenBuffer) GetLastNonEmptyLine() (int, string) {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	for y := sb.height - 1; y >= 0; y-- {
		line := strings.TrimRight(string(sb.cells[y]), " ")
		if line != "" {
			return y, line
		}
	}
	return -1, ""
}

// GetCursorLine returns the line at the current cursor position.
func (sb *ScreenBuffer) GetCursorLine() string {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	if sb.cursorY < 0 || sb.cursorY >= sb.height {
		return ""
	}

	return strings.TrimRight(string(sb.cells[sb.cursorY]), " ")
}

// GetScreen returns the entire screen as a string with newlines.
func (sb *ScreenBuffer) GetScreen() string {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	var buf bytes.Buffer
	for y := 0; y < sb.height; y++ {
		line := strings.TrimRight(string(sb.cells[y]), " ")
		buf.WriteString(line)
		if y < sb.height-1 {
			buf.WriteByte('\n')
		}
	}
	return buf.String()
}

// SetStabilityCallback sets a callback that fires when the screen is stable
// (no writes for stabilityDelay duration).
func (sb *ScreenBuffer) SetStabilityCallback(delay time.Duration, fn func(lastRow string)) {
	sb.mu.Lock()
	sb.stabilityDelay = delay
	sb.onStable = fn
	sb.mu.Unlock()
}

// SetAlternateBufferCallbacks sets callbacks for alternate buffer enter/exit.
func (sb *ScreenBuffer) SetAlternateBufferCallbacks(onEnter, onExit func()) {
	sb.mu.Lock()
	sb.onAlternateEnter = onEnter
	sb.onAlternateExit = onExit
	sb.mu.Unlock()
}

// CheckStability should be called periodically to check if screen is stable.
func (sb *ScreenBuffer) CheckStability() {
	sb.mu.RLock()
	lastWrite := sb.lastWrite
	onStable := sb.onStable
	stabilityDelay := sb.stabilityDelay
	alternateBuffer := sb.alternateBuffer
	sb.mu.RUnlock()

	if onStable == nil || alternateBuffer {
		return // No callback or in TUI mode
	}

	if time.Since(lastWrite) >= stabilityDelay {
		_, lastRow := sb.GetLastNonEmptyLine()
		if lastRow != "" {
			onStable(lastRow)
		}
	}
}

// Resize changes the screen dimensions.
func (sb *ScreenBuffer) Resize(width, height int) {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	if width <= 0 || height <= 0 {
		return
	}

	// Create new cells
	newCells := make([][]rune, height)
	for y := 0; y < height; y++ {
		newCells[y] = make([]rune, width)
		for x := 0; x < width; x++ {
			if y < sb.height && x < sb.width {
				newCells[y][x] = sb.cells[y][x]
			} else {
				newCells[y][x] = ' '
			}
		}
	}

	sb.cells = newCells
	sb.width = width
	sb.height = height
	sb.clampCursor()
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN ANALYZER - Prompt Detection on Rendered Screen
// ═══════════════════════════════════════════════════════════════════════════════

// ScreenAnalyzer analyzes the rendered screen buffer to detect prompts.
// This replaces regex-based stream analysis with positional screen analysis.
type ScreenAnalyzer struct {
	mu sync.RWMutex

	buffer *ScreenBuffer

	// Prompt patterns for different contexts
	interactivePatterns []*regexp.Regexp
	shellPatterns       []*regexp.Regexp

	// State
	lastAnalyzedLine string
	lastAnalyzeTime  time.Time

	// Callbacks
	onInteractivePrompt func(promptText string)
	onShellPrompt       func()
	onTUIEnter          func()
	onTUIExit           func()
}

// NewScreenAnalyzer creates a new screen analyzer with a screen buffer.
func NewScreenAnalyzer(width, height int) *ScreenAnalyzer {
	sa := &ScreenAnalyzer{
		buffer: NewScreenBuffer(width, height),

		// Interactive prompts: [Y/n], (y/n), "Press Enter", "Continue?", etc.
		// These are detected on the RENDERED line, not raw stream
		interactivePatterns: []*regexp.Regexp{
			regexp.MustCompile(`\[Y/n\]`),
			regexp.MustCompile(`\[y/N\]`),
			regexp.MustCompile(`\[y/n\]`),
			regexp.MustCompile(`\(y/n\)`),
			regexp.MustCompile(`\(Y/N\)`),
			regexp.MustCompile(`(?i)press\s+enter`),
			regexp.MustCompile(`(?i)continue\?\s*$`),
			regexp.MustCompile(`(?i)proceed\?\s*$`),
			regexp.MustCompile(`(?i)confirm\?\s*$`),
			regexp.MustCompile(`:\s*$`), // Ends with colon (input prompt)
			regexp.MustCompile(`\?\s*$`), // Ends with question mark
		},

		// Shell prompts: $, #, >, %, followed by end of line
		// Also handles PowerShell PS C:\path>
		shellPatterns: []*regexp.Regexp{
			regexp.MustCompile(`[$#>%]\s*$`),
			regexp.MustCompile(`PS\s+[A-Za-z]:\\[^>]*>\s*$`), // PowerShell
			regexp.MustCompile(`^\s*>>>\s*$`),                // Python REPL
			regexp.MustCompile(`^\s*\.\.\.\s*$`),             // Python continuation
		},
	}

	// Set up buffer callbacks
	sa.buffer.SetAlternateBufferCallbacks(
		func() {
			if sa.onTUIEnter != nil {
				sa.onTUIEnter()
			}
		},
		func() {
			if sa.onTUIExit != nil {
				sa.onTUIExit()
			}
		},
	)

	return sa
}

// Write processes PTY output through the screen buffer.
func (sa *ScreenAnalyzer) Write(data []byte) {
	sa.buffer.Write(data)
}

// Analyze checks the current screen state for prompts.
// Should be called after stability delay (screen hasn't changed for N ms).
func (sa *ScreenAnalyzer) Analyze() {
	sa.mu.Lock()
	defer sa.mu.Unlock()

	// Don't analyze in TUI mode
	if sa.buffer.IsAlternateBuffer() {
		return
	}

	// Get the last non-empty line (this is where prompts appear)
	_, lastLine := sa.buffer.GetLastNonEmptyLine()
	if lastLine == "" {
		return
	}

	// Also check the cursor line (prompt might be on cursor line)
	cursorLine := sa.buffer.GetCursorLine()

	// Avoid re-analyzing the same line
	if lastLine == sa.lastAnalyzedLine && time.Since(sa.lastAnalyzeTime) < 100*time.Millisecond {
		return
	}
	sa.lastAnalyzedLine = lastLine
	sa.lastAnalyzeTime = time.Now()

	// Check for interactive prompts first (higher priority)
	lineToCheck := lastLine
	if cursorLine != "" && cursorLine != lastLine {
		// Cursor might be on a different line (e.g., after output)
		lineToCheck = cursorLine
	}

	for _, pattern := range sa.interactivePatterns {
		if pattern.MatchString(lineToCheck) {
			log.Printf("[ScreenAnalyzer] Interactive prompt detected: %s", truncateScreenLog(lineToCheck, 60))
			if sa.onInteractivePrompt != nil {
				go sa.onInteractivePrompt(lineToCheck)
			}
			return
		}
	}

	// Check for shell prompts
	for _, pattern := range sa.shellPatterns {
		if pattern.MatchString(lineToCheck) {
			log.Printf("[ScreenAnalyzer] Shell prompt detected")
			if sa.onShellPrompt != nil {
				go sa.onShellPrompt()
			}
			return
		}
	}
}

// GetBuffer returns the underlying screen buffer.
func (sa *ScreenAnalyzer) GetBuffer() *ScreenBuffer {
	return sa.buffer
}

// IsInTUI returns whether the terminal is in TUI (alternate buffer) mode.
func (sa *ScreenAnalyzer) IsInTUI() bool {
	return sa.buffer.IsAlternateBuffer()
}

// GetLastLine returns the last non-empty line on the screen.
func (sa *ScreenAnalyzer) GetLastLine() string {
	_, line := sa.buffer.GetLastNonEmptyLine()
	return line
}

// GetScreen returns the full rendered screen.
func (sa *ScreenAnalyzer) GetScreen() string {
	return sa.buffer.GetScreen()
}

// SetCallbacks sets the prompt detection callbacks.
func (sa *ScreenAnalyzer) SetCallbacks(onInteractive func(string), onShell func(), onTUIEnter, onTUIExit func()) {
	sa.mu.Lock()
	sa.onInteractivePrompt = onInteractive
	sa.onShellPrompt = onShell
	sa.onTUIEnter = onTUIEnter
	sa.onTUIExit = onTUIExit
	sa.mu.Unlock()
}

// Resize updates the screen dimensions.
func (sa *ScreenAnalyzer) Resize(width, height int) {
	sa.buffer.Resize(width, height)
}

// truncateScreenLog truncates a string for logging (unique name to avoid conflicts).
func truncateScreenLog(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
