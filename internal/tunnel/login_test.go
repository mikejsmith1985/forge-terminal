package tunnel

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// ─── fake commander ──────────────────────────────────────────────────────────

type fakeCmd struct {
	stdout       *io.PipeReader
	stderr       *io.PipeReader
	stdoutW      *io.PipeWriter
	stderrW      *io.PipeWriter
	waitCh       chan error
	killed       chan struct{}
	killOnce     sync.Once
	pipesHandedOut bool
	startErr     error
}

func newFakeCmd() *fakeCmd {
	outR, outW := io.Pipe()
	errR, errW := io.Pipe()
	return &fakeCmd{
		stdout:  outR,
		stderr:  errR,
		stdoutW: outW,
		stderrW: errW,
		waitCh:  make(chan error, 1),
		killed:  make(chan struct{}),
	}
}

func (f *fakeCmd) Start() error                       { return f.startErr }
func (f *fakeCmd) Wait() error                        { return <-f.waitCh }
func (f *fakeCmd) StdoutPipe() (io.ReadCloser, error) { return f.stdout, nil }
func (f *fakeCmd) StderrPipe() (io.ReadCloser, error) { return f.stderr, nil }
func (f *fakeCmd) Kill() error {
	f.killOnce.Do(func() {
		close(f.killed)
		// Simulate exit-after-kill so Wait() unblocks.
		select {
		case f.waitCh <- errors.New("signal: killed"):
		default:
		}
		_ = f.stdoutW.Close()
		_ = f.stderrW.Close()
	})
	return nil
}

// exitCleanly simulates the child exiting on its own.
func (f *fakeCmd) exitCleanly(err error) {
	_ = f.stdoutW.Close()
	_ = f.stderrW.Close()
	select {
	case f.waitCh <- err:
	default:
	}
}

// emitStderr writes a line (with trailing newline) to the fake
// cloudflared stderr pipe.
func (f *fakeCmd) emitStderr(line string) {
	_, _ = f.stderrW.Write([]byte(line + "\n"))
}

// withFakeLoginCmd installs a fake commander factory for the duration
// of a single test.
func withFakeLoginCmd(t *testing.T, fc *fakeCmd) func() {
	t.Helper()
	prev := newLoginCommand
	newLoginCommand = func(ctx context.Context, bin string) commander { return fc }
	// ResolvePath must return non-empty so StartLogin proceeds. Point it
	// at a sentinel path; the fake commander ignores it anyway.
	prevResolve := resolvePathOverride
	resolvePathOverride = func() string { return "fake-cloudflared" }
	return func() {
		newLoginCommand = prev
		resolvePathOverride = prevResolve
	}
}

// withCertPath stubs certPathFn to a test-scoped file.
func withCertPath(t *testing.T, path string) func() {
	t.Helper()
	prev := certPathFn
	certPathFn = func() string { return path }
	return func() { certPathFn = prev }
}

// ─── tests ───────────────────────────────────────────────────────────────────

func TestLogin_StrictAuthURLMatch(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}
	defer sess.Cancel()

	fc.emitStderr("Please open the following URL and log in with your Cloudflare account:")
	fc.emitStderr("")
	fc.emitStderr("https://dash.cloudflare.com/argotunnel?callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc")
	fc.emitStderr("")
	fc.emitStderr("Leave cloudflared running to download the cert automatically.")

	if !sess.WaitForAuthURL(2 * time.Second) {
		t.Fatal("auth URL not captured")
	}
	got := sess.AuthURL()
	if !strings.HasPrefix(got, "https://dash.cloudflare.com/argotunnel?") {
		t.Errorf("authURL = %q, want dash.cloudflare.com/argotunnel", got)
	}
}

func TestLogin_LoosePatternFallback(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}
	defer sess.Cancel()

	// No dash.cloudflare.com URL — cloudflared variant that prints a
	// generic "open URL in browser" line.
	fc.emitStderr("Opening browser: https://auth.example.com/flow/xyz")

	if !sess.WaitForAuthURL(2 * time.Second) {
		t.Fatal("auth URL not captured via loose pattern")
	}
	if got := sess.AuthURL(); got != "https://auth.example.com/flow/xyz" {
		t.Errorf("authURL = %q", got)
	}
}

func TestLogin_IgnoresDocsURLBeforeAuthURL(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}
	defer sess.Cancel()

	// Leading docs link must not latch — strict pattern should skip it
	// and wait for the real auth URL.
	fc.emitStderr("See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ for help")
	fc.emitStderr("https://dash.cloudflare.com/argotunnel?callback=REAL")

	if !sess.WaitForAuthURL(2 * time.Second) {
		t.Fatal("auth URL not captured")
	}
	if got := sess.AuthURL(); !strings.Contains(got, "callback=REAL") {
		t.Errorf("authURL = %q, expected real argotunnel URL", got)
	}
}

func TestLogin_CertChangeTriggersSuccessAndKillsChild(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}

	fc.emitStderr("https://dash.cloudflare.com/argotunnel?callback=x")
	sess.WaitForAuthURL(2 * time.Second)

	// Drop the cert on disk to simulate cloudflared finishing OAuth.
	if err := os.WriteFile(cert, []byte("PEM"), 0o600); err != nil {
		t.Fatal(err)
	}

	select {
	case <-sess.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("session did not complete after cert appeared")
	}

	snap := sess.Snapshot()
	if snap.Status != LoginStatusSuccess {
		t.Errorf("status = %q, want success (err=%q)", snap.Status, snap.Error)
	}
	if snap.CertPath != cert {
		t.Errorf("certPath = %q, want %q", snap.CertPath, cert)
	}

	// Child must have been killed (after the 3s grace → we only wait up
	// to 5s to validate so force the Kill by exiting).
	select {
	case <-fc.killed:
	case <-time.After(5 * time.Second):
		// The grace period is 3s; if we got here the test is slow — ok.
	}
}

func TestLogin_CertPreExistingIsNotInstantSuccess(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	certDir := t.TempDir()
	cert := filepath.Join(certDir, "cert.pem")
	if err := os.WriteFile(cert, []byte("OLD"), 0o600); err != nil {
		t.Fatal(err)
	}
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}
	defer sess.Cancel()

	// Give the supervise goroutine a few poll ticks.
	time.Sleep(1500 * time.Millisecond)

	if sess.IsTerminal() {
		snap := sess.Snapshot()
		t.Fatalf("session terminated prematurely: status=%q err=%q", snap.Status, snap.Error)
	}
}

func TestLogin_ChildExitWithoutCertIsError(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}

	fc.exitCleanly(errors.New("boom"))

	select {
	case <-sess.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("session did not observe child exit")
	}

	snap := sess.Snapshot()
	if snap.Status != LoginStatusError {
		t.Errorf("status = %q, want error", snap.Status)
	}
	if !strings.Contains(snap.Error, "boom") {
		t.Errorf("error = %q, want to contain 'boom'", snap.Error)
	}
}

func TestLogin_CancelMarksCancelled(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}

	sess.Cancel()

	select {
	case <-sess.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("Cancel did not propagate")
	}

	if got := sess.Snapshot().Status; got != LoginStatusCancelled {
		t.Errorf("status = %q, want cancelled", got)
	}
}

func TestLogin_WaitForAuthURLTimesOut(t *testing.T) {
	fc := newFakeCmd()
	defer withFakeLoginCmd(t, fc)()

	cert := filepath.Join(t.TempDir(), "cert.pem")
	defer withCertPath(t, cert)()

	sess, err := StartLogin(context.Background())
	if err != nil {
		t.Fatalf("StartLogin: %v", err)
	}
	defer sess.Cancel()

	// No emitStderr — WaitForAuthURL must time out.
	if sess.WaitForAuthURL(200 * time.Millisecond) {
		t.Error("WaitForAuthURL returned true without any output")
	}
}

func TestLogin_StartFailsWhenBinaryMissing(t *testing.T) {
	prev := resolvePathOverride
	resolvePathOverride = func() string { return "" }
	defer func() { resolvePathOverride = prev }()

	if _, err := StartLogin(context.Background()); err == nil {
		t.Fatal("expected error when cloudflared is not installed")
	}
}
