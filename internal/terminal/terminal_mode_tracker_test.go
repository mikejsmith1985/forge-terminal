package terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// containsSeq reports whether haystack contains the literal escape sequence needle.
func containsSeq(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}

func TestModeTracker_DECPrivateSetAndReset(t *testing.T) {
	tr := newTerminalModeTracker()
	// Application cursor keys (1) + bracketed paste (2004) on.
	tr.Observe([]byte("\x1b[?1h\x1b[?2004h"))

	restore := string(tr.RestoreSequence())
	if !containsSeq(restore, "\x1b[?1h") {
		t.Fatalf("expected DECCKM (?1h) in restore, got %q", restore)
	}
	if !containsSeq(restore, "\x1b[?2004h") {
		t.Fatalf("expected bracketed-paste (?2004h) in restore, got %q", restore)
	}

	// Now reset cursor keys; it must drop out of the restore set.
	tr.Observe([]byte("\x1b[?1l"))
	restore = string(tr.RestoreSequence())
	if containsSeq(restore, "\x1b[?1h") {
		t.Fatalf("DECCKM should be cleared after ?1l, got %q", restore)
	}
	if !containsSeq(restore, "\x1b[?2004h") {
		t.Fatalf("bracketed-paste should remain set, got %q", restore)
	}
}

func TestModeTracker_MultipleParamsOneSequence(t *testing.T) {
	tr := newTerminalModeTracker()
	// A single DECSET can carry several mode numbers separated by ';'.
	tr.Observe([]byte("\x1b[?1;1006;2004h"))
	restore := string(tr.RestoreSequence())
	for _, want := range []string{"\x1b[?1h", "\x1b[?1006h", "\x1b[?2004h"} {
		if !containsSeq(restore, want) {
			t.Fatalf("expected %q in restore, got %q", want, restore)
		}
	}
}

func TestModeTracker_ApplicationKeypad(t *testing.T) {
	tr := newTerminalModeTracker()
	tr.Observe([]byte("\x1b=")) // DECKPAM — application keypad
	if !containsSeq(string(tr.RestoreSequence()), "\x1b=") {
		t.Fatalf("expected application keypad (ESC =) in restore")
	}
	tr.Observe([]byte("\x1b>")) // DECKPNM — normal keypad
	if containsSeq(string(tr.RestoreSequence()), "\x1b=") {
		t.Fatalf("application keypad should be cleared after ESC >")
	}
}

func TestModeTracker_ModifyOtherKeys(t *testing.T) {
	tr := newTerminalModeTracker()
	tr.Observe([]byte("\x1b[>4;2m")) // modifyOtherKeys level 2
	if !containsSeq(string(tr.RestoreSequence()), "\x1b[>4;2m") {
		t.Fatalf("expected modifyOtherKeys level 2 in restore")
	}
	tr.Observe([]byte("\x1b[>4;0m")) // disable
	if containsSeq(string(tr.RestoreSequence()), "\x1b[>4;2m") {
		t.Fatalf("modifyOtherKeys should be cleared at level 0")
	}
}

func TestModeTracker_KittyKeyboard(t *testing.T) {
	tr := newTerminalModeTracker()
	tr.Observe([]byte("\x1b[>1u")) // push kitty flags=1
	if !containsSeq(string(tr.RestoreSequence()), "\x1b[>1u") {
		t.Fatalf("expected kitty keyboard push in restore")
	}
	tr.Observe([]byte("\x1b[<u")) // pop
	if containsSeq(string(tr.RestoreSequence()), "\x1b[>1u") {
		t.Fatalf("kitty keyboard should be cleared after pop")
	}
}

// A mode sequence can be split across two PTY read chunks; the tracker must
// stitch the trailing partial escape back together.
func TestModeTracker_SplitAcrossChunks(t *testing.T) {
	tr := newTerminalModeTracker()
	tr.Observe([]byte("text before \x1b[?1")) // sequence cut mid-way
	tr.Observe([]byte("049h more text"))       // completes ?1049h (alt screen)
	if !containsSeq(string(tr.RestoreSequence()), "\x1b[?1049h") {
		t.Fatalf("expected alt-screen (?1049h) to survive a chunk split, got %q", tr.RestoreSequence())
	}
}

func TestModeTracker_EmptyWhenNoModes(t *testing.T) {
	tr := newTerminalModeTracker()
	tr.Observe([]byte("just plain output with \x1b[31mcolor\x1b[0m and \x1b[2J clear"))
	if seq := tr.RestoreSequence(); len(seq) != 0 {
		t.Fatalf("expected empty restore for non-mode output, got %q", seq)
	}
}

func TestModeTracker_PersistRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tab-x.modes")

	tr := newTerminalModeTracker()
	tr.SetPersistPath(path)
	tr.Observe([]byte("\x1b[?1h\x1b=\x1b[?2004h")) // changes trigger a persist write

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected persist file to be written: %v", err)
	}

	// A fresh tracker (simulating a process restart) must reload the same modes.
	reloaded := newTerminalModeTracker()
	reloaded.LoadPersisted(path)
	if string(reloaded.RestoreSequence()) != string(tr.RestoreSequence()) {
		t.Fatalf("reloaded restore %q != original %q", reloaded.RestoreSequence(), tr.RestoreSequence())
	}
}

// The reattach guarantee: output that set a keyboard mode flows through
// broadcast() into the tracker, and a client joining later receives the mode
// restore sequence BEFORE the scrollback — re-syncing the fresh xterm with the
// still-running TUI. This is the core of the "recovered tab can't type numbers"
// fix.
func TestHub_ReplayPrependsModeRestore(t *testing.T) {
	hub := newSessionHub()
	// A TUI sets application cursor keys + keypad, then prints a screen.
	hub.broadcast(websocket.BinaryMessage, []byte("\x1b[?1h\x1b=screen contents"))

	payload := string(hub.replayPayload())
	if !strings.Contains(payload, "\x1b[?1h") || !strings.Contains(payload, "\x1b=") {
		t.Fatalf("replay payload missing mode restore, got %q", payload)
	}
	// Restore must precede the replayed scrollback so the mode is set before the
	// terminal renders/accepts input.
	if strings.Index(payload, "\x1b[?1h") > strings.Index(payload, "screen contents") {
		t.Fatalf("mode restore must come before scrollback in %q", payload)
	}
}
