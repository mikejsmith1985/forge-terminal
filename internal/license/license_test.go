package license

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ── Status constants ─────────────────────────────────────────────────────────

func TestStatusConstants(t *testing.T) {
	cases := []struct {
		status Status
		want   string
	}{
		{StatusOK, "ok"},
		{StatusRequired, "required"},
		{StatusExpired, "expired"},
		{StatusGrace, "grace"},
	}
	for _, tc := range cases {
		if string(tc.status) != tc.want {
			t.Errorf("Status %q: string value = %q, want %q", tc.status, string(tc.status), tc.want)
		}
	}
}

// ── CheckLicense decision tree ────────────────────────────────────────────────

func TestCheckLicense_NoCache_ReturnsRequired(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	status, info := CheckLicense()
	if status != StatusRequired {
		t.Errorf("status = %q, want %q", status, StatusRequired)
	}
	if info != nil {
		t.Errorf("info should be nil when no cache, got %+v", info)
	}
}

func TestCheckLicense_ActiveGracePeriod_ReturnsGrace(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	graceEnd := time.Now().Add(48 * time.Hour)
	cached := &Info{
		Key:                "k",
		Token:              "t",
		LastCheck:          time.Now().Add(-48 * time.Hour),
		GracePeriodExpires: &graceEnd,
	}
	if err := writeCache(cached); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	status, _ := CheckLicense()
	if status != StatusGrace {
		t.Errorf("status = %q, want %q", status, StatusGrace)
	}
}

func TestCheckLicense_ExpiredGracePeriod_ReturnsExpired(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	graceEnd := time.Now().Add(-1 * time.Hour) // expired in the past
	cached := &Info{
		Key:                "k",
		Token:              "t",
		LastCheck:          time.Now().Add(-100 * time.Hour),
		GracePeriodExpires: &graceEnd,
	}
	if err := writeCache(cached); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	status, _ := CheckLicense()
	if status != StatusExpired {
		t.Errorf("status = %q, want %q", status, StatusExpired)
	}
}

func TestCheckLicense_RecentLastCheck_ReturnsOK(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	// LastCheck within 24 h → OK without network call
	cached := &Info{
		Key:       "k",
		Token:     "t",
		LastCheck: time.Now().Add(-1 * time.Hour),
	}
	if err := writeCache(cached); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	status, info := CheckLicense()
	if status != StatusOK {
		t.Errorf("status = %q, want %q", status, StatusOK)
	}
	if info == nil {
		t.Fatal("info should not be nil on StatusOK")
	}
}

func TestCheckLicense_StaleCache_ValidateOK_ReturnsOK(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expires := time.Now().Add(365 * 24 * time.Hour)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","expiresAt":"` + expires.Format(time.RFC3339) + `"}`))
	}))
	defer srv.Close()

	origURL := WorkerBaseURL
	WorkerBaseURL = srv.URL
	defer func() { WorkerBaseURL = origURL }()

	cached := &Info{
		Key:       "k",
		Token:     "t",
		LastCheck: time.Now().Add(-48 * time.Hour), // stale
	}
	if err := writeCache(cached); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	status, _ := CheckLicense()
	if status != StatusOK {
		t.Errorf("status = %q, want %q", status, StatusOK)
	}
}

func TestCheckLicense_StaleCache_NetworkFail_ReturnsGrace(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	origURL := WorkerBaseURL
	WorkerBaseURL = "http://localhost:1" // refused connection
	defer func() { WorkerBaseURL = origURL }()

	cached := &Info{
		Key:       "k",
		Token:     "t",
		LastCheck: time.Now().Add(-48 * time.Hour), // stale
	}
	if err := writeCache(cached); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	status, info := CheckLicense()
	if status != StatusGrace {
		t.Errorf("status = %q, want %q", status, StatusGrace)
	}
	if info == nil || info.GracePeriodExpires == nil {
		t.Error("grace period should have been set on network failure")
	}
}
