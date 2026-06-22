//go:build windows
// +build windows

// session_identity_integration_windows_test.go — integration proof that the
// per-tab FORGE_SESSION_ID actually reaches a child process through Windows
// ConPTY, and that two concurrent sessions receive DISTINCT identities (the
// conflation fix, demonstrated at the environment level).
// specs/010-sdd-authoritative-state, FR-003 and FR-004.
//
// This spawns real ConPTY shells, so it is an integration test (not a <10ms
// unit test) and is gated to Windows, where the write-into-shell injection
// path in pty_windows.go lives.
package terminal

import (
	"strings"
	"sync"
	"testing"
	"time"
)

// collectPTY drains a session's PTY output into out until stop is closed or the
// PTY returns an error. A draining reader is required because, outside the
// WebSocket handler, nothing else pumps the PTY (and an undrained PTY can block
// the child shell).
func collectPTY(sess *TerminalSession, stop <-chan struct{}, out *strings.Builder, mu *sync.Mutex) {
	tmp := make([]byte, 4096)
	for {
		select {
		case <-stop:
			return
		default:
		}
		readCount, err := sess.Read(tmp)
		if readCount > 0 {
			mu.Lock()
			out.Write(tmp[:readCount])
			mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}

// waitForMarker polls the collected output for marker until found or timeout.
func waitForMarker(mu *sync.Mutex, out *strings.Builder, marker string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		mu.Lock()
		hasMarker := strings.Contains(out.String(), marker)
		mu.Unlock()
		if hasMarker {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
}

// TestForgeSessionIDReachesChildAndIsPerTab spawns two concurrent ConPTY
// sessions with different ids and proves each child shell reports its OWN
// FORGE_SESSION_ID and never the other's.
func TestForgeSessionIDReachesChildAndIsPerTab(t *testing.T) {
	const idA = "forge-itest-AAA-111"
	const idB = "forge-itest-BBB-222"

	sessA, err := NewTerminalSessionWithConfig(idA, &ShellConfig{ShellType: "cmd"})
	if err != nil {
		t.Fatalf("spawn session A: %v", err)
	}
	defer sessA.Close()
	sessB, err := NewTerminalSessionWithConfig(idB, &ShellConfig{ShellType: "cmd"})
	if err != nil {
		t.Fatalf("spawn session B: %v", err)
	}
	defer sessB.Close()

	var muA, muB sync.Mutex
	var outA, outB strings.Builder
	stopA := make(chan struct{})
	stopB := make(chan struct{})
	go collectPTY(sessA, stopA, &outA, &muA)
	go collectPTY(sessB, stopB, &outB, &muB)
	defer close(stopA)
	defer close(stopB)

	// Allow the 100ms injection goroutine + shell startup to complete.
	time.Sleep(1 * time.Second)

	// Ask each child shell to print its injected identity. The expanded result
	// line "MARK=<id>" is distinct from the echoed command "MARK=%FORGE_SESSION_ID%",
	// so a match proves the variable was set in the child, not merely typed.
	if _, err := sessA.WriteToPty([]byte("echo MARK=%FORGE_SESSION_ID%\r")); err != nil {
		t.Fatalf("write to A: %v", err)
	}
	if _, err := sessB.WriteToPty([]byte("echo MARK=%FORGE_SESSION_ID%\r")); err != nil {
		t.Fatalf("write to B: %v", err)
	}

	if !waitForMarker(&muA, &outA, "MARK="+idA, 10*time.Second) {
		t.Fatalf("session A child never reported FORGE_SESSION_ID=%s; output:\n%s", idA, outA.String())
	}
	if !waitForMarker(&muB, &outB, "MARK="+idB, 10*time.Second) {
		t.Fatalf("session B child never reported FORGE_SESSION_ID=%s; output:\n%s", idB, outB.String())
	}

	// Isolation: neither session may carry the other's identity (the conflation fix).
	muA.Lock()
	aLeakedB := strings.Contains(outA.String(), "MARK="+idB)
	muA.Unlock()
	muB.Lock()
	bLeakedA := strings.Contains(outB.String(), "MARK="+idA)
	muB.Unlock()
	if aLeakedB {
		t.Errorf("session A leaked session B's identity %s — per-tab isolation broken", idB)
	}
	if bLeakedA {
		t.Errorf("session B leaked session A's identity %s — per-tab isolation broken", idA)
	}
}
