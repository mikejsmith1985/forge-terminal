// logging_test.go — unit tests for the resilient startup log writer and log rotation.
// These exist because file logging silently died: io.MultiWriter aborts the whole
// chain when its first sink (stdout) errors, which is exactly what happens in a
// windowsgui binary launched from Explorer — leaving forge.log untouched for weeks.
package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// failingWriter simulates a dead sink such as the invalid stdout handle of a
// windowsgui process: every write fails.
type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, errors.New("write to dead handle failed")
}

// TestRawMultiWriterAbortsOnFirstSinkError documents the stdlib behavior that
// caused the outage: with a failing first sink, io.MultiWriter never reaches the
// second sink. This is the defect the resilient writer below must not share.
func TestRawMultiWriterAbortsOnFirstSinkError(t *testing.T) {
	var fileSink bytes.Buffer
	chained := io.MultiWriter(failingWriter{}, &fileSink)

	_, writeErr := chained.Write([]byte("boot message"))

	if writeErr == nil {
		t.Fatal("expected io.MultiWriter to surface the first sink's error")
	}
	if fileSink.Len() != 0 {
		t.Fatal("expected io.MultiWriter to skip the file sink after the stdout error — stdlib behavior changed?")
	}
}

// TestResilientLogWriter_DeadSinkDoesNotBlockOthers is the fix's core guarantee:
// a dead stdout must never stop the log file from receiving output.
func TestResilientLogWriter_DeadSinkDoesNotBlockOthers(t *testing.T) {
	var fileSink bytes.Buffer
	logWriter := newResilientLogWriter(failingWriter{}, &fileSink)

	written, writeErr := logWriter.Write([]byte("boot message"))

	if writeErr != nil {
		t.Fatalf("resilient writer must swallow sink errors, got %v", writeErr)
	}
	if written != len("boot message") {
		t.Fatalf("expected full length %d reported, got %d", len("boot message"), written)
	}
	if fileSink.String() != "boot message" {
		t.Fatalf("file sink expected %q, got %q", "boot message", fileSink.String())
	}
}

// TestResilientLogWriter_AllSinksReceiveOutput proves healthy sinks all get the payload.
func TestResilientLogWriter_AllSinksReceiveOutput(t *testing.T) {
	var firstSink, secondSink bytes.Buffer
	logWriter := newResilientLogWriter(&firstSink, &secondSink)

	if _, writeErr := logWriter.Write([]byte("hello")); writeErr != nil {
		t.Fatalf("unexpected error: %v", writeErr)
	}
	if firstSink.String() != "hello" || secondSink.String() != "hello" {
		t.Fatalf("both sinks expected %q, got %q and %q", "hello", firstSink.String(), secondSink.String())
	}
}

// TestRotateOversizedLog_RenamesWhenOverCap: an oversized log is moved aside so the
// active file starts fresh (forge.log had grown to 888 MB in the field).
func TestRotateOversizedLog_RenamesWhenOverCap(t *testing.T) {
	tempDir := t.TempDir()
	logPath := filepath.Join(tempDir, "forge.log")
	if err := os.WriteFile(logPath, bytes.Repeat([]byte("x"), 128), 0644); err != nil {
		t.Fatal(err)
	}

	if err := rotateOversizedLog(logPath, 64); err != nil {
		t.Fatalf("rotation failed: %v", err)
	}

	if _, statErr := os.Stat(logPath); !os.IsNotExist(statErr) {
		t.Fatal("expected original log to be moved aside")
	}
	rotated, readErr := os.ReadFile(logPath + rotatedLogSuffix)
	if readErr != nil {
		t.Fatalf("expected rotated log at %s: %v", logPath+rotatedLogSuffix, readErr)
	}
	if len(rotated) != 128 {
		t.Fatalf("rotated log expected 128 bytes, got %d", len(rotated))
	}
}

// TestRotateOversizedLog_KeepsSmallLog: an in-cap log is left untouched.
func TestRotateOversizedLog_KeepsSmallLog(t *testing.T) {
	tempDir := t.TempDir()
	logPath := filepath.Join(tempDir, "forge.log")
	if err := os.WriteFile(logPath, []byte("small"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := rotateOversizedLog(logPath, 64); err != nil {
		t.Fatalf("rotation failed: %v", err)
	}

	content, readErr := os.ReadFile(logPath)
	if readErr != nil || string(content) != "small" {
		t.Fatalf("expected small log untouched, got %q err=%v", content, readErr)
	}
}

// TestRotateOversizedLog_MissingFileIsNoop: first boot has no log file yet.
func TestRotateOversizedLog_MissingFileIsNoop(t *testing.T) {
	if err := rotateOversizedLog(filepath.Join(t.TempDir(), "absent.log"), 64); err != nil {
		t.Fatalf("missing file must be a no-op, got %v", err)
	}
}
