package tunnel

import (
	"testing"
)

// TestRanker_EmptyReturnsLANAbsent ensures a freshly-constructed ranker
// still has a deterministic Best() result during the brief startup
// window before any detector has reported.
func TestRanker_EmptyReturnsLANAbsent(t *testing.T) {
	r := NewRanker()

	best := r.Best()
	if best.Mode != ModeIDLAN {
		t.Errorf("expected LAN fallback, got %s", best.Mode)
	}
	if best.Stage != StageAbsent {
		t.Errorf("expected Absent stage, got %s", best.Stage)
	}
}

// TestRanker_HealthyBeatsConfigured is the core contract: a
// less-preferred-but-healthy mode wins over a more-preferred-but-broken
// mode. This prevents the "stuck on dead Named Tunnel" failure mode the
// rubber-duck review flagged.
func TestRanker_HealthyBeatsConfigured(t *testing.T) {
	r := NewRanker()

	// Named is broken — only configured on disk, not running.
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageConfigured})
	// Quick is currently up and serving traffic.
	r.Set(HealthState{Mode: ModeIDQuick, Stage: StageHealthy,
		URL: "https://abc.trycloudflare.com"})

	best := r.Best()
	if best.Mode != ModeIDQuick {
		t.Errorf("expected healthy Quick to win over configured Named, got %s", best.Mode)
	}
}

// TestRanker_HealthyTiebreakByModePreference confirms the
// Named > Tailscale > Quick > LAN ordering for equal-health ties.
func TestRanker_HealthyTiebreakByModePreference(t *testing.T) {
	r := NewRanker()
	r.Set(HealthState{Mode: ModeIDQuick, Stage: StageHealthy, URL: "q"})
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageHealthy, URL: "n"})
	r.Set(HealthState{Mode: ModeIDTailscale, Stage: StageHealthy, URL: "t"})

	best := r.Best()
	if best.Mode != ModeIDNamed {
		t.Errorf("expected Named to win tie, got %s", best.Mode)
	}
}

// TestRanker_DegradedRanksBelowConfigured — if we KNOW a mode is broken,
// prefer a mode we haven't even tried yet. Otherwise the UI would keep
// pointing users at a mode whose last probe failed.
func TestRanker_DegradedRanksBelowConfigured(t *testing.T) {
	r := NewRanker()
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageDegraded,
		LastError: "DNS unresolved"})
	r.Set(HealthState{Mode: ModeIDQuick, Stage: StageConfigured})

	best := r.Best()
	if best.Mode != ModeIDQuick {
		t.Errorf("expected configured Quick to beat degraded Named, got %s (stage=%s)",
			best.Mode, best.Stage)
	}
}

// TestRanker_AllReturnsSortedBestFirst exercises the full list that the
// "Other ways to connect" expander will render.
func TestRanker_AllReturnsSortedBestFirst(t *testing.T) {
	r := NewRanker()
	r.Set(HealthState{Mode: ModeIDLAN, Stage: StageHealthy, URL: "http://192.168.0.2"})
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageAbsent})
	r.Set(HealthState{Mode: ModeIDQuick, Stage: StageHealthy, URL: "https://q.trycloudflare.com"})
	r.Set(HealthState{Mode: ModeIDTailscale, Stage: StageDegraded})

	all := r.All()
	if len(all) != 4 {
		t.Fatalf("expected 4 states, got %d", len(all))
	}

	// Healthy Quick and Healthy LAN should come first; Named (Absent)
	// and Tailscale (Degraded) are at the bottom. Among the two healthy
	// options, Quick > LAN by mode preference.
	want := []ModeID{ModeIDQuick, ModeIDLAN, ModeIDTailscale, ModeIDNamed}
	for i, w := range want {
		if all[i].Mode != w {
			t.Errorf("position %d: want %s, got %s", i, w, all[i].Mode)
		}
	}
}

// TestRanker_SetOverwrites confirms that re-reporting a mode replaces
// the prior state (detectors may transition from Healthy → Degraded and
// we must not accumulate history in the live Ranker).
func TestRanker_SetOverwrites(t *testing.T) {
	r := NewRanker()
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageHealthy, URL: "x"})
	r.Set(HealthState{Mode: ModeIDNamed, Stage: StageDegraded, LastError: "probe failed"})

	got := r.Get(ModeIDNamed)
	if got.Stage != StageDegraded {
		t.Errorf("expected latest state (Degraded), got %s", got.Stage)
	}
	if got.LastError != "probe failed" {
		t.Errorf("expected latest error to be carried, got %q", got.LastError)
	}
}

// TestHealthState_IsUsable guards the contract that only StageHealthy
// counts as "safe to publish to the user's phone".
func TestHealthState_IsUsable(t *testing.T) {
	cases := []struct {
		stage HealthStage
		want  bool
	}{
		{StageHealthy, true},
		{StageStarting, false},
		{StageConfigured, false},
		{StageDegraded, false},
		{StageStopped, false},
		{StageAbsent, false},
	}
	for _, tc := range cases {
		h := HealthState{Mode: ModeIDNamed, Stage: tc.stage}
		if got := h.IsUsable(); got != tc.want {
			t.Errorf("stage %s: IsUsable()=%v, want %v", tc.stage, got, tc.want)
		}
	}
}
