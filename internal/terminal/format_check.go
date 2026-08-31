// Package terminal — format_check.go: noticing when a response became a wall of text.
//
// WHAT THIS CANNOT DO, stated first so nobody mistakes it for a guarantee.
//
// An agent CLI is a full-screen program. What reaches the scrollback buffer is
// escape sequences and screen redraws, not a transcript — the same region gets
// rewritten many times, prompts and spinners interleave with content, and there
// is no marker saying "the assistant's answer starts here". Any verdict drawn
// from that is a guess.
//
// A guess must never gate. If this blocked, it would sometimes block correct
// work, and a developer who has been wrongly blocked once starts bypassing
// every time. So the result of this file is a warning and nothing else, and
// every function below is written on that assumption.
//
// It is still worth having. The rule it watches has been broken for months
// without anyone noticing, because nothing was counting. A count that is roughly
// right is a large improvement on no count at all — provided nobody believes it
// is exact.
package terminal

import (
	"regexp"
	"strings"
)

// The most words a section should carry before it stops being scannable.
//
// Matches the contract the developer already works to. A section beyond this
// reads as a block of text and gets agreed with rather than read.
const maximumWordsPerSection = 75

// How much output to look back over. Long enough to hold one reply, short
// enough that a previous exchange does not colour the verdict.
const scrollbackWindowLines = 200

// ansiEscapePattern strips the control sequences a full-screen program leaves
// behind, so word counting sees text rather than cursor movements.
var ansiEscapePattern = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07`)

// sectionHeaderPattern matches the heading style the format contract asks for:
// an emoji or symbol followed by a short title in bold or as a markdown heading.
var sectionHeaderPattern = regexp.MustCompile(`(?m)^\s*(#{1,4}\s+|\*\*)?[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]`)

// dividerPattern matches the horizontal rule the contract uses between sections.
var dividerPattern = regexp.MustCompile(`(?m)^\s*---\s*$`)

// FormatVerdict is what the check noticed. Advisory in every case.
type FormatVerdict struct {
	// HasLongSection is true when some run of prose exceeded the word cap.
	HasLongSection bool

	// LongestSectionWords is the worst run seen, for a message that says how bad.
	LongestSectionWords int

	// HasSectionHeaders is true when at least one emoji-prefixed header appeared.
	HasSectionHeaders bool

	// HasDividers is true when at least one horizontal rule appeared.
	HasDividers bool

	// Summary is a single line suitable for a warning, empty when nothing was noticed.
	Summary string
}

// ShouldWarn reports whether the developer should be told.
//
// Note what this is NOT called. There is no ShouldBlock, and adding one would
// be a mistake: the input is screen redraws, and a verdict drawn from screen
// redraws cannot carry that weight.
func (verdict FormatVerdict) ShouldWarn() bool {
	return verdict.Summary != ""
}

// CheckFormat looks over recent output for a response that stopped being scannable.
//
// @param scrollback Raw bytes from the session's ring buffer, escape codes included.
// @returns A verdict that is always advisory.
func CheckFormat(scrollback string) FormatVerdict {
	text := stripEscapeSequences(scrollback)
	lines := recentLines(text, scrollbackWindowLines)

	verdict := FormatVerdict{
		HasSectionHeaders:   sectionHeaderPattern.MatchString(lines),
		HasDividers:         dividerPattern.MatchString(lines),
		LongestSectionWords: longestProseRun(lines),
	}
	verdict.HasLongSection = verdict.LongestSectionWords > maximumWordsPerSection

	verdict.Summary = summarise(verdict)
	return verdict
}

// summarise turns a verdict into the one line a warning would carry.
//
// Deliberately says "looks like" rather than asserting. The developer is being
// told what a rough count noticed, and the wording should not claim more
// certainty than the method has.
func summarise(verdict FormatVerdict) string {
	if !verdict.HasLongSection {
		return ""
	}

	message := "That reply looks like a wall of text — around " +
		itoa(verdict.LongestSectionWords) + " words in one run."

	if !verdict.HasSectionHeaders {
		message += " No section headers seen."
	}
	if !verdict.HasDividers {
		message += " No dividers seen."
	}
	return message
}

// stripEscapeSequences removes terminal control codes so text can be counted.
func stripEscapeSequences(raw string) string {
	withoutEscapes := ansiEscapePattern.ReplaceAllString(raw, "")
	return strings.ReplaceAll(withoutEscapes, "\r", "\n")
}

// recentLines keeps the last N lines, which is as far back as one reply reaches.
func recentLines(text string, lineCount int) string {
	lines := strings.Split(text, "\n")
	if len(lines) <= lineCount {
		return text
	}
	return strings.Join(lines[len(lines)-lineCount:], "\n")
}

// longestProseRun returns the largest number of words between two breaks.
//
// A break is a blank line, a divider, or a section header — the three things
// the format contract uses to stop a block of text from forming. Counting
// between them is a rough stand-in for "one section", and rough is all the
// input supports.
func longestProseRun(text string) int {
	longest := 0
	current := 0

	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)

		isBreak := trimmed == "" ||
			dividerPattern.MatchString(line) ||
			sectionHeaderPattern.MatchString(line)

		if isBreak {
			if current > longest {
				longest = current
			}
			current = 0
			continue
		}

		current += len(strings.Fields(trimmed))
	}

	if current > longest {
		longest = current
	}
	return longest
}

// itoa converts a count to text without pulling in a formatting dependency for
// one number.
func itoa(value int) string {
	if value == 0 {
		return "0"
	}

	digits := make([]byte, 0, 8)
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
