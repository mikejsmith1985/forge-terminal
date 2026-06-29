// Package terminal — terminal_mode_tracker.go tracks the keyboard/private-mode
// state a TUI establishes so it can be restored when a client reattaches.
//
// WHY THIS EXISTS: a TUI (e.g. an AI CLI) sends terminal mode-setup sequences
// ONCE at startup — application cursor keys, application keypad, bracketed paste,
// modifyOtherKeys, the Kitty keyboard protocol. Those bytes scroll past and are
// trimmed from the scrollback journal. When the app restarts and a fresh xterm
// reattaches to the still-running TUI, the journal replay no longer contains the
// mode setup, so the new xterm comes up in DEFAULT keyboard mode while the TUI is
// still in application mode. Letters are mode-independent ASCII (they work), but
// digits, the numpad, and arrows are mode-dependent — so they silently break.
// That is the root cause of the "recovered tab won't accept numbers" bug.
//
// This tracker observes PTY output, remembers the current mode state, and can
// re-emit it on reattach so the fresh xterm is put back in sync with the TUI.
package terminal

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
)

// sessionModesPath is the sidecar file holding a session's persisted terminal
// mode state. It sits next to the scrollback journal (logs/sessions/<id>.bin).
func sessionModesPath(sessionID string) string {
	return filepath.Join(journalDir, sessionID+".modes")
}

// mustCompileModeRegex builds the alternation that recognises every tracked
// terminal mode-setup sequence. Kept in a constructor so the (long) pattern has
// one documented home.
func mustCompileModeRegex() *regexp.Regexp {
	return regexp.MustCompile(
		"\x1b(?:" +
			"\\[\\?[0-9;]+[hl]" + // DEC private set/reset
			"|=" + // application keypad (DECKPAM)
			"|>" + // normal keypad (DECKPNM)
			"|\\[>4(?:;[0-9]+)?m" + // modifyOtherKeys level
			"|\\[>[0-9]+u" + // Kitty keyboard push
			"|\\[<u" + // Kitty keyboard pop
			"|\\[=[0-9]+;[0-9]+u" + // Kitty keyboard set
			")",
	)
}

// maxPendingEscape caps the bytes held while waiting for a split escape sequence
// to complete across two PTY reads. Mode sequences are short; anything longer is
// not a sequence we track and is dropped rather than buffered unboundedly.
const maxPendingEscape = 64

// modeSequence matches every terminal mode-setup sequence the tracker cares about,
// in one alternation so matches can be walked in positional (temporal) order.
//   \x1b[?<params>h|l  — DEC private set/reset (DECCKM 1, bracketed paste 2004, …)
//   \x1b=  / \x1b>     — application / normal keypad (DECKPAM / DECKPNM)
//   \x1b[>4;<n>m       — modifyOtherKeys level n
//   \x1b[>...u         — Kitty keyboard protocol push
//   \x1b[<u            — Kitty keyboard protocol pop
//   \x1b[=...;...u     — Kitty keyboard protocol set
var modeSequence = mustCompileModeRegex()

// terminalModeTracker is the observed mode state for a single PTY session.
// All methods are safe for concurrent use.
type terminalModeTracker struct {
	mu              sync.Mutex
	decPrivate      map[int]bool // DEC private mode number -> currently set
	appKeypad       bool         // application keypad (DECKPAM) active
	modifyOtherKeys int          // modifyOtherKeys level (0 = off)
	kittyActive     bool         // Kitty keyboard protocol active
	kittyFlags      int          // Kitty keyboard protocol flags
	pending         []byte       // trailing partial escape carried to the next Observe
	persistPath     string       // sidecar file for cross-restart persistence ("" = disabled)
}

// newTerminalModeTracker returns an empty tracker.
func newTerminalModeTracker() *terminalModeTracker {
	return &terminalModeTracker{decPrivate: make(map[int]bool)}
}

// SetPersistPath enables disk persistence of the mode state to path. Each mode
// change rewrites the file so the state survives a server/app restart.
func (t *terminalModeTracker) SetPersistPath(path string) {
	t.mu.Lock()
	t.persistPath = path
	t.mu.Unlock()
}

// LoadPersisted seeds the tracker from a sidecar previously written via the
// persist path. It is best-effort: a missing or unreadable file is ignored.
func (t *terminalModeTracker) LoadPersisted(path string) {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return
	}
	t.Observe(data) // the file holds valid set sequences, so Observe rebuilds state
}

// Observe parses a chunk of PTY output and updates the mode state. Sequences that
// straddle two chunks are stitched back together via the pending buffer.
func (t *terminalModeTracker) Observe(data []byte) {
	if len(data) == 0 {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	buf := data
	if len(t.pending) > 0 {
		buf = append(append([]byte{}, t.pending...), data...)
		t.pending = nil
	}

	changed := false
	for _, match := range modeSequence.FindAll(buf, -1) {
		if t.applyLocked(match) {
			changed = true
		}
	}

	t.retainTrailingPartialLocked(buf)

	if changed && t.persistPath != "" {
		// Best-effort: a failed write just means a future restart can't restore.
		_ = os.WriteFile(t.persistPath, t.restoreSequenceLocked(), 0644)
	}
}

// applyLocked updates state from a single matched mode sequence. Returns whether
// the state actually changed. Caller holds t.mu.
func (t *terminalModeTracker) applyLocked(match []byte) bool {
	seq := string(match)
	switch {
	case bytes.HasPrefix(match, []byte("\x1b[?")):
		return t.applyDecPrivateLocked(seq)
	case seq == "\x1b=":
		return setBool(&t.appKeypad, true)
	case seq == "\x1b>":
		return setBool(&t.appKeypad, false)
	case bytes.HasPrefix(match, []byte("\x1b[>4")) && bytes.HasSuffix(match, []byte("m")):
		return setInt(&t.modifyOtherKeys, modifyOtherKeysLevel(seq))
	case seq == "\x1b[<u":
		return setBool(&t.kittyActive, false)
	case bytes.HasPrefix(match, []byte("\x1b[>")) && bytes.HasSuffix(match, []byte("u")):
		return t.applyKittyLocked(true, seq[3:len(seq)-1]) // \x1b[> … u
	case bytes.HasPrefix(match, []byte("\x1b[=")) && bytes.HasSuffix(match, []byte("u")):
		flags := seq[3 : len(seq)-1] // \x1b[= flags ; mode u
		if i := indexByte(flags, ';'); i >= 0 {
			flags = flags[:i]
		}
		return t.applyKittyLocked(true, flags)
	}
	return false
}

// applyDecPrivateLocked handles \x1b[?<params>h or l, toggling each mode number.
func (t *terminalModeTracker) applyDecPrivateLocked(seq string) bool {
	set := seq[len(seq)-1] == 'h'
	body := seq[3 : len(seq)-1] // between "\x1b[?" and the final h/l
	changed := false
	for _, part := range splitSemicolons(body) {
		num, err := strconv.Atoi(part)
		if err != nil {
			continue
		}
		if t.decPrivate[num] != set {
			t.decPrivate[num] = set
			changed = true
		}
	}
	return changed
}

// applyKittyLocked sets the Kitty keyboard protocol active with the given flags.
func (t *terminalModeTracker) applyKittyLocked(active bool, flagsStr string) bool {
	flags, _ := strconv.Atoi(flagsStr)
	if t.kittyActive == active && t.kittyFlags == flags {
		return false
	}
	t.kittyActive = active
	t.kittyFlags = flags
	return true
}

// retainTrailingPartialLocked carries an unterminated escape at the end of buf
// over to the next Observe so a split sequence isn't lost.
func (t *terminalModeTracker) retainTrailingPartialLocked(buf []byte) {
	last := bytes.LastIndexByte(buf, 0x1b)
	if last < 0 {
		return
	}
	tail := buf[last:]
	if isIncompleteEscape(tail) && len(tail) <= maxPendingEscape {
		t.pending = append([]byte{}, tail...)
	}
}

// RestoreSequence returns the bytes that re-establish the current mode state on a
// fresh terminal. Empty when no tracked modes are active.
func (t *terminalModeTracker) RestoreSequence() []byte {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.restoreSequenceLocked()
}

// restoreSequenceLocked builds the restore bytes in a deterministic order so the
// output is stable across calls and across a persist/reload round-trip.
func (t *terminalModeTracker) restoreSequenceLocked() []byte {
	var out bytes.Buffer
	if t.appKeypad {
		out.WriteString("\x1b=")
	}
	modes := make([]int, 0, len(t.decPrivate))
	for num, isSet := range t.decPrivate {
		if isSet {
			modes = append(modes, num)
		}
	}
	sort.Ints(modes)
	for _, num := range modes {
		out.WriteString("\x1b[?")
		out.WriteString(strconv.Itoa(num))
		out.WriteString("h")
	}
	if t.modifyOtherKeys > 0 {
		out.WriteString("\x1b[>4;")
		out.WriteString(strconv.Itoa(t.modifyOtherKeys))
		out.WriteString("m")
	}
	if t.kittyActive {
		out.WriteString("\x1b[>")
		out.WriteString(strconv.Itoa(t.kittyFlags))
		out.WriteString("u")
	}
	if out.Len() == 0 {
		return nil
	}
	return out.Bytes()
}

// ── small helpers ────────────────────────────────────────────────────────────

// isIncompleteEscape reports whether tail is the start of an escape sequence that
// has not yet received its terminating byte (so more input is expected).
func isIncompleteEscape(tail []byte) bool {
	if len(tail) == 1 {
		return true // lone ESC
	}
	if tail[1] != '[' {
		return false // 2-byte ESC form (ESC=, ESC>, charset, …) — complete enough
	}
	// CSI: terminated by a final byte in 0x40–0x7E.
	for _, b := range tail[2:] {
		if b >= 0x40 && b <= 0x7E {
			return false
		}
	}
	return true
}

func modifyOtherKeysLevel(seq string) int {
	// seq is "\x1b[>4m" (level 0) or "\x1b[>4;<n>m".
	if i := indexByte(seq, ';'); i >= 0 {
		level, _ := strconv.Atoi(seq[i+1 : len(seq)-1])
		return level
	}
	return 0
}

func setBool(field *bool, value bool) bool {
	if *field == value {
		return false
	}
	*field = value
	return true
}

func setInt(field *int, value int) bool {
	if *field == value {
		return false
	}
	*field = value
	return true
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func splitSemicolons(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ';' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	return append(parts, s[start:])
}
