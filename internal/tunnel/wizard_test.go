package tunnel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// withTempHome redirects HOME / USERPROFILE at test scope and returns a
// restore func. Mirrors the helper used in login_test.go.
func withTempHomeWizard(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	return dir
}

func writeCertWithToken(t *testing.T, home string, info originCertInfo) string {
	t.Helper()
	raw, err := json.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	b64 := base64.StdEncoding.EncodeToString(raw)
	pem := "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n" +
		"-----BEGIN ARGO TUNNEL TOKEN-----\n" + b64 + "\n-----END ARGO TUNNEL TOKEN-----\n"
	dir := filepath.Join(home, ".cloudflared")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "cert.pem")
	if err := os.WriteFile(path, []byte(pem), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// ------------------------------------------------------------------
// cert.pem parsing
// ------------------------------------------------------------------

func TestReadOriginCert_Success(t *testing.T) {
	home := withTempHomeWizard(t)
	path := writeCertWithToken(t, home, originCertInfo{
		ZoneID: "zone1", AccountID: "acc1", APIToken: "tok",
	})
	info, err := readOriginCert(path)
	if err != nil {
		t.Fatalf("readOriginCert: %v", err)
	}
	if info.APIToken != "tok" || info.ZoneID != "zone1" {
		t.Fatalf("unexpected info: %+v", info)
	}
}

func TestReadOriginCert_MissingBlock(t *testing.T) {
	home := withTempHomeWizard(t)
	dir := filepath.Join(home, ".cloudflared")
	os.MkdirAll(dir, 0o700)
	path := filepath.Join(dir, "cert.pem")
	os.WriteFile(path, []byte("-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n"), 0o600)
	if _, err := readOriginCert(path); err == nil {
		t.Fatal("expected error for missing token block")
	}
}

func TestReadOriginCert_NoAPIToken(t *testing.T) {
	home := withTempHomeWizard(t)
	path := writeCertWithToken(t, home, originCertInfo{ZoneID: "zone1"})
	if _, err := readOriginCert(path); err == nil {
		t.Fatal("expected error for empty apiToken")
	}
}

// ------------------------------------------------------------------
// Hostname + tunnel-name helpers
// ------------------------------------------------------------------

func TestValidateHostname(t *testing.T) {
	ok := []string{"forge.example.com", "Forge.Example.COM", "a.b.co", "x-y.example.org"}
	for _, h := range ok {
		if _, err := validateHostname(h); err != nil {
			t.Errorf("expected %q valid, got %v", h, err)
		}
	}
	bad := []string{"", "nodots", ".leading", "trailing.", "space in.it.com", "under_score.com"}
	for _, h := range bad {
		if _, err := validateHostname(h); err == nil {
			t.Errorf("expected %q invalid", h)
		}
	}
}

func TestTunnelNameFor_DeterministicAndCollisionResistant(t *testing.T) {
	n1 := tunnelNameFor("a.b.com")
	n2 := tunnelNameFor("a-b.com")
	if n1 == n2 {
		t.Fatalf("different hostnames must produce different names: %q", n1)
	}
	if tunnelNameFor("forge.example.com") != tunnelNameFor("forge.example.com") {
		t.Fatal("tunnelNameFor must be deterministic")
	}
	if !strings.HasPrefix(n1, "forge-") {
		t.Fatalf("expected forge- prefix, got %q", n1)
	}
}

// ------------------------------------------------------------------
// Config rendering
// ------------------------------------------------------------------

func TestRenderConfigYAML(t *testing.T) {
	y := string(renderConfigYAML("u-1", `C:\Users\x\.forge\tunnel\u-1.json`, "forge.example.com", 3005))
	for _, want := range []string{
		"tunnel: u-1",
		"credentials-file: C:/Users/x/.forge/tunnel/u-1.json",
		"hostname: forge.example.com",
		"service: http://localhost:3005",
		"http_status:404",
	} {
		if !strings.Contains(y, want) {
			t.Errorf("config.yml missing %q; got:\n%s", want, y)
		}
	}
}

// ------------------------------------------------------------------
// ListZones — uses httptest server as Cloudflare API
// ------------------------------------------------------------------

func TestListZones_SingleZoneFastPath(t *testing.T) {
	home := withTempHomeWizard(t)
	writeCertWithToken(t, home, originCertInfo{ZoneID: "zone1", APIToken: "tok"})

	var singleCalled bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/zones/zone1" {
			singleCalled = true
			if got := r.Header.Get("Authorization"); got != "Bearer tok" {
				t.Errorf("bad auth: %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(zoneEnvelope{
				Success: true,
				Result:  Zone{ID: "zone1", Name: "example.com"},
			})
			return
		}
		t.Errorf("unexpected request: %s", r.URL.Path)
		http.NotFound(w, r)
	}))
	defer srv.Close()

	prev := cloudflareAPIBase
	cloudflareAPIBase = srv.URL
	t.Cleanup(func() { cloudflareAPIBase = prev })

	zs, err := ListZones(context.Background())
	if err != nil {
		t.Fatalf("ListZones: %v", err)
	}
	if !singleCalled {
		t.Fatal("expected single-zone endpoint to be hit when zoneID present")
	}
	if len(zs) != 1 || zs[0].Name != "example.com" {
		t.Fatalf("unexpected zones: %+v", zs)
	}
}

func TestListZones_AccountListFallback(t *testing.T) {
	home := withTempHomeWizard(t)
	writeCertWithToken(t, home, originCertInfo{AccountID: "acc1", APIToken: "tok"})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/zones") {
			http.NotFound(w, r)
			return
		}
		env := zonesEnvelope{Success: true, Result: []Zone{{ID: "z1", Name: "a.com"}, {ID: "z2", Name: "b.com"}}}
		env.ResultInfo.Page = 1
		env.ResultInfo.TotalPages = 1
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(env)
	}))
	defer srv.Close()

	prev := cloudflareAPIBase
	cloudflareAPIBase = srv.URL
	t.Cleanup(func() { cloudflareAPIBase = prev })

	zs, err := ListZones(context.Background())
	if err != nil {
		t.Fatalf("ListZones: %v", err)
	}
	if len(zs) != 2 {
		t.Fatalf("expected 2 zones, got %+v", zs)
	}
}

// ------------------------------------------------------------------
// CreateNamedTunnel — end-to-end with fake cloudflared
// ------------------------------------------------------------------

// fakeRunner implements the cloudflaredRunner contract via a scripted
// response table.
type fakeRunner struct {
	responses map[string]fakeResponse
	calls     []string
}

type fakeResponse struct {
	out []byte
	err error
}

func (f *fakeRunner) run(_ context.Context, args ...string) ([]byte, error) {
	key := strings.Join(args, " ")
	f.calls = append(f.calls, key)
	if r, ok := f.responses[key]; ok {
		return r.out, r.err
	}
	return nil, &fakeExitErr{msg: "no fake response for: " + key}
}

type fakeExitErr struct{ msg string }

func (e *fakeExitErr) Error() string { return e.msg }

func withFakeRunner(t *testing.T, f *fakeRunner) {
	t.Helper()
	prev := cloudflaredRunner
	cloudflaredRunner = f.run
	t.Cleanup(func() { cloudflaredRunner = prev })
}

// writeOriginCredsFile simulates `cloudflared tunnel create` having
// written ~/.cloudflared/<uuid>.json.
func writeOriginCredsFile(t *testing.T, uuid string) {
	t.Helper()
	path := defaultOriginCredentialsPath(uuid)
	os.MkdirAll(filepath.Dir(path), 0o700)
	if err := os.WriteFile(path, []byte(`{"AccountTag":"x","TunnelID":"`+uuid+`"}`), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCreateNamedTunnel_HappyPath(t *testing.T) {
	withTempHomeWizard(t)
	name := tunnelNameFor("forge.example.com")

	f := &fakeRunner{responses: map[string]fakeResponse{
		"tunnel list --output json":                    {out: []byte(`[]`)},
		"tunnel create --output json " + name:          {out: []byte(`{"id":"uuid-1","name":"` + name + `"}`)},
		"tunnel route dns uuid-1 forge.example.com":    {out: []byte(`ok`)},
	}}
	withFakeRunner(t, f)
	// Pretend cloudflared wrote the creds file.
	writeOriginCredsFile(t, "uuid-1")

	cfg, err := CreateNamedTunnel(context.Background(), "forge.example.com", 3005)
	if err != nil {
		t.Fatalf("CreateNamedTunnel: %v", err)
	}
	if cfg.TunnelUUID != "uuid-1" || cfg.Hostname != "forge.example.com" || cfg.LocalPort != 3005 {
		t.Fatalf("unexpected cfg: %+v", cfg)
	}

	// Verify config.yml written to managed dir.
	if b, err := os.ReadFile(cfg.ConfigPath); err != nil {
		t.Fatalf("config.yml: %v", err)
	} else if !strings.Contains(string(b), "tunnel: uuid-1") {
		t.Fatalf("config.yml missing tunnel id: %s", b)
	}
	// Verify creds copied into managed dir.
	if _, err := os.Stat(cfg.CredentialsPath); err != nil {
		t.Fatalf("forge creds missing: %v", err)
	}
	// Verify source creds NOT deleted.
	if _, err := os.Stat(defaultOriginCredentialsPath("uuid-1")); err != nil {
		t.Fatalf("source creds should be preserved: %v", err)
	}
	// Verify state.json written.
	st := LoadWizardState()
	if !st.Created || st.Config == nil || st.Config.TunnelUUID != "uuid-1" {
		t.Fatalf("state not persisted: %+v", st)
	}
}

func TestCreateNamedTunnel_IdempotentReuse(t *testing.T) {
	withTempHomeWizard(t)
	name := tunnelNameFor("forge.example.com")

	// Tunnel already exists in account; no create call should be made.
	f := &fakeRunner{responses: map[string]fakeResponse{
		"tunnel list --output json":                 {out: []byte(`[{"id":"uuid-existing","name":"` + name + `"}]`)},
		"tunnel route dns uuid-existing forge.example.com": {out: []byte(`ok`)},
	}}
	withFakeRunner(t, f)
	writeOriginCredsFile(t, "uuid-existing")

	cfg, err := CreateNamedTunnel(context.Background(), "forge.example.com", 3005)
	if err != nil {
		t.Fatalf("CreateNamedTunnel: %v", err)
	}
	if cfg.TunnelUUID != "uuid-existing" {
		t.Fatalf("expected reuse, got %+v", cfg)
	}
	for _, c := range f.calls {
		if strings.HasPrefix(c, "tunnel create") {
			t.Fatalf("did not expect `tunnel create` call during reuse: %v", f.calls)
		}
	}
}

func TestCreateNamedTunnel_ExistingButNoLocalCreds(t *testing.T) {
	withTempHomeWizard(t)
	name := tunnelNameFor("forge.example.com")

	f := &fakeRunner{responses: map[string]fakeResponse{
		"tunnel list --output json": {out: []byte(`[{"id":"uuid-orphan","name":"` + name + `"}]`)},
	}}
	withFakeRunner(t, f)
	// Do NOT write creds file — simulates "tunnel created on another host".

	_, err := CreateNamedTunnel(context.Background(), "forge.example.com", 3005)
	if err == nil {
		t.Fatal("expected adopt error when creds missing locally")
	}
	if !strings.Contains(err.Error(), "credentials file is not present") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateNamedTunnel_DNSRouteFails(t *testing.T) {
	withTempHomeWizard(t)
	name := tunnelNameFor("forge.example.com")

	f := &fakeRunner{responses: map[string]fakeResponse{
		"tunnel list --output json":                    {out: []byte(`[]`)},
		"tunnel create --output json " + name:          {out: []byte(`{"id":"uuid-1","name":"` + name + `"}`)},
		"tunnel route dns uuid-1 forge.example.com":    {out: []byte(`error 1003: record exists`), err: &fakeExitErr{msg: "exit 1"}},
	}}
	withFakeRunner(t, f)
	writeOriginCredsFile(t, "uuid-1")

	_, err := CreateNamedTunnel(context.Background(), "forge.example.com", 3005)
	if err == nil {
		t.Fatal("expected DNS route error")
	}
	if !strings.Contains(err.Error(), "DNS route") {
		t.Fatalf("unexpected error: %v", err)
	}
	// state.json must NOT be written on failure.
	if LoadWizardState().Created {
		t.Fatal("state should not be Created after DNS route failure")
	}
}

func TestCreateNamedTunnel_InvalidInputs(t *testing.T) {
	withTempHomeWizard(t)

	cases := []struct {
		host string
		port int
	}{
		{"", 3005},
		{"bad host", 3005},
		{"forge.example.com", 0},
		{"forge.example.com", 99999},
	}
	for _, c := range cases {
		if _, err := CreateNamedTunnel(context.Background(), c.host, c.port); err == nil {
			t.Errorf("expected error for %+v", c)
		}
	}
}

func TestLoadWizardState_DerivedFromFiles(t *testing.T) {
	home := withTempHomeWizard(t)
	// No files yet.
	st := LoadWizardState()
	if st.Created || st.LoggedIn {
		t.Fatalf("expected empty state, got %+v", st)
	}
	// Writing cert.pem flips LoggedIn.
	writeCertWithToken(t, home, originCertInfo{APIToken: "tok"})
	st = LoadWizardState()
	if !st.LoggedIn {
		t.Fatal("expected LoggedIn after cert.pem written")
	}
	if st.Created {
		t.Fatal("Created should remain false without state.json")
	}
}
