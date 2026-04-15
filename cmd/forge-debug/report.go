// report.go generates the complete diagnostic report for forge-debug, assembling
// pre-launch checks, connectivity probes, process logs, and auto-diagnosis into
// a JSON-serializable structure with a human-readable summary. The report can be
// copied to the system clipboard for sharing with developers.
package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/atotto/clipboard"
)

// ── Constants ──

// NOTE: DebugToolVersion is defined in main.go and shared across the package.

// MaxLogLinesInSummary limits how many process log lines appear in the human-readable summary.
const MaxLogLinesInSummary = 50

// maxProcessLogLinesInReport caps how many fterm.exe output lines are included
// in the full JSON report to keep clipboard payloads manageable.
const maxProcessLogLinesInReport = 500

// Severity levels for auto-diagnosis entries.
const (
	SeverityCritical = "critical"
	SeverityWarning  = "warning"
	SeverityInfo     = "info"
)

// Emoji indicators for the human-readable summary.
const (
	emojiPass     = "✅"
	emojiFail     = "❌"
	emojiWarn     = "⚠️"
	emojiCritical = "🔴"
	emojiInfoIcon = "ℹ️"
)

// minimumAcceptableSuccessRate is the threshold below which intermittent
// connectivity failures are flagged as a warning (80%).
const minimumAcceptableSuccessRate = 80.0

// minimumSilentUptimeSeconds is how long a process must run with zero output
// before we flag it as suspicious.
const minimumSilentUptimeSeconds = 5

// ── Report Types ──

// DiagnosticReport is the complete report structure sent to developers for analysis.
type DiagnosticReport struct {
	GeneratedAt         time.Time            `json:"generatedAt"`
	ToolVersion         string               `json:"toolVersion"`
	ForgePort           int                  `json:"forgePort"`
	PreLaunchChecks     []CheckResult        `json:"preLaunchChecks"`
	MonitorTimeline     []ProbeResult        `json:"monitorTimeline"`
	ProcessLog          []TimestampedLogLine `json:"processLog"`
	ProcessInfo         ProcessDiagnostics   `json:"processInfo"`
	ConnectivitySummary ConnectivitySummary  `json:"connectivitySummary"`
	AutoDiagnosis       []DiagnosisEntry     `json:"autoDiagnosis"`
	HumanSummary        string               `json:"humanSummary"`
}

// ProcessDiagnostics captures the state of the fterm.exe process.
type ProcessDiagnostics struct {
	IsRunning bool   `json:"isRunning"`
	Uptime    string `json:"uptime"`
	ExitCode  int    `json:"exitCode"`
	ExitError string `json:"exitError,omitempty"`
}

// ConnectivitySummary captures the final state of connectivity probes.
type ConnectivitySummary struct {
	IsPortOpen            bool    `json:"isPortOpen"`
	IsHTTPResponding      bool    `json:"isHttpResponding"`
	IsWebSocketConnecting bool    `json:"isWebSocketConnecting"`
	HTTPSuccessRate       float64 `json:"httpSuccessRate"`
	WebSocketSuccessRate  float64 `json:"webSocketSuccessRate"`
	TotalProbes           int     `json:"totalProbes"`
}

// DiagnosisEntry represents one auto-detected issue and recommended fix.
type DiagnosisEntry struct {
	Severity      string `json:"severity"`
	Issue         string `json:"issue"`
	Explanation   string `json:"explanation"`
	FixSuggestion string `json:"fixSuggestion"`
}

// ── Report Assembly ──

// buildDiagnosticReport assembles the complete report from all data sources.
// Calls runAutoDiagnosis and buildHumanSummary internally. If timeline or
// launcher is nil, the report is generated with available data only (pre-launch report).
func buildDiagnosticReport(preChecks []CheckResult, timeline *MonitorTimeline, launcher *ProcessLauncher, port int) *DiagnosticReport {
	report := &DiagnosticReport{
		GeneratedAt:     time.Now().UTC(),
		ToolVersion:     DebugToolVersion,
		ForgePort:       port,
		PreLaunchChecks: ensureCheckSlice(preChecks),
	}

	report.MonitorTimeline = extractProbeResults(timeline)
	report.ProcessLog = collectProcessOutput(launcher)
	report.ProcessInfo = extractProcessDiagnostics(launcher)
	report.ConnectivitySummary = buildConnectivitySummary(timeline)
	report.AutoDiagnosis = runAutoDiagnosis(preChecks, report.ConnectivitySummary, launcher)
	report.HumanSummary = buildHumanSummary(report)

	return report
}

// ensureCheckSlice returns the input slice or an empty slice if nil,
// guaranteeing the JSON output always contains an array (never null).
func ensureCheckSlice(checks []CheckResult) []CheckResult {
	if checks == nil {
		return []CheckResult{}
	}
	return checks
}

// extractProbeResults safely retrieves probe results from the timeline.
// Returns an empty slice if timeline is nil.
func extractProbeResults(timeline *MonitorTimeline) []ProbeResult {
	if timeline == nil {
		return []ProbeResult{}
	}
	return timeline.getProbeResults()
}

// collectProcessOutput returns the captured fterm.exe log lines, capped at
// maxProcessLogLinesInReport. Returns an empty slice if launcher is nil.
func collectProcessOutput(launcher *ProcessLauncher) []TimestampedLogLine {
	if launcher == nil {
		return []TimestampedLogLine{}
	}

	allLines := launcher.getLogLines()
	if len(allLines) <= maxProcessLogLinesInReport {
		return allLines
	}

	// Take the most recent lines — early startup noise is less valuable than
	// the logs closest to the point where things went wrong.
	startIndex := len(allLines) - maxProcessLogLinesInReport
	return allLines[startIndex:]
}

// extractProcessDiagnostics gathers process state from the launcher,
// locking the mutex to safely read unexported fields.
func extractProcessDiagnostics(launcher *ProcessLauncher) ProcessDiagnostics {
	if launcher == nil {
		return ProcessDiagnostics{}
	}

	exitCode, exitError := extractExitInfo(launcher)

	return ProcessDiagnostics{
		IsRunning: launcher.isProcessRunning(),
		Uptime:    launcher.getProcessUptime().String(),
		ExitCode:  exitCode,
		ExitError: exitError,
	}
}

// extractExitInfo reads the exit code and error from the launcher under
// its mutex, ensuring thread-safe access to unexported fields.
func extractExitInfo(launcher *ProcessLauncher) (int, string) {
	launcher.logMu.Lock()
	defer launcher.logMu.Unlock()
	return launcher.exitCode, launcher.exitError
}

// ── Connectivity Summary ──

// buildConnectivitySummary extracts the latest status and success rates from the
// monitor timeline. Returns a zeroed summary if timeline is nil or has no results.
func buildConnectivitySummary(timeline *MonitorTimeline) ConnectivitySummary {
	if timeline == nil {
		return ConnectivitySummary{}
	}

	probeResults := timeline.getProbeResults()
	if len(probeResults) == 0 {
		return ConnectivitySummary{}
	}

	isPortOpen, isHTTPHealthy, isWSConnected := timeline.getLatestStatus()
	httpRate, wsRate := timeline.getSuccessRates()

	return ConnectivitySummary{
		IsPortOpen:            isPortOpen,
		IsHTTPResponding:      isHTTPHealthy,
		IsWebSocketConnecting: isWSConnected,
		HTTPSuccessRate:       httpRate,
		WebSocketSuccessRate:  wsRate,
		TotalProbes:           len(probeResults),
	}
}

// ── Auto-Diagnosis Engine ──

// runAutoDiagnosis is the smart diagnosis engine that checks for common failure
// patterns and produces actionable DiagnosisEntry items with severity, clear
// explanation, and fix suggestions. Returns "No issues detected" when healthy.
func runAutoDiagnosis(preChecks []CheckResult, connectivity ConnectivitySummary, launcher *ProcessLauncher) []DiagnosisEntry {
	var entries []DiagnosisEntry

	entries = append(entries, diagnosePreLaunchFailures(preChecks)...)
	entries = append(entries, diagnoseProcessState(launcher)...)
	entries = append(entries, diagnoseConnectivityPatterns(connectivity)...)

	if len(entries) == 0 {
		entries = append(entries, DiagnosisEntry{
			Severity:      SeverityInfo,
			Issue:         "No issues detected",
			Explanation:   "All pre-launch checks passed and connectivity is healthy.",
			FixSuggestion: "No action needed.",
		})
	}

	return entries
}

// diagnosePreLaunchFailures scans pre-launch check results for failures and
// produces a targeted diagnosis for each one.
func diagnosePreLaunchFailures(preChecks []CheckResult) []DiagnosisEntry {
	var entries []DiagnosisEntry
	for _, check := range preChecks {
		if check.Status != "fail" {
			continue
		}
		entries = append(entries, classifyPreLaunchFailure(check))
	}
	return entries
}

// classifyPreLaunchFailure maps a failed pre-launch check to a DiagnosisEntry
// with a contextual explanation and actionable fix suggestion.
func classifyPreLaunchFailure(check CheckResult) DiagnosisEntry {
	lowerName := strings.ToLower(check.Name)

	if strings.Contains(lowerName, "port") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Port already in use",
			Explanation:   fmt.Sprintf("Pre-launch check '%s' failed: %s", check.Name, check.Detail),
			FixSuggestion: "Stop the process using this port, or choose a different port with the --port flag.",
		}
	}

	if strings.Contains(lowerName, "directory") || strings.Contains(lowerName, "forge dir") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Forge directory not found",
			Explanation:   fmt.Sprintf("Pre-launch check '%s' failed: %s", check.Name, check.Detail),
			FixSuggestion: "Verify the Forge installation directory exists and is accessible. Reinstall if necessary.",
		}
	}

	if strings.Contains(lowerName, "process") {
		return DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "Existing Forge process detected",
			Explanation:   fmt.Sprintf("Pre-launch check '%s' failed: %s", check.Name, check.Detail),
			FixSuggestion: "Stop the existing fterm.exe process before launching a new instance.",
		}
	}

	if strings.Contains(lowerName, "firewall") {
		return DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "Firewall may block connections",
			Explanation:   fmt.Sprintf("Pre-launch check '%s' failed: %s", check.Name, check.Detail),
			FixSuggestion: "Add a firewall exception for fterm.exe, or allow connections on the configured port.",
		}
	}

	if strings.Contains(lowerName, "proxy") {
		return DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "Proxy configuration detected",
			Explanation:   fmt.Sprintf("Pre-launch check '%s' failed: %s", check.Name, check.Detail),
			FixSuggestion: "Ensure your proxy settings do not intercept localhost traffic. Set NO_PROXY=localhost,127.0.0.1.",
		}
	}

	// Generic fallback for unrecognized check names
	return DiagnosisEntry{
		Severity:      SeverityWarning,
		Issue:         fmt.Sprintf("Pre-launch check failed: %s", check.Name),
		Explanation:   check.Detail,
		FixSuggestion: "Review the check details above and resolve the underlying issue.",
	}
}

// diagnoseProcessState examines the launcher state and log output to detect
// crashes and common startup errors.
func diagnoseProcessState(launcher *ProcessLauncher) []DiagnosisEntry {
	if launcher == nil {
		return nil
	}

	var entries []DiagnosisEntry

	if !launcher.isProcessRunning() {
		entries = append(entries, diagnoseCrashedProcess(launcher)...)
	}

	entries = append(entries, diagnoseSilentProcess(launcher)...)
	entries = append(entries, diagnoseCommonLogErrors(launcher.getLogLines())...)

	return entries
}

// diagnoseCrashedProcess produces a diagnosis entry if the process exited with an error.
func diagnoseCrashedProcess(launcher *ProcessLauncher) []DiagnosisEntry {
	exitCode, exitError := extractExitInfo(launcher)
	if exitError == "" {
		return nil
	}

	return []DiagnosisEntry{{
		Severity:      SeverityCritical,
		Issue:         "Process crashed on startup",
		Explanation:   fmt.Sprintf("fterm.exe exited with code %d: %s", exitCode, exitError),
		FixSuggestion: "Check the process output below for error details. Common causes: missing config, port conflicts, or corrupt binary.",
	}}
}

// diagnoseSilentProcess flags when the process has run for a while without producing output.
func diagnoseSilentProcess(launcher *ProcessLauncher) []DiagnosisEntry {
	logLines := launcher.getLogLines()
	uptimeSeconds := int64(launcher.getProcessUptime().Seconds())

	if len(logLines) == 0 && uptimeSeconds > minimumSilentUptimeSeconds {
		return []DiagnosisEntry{{
			Severity:      SeverityWarning,
			Issue:         "No output from process",
			Explanation:   fmt.Sprintf("No stdout/stderr output captured from fterm.exe after %d+ seconds.", minimumSilentUptimeSeconds),
			FixSuggestion: "The process may have frozen or output is being redirected. Try running fterm.exe manually in a terminal.",
		}}
	}

	return nil
}

// diagnoseCommonLogErrors scans process log output for known error patterns
// and returns targeted diagnosis entries for each match found.
func diagnoseCommonLogErrors(logLines []TimestampedLogLine) []DiagnosisEntry {
	var entries []DiagnosisEntry
	for _, logLine := range logLines {
		lowerText := strings.ToLower(logLine.Text)
		if entry, hasMatch := matchLogErrorPattern(lowerText, logLine); hasMatch {
			entries = append(entries, entry)
		}
	}
	return entries
}

// matchLogErrorPattern checks a single log line against known error patterns.
// Returns a diagnosis entry and true if a pattern matched, or zero value and false.
func matchLogErrorPattern(lowerText string, logLine TimestampedLogLine) (DiagnosisEntry, bool) {
	if strings.Contains(lowerText, "panic:") || strings.Contains(lowerText, "fatal error") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Runtime panic or fatal error detected in logs",
			Explanation:   fmt.Sprintf("Found in %s at %s: %s", logLine.Stream, logLine.Timestamp.Format(time.RFC3339), truncateString(logLine.Text, 200)),
			FixSuggestion: "This is a crash in fterm.exe. Report this to the Forge team with the full diagnostic output.",
		}, true
	}

	if strings.Contains(lowerText, "address already in use") || strings.Contains(lowerText, "bind: address already") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Port bind conflict detected in logs",
			Explanation:   "The process log shows an 'address already in use' error, confirming a port conflict.",
			FixSuggestion: "Find and stop the process occupying the port, or configure a different port.",
		}, true
	}

	if strings.Contains(lowerText, "permission denied") || strings.Contains(lowerText, "access is denied") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Permission denied error in logs",
			Explanation:   "The process encountered a permission error, possibly when binding to a port or accessing files.",
			FixSuggestion: "Run the tool with elevated privileges, or check file/directory permissions.",
		}, true
	}

	if strings.Contains(lowerText, "tls") && strings.Contains(lowerText, "certificate") {
		return DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "TLS certificate error in logs",
			Explanation:   "The process log indicates a TLS/certificate issue that may prevent HTTPS or WSS connections.",
			FixSuggestion: "Verify TLS certificate configuration. Regenerate certificates if they are expired or invalid.",
		}, true
	}

	if strings.Contains(lowerText, "out of memory") {
		return DiagnosisEntry{
			Severity:      SeverityCritical,
			Issue:         "Out of memory condition",
			Explanation:   "The process ran out of available memory during operation.",
			FixSuggestion: "Close other applications to free memory, or increase system RAM.",
		}, true
	}

	return DiagnosisEntry{}, false
}

// diagnoseConnectivityPatterns examines the connectivity summary for common
// failure patterns and produces targeted diagnosis entries.
func diagnoseConnectivityPatterns(connectivity ConnectivitySummary) []DiagnosisEntry {
	if connectivity.TotalProbes == 0 {
		return nil
	}

	var entries []DiagnosisEntry

	entries = appendIfNotEmpty(entries, diagnoseNoConnectivity(connectivity))
	entries = appendIfNotEmpty(entries, diagnosePortOpenHTTPFailing(connectivity))
	entries = appendIfNotEmpty(entries, diagnoseHTTPUpWebSocketDown(connectivity))
	entries = append(entries, diagnoseIntermittentFailures(connectivity)...)

	return entries
}

// appendIfNotEmpty appends a diagnosis entry to the slice only if it has a non-empty Issue.
func appendIfNotEmpty(entries []DiagnosisEntry, entry DiagnosisEntry) []DiagnosisEntry {
	if entry.Issue != "" {
		return append(entries, entry)
	}
	return entries
}

// diagnoseNoConnectivity returns a diagnosis when all probes are failing.
func diagnoseNoConnectivity(connectivity ConnectivitySummary) DiagnosisEntry {
	isCompletelyDown := !connectivity.IsPortOpen && !connectivity.IsHTTPResponding && !connectivity.IsWebSocketConnecting
	if !isCompletelyDown {
		return DiagnosisEntry{}
	}

	return DiagnosisEntry{
		Severity:      SeverityCritical,
		Issue:         "No connectivity on target port",
		Explanation:   fmt.Sprintf("None of the %d probes succeeded. The process may not have started or is listening on a different port.", connectivity.TotalProbes),
		FixSuggestion: "Verify the port number is correct and the process started successfully. Check firewall settings for localhost.",
	}
}

// diagnosePortOpenHTTPFailing returns a diagnosis when TCP connects but HTTP fails.
func diagnosePortOpenHTTPFailing(connectivity ConnectivitySummary) DiagnosisEntry {
	if !connectivity.IsPortOpen || connectivity.IsHTTPResponding {
		return DiagnosisEntry{}
	}

	return DiagnosisEntry{
		Severity:      SeverityCritical,
		Issue:         "Port open but HTTP not responding",
		Explanation:   "The process bound to the port but the HTTP server failed to initialize or is not serving the health endpoint.",
		FixSuggestion: "Check process logs for HTTP server startup errors. The binary may have started but failed during route initialization.",
	}
}

// diagnoseHTTPUpWebSocketDown returns a diagnosis when HTTP works but WebSocket fails.
func diagnoseHTTPUpWebSocketDown(connectivity ConnectivitySummary) DiagnosisEntry {
	if !connectivity.IsHTTPResponding || connectivity.IsWebSocketConnecting {
		return DiagnosisEntry{}
	}

	return DiagnosisEntry{
		Severity:      SeverityCritical,
		Issue:         "WebSocket upgrade blocked",
		Explanation:   "HTTP health checks succeed but WebSocket connections are being refused. A proxy or firewall may be intercepting WebSocket upgrade requests.",
		FixSuggestion: "Check if a corporate proxy is intercepting localhost traffic. Verify no firewall rule blocks WebSocket (HTTP Upgrade) connections on this port.",
	}
}

// diagnoseIntermittentFailures flags HTTP or WebSocket success rates below acceptable thresholds.
func diagnoseIntermittentFailures(connectivity ConnectivitySummary) []DiagnosisEntry {
	var entries []DiagnosisEntry

	if connectivity.HTTPSuccessRate > 0 && connectivity.HTTPSuccessRate < minimumAcceptableSuccessRate {
		entries = append(entries, DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "Intermittent HTTP failures",
			Explanation:   fmt.Sprintf("HTTP health check success rate is only %.0f%% — intermittent failures detected.", connectivity.HTTPSuccessRate),
			FixSuggestion: "The server may be overloaded or restarting. Check system resources and process output.",
		})
	}

	if connectivity.WebSocketSuccessRate > 0 && connectivity.WebSocketSuccessRate < minimumAcceptableSuccessRate {
		entries = append(entries, DiagnosisEntry{
			Severity:      SeverityWarning,
			Issue:         "Intermittent WebSocket failures",
			Explanation:   fmt.Sprintf("WebSocket success rate is only %.0f%% — intermittent connection drops.", connectivity.WebSocketSuccessRate),
			FixSuggestion: "This may indicate resource exhaustion or connection limits. Check process memory usage.",
		})
	}

	return entries
}

// ── Human-Readable Summary ──

// buildHumanSummary generates a plain-text diagnostic summary with pass/fail
// emoji indicators, suitable for quick visual triage by developers.
func buildHumanSummary(report *DiagnosticReport) string {
	var summaryBuilder strings.Builder

	writeReportHeader(&summaryBuilder, report)
	writePreLaunchSection(&summaryBuilder, report.PreLaunchChecks)
	writeConnectivitySection(&summaryBuilder, report.ConnectivitySummary)
	writeAutoDiagnosisSection(&summaryBuilder, report.AutoDiagnosis)
	writeProcessLogSection(&summaryBuilder, report.ProcessLog)

	return summaryBuilder.String()
}

// writeReportHeader writes the top-level banner and metadata to the summary.
func writeReportHeader(builder *strings.Builder, report *DiagnosticReport) {
	builder.WriteString("═══ FORGE TERMINAL DIAGNOSTIC REPORT ═══\n")
	formattedTime := report.GeneratedAt.Format("2006-01-02 15:04:05 UTC")
	builder.WriteString(fmt.Sprintf("Generated: %s\n", formattedTime))
	builder.WriteString(fmt.Sprintf("Tool Version: %s | Port: %d\n\n", report.ToolVersion, report.ForgePort))
}

// writePreLaunchSection writes the pre-launch check results with status emojis.
func writePreLaunchSection(builder *strings.Builder, checks []CheckResult) {
	builder.WriteString("── Pre-Launch Checks ──\n")
	if len(checks) == 0 {
		builder.WriteString("  (no checks recorded)\n")
	}
	for _, check := range checks {
		statusEmoji := mapCheckStatusToEmoji(check.Status)
		builder.WriteString(fmt.Sprintf("  %s %s: %s\n", statusEmoji, check.Name, check.Detail))
	}
	builder.WriteString("\n")
}

// mapCheckStatusToEmoji converts a check status string to the corresponding emoji.
func mapCheckStatusToEmoji(status string) string {
	switch status {
	case "pass":
		return emojiPass
	case "fail":
		return emojiFail
	case "warn":
		return emojiWarn
	default:
		return emojiWarn
	}
}

// writeConnectivitySection writes the connectivity probe status to the summary.
func writeConnectivitySection(builder *strings.Builder, summary ConnectivitySummary) {
	builder.WriteString("── Connectivity Status ──\n")
	builder.WriteString(fmt.Sprintf("  %s Port Listening: %s\n",
		formatBoolEmoji(summary.IsPortOpen), formatYesNo(summary.IsPortOpen)))
	builder.WriteString(fmt.Sprintf("  %s HTTP Health: %s\n",
		formatBoolEmoji(summary.IsHTTPResponding), formatHTTPStatusText(summary.IsHTTPResponding)))
	builder.WriteString(fmt.Sprintf("  %s WebSocket: %s\n",
		formatBoolEmoji(summary.IsWebSocketConnecting), formatWebSocketStatusText(summary.IsWebSocketConnecting)))

	if summary.TotalProbes > 0 {
		builder.WriteString(fmt.Sprintf("  HTTP Success Rate: %.1f%% | WebSocket Success Rate: %.1f%% | Total Probes: %d\n",
			summary.HTTPSuccessRate, summary.WebSocketSuccessRate, summary.TotalProbes))
	}
	builder.WriteString("\n")
}

// formatBoolEmoji returns a pass or fail emoji based on a boolean value.
func formatBoolEmoji(isHealthy bool) string {
	if isHealthy {
		return emojiPass
	}
	return emojiFail
}

// formatYesNo returns "Yes" or "No" for boolean status display.
func formatYesNo(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}

// formatHTTPStatusText returns a descriptive string for HTTP health status.
func formatHTTPStatusText(isResponding bool) string {
	if isResponding {
		return "Responding (200 OK)"
	}
	return "Not responding"
}

// formatWebSocketStatusText returns a descriptive string for WebSocket status.
func formatWebSocketStatusText(isConnecting bool) string {
	if isConnecting {
		return "Connected"
	}
	return "Connection refused"
}

// writeAutoDiagnosisSection writes the auto-diagnosis results with severity emojis.
func writeAutoDiagnosisSection(builder *strings.Builder, entries []DiagnosisEntry) {
	builder.WriteString("── Auto-Diagnosis ──\n")
	for _, entry := range entries {
		severityEmoji := mapSeverityToEmoji(entry.Severity)
		severityLabel := strings.ToUpper(entry.Severity)
		builder.WriteString(fmt.Sprintf("  %s %s: %s\n", severityEmoji, severityLabel, entry.Issue))
		builder.WriteString(fmt.Sprintf("     → %s\n", entry.Explanation))
		builder.WriteString(fmt.Sprintf("     → Fix: %s\n", entry.FixSuggestion))
	}
	builder.WriteString("\n")
}

// mapSeverityToEmoji converts a severity level string to the corresponding emoji.
func mapSeverityToEmoji(severity string) string {
	switch severity {
	case SeverityCritical:
		return emojiCritical
	case SeverityWarning:
		return emojiWarn
	case SeverityInfo:
		return emojiInfoIcon
	default:
		return emojiInfoIcon
	}
}

// writeProcessLogSection writes the last N lines of process output to the summary.
func writeProcessLogSection(builder *strings.Builder, logLines []TimestampedLogLine) {
	builder.WriteString(fmt.Sprintf("── Process Output (last %d lines) ──\n", MaxLogLinesInSummary))

	if len(logLines) == 0 {
		builder.WriteString("  (no process output captured)\n")
		return
	}

	displayLines := tailLogLines(logLines, MaxLogLinesInSummary)
	for _, line := range displayLines {
		formattedTimestamp := line.Timestamp.Format("2006-01-02 15:04:05")
		builder.WriteString(fmt.Sprintf("  [%s] [%s] %s\n", formattedTimestamp, line.Stream, line.Text))
	}
}

// tailLogLines returns the last maxLines entries from the log, or all entries
// if fewer than maxLines exist.
func tailLogLines(logLines []TimestampedLogLine, maxLines int) []TimestampedLogLine {
	if len(logLines) <= maxLines {
		return logLines
	}
	startIndex := len(logLines) - maxLines
	return logLines[startIndex:]
}

// ── Serialisation & Clipboard ──

// copyReportToClipboard marshals the report to indented JSON and copies it to
// the system clipboard. Returns an error if marshalling or clipboard access fails.
func copyReportToClipboard(report *DiagnosticReport) error {
	jsonContent, marshalError := formatReportAsJSON(report)
	if marshalError != nil {
		return fmt.Errorf("failed to marshal report to JSON: %w", marshalError)
	}

	clipboardError := clipboard.WriteAll(jsonContent)
	if clipboardError != nil {
		return fmt.Errorf("failed to write report to clipboard: %w", clipboardError)
	}

	return nil
}

// formatReportAsJSON marshals the diagnostic report to a pretty-printed JSON string.
func formatReportAsJSON(report *DiagnosticReport) (string, error) {
	jsonBytes, marshalError := json.MarshalIndent(report, "", "  ")
	if marshalError != nil {
		return "", fmt.Errorf("failed to marshal diagnostic report: %w", marshalError)
	}
	return string(jsonBytes), nil
}
