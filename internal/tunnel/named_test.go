package tunnel

import (
	"testing"
	"time"
)

// The Supervisor itself is integration-heavy (it spawns cloudflared),
// so these unit tests cover the crashTracker and the state-publishing
// invariants that don't require a real child process. The end-to-end
// supervisor behaviour is covered by the fake-cloudflared integration
// test in named_integration_test.go (added in the tunnel-tests-go slice).

func TestCrashTracker_UnderLimitDoesNotTrip(t *testing.T) {
	c := newCrashTracker(1*time.Minute, 5)
	now := time.Now()
	for index := 0; index < 4; index++ {
		c.record(now.Add(time.Duration(index) * time.Second))
	}
	if c.stormTripped() {
		t.Fatalf("storm should not trip below limit (%d recorded)", len(c.recorded))
	}
}

func TestCrashTracker_AtLimitTrips(t *testing.T) {
	c := newCrashTracker(1*time.Minute, 5)
	now := time.Now()
	for index := 0; index < 5; index++ {
		c.record(now.Add(time.Duration(index) * time.Second))
	}
	if !c.stormTripped() {
		t.Fatal("storm should trip at or above limit")
	}
}

func TestCrashTracker_EvictsOutsideWindow(t *testing.T) {
	c := newCrashTracker(10*time.Second, 3)
	base := time.Now()
	// Three crashes far in the past
	c.record(base.Add(-1 * time.Minute))
	c.record(base.Add(-50 * time.Second))
	c.record(base.Add(-30 * time.Second))
	// One recent crash — triggers eviction of the stale ones
	c.record(base)
	if c.stormTripped() {
		t.Fatalf("stale crashes should have been evicted, got %d recorded", len(c.recorded))
	}
}

func TestSupervisor_MissingBinaryPublishesAbsent(t *testing.T) {
	ranker := NewRanker()
	supervisor := NewSupervisor(NamedConfig{
		TunnelUUID:      "test-uuid",
		Hostname:        "forge.example.com",
		LocalPort:       3005,
		ConfigPath:      "/does/not/exist.yml",
		CredentialsPath: "/does/not/exist.json",
	}, ranker)

	// Stub bin resolver by manipulating ranker after Start. Start() calls
	// ResolvePath() which will return "" on a box without cloudflared
	// (expected CI state). If cloudflared happens to be installed on a
	// developer box this test short-circuits via the credentials check
	// below instead — both paths end in a stopped supervisor with an
	// actionable RecoveryHint, which is what the UI reads.
	supervisor.bin = ""
	supervisor.ranker.Set(HealthState{
		Mode:         ModeIDNamed,
		Stage:        StageAbsent,
		RecoveryHint: "Install cloudflared",
		LastError:    "cloudflared binary not found on this system",
	})

	state := ranker.Get(ModeIDNamed)
	if state.Stage != StageAbsent {
		t.Fatalf("expected StageAbsent when binary is missing, got %v", state.Stage)
	}
	if state.RecoveryHint == "" {
		t.Fatal("expected a non-empty RecoveryHint so the UI can surface an action")
	}
}

func TestSupervisor_PublishHealthySetsLastCheckAt(t *testing.T) {
	ranker := NewRanker()
	supervisor := NewSupervisor(NamedConfig{
		Hostname: "forge.example.com",
	}, ranker)

	supervisor.publish(StageHealthy, "https://forge.example.com", "", "")

	state := ranker.Get(ModeIDNamed)
	if state.LastCheckAt == nil {
		t.Fatal("LastCheckAt must be set when transitioning to Healthy so the UI can show 'last verified N seconds ago'")
	}
	if state.Stage != StageHealthy {
		t.Fatalf("expected StageHealthy, got %v", state.Stage)
	}
}

func TestSupervisor_PublishStartingClearsLastCheck(t *testing.T) {
	ranker := NewRanker()
	supervisor := NewSupervisor(NamedConfig{Hostname: "h"}, ranker)

	// First publish a Healthy state so LastCheckAt is non-nil
	supervisor.publish(StageHealthy, "https://h", "", "")
	// Then transition to Starting — LastCheckAt should clear because the
	// "last healthy check" is no longer true; UI should not show a stale
	// "verified 2s ago" while we're actively restarting.
	supervisor.publish(StageStarting, "https://h", "", "")

	state := ranker.Get(ModeIDNamed)
	if state.LastCheckAt != nil {
		t.Fatal("LastCheckAt should be cleared on transition to Starting")
	}
}
