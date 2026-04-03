package terminal

import (
	"log"
	"os"
	"path/filepath"
	"sync"
)

const (
	journalMaxSize = 2 * 1024 * 1024 // 2 MiB per session
	journalDir     = "logs/sessions"  // relative to process working directory
)

// SessionJournal persists raw PTY output to disk so terminal scrollback
// survives server restarts and extended disconnections.
//
// File layout: logs/sessions/<sessionID>.bin
// Format: raw bytes (binary PTY output, including ANSI escape sequences).
// Size: capped at journalMaxSize; oldest half is trimmed when the limit is hit.
//
// All public methods are nil-safe — callers may treat a nil *SessionJournal as
// "journaling disabled" and call methods on it without any effect.
type SessionJournal struct {
	mu      sync.Mutex
	f       *os.File
	path    string
	written int64
}

// NewSessionJournal opens (or creates) the journal file for sessionID.
// Returns nil if the directory cannot be created or the file cannot be opened;
// callers should continue normally — journaling is a best-effort feature.
func NewSessionJournal(sessionID string) *SessionJournal {
	if err := os.MkdirAll(journalDir, 0755); err != nil {
		log.Printf("[Journal] Cannot create dir %s: %v", journalDir, err)
		return nil
	}

	path := filepath.Join(journalDir, sessionID+".bin")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		log.Printf("[Journal] Cannot open %s: %v", path, err)
		return nil
	}

	stat, _ := f.Stat()
	var written int64
	if stat != nil {
		written = stat.Size()
	}
	// Seek to end so subsequent Write calls append.
	if _, err := f.Seek(0, 2); err != nil {
		_ = f.Close()
		log.Printf("[Journal] Seek error for %s: %v", path, err)
		return nil
	}

	if written > 0 {
		log.Printf("[Journal] Session %s: journal restored (%d bytes) from %s", sessionID, written, path)
	}

	return &SessionJournal{f: f, path: path, written: written}
}

// Write appends data to the journal. If the file would exceed journalMaxSize,
// the oldest half is discarded before writing. Thread-safe; nil-safe.
func (j *SessionJournal) Write(data []byte) {
	if j == nil || len(data) == 0 {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()

	if j.f == nil {
		return
	}

	// Trim if appending would exceed the size cap.
	if j.written+int64(len(data)) > journalMaxSize {
		j.trimLocked()
	}

	n, err := j.f.Write(data)
	if err != nil {
		log.Printf("[Journal] Write error (%s): %v", j.path, err)
		return
	}
	j.written += int64(n)
}

// ReadAll returns all bytes currently in the journal file.
// Used to seed a new sessionHub's ring buffer on reconnect.
// Returns nil if the journal is empty or unavailable. Thread-safe; nil-safe.
func (j *SessionJournal) ReadAll() []byte {
	if j == nil {
		return nil
	}
	j.mu.Lock()
	defer j.mu.Unlock()

	if j.f == nil || j.written == 0 {
		return nil
	}

	if _, err := j.f.Seek(0, 0); err != nil {
		return nil
	}

	data := make([]byte, j.written)
	n, err := j.f.Read(data)
	// Restore write position.
	_, _ = j.f.Seek(0, 2)

	if err != nil || n == 0 {
		return nil
	}
	return data[:n]
}

// Close flushes and closes the underlying file. The file remains on disk so
// a future NewSessionJournal call can restore the session's scrollback.
// Thread-safe; nil-safe. Idempotent.
func (j *SessionJournal) Close() {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()

	if j.f != nil {
		_ = j.f.Sync()
		_ = j.f.Close()
		j.f = nil
	}
}

// trimLocked discards the oldest half of the journal to stay under journalMaxSize.
// Must be called with j.mu held.
func (j *SessionJournal) trimLocked() {
	if j.f == nil {
		return
	}

	if _, err := j.f.Seek(0, 0); err != nil {
		return
	}

	content := make([]byte, j.written)
	n, err := j.f.Read(content)
	if err != nil || n == 0 {
		return
	}
	content = content[:n]

	// Keep the most-recent half.
	keep := content[len(content)/2:]

	if err := j.f.Truncate(0); err != nil {
		return
	}
	if _, err := j.f.Seek(0, 0); err != nil {
		return
	}

	written, err := j.f.Write(keep)
	if err != nil {
		log.Printf("[Journal] Trim rewrite error (%s): %v", j.path, err)
		j.written = 0
		return
	}
	j.written = int64(written)
	log.Printf("[Journal] %s trimmed to %d bytes", j.path, j.written)
}
