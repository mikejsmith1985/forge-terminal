package license

import (
	"testing"
	"time"
)

func TestHeartbeat_Constants(t *testing.T) {
	if heartbeatInterval < 1*time.Minute {
		t.Errorf("heartbeatInterval = %v, want >= 1 minute", heartbeatInterval)
	}
	if gracePeriodDuration < 24*time.Hour {
		t.Errorf("gracePeriodDuration = %v, want >= 24 hours", gracePeriodDuration)
	}
	if maxConsecutiveFailures < 1 {
		t.Errorf("maxConsecutiveFailures = %d, want >= 1", maxConsecutiveFailures)
	}
}

// TestStartHeartbeat_DoesNotPanic verifies StartHeartbeat spawns without panicking.
// The heartbeat goroutine runs on a 60-minute ticker so no real I/O occurs in tests.
func TestStartHeartbeat_DoesNotPanic(t *testing.T) {
	info := &Info{Key: "k", Token: "t", LastCheck: time.Now()}
	// Should return immediately (goroutine runs in background)
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("StartHeartbeat panicked: %v", r)
		}
	}()
	StartHeartbeat(info)
}
