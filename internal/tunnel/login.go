package tunnel

// Package tunnel — Headless-safe cloudflared login session.
//
// `cloudflared tunnel login` exists to trade a short-lived OAuth flow
// for a long-lived `cert.pem` on disk. By default it prints the auth
// URL and *tries* to open the user's browser. In Forge we run on
// servers, containers, and headless SSH sessions where that browser
// launch is useless or outright wrong — we need the URL extracted and
// returned over HTTP so the UI can render a copy-paste fallback.
//
// Design:
//   - LoginSession owns one `cloudflared tunnel login` child process
//     plus a goroutine that scans its stdout+stderr for an auth URL.
//   - The auth URL is published via an atomic-ish getter protected by
//     the session mutex, and a one-shot channel the handler blocks on
//     for up to ~10s so the first HTTP response already carries it.
//   - Completion is detected by watching the cert file: we snapshot
//     its pre-spawn (mtime,size) and treat a change-after-start as
//     success. This avoids the "cert already exists from a previous
//     login" false positive.
//   - A single global deadline (default 10 minutes) bounds the whole
//     session. Cancel() kills only the cloudflared process (not its
//     browser descendants — login intentionally spawns a browser and
//     ripping it out of the user's session would be rude).

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

// LoginStatus is the coarse lifecycle state of a LoginSession.
type LoginStatus string

const (
	LoginStatusRunning   LoginStatus = "running"
	LoginStatusSuccess   LoginStatus = "success"
	LoginStatusError     LoginStatus = "error"
	LoginStatusTimeout   LoginStatus = "timeout"
	LoginStatusCancelled LoginStatus = "cancelled"
)

// defaultLoginDeadline is how long the session waits for cert.pem to
// materialise before giving up. 10 minutes is long enough to cover
// "paste URL into phone, find a 2FA code, log in" without leaving a
// runaway child forever.
const defaultLoginDeadline = 10 * time.Minute

// ErrLoginInFlight is returned by the handler when a second StartLogin
// is requested while an earlier one is still running.
var ErrLoginInFlight = errors.New("cloudflared login already in progress")

// strictAuthURLPattern matches the two hostnames cloudflared actually
// prints during `tunnel login`. We prefer this to a generic https://
// match because a stray docs link in the output would otherwise be
// latched onto.
var strictAuthURLPattern = regexp.MustCompile(
	`https?://(?:dash\.cloudflare\.com|login\.cloudflareaccess\.com)/[^\s'"]+`,
)

// looseAuthURLPattern is the fallback — used only when no strict match
// is seen within the loose grace period. Captures the first https://
// URL on any line that also mentions "browser" or "open" to reduce
// false positives.
var looseAuthURLPattern = regexp.MustCompile(
	`(?i)(?:browser|open)[^\n]*?(https?://\S+)`,
)

// commander is the minimal subset of *exec.Cmd the LoginSession needs.
// Tests supply a fake commander that never spawns a real binary.
type commander interface {
	Start() error
	Wait() error
	StdoutPipe() (io.ReadCloser, error)
	StderrPipe() (io.ReadCloser, error)
	Kill() error
}

// realCmd adapts *exec.Cmd to the commander interface.
type realCmd struct{ c *exec.Cmd }

func (r *realCmd) Start() error                         { return r.c.Start() }
func (r *realCmd) Wait() error                          { return r.c.Wait() }
func (r *realCmd) StdoutPipe() (io.ReadCloser, error)   { return r.c.StdoutPipe() }
func (r *realCmd) StderrPipe() (io.ReadCloser, error)   { return r.c.StderrPipe() }
func (r *realCmd) Kill() error {
	if r.c.Process == nil {
		return nil
	}
	return r.c.Process.Kill()
}

// newLoginCommand is the factory used at runtime; tests override this
// var to supply a fake commander.
var newLoginCommand = func(ctx context.Context, bin string) commander {
	cmd := exec.CommandContext(ctx, bin, "tunnel", "login")
	hideWindow(cmd)
	return &realCmd{c: cmd}
}

// certPathFn resolves the location of the cloudflared cert.pem. The
// default is ~/.cloudflared/cert.pem; tests override this.
var certPathFn = defaultCertPath

// resolvePathOverride lets tests swap out ResolvePath() so StartLogin
// can succeed without a real cloudflared on disk. Prod always uses the
// real ResolvePath.
var resolvePathOverride func() string

func defaultCertPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".cloudflared", "cert.pem")
}

// LoginSession is the supervisor for a single `cloudflared tunnel
// login` invocation.
type LoginSession struct {
	mu       sync.Mutex
	status   LoginStatus
	authURL  string
	certPath string // set on success
	lastErr  string
	startTS  time.Time

	authURLReady chan struct{} // closed once authURL is populated
	done         chan struct{} // closed when the session reaches a terminal state

	cancel context.CancelFunc
	cmd    commander
}

// Snapshot is the lock-safe view of a LoginSession used by HTTP
// handlers; capture once and marshal.
type LoginSnapshot struct {
	Status    LoginStatus `json:"status"`
	AuthURL   string      `json:"authURL,omitempty"`
	CertPath  string      `json:"certPath,omitempty"`
	Error     string      `json:"error,omitempty"`
	StartedAt time.Time   `json:"startedAt,omitempty"`
}

// certStat captures the two fields we use to detect "cert changed
// after spawn". Zero value means "file did not exist".
type certStat struct {
	exists bool
	mtime  time.Time
	size   int64
}

func snapshotCert(path string) certStat {
	if path == "" {
		return certStat{}
	}
	fi, err := os.Stat(path)
	if err != nil {
		return certStat{}
	}
	return certStat{exists: true, mtime: fi.ModTime(), size: fi.Size()}
}

func (a certStat) changedSince(b certStat) bool {
	// Cert newly created after spawn -> changed.
	if a.exists && !b.exists {
		return true
	}
	if !a.exists {
		return false
	}
	return !a.mtime.Equal(b.mtime) || a.size != b.size
}

// StartLogin spawns `cloudflared tunnel login` and returns a session
// handle. The handler should Wait(authURL grace) before responding so
// the caller's first HTTP response already carries the auth URL.
//
// If cloudflared is not installed this returns an error immediately.
// If the cert file already exists at session start, that pre-existing
// state is snapshotted but NOT treated as instant success — the session
// must produce a modification after the child is spawned.
func StartLogin(parent context.Context) (*LoginSession, error) {
	bin := ""
	if resolvePathOverride != nil {
		bin = resolvePathOverride()
	} else {
		bin = ResolvePath()
	}
	if bin == "" {
		return nil, errors.New("cloudflared not installed")
	}

	ctx, cancel := context.WithCancel(parent)
	cmd := newLoginCommand(ctx, bin)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	certPath := certPathFn()
	certBefore := snapshotCert(certPath)

	s := &LoginSession{
		status:       LoginStatusRunning,
		startTS:      time.Now(),
		authURLReady: make(chan struct{}),
		done:         make(chan struct{}),
		cancel:       cancel,
		cmd:          cmd,
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start cloudflared: %w", err)
	}

	go s.scanPipe(stdout, "stdout")
	go s.scanPipe(stderr, "stderr")
	go s.supervise(ctx, certPath, certBefore, defaultLoginDeadline)

	return s, nil
}

// scanPipe reads from a child pipe line by line, feeding each line to
// the auth-URL matcher. Exits when the pipe EOFs (child exit).
func (s *LoginSession) scanPipe(r io.ReadCloser, _ string) {
	defer r.Close()
	sc := bufio.NewScanner(r)
	// cloudflared can emit fairly long URLs; default bufio max is 64K
	// which is plenty, but bump anyway to be safe.
	sc.Buffer(make([]byte, 0, 8*1024), 256*1024)
	for sc.Scan() {
		s.tryMatchAuthURL(sc.Text())
	}
}

// tryMatchAuthURL updates authURL on the first successful match. Only
// the first match wins — later ones are ignored so a transient log
// message can't swap the URL mid-session.
func (s *LoginSession) tryMatchAuthURL(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.authURL != "" {
		return
	}
	if m := strictAuthURLPattern.FindString(line); m != "" {
		s.authURL = m
		close(s.authURLReady)
		return
	}
	if m := looseAuthURLPattern.FindStringSubmatch(line); len(m) >= 2 {
		s.authURL = m[1]
		close(s.authURLReady)
		return
	}
}

// supervise waits for whichever of these happens first:
//   - cert.pem changes (success)
//   - child exits (error, unless cert also changed in the same tick)
//   - parent context is cancelled (cancelled)
//   - deadline elapses (timeout)
//
// In the success path it gives the child a short grace period to exit
// cleanly before force-killing it, so we don't leak a zombie.
func (s *LoginSession) supervise(ctx context.Context, certPath string, certBefore certStat, deadline time.Duration) {
	defer close(s.done)

	timer := time.NewTimer(deadline)
	defer timer.Stop()

	poll := time.NewTicker(1 * time.Second)
	defer poll.Stop()

	waitCh := make(chan error, 1)
	go func() { waitCh <- s.cmd.Wait() }()

	// observeSuccess transitions the session to success, giving the
	// child up to 3s to exit on its own before force-killing it.
	observeSuccess := func() {
		s.mu.Lock()
		if s.status == LoginStatusRunning {
			s.status = LoginStatusSuccess
			s.certPath = certPath
		}
		s.mu.Unlock()

		select {
		case <-waitCh:
		case <-time.After(3 * time.Second):
			_ = s.cmd.Kill()
			<-waitCh
		}
	}

	for {
		select {
		case <-ctx.Done():
			// Context cancelled — either the caller explicitly
			// Cancel()'d us, or the parent shut down. Either way we
			// distinguish by looking at s.status later; the common
			// path marks cancelled here.
			_ = s.cmd.Kill()
			<-waitCh
			s.mu.Lock()
			if s.status == LoginStatusRunning {
				s.status = LoginStatusCancelled
				s.lastErr = "login cancelled"
			}
			s.mu.Unlock()
			s.ensureAuthURLReady()
			return

		case <-timer.C:
			_ = s.cmd.Kill()
			<-waitCh
			s.mu.Lock()
			if s.status == LoginStatusRunning {
				s.status = LoginStatusTimeout
				s.lastErr = fmt.Sprintf("login did not complete within %s", deadline)
			}
			s.mu.Unlock()
			s.ensureAuthURLReady()
			return

		case err := <-waitCh:
			// Child exited before we observed a cert change. Check
			// once more in case the cert landed in the same instant.
			after := snapshotCert(certPath)
			if after.changedSince(certBefore) {
				s.mu.Lock()
				s.status = LoginStatusSuccess
				s.certPath = certPath
				s.mu.Unlock()
				s.ensureAuthURLReady()
				return
			}
			s.mu.Lock()
			if s.status == LoginStatusRunning {
				s.status = LoginStatusError
				if err != nil {
					s.lastErr = fmt.Sprintf("cloudflared exited: %v", err)
				} else {
					s.lastErr = "cloudflared exited before login completed"
				}
			}
			s.mu.Unlock()
			s.ensureAuthURLReady()
			return

		case <-poll.C:
			if snapshotCert(certPath).changedSince(certBefore) {
				observeSuccess()
				s.ensureAuthURLReady()
				return
			}
		}
	}
}

// ensureAuthURLReady closes the authURLReady channel on terminal exit
// paths where no URL was ever captured, so WaitForAuthURL callers
// unblock instead of hanging.
func (s *LoginSession) ensureAuthURLReady() {
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.authURLReady:
	default:
		close(s.authURLReady)
	}
}

// WaitForAuthURL blocks until either (a) the auth URL has been
// captured, (b) the session exits without ever producing one, or (c)
// the supplied timeout elapses. The returned bool is true iff an auth
// URL is available in the session.
func (s *LoginSession) WaitForAuthURL(timeout time.Duration) bool {
	select {
	case <-s.authURLReady:
		return s.AuthURL() != ""
	case <-time.After(timeout):
		return s.AuthURL() != ""
	}
}

// AuthURL returns the auth URL or "" if not yet captured.
func (s *LoginSession) AuthURL() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.authURL
}

// Snapshot returns a lock-safe view of the session for HTTP responses.
func (s *LoginSession) Snapshot() LoginSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return LoginSnapshot{
		Status:    s.status,
		AuthURL:   s.authURL,
		CertPath:  s.certPath,
		Error:     s.lastErr,
		StartedAt: s.startTS,
	}
}

// Done returns a channel that is closed when the session has reached a
// terminal state.
func (s *LoginSession) Done() <-chan struct{} { return s.done }

// Cancel terminates the cloudflared login process. Idempotent. The
// session transitions to LoginStatusCancelled if it was still running.
func (s *LoginSession) Cancel() {
	if s.cancel != nil {
		s.cancel()
	}
}

// IsTerminal reports whether the session has reached a terminal state.
func (s *LoginSession) IsTerminal() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status != LoginStatusRunning
}
