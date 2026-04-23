package tunnel

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func withTempHomeDetect(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	return home
}

func TestDetectQuick(t *testing.T) {
	// When cloudflared is not installed, quick should be Absent.
	withTempHomeDetect(t)
	got := detectQuick()
	// Can't easily force ResolvePath empty on dev machines that have
	// cloudflared on PATH — just check the struct invariants.
	if got.Mode != ModeIDQuick {
		t.Fatalf("wrong mode: %v", got.Mode)
	}
	if got.Stage != StageAbsent && got.Stage != StageConfigured {
		t.Fatalf("unexpected stage: %v", got.Stage)
	}
}

func TestDetectLAN(t *testing.T) {
	got := detectLAN(3005)
	if got.Mode != ModeIDLAN {
		t.Fatalf("wrong mode: %v", got.Mode)
	}
	if got.Stage == StageConfigured && got.URL == "" {
		t.Fatalf("configured LAN without URL")
	}
	// Any box running tests likely has at least one NIC, but CI
	// sandboxes sometimes don't — both outcomes are legal.
}

func TestDetectLANNoPort(t *testing.T) {
	got := detectLAN(0)
	if got.Stage != StageAbsent {
		t.Fatalf("port 0 should yield Absent, got %v", got.Stage)
	}
}

func TestDetectNamedAbsent(t *testing.T) {
	withTempHomeDetect(t)
	got := detectNamed(HealthState{Mode: ModeIDNamed, Stage: StageAbsent})
	if got.Stage != StageAbsent {
		t.Fatalf("no wizard state should yield Absent, got %v", got.Stage)
	}
}

func TestDetectNamedConfigured(t *testing.T) {
	home := withTempHomeDetect(t)
	tunDir := filepath.Join(home, ".forge", "tunnel")
	_ = os.MkdirAll(tunDir, 0o700)

	// Write a valid wizard state + referenced files.
	uuid := "aaaabbbb-cccc-dddd-eeee-ffff11112222"
	credsPath := filepath.Join(tunDir, uuid+".json")
	cfgPath := filepath.Join(tunDir, "config.yml")
	_ = os.WriteFile(credsPath, []byte(`{"x":1}`), 0o600)
	_ = os.WriteFile(cfgPath, []byte("tunnel: "+uuid+"\n"), 0o600)

	st := WizardState{
		Installed:       true,
		LoggedIn:        true,
		Created:         true,
		Config: &NamedConfig{
			TunnelUUID:      uuid,
			Hostname:        "forge.example.com",
			ConfigPath:      cfgPath,
			CredentialsPath: credsPath,
		},
	}
	body, _ := json.MarshalIndent(st, "", "  ")
	_ = os.WriteFile(filepath.Join(tunDir, "state.json"), body, 0o600)

	got := detectNamed(HealthState{Mode: ModeIDNamed, Stage: StageAbsent})
	if got.Stage != StageConfigured {
		t.Fatalf("expected Configured, got %v  (err=%q)", got.Stage, got.LastError)
	}
	if got.URL != "https://forge.example.com" {
		t.Fatalf("wrong URL: %q", got.URL)
	}
}

func TestDetectNamedPreservesLive(t *testing.T) {
	// A live supervisor writing Healthy must not be overwritten by a
	// file-based Absent/Configured reading.
	in := HealthState{Mode: ModeIDNamed, Stage: StageHealthy, URL: "https://live.example"}
	got := detectNamed(in)
	if got.Stage != StageHealthy {
		t.Fatalf("detectNamed clobbered live Healthy state: %v", got.Stage)
	}
}

func TestPreferenceRoundTrip(t *testing.T) {
	withTempHomeDetect(t)
	if got := LoadPreference(); got.Mode != "" {
		t.Fatalf("fresh home should have empty preference, got %q", got.Mode)
	}
	if err := SavePreference(string(ModeIDTailscale)); err != nil {
		t.Fatalf("save: %v", err)
	}
	got := LoadPreference()
	if got.Mode != string(ModeIDTailscale) {
		t.Fatalf("expected tailscale, got %q", got.Mode)
	}
	if got.UpdatedAt.IsZero() {
		t.Fatalf("UpdatedAt not set")
	}
	if err := SavePreference(""); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if got := LoadPreference(); got.Mode != "" {
		t.Fatalf("cleared preference should be empty, got %q", got.Mode)
	}
}

func TestPreferenceRejectsUnknown(t *testing.T) {
	withTempHomeDetect(t)
	if err := SavePreference("not-a-real-mode"); err == nil {
		t.Fatalf("unknown mode should be rejected")
	}
}

func TestDetectAllPopulatesAll(t *testing.T) {
	withTempHomeDetect(t)
	r := NewRanker()
	DetectAll(context.Background(), r, 3005)
	all := r.All()
	if len(all) != 4 {
		t.Fatalf("expected 4 modes, got %d", len(all))
	}
	seen := map[ModeID]bool{}
	for _, s := range all {
		seen[s.Mode] = true
	}
	for _, m := range []ModeID{ModeIDNamed, ModeIDTailscale, ModeIDQuick, ModeIDLAN} {
		if !seen[m] {
			t.Fatalf("mode %q missing from DetectAll output", m)
		}
	}
}
