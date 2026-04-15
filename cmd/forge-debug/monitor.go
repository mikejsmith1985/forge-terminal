// monitor.go provides a live connectivity monitor for the forge-debug diagnostic tool.
// It continuously probes fterm.exe's HTTP and WebSocket endpoints after launch,
// tracking port availability, HTTP health, and WebSocket handshake success over time.
package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── Constants ──

// HealthPollIntervalSeconds defines how often the monitor polls all endpoints.
const HealthPollIntervalSeconds = 2

// WebSocketDialTimeoutSeconds defines the timeout for WebSocket handshake attempts.
const WebSocketDialTimeoutSeconds = 5

// HTTPRequestTimeoutSeconds defines the timeout for HTTP health check requests.
const HTTPRequestTimeoutSeconds = 3

// tcpDialTimeoutSeconds defines the timeout for raw TCP port connectivity checks.
const tcpDialTimeoutSeconds = 2

// maxResponseBodyLength caps how many characters of an HTTP response body are recorded.
const maxResponseBodyLength = 200

// localhostAddress is the loopback address used for all connectivity probes.
const localhostAddress = "127.0.0.1"

// ── Probe Type Identifiers ──

const probeTypePortOpen = "port_open"
const probeTypeHTTPHealth = "http_health"
const probeTypeWebSocketHandshake = "websocket_handshake"

// probesPerCycle is the number of probes executed in each monitoring cycle.
const probesPerCycle = 3

// successRatePercentMultiplier converts a 0–1 ratio into a 0–100 percentage.
const successRatePercentMultiplier = 100.0

// ── Types ──

// ProbeResult records the outcome of a single connectivity probe.
type ProbeResult struct {
	Timestamp    time.Time `json:"timestamp"`
	ProbeType    string    `json:"probeType"`
	IsSuccess    bool      `json:"isSuccess"`
	LatencyMs    int64     `json:"latencyMs"`
	Detail       string    `json:"detail"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
}

// MonitorTimeline tracks all probe results over time.
type MonitorTimeline struct {
	probeResults []ProbeResult
	probeMu      sync.Mutex
	isMonitoring bool
	stopChan     chan struct{}
	port         int
}

// ── Constructor ──

// createMonitorTimeline initializes a new MonitorTimeline configured to probe the given port.
// The timeline starts idle; call startMonitoring to begin periodic probing.
func createMonitorTimeline(port int) *MonitorTimeline {
	return &MonitorTimeline{
		probeResults: make([]ProbeResult, 0),
		stopChan:     make(chan struct{}),
		port:         port,
	}
}

// ── Monitoring Lifecycle ──

// startMonitoring begins periodic connectivity probing in a background goroutine.
// It runs a full monitoring cycle every HealthPollIntervalSeconds until stopMonitoring
// is called. If monitoring is already active, this is a no-op.
func (timeline *MonitorTimeline) startMonitoring() {
	timeline.probeMu.Lock()
	if timeline.isMonitoring {
		timeline.probeMu.Unlock()
		return
	}
	timeline.isMonitoring = true
	timeline.probeMu.Unlock()

	go timeline.runPollingLoop()
}

// runPollingLoop is the internal goroutine that drives periodic monitoring cycles.
// It fires an immediate first cycle, then repeats on each tick until stopChan closes.
func (timeline *MonitorTimeline) runPollingLoop() {
	pollInterval := time.Duration(HealthPollIntervalSeconds) * time.Second
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// Run one cycle immediately so callers don't wait for the first tick
	timeline.runMonitoringCycle()

	for {
		select {
		case <-timeline.stopChan:
			return
		case <-ticker.C:
			timeline.runMonitoringCycle()
		}
	}
}

// stopMonitoring signals the monitoring goroutine to exit and marks monitoring as inactive.
// Safe to call even if monitoring is not running.
func (timeline *MonitorTimeline) stopMonitoring() {
	timeline.probeMu.Lock()
	defer timeline.probeMu.Unlock()

	if !timeline.isMonitoring {
		return
	}

	close(timeline.stopChan)
	timeline.isMonitoring = false
}

// ── Monitoring Cycle ──

// runMonitoringCycle executes all connectivity probes in sequence and appends their results.
// Probe order: port open → HTTP health → WebSocket handshake.
func (timeline *MonitorTimeline) runMonitoringCycle() {
	portResult := timeline.probePortOpen()
	httpResult := timeline.probeHTTPHealth()
	wsResult := timeline.probeWebSocketHandshake()

	timeline.probeMu.Lock()
	defer timeline.probeMu.Unlock()

	timeline.probeResults = append(timeline.probeResults, portResult, httpResult, wsResult)
}

// ── Individual Probes ──

// probePortOpen attempts a TCP connection to the monitored port to verify it is listening.
// A successful dial (even if immediately closed) means the port is accepting connections.
func (timeline *MonitorTimeline) probePortOpen() ProbeResult {
	targetAddress := fmt.Sprintf("%s:%d", localhostAddress, timeline.port)
	dialTimeout := time.Duration(tcpDialTimeoutSeconds) * time.Second

	startTime := time.Now()
	connection, dialError := net.DialTimeout("tcp", targetAddress, dialTimeout)
	elapsedMs := time.Since(startTime).Milliseconds()

	if dialError != nil {
		return ProbeResult{
			Timestamp:    startTime,
			ProbeType:    probeTypePortOpen,
			IsSuccess:    false,
			LatencyMs:    elapsedMs,
			Detail:       fmt.Sprintf("TCP dial to %s failed", targetAddress),
			ErrorMessage: dialError.Error(),
		}
	}
	connection.Close()

	return ProbeResult{
		Timestamp: startTime,
		ProbeType: probeTypePortOpen,
		IsSuccess: true,
		LatencyMs: elapsedMs,
		Detail:    fmt.Sprintf("TCP dial to %s succeeded", targetAddress),
	}
}

// probeHTTPHealth sends an HTTP GET request to the /api/version endpoint and checks
// whether the server responds with a 200 status code. The response body is recorded
// (truncated to maxResponseBodyLength characters) for diagnostic visibility.
func (timeline *MonitorTimeline) probeHTTPHealth() ProbeResult {
	healthURL := fmt.Sprintf("http://%s:%d/api/version", localhostAddress, timeline.port)
	httpClient := &http.Client{
		Timeout: time.Duration(HTTPRequestTimeoutSeconds) * time.Second,
	}

	startTime := time.Now()
	response, requestError := httpClient.Get(healthURL)
	elapsedMs := time.Since(startTime).Milliseconds()

	if requestError != nil {
		return ProbeResult{
			Timestamp:    startTime,
			ProbeType:    probeTypeHTTPHealth,
			IsSuccess:    false,
			LatencyMs:    elapsedMs,
			Detail:       fmt.Sprintf("GET %s failed", healthURL),
			ErrorMessage: requestError.Error(),
		}
	}
	defer response.Body.Close()

	return buildHTTPProbeResult(startTime, elapsedMs, healthURL, response)
}

// buildHTTPProbeResult constructs a ProbeResult from a completed HTTP response,
// reading and truncating the body for diagnostic detail.
func buildHTTPProbeResult(startTime time.Time, elapsedMs int64, healthURL string, response *http.Response) ProbeResult {
	bodyBytes, readError := io.ReadAll(response.Body)
	responseBody := truncateResponseBody(string(bodyBytes), readError)

	isHealthy := response.StatusCode == http.StatusOK
	statusDetail := fmt.Sprintf("GET %s → %d, body: %s", healthURL, response.StatusCode, responseBody)

	return ProbeResult{
		Timestamp: startTime,
		ProbeType: probeTypeHTTPHealth,
		IsSuccess: isHealthy,
		LatencyMs: elapsedMs,
		Detail:    statusDetail,
	}
}

// truncateResponseBody returns the response body string, capped at maxResponseBodyLength.
// If the body could not be read, returns a placeholder indicating the failure.
func truncateResponseBody(body string, readError error) string {
	if readError != nil {
		return "[unreadable body]"
	}
	if len(body) > maxResponseBodyLength {
		return body[:maxResponseBodyLength] + "..."
	}
	return body
}

// probeWebSocketHandshake attempts a WebSocket upgrade handshake to the /ws endpoint.
// The connection is closed immediately after a successful handshake — we only need to
// verify that the server accepts WebSocket upgrades, not maintain a session.
func (timeline *MonitorTimeline) probeWebSocketHandshake() ProbeResult {
	wsURL := fmt.Sprintf("ws://%s:%d/ws", localhostAddress, timeline.port)
	dialer := websocket.Dialer{
		HandshakeTimeout: time.Duration(WebSocketDialTimeoutSeconds) * time.Second,
	}

	startTime := time.Now()
	wsConnection, _, dialError := dialer.Dial(wsURL, nil)
	elapsedMs := time.Since(startTime).Milliseconds()

	if dialError != nil {
		return ProbeResult{
			Timestamp:    startTime,
			ProbeType:    probeTypeWebSocketHandshake,
			IsSuccess:    false,
			LatencyMs:    elapsedMs,
			Detail:       fmt.Sprintf("WebSocket dial to %s failed", wsURL),
			ErrorMessage: dialError.Error(),
		}
	}
	// Close immediately — we only verify the handshake, not maintain a session
	wsConnection.Close()

	return ProbeResult{
		Timestamp: startTime,
		ProbeType: probeTypeWebSocketHandshake,
		IsSuccess: true,
		LatencyMs: elapsedMs,
		Detail:    fmt.Sprintf("WebSocket handshake to %s succeeded", wsURL),
	}
}

// ── Query Methods ──

// getProbeResults returns a thread-safe copy of all recorded probe results.
// The caller receives an independent slice that won't be affected by future probes.
func (timeline *MonitorTimeline) getProbeResults() []ProbeResult {
	timeline.probeMu.Lock()
	defer timeline.probeMu.Unlock()

	resultsCopy := make([]ProbeResult, len(timeline.probeResults))
	copy(resultsCopy, timeline.probeResults)
	return resultsCopy
}

// getLatestStatus examines the most recent monitoring cycle's results and returns
// the current connectivity status for each probe type. If fewer than one full cycle
// has completed, all statuses default to false.
func (timeline *MonitorTimeline) getLatestStatus() (isPortOpen bool, isHTTPHealthy bool, isWebSocketConnected bool) {
	timeline.probeMu.Lock()
	defer timeline.probeMu.Unlock()

	probeCount := len(timeline.probeResults)
	if probeCount < probesPerCycle {
		return false, false, false
	}

	// The last 3 results form the most recent cycle
	// (appended atomically in runMonitoringCycle: port, http, ws)
	latestCycleResults := timeline.probeResults[probeCount-probesPerCycle:]
	for _, result := range latestCycleResults {
		switch result.ProbeType {
		case probeTypePortOpen:
			isPortOpen = result.IsSuccess
		case probeTypeHTTPHealth:
			isHTTPHealthy = result.IsSuccess
		case probeTypeWebSocketHandshake:
			isWebSocketConnected = result.IsSuccess
		}
	}

	return isPortOpen, isHTTPHealthy, isWebSocketConnected
}

// getSuccessRates calculates the percentage of successful probes for HTTP health
// and WebSocket handshake across all recorded results. Returns values in the range 0–100.
func (timeline *MonitorTimeline) getSuccessRates() (httpSuccessRate float64, wsSuccessRate float64) {
	timeline.probeMu.Lock()
	defer timeline.probeMu.Unlock()

	httpSuccessRate = calculateSuccessRateForType(timeline.probeResults, probeTypeHTTPHealth)
	wsSuccessRate = calculateSuccessRateForType(timeline.probeResults, probeTypeWebSocketHandshake)

	return httpSuccessRate, wsSuccessRate
}

// calculateSuccessRateForType computes the success percentage (0–100) for a specific
// probe type across the provided results. Returns 0.0 if no matching probes exist.
func calculateSuccessRateForType(probeResults []ProbeResult, probeType string) float64 {
	totalCount := 0
	successCount := 0

	for _, result := range probeResults {
		if result.ProbeType != probeType {
			continue
		}
		totalCount++
		if result.IsSuccess {
			successCount++
		}
	}

	if totalCount == 0 {
		return 0.0
	}

	return float64(successCount) / float64(totalCount) * successRatePercentMultiplier
}
