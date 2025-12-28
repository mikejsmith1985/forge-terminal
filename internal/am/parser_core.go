// Package am provides the core ANSI parsing state machine.
// This is the single source of truth for ANSI stripping - used by both
// tui_parser.go and capture.go to eliminate logic duplication.
package am

import (
	"bytes"
	"strings"
	"unicode/utf8"
)

// ANSIParserState represents the state machine states for ANSI parsing.
type ANSIParserState uint8

const (
	StateNormal  ANSIParserState = iota
	StateEscape                  // Saw ESC (0x1b)
	StateCSI                     // Saw ESC [ - Control Sequence Introducer
	StateOSC                     // Saw ESC ] - Operating System Command
	StateDCS                     // Saw ESC P, X, ^, _ - Device Control String
	StateCharset                 // Saw ESC ( - skip next byte
)

// StripANSIToBuffer removes ANSI escape sequences using a zero-allocation state machine.
// Writes clean output to the provided buffer. This is the core parsing function.
func StripANSIToBuffer(input []byte, output *bytes.Buffer) {
	if len(input) == 0 {
		return
	}

	// Fast path: check if there are any escape sequences
	hasEscape := false
	for _, b := range input {
		if b == 0x1b {
			hasEscape = true
			break
		}
	}
	if !hasEscape {
		output.Write(input)
		return
	}

	state := StateNormal

	for i := 0; i < len(input); i++ {
		b := input[i]

		switch state {
		case StateNormal:
			if b == 0x1b {
				state = StateEscape
			} else if b >= 32 || b == '\n' || b == '\t' || b == '\r' {
				output.WriteByte(b)
			}

		case StateEscape:
			switch b {
			case '[':
				state = StateCSI
			case ']':
				state = StateOSC
			case 'P', 'X', '^', '_':
				state = StateDCS
			case '(':
				state = StateCharset
			default:
				// Single-character escape (0x40-0x5F) or unknown - return to normal
				state = StateNormal
			}

		case StateCSI:
			// CSI sequence ends with final byte (0x40-0x7E: @A-Z[\]^_`a-z{|}~)
			// Skip parameter bytes (0x30-0x3F: 0-9:;<=>?) and intermediate (0x20-0x2F)
			if b >= 0x40 && b <= 0x7E {
				state = StateNormal
			}

		case StateOSC:
			// OSC ends with BEL (0x07) or ST (ESC \)
			if b == 0x07 {
				state = StateNormal
			} else if b == 0x1b {
				// Check for ST (ESC \)
				if i+1 < len(input) && input[i+1] == '\\' {
					i++ // Skip the backslash
					state = StateNormal
				}
			}

		case StateDCS:
			// DCS ends with ST (ESC \)
			if b == 0x1b && i+1 < len(input) && input[i+1] == '\\' {
				i++
				state = StateNormal
			}

		case StateCharset:
			// Charset designation: skip exactly one byte after ESC (
			state = StateNormal
		}
	}
}

// StripANSIBytes removes ANSI sequences and returns a new byte slice.
// Uses buffer pool for efficiency.
func StripANSIBytes(input []byte) []byte {
	if len(input) == 0 {
		return input
	}

	// Fast path: no escape characters
	hasEscape := false
	for _, b := range input {
		if b == 0x1b {
			hasEscape = true
			break
		}
	}
	if !hasEscape {
		return input
	}

	buf := GetBuffer()
	defer PutBuffer(buf)

	StripANSIToBuffer(input, buf)

	// Make a copy since we're returning the buffer to the pool
	result := make([]byte, buf.Len())
	copy(result, buf.Bytes())
	return result
}

// StripANSIString removes ANSI sequences from a string.
// Uses buffer pool for efficiency.
func StripANSIString(input string) string {
	if len(input) == 0 {
		return input
	}

	// Fast path: no escape characters
	if !strings.ContainsRune(input, 0x1b) {
		return input
	}

	buf := GetBuffer()
	defer PutBuffer(buf)

	StripANSIToBuffer([]byte(input), buf)
	return buf.String()
}

// IsBoxDrawingChar returns true for Unicode box drawing characters.
// Range: U+2500 to U+257F (Box Drawing) + U+2580 to U+259F (Block Elements)
func IsBoxDrawingChar(r rune) bool {
	return (r >= 0x2500 && r <= 0x257F) || // Box Drawing
		(r >= 0x2580 && r <= 0x259F) || // Block Elements
		(r >= 0x2550 && r <= 0x256C) // Double-line box drawing
}

// StripBoxDrawingToBuilder removes box drawing characters from text.
func StripBoxDrawingToBuilder(input string, output *strings.Builder) {
	for _, r := range input {
		if !IsBoxDrawingChar(r) {
			output.WriteRune(r)
		}
	}
}

// StripBoxDrawing removes box drawing characters and returns a new string.
func StripBoxDrawing(input string) string {
	// Fast path: check if any box drawing chars exist
	hasBox := false
	for _, r := range input {
		if IsBoxDrawingChar(r) {
			hasBox = true
			break
		}
	}
	if !hasBox {
		return input
	}

	var sb strings.Builder
	sb.Grow(len(input))
	StripBoxDrawingToBuilder(input, &sb)
	return sb.String()
}

// IsSeparatorLine checks if a line consists only of separator characters.
// Matches lines of 3+ dashes, equals, or box drawing horizontal lines.
func IsSeparatorLine(line string) bool {
	if len(line) < 3 {
		return false
	}

	sepCount := 0
	totalRunes := 0

	for _, r := range line {
		totalRunes++
		if r == '-' || r == '=' || r == '─' || r == '━' || r == '═' {
			sepCount++
		} else if r != ' ' && r != '\t' {
			// Non-separator, non-whitespace character
			return false
		}
	}

	// Must be at least 3 separator chars and mostly separators
	return sepCount >= 3 && sepCount > totalRunes/2
}

// NormalizeWhitespaceToBuffer normalizes whitespace without regex.
// Collapses multiple spaces/tabs to single space, multiple newlines to single.
func NormalizeWhitespaceToBuffer(input []byte, output *bytes.Buffer) {
	if len(input) == 0 {
		return
	}

	prevSpace := false
	prevNewline := false

	for i := 0; i < len(input); {
		r, size := utf8.DecodeRune(input[i:])
		i += size

		if r == ' ' || r == '\t' {
			if !prevSpace && !prevNewline {
				output.WriteByte(' ')
				prevSpace = true
			}
		} else if r == '\n' || r == '\r' {
			if !prevNewline {
				output.WriteByte('\n')
				prevNewline = true
				prevSpace = false
			}
		} else {
			output.WriteRune(r)
			prevSpace = false
			prevNewline = false
		}
	}
}

// NormalizeWhitespace collapses multiple spaces and newlines.
func NormalizeWhitespace(input string) string {
	buf := GetBuffer()
	defer PutBuffer(buf)

	NormalizeWhitespaceToBuffer([]byte(input), buf)
	return strings.TrimSpace(buf.String())
}

// ContainsANSIArtifacts checks for leftover ANSI artifacts in cleaned text.
// Used by health monitor to validate content quality.
func ContainsANSIArtifacts(content string) bool {
	// Check for raw escape character
	if strings.ContainsRune(content, 0x1b) {
		return true
	}

	// Check for orphaned CSI-like patterns (bracket followed by params and letter)
	// Pattern: [ followed by optional ? and digits/semicolons, then a letter
	inBracket := false
	hasParams := false

	for i, r := range content {
		if r == '[' && i > 0 {
			inBracket = true
			hasParams = false
		} else if inBracket {
			if r == '?' || (r >= '0' && r <= '9') || r == ';' {
				hasParams = true
			} else if r >= 'A' && r <= 'z' && hasParams {
				// Found [?0-9;]+[A-Za-z] pattern - likely ANSI artifact
				return true
			} else {
				inBracket = false
			}
		}
	}

	return false
}

// ApplyBackspaces processes backspace characters in input.
// Handles both DEL (0x7f) and BS (0x08) by deleting previous character.
func ApplyBackspaces(input []byte) []byte {
	if len(input) == 0 {
		return input
	}

	// Fast path: no backspace characters
	hasBS := false
	for _, b := range input {
		if b == 0x7f || b == 0x08 {
			hasBS = true
			break
		}
	}
	if !hasBS {
		return input
	}

	result := make([]byte, 0, len(input))
	for _, b := range input {
		if b == 0x7f || b == 0x08 {
			if len(result) > 0 {
				result = result[:len(result)-1]
			}
		} else {
			result = append(result, b)
		}
	}
	return result
}

// RemoveControlCharsToBuffer removes control characters except newline and tab.
func RemoveControlCharsToBuffer(input []byte, output *bytes.Buffer) {
	for _, b := range input {
		if b >= 32 || b == '\n' || b == '\t' || b == '\r' {
			output.WriteByte(b)
		}
	}
}

// CleanTerminalOutput is the unified cleaning function for terminal output.
// Combines ANSI stripping, control char removal, and whitespace normalization.
func CleanTerminalOutput(input string) string {
	if len(input) == 0 {
		return input
	}

	buf := GetBuffer()
	defer PutBuffer(buf)

	// Step 1: Strip ANSI sequences
	StripANSIToBuffer([]byte(input), buf)

	// Step 2: Remove control chars (already done by StripANSIToBuffer for most)
	// Step 3: Normalize whitespace
	result := NormalizeWhitespace(buf.String())

	return result
}
