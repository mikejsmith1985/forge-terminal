// instance_guard_test.go — unit tests for the single-instance startup guard.
// The guard exists because a second Forge launch used to fall through silently to
// the next preferred port, leaving a stale older binary running side by side with
// the new one (split-brain vault/companion state, unsuppressed console spawns).
package main

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

// startFakeForgeServer runs an httptest server that answers /api/version like a
// real Forge instance and reports whether /api/instance/exit was called.
func startFakeForgeServer(t *testing.T, version string, hasExitEndpoint bool) (host string, port int, wasExitRequested *bool) {
	t.Helper()
	exitRequested := false

	mux := http.NewServeMux()
	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":%q,"latestGitTag":""}`, version)
	})
	if hasExitEndpoint {
		mux.HandleFunc("/api/instance/exit", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			exitRequested = true
			w.Write([]byte(`{"status":"exiting"}`))
		})
	}

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	serverHost, serverPortText, splitErr := net.SplitHostPort(server.Listener.Addr().String())
	if splitErr != nil {
		t.Fatalf("failed to parse fake server address: %v", splitErr)
	}
	serverPort, _ := strconv.Atoi(serverPortText)
	return serverHost, serverPort, &exitRequested
}

func TestDetectForgeInstance_RecognisesForgeVersionEndpoint(t *testing.T) {
	host, port, _ := startFakeForgeServer(t, "7.23.4", false)

	instance, isForge := detectForgeInstance(newInstanceProbeClient(), host, port)

	if !isForge {
		t.Fatal("expected a Forge instance to be detected")
	}
	if instance.Version != "7.23.4" {
		t.Fatalf("expected version 7.23.4, got %q", instance.Version)
	}
}

func TestDetectForgeInstance_RejectsNonForgeService(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html>some other app</html>"))
	}))
	t.Cleanup(server.Close)
	host, portText, _ := net.SplitHostPort(server.Listener.Addr().String())
	port, _ := strconv.Atoi(portText)

	if _, isForge := detectForgeInstance(newInstanceProbeClient(), host, port); isForge {
		t.Fatal("a non-Forge HTTP service must not be detected as Forge")
	}
}

func TestDetectForgeInstance_RejectsUnreachablePort(t *testing.T) {
	// Grab a port and immediately release it so nothing is listening there.
	listener, listenErr := net.Listen("tcp", "127.0.0.1:0")
	if listenErr != nil {
		t.Fatal(listenErr)
	}
	_, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	listener.Close()

	if _, isForge := detectForgeInstance(newInstanceProbeClient(), "127.0.0.1", port); isForge {
		t.Fatal("an unreachable port must not be detected as Forge")
	}
}

func TestRequestInstanceExit_PostsToExitEndpoint(t *testing.T) {
	host, port, wasExitRequested := startFakeForgeServer(t, "7.23.4", true)

	if err := requestInstanceExit(newInstanceProbeClient(), host, port); err != nil {
		t.Fatalf("expected graceful exit request to succeed, got %v", err)
	}
	if !*wasExitRequested {
		t.Fatal("expected POST /api/instance/exit to be called")
	}
}

func TestRequestInstanceExit_FailsWhenEndpointMissing(t *testing.T) {
	// Older Forge versions have no /api/instance/exit — the request must error
	// so the guard falls back to deferring to the running instance.
	host, port, _ := startFakeForgeServer(t, "7.23.4", false)

	if err := requestInstanceExit(newInstanceProbeClient(), host, port); err == nil {
		t.Fatal("expected an error when the exit endpoint is missing (older instance)")
	}
}

func TestResolvePreferredPortConflict_SameVersionDefersToRunningInstance(t *testing.T) {
	host, port, wasExitRequested := startFakeForgeServer(t, "7.24.0", true)

	listener, guardErr := resolvePreferredPortConflict(newInstanceProbeClient(), host, port, "7.24.0")

	if listener != nil {
		t.Fatal("a duplicate launch of the same version must not take over the port")
	}
	if _, isAlreadyRunning := guardErr.(*forgeAlreadyRunningError); !isAlreadyRunning {
		t.Fatalf("expected forgeAlreadyRunningError, got %v", guardErr)
	}
	if *wasExitRequested {
		t.Fatal("a same-version duplicate must never ask the running instance to exit")
	}
}

func TestResolvePreferredPortConflict_OlderInstanceWithoutExitEndpointDefers(t *testing.T) {
	host, port, _ := startFakeForgeServer(t, "7.23.4", false)

	listener, guardErr := resolvePreferredPortConflict(newInstanceProbeClient(), host, port, "7.24.0")

	if listener != nil {
		t.Fatal("takeover must not be reported when the old instance cannot exit")
	}
	alreadyRunning, isAlreadyRunning := guardErr.(*forgeAlreadyRunningError)
	if !isAlreadyRunning {
		t.Fatalf("expected forgeAlreadyRunningError, got %v", guardErr)
	}
	if alreadyRunning.Instance.Version != "7.23.4" {
		t.Fatalf("error must carry the running instance's version, got %q", alreadyRunning.Instance.Version)
	}
}

func TestResolvePreferredPortConflict_NonForgeServiceFallsThrough(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not forge"))
	}))
	t.Cleanup(server.Close)
	host, portText, _ := net.SplitHostPort(server.Listener.Addr().String())
	port, _ := strconv.Atoi(portText)

	listener, guardErr := resolvePreferredPortConflict(newInstanceProbeClient(), host, port, "7.24.0")

	if listener != nil || guardErr != nil {
		t.Fatalf("a non-Forge service must fall through to the next port (nil, nil), got %v, %v", listener, guardErr)
	}
}

func TestClaimReleasedPort_SucceedsWhenPortIsFree(t *testing.T) {
	listener, listenErr := net.Listen("tcp", "127.0.0.1:0")
	if listenErr != nil {
		t.Fatal(listenErr)
	}
	_, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	listener.Close()

	claimed, wasClaimed := claimReleasedPort("127.0.0.1", port, 50*time.Millisecond)
	if !wasClaimed {
		t.Fatal("expected a free port to be claimed immediately")
	}
	claimed.Close()
}

func TestClaimReleasedPort_GivesUpWhenPortStaysBusy(t *testing.T) {
	listener, listenErr := net.Listen("tcp", "127.0.0.1:0")
	if listenErr != nil {
		t.Fatal(listenErr)
	}
	defer listener.Close()
	_, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)

	if _, wasClaimed := claimReleasedPort("127.0.0.1", port, 5*time.Millisecond); wasClaimed {
		t.Fatal("expected claim to fail while the port stays busy")
	}
}

func TestProbeHostFor_MapsWildcardBindToLoopback(t *testing.T) {
	if got := probeHostFor("0.0.0.0"); got != "127.0.0.1" {
		t.Fatalf("wildcard bind must probe loopback, got %q", got)
	}
	if got := probeHostFor("localhost"); got != "localhost" {
		t.Fatalf("named host must probe itself, got %q", got)
	}
}
