// launcher_test.go — Unit tests for the process launcher module.
package main

import (
	"testing"
	"time"
)

func TestProcessLauncher_GetRecentLogLines_FewerThanMaxReturnsAll(t *testing.T) {
	launcher := createProcessLauncher("", 9119)
	launcher.logLines = []TimestampedLogLine{
		{Text: "line1", Stream: "stdout", Timestamp: time.Now()},
		{Text: "line2", Stream: "stdout", Timestamp: time.Now()},
	}
	recent := launcher.getRecentLogLines(5)
	if len(recent) != 2 {
		t.Errorf("expected 2 lines, got %d", len(recent))
	}
}

func TestProcessLauncher_GetRecentLogLines_TruncatesToMaxCount(t *testing.T) {
	launcher := createProcessLauncher("", 9119)
	for i := 0; i < 10; i++ {
		launcher.logLines = append(launcher.logLines, TimestampedLogLine{
			Text: "line", Stream: "stdout", Timestamp: time.Now(),
		})
	}
	recent := launcher.getRecentLogLines(3)
	if len(recent) != 3 {
		t.Errorf("expected 3 lines, got %d", len(recent))
	}
}

func TestProcessLauncher_IsProcessRunning_DefaultIsFalse(t *testing.T) {
	launcher := createProcessLauncher("", 9119)
	if launcher.isProcessRunning() {
		t.Error("new launcher should not be running")
	}
}

func TestProcessLauncher_GetProcessUptime_ZeroWhenNotStarted(t *testing.T) {
	launcher := createProcessLauncher("", 9119)
	if launcher.getProcessUptime() != 0 {
		t.Error("uptime should be 0 when not started")
	}
}
