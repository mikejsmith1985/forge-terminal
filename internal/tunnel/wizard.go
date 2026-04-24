// Package tunnel — Named Tunnel setup wizard.
//
// Once the user has logged in (`cloudflared tunnel login` produced
// ~/.cloudflared/cert.pem), this file turns that credential into a
// running Named Tunnel:
//
//   1. List the zones the cert has access to (best-effort).
//   2. Create a tunnel named `forge-<slug>-<hash>` — deterministic from
//      the chosen hostname, with a hash suffix so two hostnames that
//      sanitise to the same slug don't collide.
//   3. Route DNS for the hostname at `<uuid>.cfargotunnel.com`.
//   4. Copy the credentials JSON into `~/.forge/tunnel/<uuid>.json`
//      (leaving the original in ~/.cloudflared/ untouched so other
//      cloudflared tooling keeps working).
//   5. Render a `config.yml` pointing at `http://localhost:<port>`.
//   6. Write `state.json` LAST — so LoadWizardState returning
//      `Created=true` implies every prior file is present.
//
// The whole flow runs under one mutex (`wizardMu`) so two concurrent
// POSTs to /create can't race. It is re-entrant: calling it a second
// time with the same hostname reuses the existing tunnel iff local
// credentials are intact, otherwise returns an explicit adopt error.
package tunnel

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// cloudflareAPIBase is overridable in tests to point at an httptest server.
var cloudflareAPIBase = "https://api.cloudflare.com/client/v4"

// httpAPIClient is the client used for Cloudflare REST calls.
var httpAPIClient = &http.Client{Timeout: 15 * time.Second}

// cloudflaredRunner executes a cloudflared subcommand and returns its
// combined output. Overridable in tests so the wizard logic is
// exercised without spawning a real cloudflared.
var cloudflaredRunner = runCloudflaredCmd

func runCloudflaredCmd(ctx context.Context, args ...string) ([]byte, error) {
	bin := ResolvePath()
	if bin == "" {
		return nil, errors.New("cloudflared not installed")
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	hideWindow(cmd)
	return cmd.CombinedOutput()
}

// wizardMu serialises wizard mutations. Read-only state queries don't
// need it because LoadWizardState only touches files.
var wizardMu sync.Mutex

// ------------------------------------------------------------------
// cert.pem parsing
// ------------------------------------------------------------------

// originCertInfo is the shape of the JSON blob cloudflared embeds
// inside the ARGO TUNNEL TOKEN PEM block. Older cloudflared versions
// may omit some fields; only APIToken is strictly required for zone
// enumeration.
type originCertInfo struct {
	ZoneID    string `json:"zoneID"`
	AccountID string `json:"accountID"`
	APIToken  string `json:"apiToken"`
}

var argoTokenBlockRE = regexp.MustCompile(
	`(?s)-----BEGIN ARGO TUNNEL TOKEN-----\s*(.*?)\s*-----END ARGO TUNNEL TOKEN-----`)

// readOriginCert parses ~/.cloudflared/cert.pem and returns the embedded
// Cloudflare API token. Fails explicitly if the PEM does not contain an
// ARGO TUNNEL TOKEN block (the user's cert.pem may be from an older
// cloudflared version or be an origin certificate from a different flow).
func readOriginCert(path string) (*originCertInfo, error) {
	if path == "" {
		return nil, errors.New("cert.pem path unknown")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read cert: %w", err)
	}
	m := argoTokenBlockRE.FindSubmatch(data)
	if len(m) < 2 {
		return nil, errors.New("cert.pem does not contain an ARGO TUNNEL TOKEN block")
	}
	b64 := strings.Join(strings.Fields(string(m[1])), "")
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("decode token: %w", err)
	}
	var info originCertInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("parse token json: %w", err)
	}
	if info.APIToken == "" {
		return nil, errors.New("cert.pem token has no apiToken")
	}
	return &info, nil
}

// ------------------------------------------------------------------
// Zone listing
// ------------------------------------------------------------------

// Zone is the minimal Cloudflare zone representation surfaced to the UI.
type Zone struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListZones is best-effort: it returns the zones accessible to the
// user's logged-in cloudflared token. If the token is bound to a single
// zone it returns exactly that zone; otherwise it paginates the
// account-scoped list. Callers should tolerate an empty slice and allow
// the user to type the hostname manually.
func ListZones(ctx context.Context) ([]Zone, error) {
	info, err := readOriginCert(certPathFn())
	if err != nil {
		return nil, err
	}
	// Prefer the single-zone path if the cert is bound to one.
	if info.ZoneID != "" {
		if z, err := fetchZone(ctx, info.APIToken, info.ZoneID); err == nil {
			return []Zone{z}, nil
		}
		// Fall through: token-scoped zone may have been removed; try list.
	}
	return listZonesByAccount(ctx, info.APIToken, info.AccountID)
}

type zoneEnvelope struct {
	Success bool  `json:"success"`
	Errors  []any `json:"errors"`
	Result  Zone  `json:"result"`
}

type zonesEnvelope struct {
	Success    bool   `json:"success"`
	Errors     []any  `json:"errors"`
	Result     []Zone `json:"result"`
	ResultInfo struct {
		Page       int `json:"page"`
		TotalPages int `json:"total_pages"`
	} `json:"result_info"`
}

func fetchZone(ctx context.Context, token, zoneID string) (Zone, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		cloudflareAPIBase+"/zones/"+zoneID, nil)
	if err != nil {
		return Zone{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := httpAPIClient.Do(req)
	if err != nil {
		return Zone{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return Zone{}, fmt.Errorf("zone fetch HTTP %d", resp.StatusCode)
	}
	var env zoneEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return Zone{}, err
	}
	if !env.Success {
		return Zone{}, errors.New("cloudflare API returned success=false")
	}
	return env.Result, nil
}

func listZonesByAccount(ctx context.Context, token, accountID string) ([]Zone, error) {
	var out []Zone
	const maxPages = 20 // safety cap
	for page := 1; page <= maxPages; page++ {
		u := fmt.Sprintf("%s/zones?per_page=50&page=%d", cloudflareAPIBase, page)
		if accountID != "" {
			u += "&account.id=" + accountID
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return out, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := httpAPIClient.Do(req)
		if err != nil {
			return out, err
		}
		var env zonesEnvelope
		decErr := json.NewDecoder(resp.Body).Decode(&env)
		resp.Body.Close()
		if decErr != nil {
			return out, decErr
		}
		if !env.Success {
			return out, errors.New("cloudflare API returned success=false")
		}
		out = append(out, env.Result...)
		if env.ResultInfo.TotalPages == 0 || env.ResultInfo.Page >= env.ResultInfo.TotalPages {
			break
		}
	}
	return out, nil
}

// ------------------------------------------------------------------
// Hostname + tunnel-name helpers
// ------------------------------------------------------------------

var hostnameRE = regexp.MustCompile(
	`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)

// validateHostname returns a normalized (lowercased, trimmed) hostname
// or an error. Bounds length at 253 per DNS rules.
func validateHostname(h string) (string, error) {
	h = strings.TrimSpace(strings.ToLower(h))
	if h == "" {
		return "", errors.New("hostname is required")
	}
	if len(h) > 253 {
		return "", errors.New("hostname too long")
	}
	if !hostnameRE.MatchString(h) {
		return "", fmt.Errorf("invalid hostname: %q", h)
	}
	return h, nil
}

var slugRE = regexp.MustCompile(`[^a-z0-9]+`)

// tunnelNameFor generates a deterministic tunnel name from a hostname.
// Format: forge-<slug>-<hash8>. The hash suffix prevents collisions
// when two hostnames (e.g. "a.b.com" and "a-b.com") sanitize to the
// same slug.
func tunnelNameFor(hostname string) string {
	slug := strings.Trim(slugRE.ReplaceAllString(hostname, "-"), "-")
	if len(slug) > 40 {
		slug = slug[:40]
	}
	sum := sha256.Sum256([]byte(hostname))
	return "forge-" + slug + "-" + hex.EncodeToString(sum[:])[:8]
}

// ------------------------------------------------------------------
// cloudflared CLI wrappers
// ------------------------------------------------------------------

// tunnelListItem mirrors the subset of `cloudflared tunnel list --output
// json` fields we consume. Any additional fields are ignored.
type tunnelListItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func findExistingTunnel(ctx context.Context, name string) (*tunnelListItem, error) {
	out, err := cloudflaredRunner(ctx, "tunnel", "list", "--output", "json")
	if err != nil {
		return nil, fmt.Errorf("tunnel list: %w: %s", err, truncOutput(out))
	}
	var items []tunnelListItem
	// Use json.Decoder instead of json.Unmarshal so that we stop after the
	// first complete JSON value. Newer cloudflared versions append a
	// structured-log warning object after the array on the same output stream
	// (e.g. {"level":"warn","message":"Your version … is outdated"}), which
	// causes Unmarshal to fail with "invalid character '{' after top-level value".
	if err := json.NewDecoder(bytes.NewReader(out)).Decode(&items); err != nil {
		return nil, fmt.Errorf("parse tunnel list: %w (raw: %s)", err, truncOutput(out))
	}
	for i := range items {
		if items[i].Name == name {
			return &items[i], nil
		}
	}
	return nil, nil
}

type createOutput struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func createTunnel(ctx context.Context, name string) (*createOutput, error) {
	out, err := cloudflaredRunner(ctx, "tunnel", "create", "--output", "json", name)
	if err != nil {
		return nil, fmt.Errorf("tunnel create: %w: %s", err, truncOutput(out))
	}
	var co createOutput
	// Same decoder strategy as findExistingTunnel: cloudflared may append
	// version-warning JSON after the tunnel object on stdout/stderr.
	if err := json.NewDecoder(bytes.NewReader(out)).Decode(&co); err != nil {
		return nil, fmt.Errorf("parse create output: %w (raw: %s)", err, truncOutput(out))
	}
	if co.ID == "" {
		return nil, errors.New("cloudflared create returned empty tunnel id")
	}
	return &co, nil
}

// truncOutput keeps error messages readable when cloudflared dumps help text.
func truncOutput(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 400 {
		s = s[:400] + "…"
	}
	return s
}

// ------------------------------------------------------------------
// Filesystem layout
// ------------------------------------------------------------------

// defaultOriginCredentialsPath returns the standard location cloudflared
// writes `<uuid>.json` to after `tunnel create`.
func defaultOriginCredentialsPath(uuid string) string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cloudflared", uuid+".json")
}

// forgeTunnelPaths returns (configPath, credentialsPath) inside the
// Forge-managed tunnel directory.
func forgeTunnelPaths(uuid string) (configPath, credsPath string) {
	dir := DefaultForgeTunnelDir()
	return filepath.Join(dir, "config.yml"), filepath.Join(dir, uuid+".json")
}

func forgeTunnelStatePath() string {
	return filepath.Join(DefaultForgeTunnelDir(), "state.json")
}

// atomicWriteFile writes data to path via a tmpfile+rename. On Windows
// Rename won't overwrite, so we pre-remove the final path. Mode applies
// only on POSIX.
func atomicWriteFile(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".part"
	_ = os.Remove(tmp)
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Remove(path)
	return os.Rename(tmp, path)
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
		return err
	}
	tmp := dst + ".part"
	_ = os.Remove(tmp)
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

// renderConfigYAML produces the cloudflared config.yml contents. Uses
// forward-slash paths even on Windows — cloudflared's YAML parser
// accepts both but forward slashes avoid YAML escape-handling concerns.
func renderConfigYAML(uuid, credsPath, hostname string, localPort int) []byte {
	return []byte(fmt.Sprintf(
		"tunnel: %s\n"+
			"credentials-file: %s\n"+
			"no-autoupdate: true\n"+
			"ingress:\n"+
			"  - hostname: %s\n"+
			"    service: http://localhost:%d\n"+
			"  - service: http_status:404\n",
		uuid, filepath.ToSlash(credsPath), hostname, localPort,
	))
}

// ------------------------------------------------------------------
// Wizard state
// ------------------------------------------------------------------

// WizardState is the persisted/computed snapshot of setup progress.
// Written to `state.json` LAST so observing Created=true implies every
// prior artefact is present on disk.
type WizardState struct {
	Installed bool         `json:"installed"`
	LoggedIn  bool         `json:"loggedIn"`
	Created   bool         `json:"created"`
	Config    *NamedConfig `json:"config,omitempty"`
	LastError string       `json:"lastError,omitempty"`
	UpdatedAt time.Time    `json:"updatedAt,omitempty"`
}

// LoadWizardState returns the current wizard state. It combines
// file-existence signals (for Installed/LoggedIn, which are created by
// other flows) with the persisted state.json (the authoritative source
// for Created).
func LoadWizardState() WizardState {
	var st WizardState

	// Installed: cloudflared binary present anywhere we know about.
	st.Installed = ResolveManagedPath() != "" || ResolvePath() != ""

	// LoggedIn: cert.pem exists AND parses as an ARGO tunnel token.
	// File-existence alone would be a false positive for incompatible
	// cert.pem variants (older cloudflared, origin-cert-only files).
	if cp := certPathFn(); cp != "" {
		if _, err := readOriginCert(cp); err == nil {
			st.LoggedIn = true
		}
	}

	// Created: only if state.json exists AND referenced files are present.
	data, err := os.ReadFile(forgeTunnelStatePath())
	if err == nil {
		var persisted WizardState
		if json.Unmarshal(data, &persisted) == nil && persisted.Config != nil {
			_, credErr := os.Stat(persisted.Config.CredentialsPath)
			_, cfgErr := os.Stat(persisted.Config.ConfigPath)
			if credErr == nil && cfgErr == nil {
				st.Created = true
				st.Config = persisted.Config
			} else {
				st.LastError = "persisted tunnel config references missing files — re-run setup"
			}
		}
	}
	return st
}

func writeStateJSON(cfg NamedConfig) error {
	st := WizardState{
		Installed: true,
		LoggedIn:  true,
		Created:   true,
		Config:    &cfg,
		UpdatedAt: time.Now().UTC(),
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(forgeTunnelStatePath(), data, 0o600)
}

// ------------------------------------------------------------------
// CreateNamedTunnel — the orchestrating entry point
// ------------------------------------------------------------------

// SyncConfigPort rewrites config.yml (and state.json) when the persisted
// localPort no longer matches the current Forge listener port.  This
// happens when the user restarts Forge on a machine where the original
// port is now taken by something else.  The supervisor must be stopped
// before calling this; it reads the updated file on its next Start().
//
// Returns nil without touching any file when the port has not changed.
func SyncConfigPort(cfg *NamedConfig, newPort int) error {
	if cfg == nil || cfg.LocalPort == newPort {
		return nil
	}
	cfg.LocalPort = newPort
	// Regenerate config.yml with the corrected port.
	if err := atomicWriteFile(cfg.ConfigPath,
		renderConfigYAML(cfg.TunnelUUID, cfg.CredentialsPath, cfg.Hostname, newPort),
		0o600); err != nil {
		return fmt.Errorf("rewrite tunnel config.yml for port change: %w", err)
	}
	// Persist updated port in state.json so the next Forge restart also
	// gets the right value without needing to run this correction again.
	return writeStateJSON(*cfg)
}

// CreateNamedTunnel runs the full wizard: find-or-create tunnel, DNS
// route, copy credentials, write config.yml, write state.json. Safe to
// call repeatedly with the same hostname; returns the existing tunnel
// when local credentials are intact.
func CreateNamedTunnel(ctx context.Context, hostnameIn string, localPort int) (NamedConfig, error) {
	wizardMu.Lock()
	defer wizardMu.Unlock()

	hostname, err := validateHostname(hostnameIn)
	if err != nil {
		return NamedConfig{}, err
	}
	if localPort <= 0 || localPort > 65535 {
		return NamedConfig{}, fmt.Errorf("invalid local port: %d", localPort)
	}

	name := tunnelNameFor(hostname)

	// 1. Find-or-create tunnel.
	uuid, sourceCreds, err := resolveTunnel(ctx, name)
	if err != nil {
		return NamedConfig{}, err
	}

	// 2. DNS route. Only exit-0 counts as success — stderr-substring
	//    matching for "already exists" can mask the dangerous case where
	//    the record points at a different tunnel. Same-tunnel repeats
	//    normally return exit-0 already.
	if out, err := cloudflaredRunner(ctx, "tunnel", "route", "dns", uuid, hostname); err != nil {
		return NamedConfig{}, fmt.Errorf(
			"DNS route for %s failed — the record may already point elsewhere; "+
				"resolve in the Cloudflare dashboard then retry: %w: %s",
			hostname, err, truncOutput(out))
	}

	// 3. Copy credentials into the Forge-managed dir (idempotent).
	_, forgeCredsPath := forgeTunnelPaths(uuid)
	if sourceCreds != forgeCredsPath {
		if _, err := os.Stat(forgeCredsPath); err != nil {
			if err := copyFile(sourceCreds, forgeCredsPath, 0o600); err != nil {
				return NamedConfig{}, fmt.Errorf("copy credentials: %w", err)
			}
		}
	}

	// 4. Write config.yml atomically.
	configPath, _ := forgeTunnelPaths(uuid)
	if err := atomicWriteFile(configPath,
		renderConfigYAML(uuid, forgeCredsPath, hostname, localPort), 0o600); err != nil {
		return NamedConfig{}, fmt.Errorf("write config.yml: %w", err)
	}

	cfg := NamedConfig{
		TunnelUUID:      uuid,
		Hostname:        hostname,
		LocalPort:       localPort,
		ConfigPath:      configPath,
		CredentialsPath: forgeCredsPath,
	}

	// 5. state.json LAST — observers can rely on Created=true as a true
	//    postcondition.
	if err := writeStateJSON(cfg); err != nil {
		return NamedConfig{}, fmt.Errorf("write state.json: %w", err)
	}
	// 6. Harden perms on every file we just wrote. Non-fatal — a tight
	//    tunnel is still better than refusing to ship at all if icacls
	//    is missing; the caller can surface the warning.
	_ = HardenTunnelDir()
	return cfg, nil
}

// resolveTunnel returns (uuid, sourceCredsPath) for the given tunnel
// name, creating the tunnel if necessary. If an existing tunnel is
// found but local credentials are missing, it returns an explicit
// adopt-error rather than silently proceeding to a broken state.
func resolveTunnel(ctx context.Context, name string) (string, string, error) {
	existing, err := findExistingTunnel(ctx, name)
	if err != nil {
		return "", "", err
	}
	if existing != nil {
		return reuseTunnel(existing, name)
	}

	co, err := createTunnel(ctx, name)
	if err != nil {
		// Race: another process just created the same name. Retry list.
		if strings.Contains(err.Error(), "already exists") {
			retry, err2 := findExistingTunnel(ctx, name)
			if err2 != nil || retry == nil {
				return "", "", err
			}
			return reuseTunnel(retry, name)
		}
		return "", "", err
	}
	return co.ID, defaultOriginCredentialsPath(co.ID), nil
}

func reuseTunnel(t *tunnelListItem, name string) (string, string, error) {
	// Prefer the original-location creds; fall back to a previously
	// migrated Forge-managed copy if the user has re-run setup before.
	candidates := []string{
		defaultOriginCredentialsPath(t.ID),
	}
	if _, forgeCreds := forgeTunnelPaths(t.ID); forgeCreds != "" {
		candidates = append(candidates, forgeCreds)
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return t.ID, c, nil
		}
	}
	return "", "", fmt.Errorf(
		"tunnel %q already exists in your Cloudflare account but its credentials "+
			"file is not present on this machine — either delete it with "+
			"`cloudflared tunnel delete %s` or re-run login on the machine that created it",
		name, t.ID)
}
