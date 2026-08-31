// Package terminal — format_check_test.go: what the wall-of-text check may and may not do.
//
// One test here matters more than the rest: the check must never produce a
// blocking result, no matter what it is fed. The input is screen redraws from a
// full-screen program, so every verdict is a guess — and a guess that can block
// will eventually block correct work, after which the developer bypasses it
// permanently and nothing is enforced at all.
//
// The rest confirm it notices the thing it exists to notice, without crying
// wolf over a reply that was formatted properly.
package terminal

import (
	"strings"
	"testing"
)

// A reply that follows the format contract: headers, dividers, short sections.
const wellFormattedReply = `🔧 Fix

The clipboard call now falls back when the API is unavailable.

---

🧪 Tests

Twenty new tests, all proven failing first.

---

⚠️ Warning

Not live until the binary is rebuilt.
`

func TestAWallOfTextIsNoticed(t *testing.T) {
	wall := "This is a single unbroken run of prose. " + strings.Repeat("more words follow here ", 40)

	verdict := CheckFormat(wall)

	if !verdict.HasLongSection {
		t.Fatalf("a long unbroken run should be noticed, got %d words", verdict.LongestSectionWords)
	}
	if !verdict.ShouldWarn() {
		t.Error("a wall of text should produce a warning")
	}
}

func TestAWellFormattedReplyIsNotFlagged(t *testing.T) {
	// Crying wolf is how a check gets ignored, and an ignored check is worse
	// than none because it creates the belief the problem is handled.
	verdict := CheckFormat(wellFormattedReply)

	if verdict.ShouldWarn() {
		t.Errorf("a properly formatted reply should not be flagged: %q", verdict.Summary)
	}
}

func TestSectionHeadersAndDividersAreRecognised(t *testing.T) {
	verdict := CheckFormat(wellFormattedReply)

	if !verdict.HasSectionHeaders {
		t.Error("emoji section headers should be recognised")
	}
	if !verdict.HasDividers {
		t.Error("dividers should be recognised")
	}
}

func TestEscapeSequencesDoNotCountAsWords(t *testing.T) {
	// A full-screen program leaves control codes everywhere. Counting them as
	// words would flag every reply, which is the fastest way to make the check
	// worthless.
	decorated := "\x1b[1;32m" + wellFormattedReply + "\x1b[0m"

	if CheckFormat(decorated).ShouldWarn() {
		t.Error("escape sequences must not inflate the word count")
	}
}

func TestOnlyRecentOutputIsConsidered(t *testing.T) {
	// A wall of text from an hour ago is not a verdict on the current reply.
	ancientWall := strings.Repeat("old words that no longer matter ", 60)
	recent := strings.Repeat("\n", 300) + wellFormattedReply

	if CheckFormat(ancientWall + recent).ShouldWarn() {
		t.Error("output beyond the window should not colour the verdict")
	}
}

func TestEmptyScrollbackIsNotAViolation(t *testing.T) {
	if CheckFormat("").ShouldWarn() {
		t.Error("an empty buffer is a session that has said nothing, not a violation")
	}
}

func TestTheVerdictCanNeverBlock(t *testing.T) {
	// The safety property. The check reads screen redraws, so no outcome it
	// produces — including a false positive — may carry more weight than a
	// warning. There is deliberately no ShouldBlock to call.
	inputs := []string{
		"",
		wellFormattedReply,
		strings.Repeat("wall of unbroken prose ", 200),
		"\x1b[2J\x1b[H" + strings.Repeat("redraw noise ", 100),
	}

	for _, input := range inputs {
		verdict := CheckFormat(input)

		// A verdict exposes exactly one decision, and it is advisory. If a
		// blocking path is ever added, this test is where it should be argued
		// about rather than slipped in.
		_ = verdict.ShouldWarn()

		if verdict.LongestSectionWords < 0 {
			t.Error("a nonsensical count would make the warning message wrong")
		}
	}
}

func TestTheWarningSaysHowBadWithoutOverclaiming(t *testing.T) {
	verdict := CheckFormat(strings.Repeat("unbroken prose continues ", 50))

	if !strings.Contains(verdict.Summary, "looks like") {
		t.Errorf("the wording should not claim more certainty than the method has: %q", verdict.Summary)
	}
	if !strings.Contains(verdict.Summary, "around") {
		t.Errorf("the count should be presented as approximate: %q", verdict.Summary)
	}
}
