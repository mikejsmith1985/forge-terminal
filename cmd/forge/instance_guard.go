// instance_guard.go — single-instance startup guard for the Forge server.
//
// Field defect this prevents: launching a new Forge binary while an old one was
// still running used to fall through silently to the next preferred port. The
// result was two full instances running side by side for weeks — the stale old
// binary kept the vault/companion port (3005) and its unfixed background spawns
// kept stealing keyboard focus, while the new binary served the UI on 8333 and
// shared ~/.forge state with its zombie twin. The guard detects the running
// instance, asks it to exit gracefully when this binary is a different version
// (the update path), and otherwise defers to it instead of split-braining.
//
// Framework-first note: /api/shutdown already exists but only restarts terminal
// sessions — it never exits the process, so a real exit endpoint is a documented
// gap and /api/instance/exit is added here.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

// browserLaunchGrace gives openBrowser's fire-and-forget "cmd /c start" child
// time to launch before this duplicate process exits.
const browserLaunchGrace = 1500 * time.Millisecond

// deferToRunningInstance opens the browser at the already-running Forge instance
// and returns so this duplicate process can exit — mirroring the "second launch
// focuses the existing window" convention of desktop applications.
func deferToRunningInstance(instance runningForgeInstance) {
	log.Printf("[Instance Guard] Forge v%s is already running at http://%s:%d — opening it and exiting. Close it first if you meant to run this binary (v%s).",
		instance.Version, instance.Host, instance.Port, updater.GetVersion())
	if os.Getenv("NO_BROWSER") != "" {
		return
	}
	openBrowser(fmt.Sprintf("http://%s:%d", instance.Host, instance.Port))
	time.Sleep(browserLaunchGrace)
}

// instanceProbeTimeout bounds how long startup waits for a busy port to answer
// the Forge identity probe before treating it as a non-Forge service.
const instanceProbeTimeout = 2 * time.Second

// portReleaseTimeout bounds how long a takeover waits for the old instance to
// exit and free its port before giving up and deferring to it.
const portReleaseTimeout = 8 * time.Second

// portReleasePollInterval is the delay between bind attempts during a takeover.
const portReleasePollInterval = 250 * time.Millisecond

// exitReplyGrace is how long handleInstanceExit waits after replying before the
// process exits, so the HTTP response reaches the requesting new instance.
const exitReplyGrace = 300 * time.Millisecond

// runningForgeInstance describes an already-running Forge server discovered on a
// preferred port during startup.
type runningForgeInstance struct {
	Host    string
	Port    int
	Version string
}

// forgeAlreadyRunningError tells main() that startup should defer to an existing
// Forge instance instead of binding a different port next to it.
type forgeAlreadyRunningError struct {
	Instance runningForgeInstance
}

// Error describes the conflict for logs.
func (alreadyRunning *forgeAlreadyRunningError) Error() string {
	return fmt.Sprintf("forge v%s is already running on %s:%d",
		alreadyRunning.Instance.Version, alreadyRunning.Instance.Host, alreadyRunning.Instance.Port)
}

// newInstanceProbeClient returns the short-timeout HTTP client used for all
// startup identity probes against loopback ports.
func newInstanceProbeClient() *http.Client {
	return &http.Client{Timeout: instanceProbeTimeout}
}

// probeHostFor maps a wildcard bind host to a loopback address that can actually
// be dialed for the identity probe.
func probeHostFor(bindHost string) string {
	if bindHost == "0.0.0.0" || bindHost == "::" {
		return "127.0.0.1"
	}
	return bindHost
}

// detectForgeInstance reports whether a Forge server is answering on host:port,
// identified by a JSON /api/version response carrying a non-empty version.
func detectForgeInstance(httpClient *http.Client, host string, port int) (runningForgeInstance, bool) {
	none := runningForgeInstance{}
	response, requestErr := httpClient.Get(fmt.Sprintf("http://%s:%d/api/version", host, port))
	if requestErr != nil {
		return none, false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return none, false
	}

	var versionPayload struct {
		Version string `json:"version"`
	}
	if decodeErr := json.NewDecoder(response.Body).Decode(&versionPayload); decodeErr != nil {
		return none, false
	}
	if versionPayload.Version == "" {
		return none, false
	}
	return runningForgeInstance{Host: host, Port: port, Version: versionPayload.Version}, true
}

// requestInstanceExit asks an already-running Forge instance to shut down
// gracefully. Older versions without the endpoint return an error, which the
// caller treats as "cannot take over — defer to the running instance".
func requestInstanceExit(httpClient *http.Client, host string, port int) error {
	response, requestErr := httpClient.Post(
		fmt.Sprintf("http://%s:%d/api/instance/exit", host, port), "application/json", nil)
	if requestErr != nil {
		return requestErr
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return fmt.Errorf("instance exit endpoint answered %d (older version without graceful takeover?)", response.StatusCode)
	}
	return nil
}

// claimReleasedPort polls until the port becomes bindable (returning the live
// listener so no other process can race in) or the timeout passes.
func claimReleasedPort(host string, port int, timeout time.Duration) (net.Listener, bool) {
	deadline := time.Now().Add(timeout)
	for {
		listener, listenErr := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))
		if listenErr == nil {
			return listener, true
		}
		if time.Now().After(deadline) {
			return nil, false
		}
		time.Sleep(portReleasePollInterval)
	}
}

// resolvePreferredPortConflict decides what to do about a busy preferred port:
//   - not a Forge instance      → (nil, nil): fall through to the next port
//   - same version already runs → forgeAlreadyRunningError: defer (duplicate launch)
//   - different version runs    → graceful takeover; on success the claimed
//     listener is returned, otherwise defer to the running instance
func resolvePreferredPortConflict(httpClient *http.Client, bindHost string, port int, currentVersion string) (net.Listener, error) {
	probeHost := probeHostFor(bindHost)
	instance, isForge := detectForgeInstance(httpClient, probeHost, port)
	if !isForge {
		return nil, nil
	}

	if instance.Version == currentVersion {
		return nil, &forgeAlreadyRunningError{Instance: instance}
	}

	log.Printf("[Instance Guard] Forge v%s holds port %d but this binary is v%s — requesting graceful exit for takeover",
		instance.Version, port, currentVersion)
	if exitErr := requestInstanceExit(httpClient, probeHost, port); exitErr != nil {
		log.Printf("[Instance Guard] Graceful takeover unavailable (%v) — deferring to the running instance", exitErr)
		return nil, &forgeAlreadyRunningError{Instance: instance}
	}

	listener, wasClaimed := claimReleasedPort(bindHost, port, portReleaseTimeout)
	if !wasClaimed {
		log.Printf("[Instance Guard] Old instance did not release port %d in time — deferring to it", port)
		return nil, &forgeAlreadyRunningError{Instance: instance}
	}
	log.Printf("[Instance Guard] Took over port %d from Forge v%s", port, instance.Version)
	return listener, nil
}

// handleInstanceExit lets a newer Forge binary ask this instance to shut down
// cleanly (sessions closed first) so it can take over the port. POST only.
func handleInstanceExit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	closedSessionCount := 0
	if termHandler != nil {
		closedSessionCount = termHandler.CloseAllSessions()
	}
	log.Printf("[Instance Guard] Exit requested by a newer instance — closed %d sessions, shutting down", closedSessionCount)

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"exiting","closedSessions":%d}`, closedSessionCount)

	// Exit shortly after the reply is flushed so the requester sees the 200.
	go func() {
		time.Sleep(exitReplyGrace)
		os.Exit(0)
	}()
}
