// report.go — Diagnostic report generator and auto-diagnosis engine for forge-debug.
// Collects all pre-launch checks, monitoring timeline data, and process output
// into a structured JSON report with a human-readable summary header. The report
// is designed to be agent-consumable for automated root-cause analysis.
package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strings"
	"time"

	"github.com/atotto/clipboard"
)

// ── Constants ────────────────────────────────────────────────────────────────────

// ReportFormatVersion identifies the schema version for forward compatibility.
const ReportFormatVersion = "1.0.0"

// maxProcessLogLinesInReport caps how many fterm.exe output lines are included
// in the report to keep clipboard payloads manageable.
const maxProcessLogLinesInReport = 500

// ── Report Types ─────────────────────────────────────────────────────────────────

// DiagnosticReport is the top-level container for the full diagnostic snapshot.
type DiagnosticReport struct {
	FormatVersion     string              `json:"formatVersion"`
	GeneratedAt       string              `json:"generatedAt"`
	ToolVersion       string              `json:"toolVersion"`
	System            SystemInfo          `json:"system"`
	PreLaunchChecks   []CheckResult       `json:"preLaunchChecks"`
	Connectivity      ConnectivitySummary `json:"connectivity"`
	ProcessInfo       ProcessSummary      `json:"processInfo"`
	ProcessOutput     []TimestampedLogLine `json:"processOutput"`
	ProbeTimeline     []ProbeResult       `json:"probeTimeline"`
	AutoDiagnosis     []DiagnosisEntry    `json:"autoDiagnosis"`
	HumanSummary      string              `json:"humanSummary"`
}

// SystemInfo captures the environment details at report generation time.
type SystemInfo struct {
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
	CPUCount     int    `json:"cpuCount"`
	GoVersion    string `json:"goVersion"`
}

// ConnectivitySummary distills the monitoring timeline into key metrics.
type ConnectivitySummary struct {
	TargetPort         int     `json:"targetPort"`
	IsPortOpen         bool    `json:"isPortOpen"`
	IsHTTPHealthy      bool    `json:"isHttpHealthy"`
	IsWebSocketConnected bool  `json:"isWebSocketConnected"`
	HTTPSuccessRate    float64 `json:"httpSuccessRatePercent"`
	WSSuccessRate      float64 `json:"wsSuccessRatePercent"`
	TotalProbes        int     `json:"totalProbes"`
}

// ProcessSummary records the fterm.exe process lifecycle data.
type ProcessSummary struct {
	WasLaunched    bool   `json:"wasLaunched"`
	IsStillRunning bool   `json:"isStillRunning"`
	ExitCode       int    `json:"exitCode"`
	ExitError      string `json:"exitError,omitempty"`
	UptimeSeconds  int64  `json:"uptimeSeconds"`
	TotalLogLines  int    `json:"totalLogLines"`
}

// DiagnosisEntry represents a single auto-detected issue with severity and advice.
type DiagnosisEntry struct {
	Severity    string `json:"severity"` // "critical", "warning", "info"
	Category    string `json:"category"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion"`
}

// ── Report Builder ───────────────────────────────────────────────────────────────

// buildDiagnosticReport assembles a complete diagnostic report from all available
// data sources. Any source can be nil if that phase hasn't run yet — the report
// gracefully handles missing data with sensible defaults.
func buildDiagnosticReport(
	preChecks []CheckResult,
	timeline *MonitorTimeline,
	launcher *ProcessLauncher,
	port int,
) DiagnosticReport {
	report := DiagnosticReport{
		FormatVersion:   ReportFormatVersion,
		GeneratedAt:     time.Now().UTC().Format(time.RFC3339),
		ToolVersion:     DebugToolVersion,
		System:          collectSystemInfo(),
		PreLaunchChecks: preChecks,
		Connectivity:    buildConnectivitySummary(timeline, port),
		ProcessInfo:     buildProcessSummary(launcher),
		ProcessOutput:   collectProcessOutput(launcher),
		ProbeTimeline:   collectProbeTimeline(timeline),
	}

	report.AutoDiagnosis = runAutoDiagnosis(report)
	report.HumanSummary = renderHumanSummary(report)

	return report
}

// collectSystemInfo gathers OS, architecture, and runtime info.
func collectSystemInfo() SystemInfo {
	return SystemInfo{
		OS:           runtime.GOOS,
		Architecture: runtime.GOARCH,
		CPUCount:     runtime.NumCPU(),
		GoVersion:    runtime.Version(),
	}
}

// buildConnectivitySummary extracts current status and success rates from the
// monitor timeline. Returns zeroed summary if timeline is nil (not yet started).
func buildConnectivitySummary(timeline *MonitorTimeline, port int) ConnectivitySummary {
	summary := ConnectivitySummary{TargetPort: port}

	if timeline == nil {
		return summary
	}

	summary.IsPortOpen, summary.IsHTTPHealthy, summary.IsWebSocketConnected = timeline.getLatestStatus()
	summary.HTTPSuccessRate, summary.WSSuccessRate = timeline.getSuccessRates()
	summary.TotalProbes = len(timeline.getProbeResults())

	return summary
}

// buildProcessSummary extracts lifecycle information from the process launcher.
// Returns a "not launched" summary if the launcher is nil.
func buildProcessSummary(launcher *ProcessLauncher) ProcessSummary {
	if launcher == nil {
		return ProcessSummary{WasLaunched: false}
	}

	return ProcessSummary{
		WasLaunched:    true,
		IsStillRunning: launcher.isProcessRunning(),
		ExitCode:       launcher.exitCode,
		ExitError:      launcher.exitError,
		UptimeSeconds:  int64(launcher.getProcessUptime().Seconds()),
		TotalLogLines:  len(launcher.getLogLines()),
	}
}

// collectProcessOutput returns the captured fterm.exe log lines, capped at
// maxProcessLogLinesInReport to keep the clipboard payload reasonable.
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

// collectProbeTimeline returns all recorded probe results, or an empty slice
// if monitoring hasn't started.
func collectProbeTimeline(timeline *MonitorTimeline) []ProbeResult {
	if timeline == nil {
		return []ProbeResult{}
	}
	return timeline.getProbeResults()
}

// ── Auto-Diagnosis Engine ────────────────────────────────────────────────────────

// runAutoDiagnosis analyzes the report data and flags likely root causes.
// Each diagnosis rule is an independent function that returns zero or more entries.
func runAutoDiagnosis(report DiagnosticReport) []DiagnosisEntry {
	var diagnoses []DiagnosisEntry

	diagnoses = append(diagnoses, diagnosePreCheckFailures(report.PreLaunchChecks)...)
	diagnoses = append(diagnoses, diagnosePortIssues(report.Connectivity)...)
	diagnoses = append(diagnoses, diagnoseHTTPIssues(report.Connectivity)...)
	diagnoses = append(diagnoses, diagnoseWebSocketIssues(report.Connectivity)...)
	diagnoses = append(diagnoses, diagnoseProcessIssues(report.ProcessInfo)...)
	diagnoses = append(diagnoses, diagnoseProcessOutputErrors(report.ProcessOutput)...)

	if len(diagnoses) == 0 {
		diagnoses = append(diagnoses, DiagnosisEntry{
			Severity:    "info",
			Category:    "overall",
			Description: "No obvious issues detected from available data.",
			Suggestion:  "If the problem persists, try running for a longer period before capturing the report.",
		})
	}

	return diagnoses
}

// diagnosePreCheckFailures flags any pre-launch check that returned "fail" status.
func diagnosePreCheckFailures(checks []CheckResult) []DiagnosisEntry {
	var entries []DiagnosisEntry
	for _, check := range checks {
		if check.Status == "fail" {
			entries = append(entries, DiagnosisEntry{
				Severity:    "critical",
				Category:    "pre-launch",
				Description: fmt.Sprintf("Pre-check '%s' FAILED: %s", check.Name, check.Detail),
				Suggestion:  check.Suggestion,
			})
		}
	}
	return entries
}

// diagnosePortIssues flags when the target port is not reachable after launch.
func diagnosePortIssues(connectivity ConnectivitySummary) []DiagnosisEntry {
	if connectivity.TotalProbes == 0 {
		return nil
	}
	if !connectivity.IsPortOpen {
		return []DiagnosisEntry{{
			Severity:    "critical",
			Category:    "network",
			Description: fmt.Sprintf("Port %d is not open — fterm.exe may not be listening.", connectivity.TargetPort),
			Suggestion:  "Check if fterm.exe started successfully. Look at process output for bind errors or crashes.",
		}}
	}
	return nil
}

// diagnoseHTTPIssues flags HTTP health endpoint failures.
func diagnoseHTTPIssues(connectivity ConnectivitySummary) []DiagnosisEntry {
	if connectivity.TotalProbes == 0 {
		return nil
	}

	// Port is open but HTTP fails → server is listening but not serving HTTP
	if connectivity.IsPortOpen && !connectivity.IsHTTPHealthy {
		return []DiagnosisEntry{{
			Severity:    "critical",
			Category:    "http",
			Description: "Port is open but HTTP /api/version is not responding.",
			Suggestion:  "The Go HTTP server may have crashed or failed to initialize routes. Check process stderr for panics.",
		}}
	}

	// Intermittent HTTP failures (below 80% success)
	const minimumAcceptableHTTPSuccessRate = 80.0
	if connectivity.HTTPSuccessRate > 0 && connectivity.HTTPSuccessRate < minimumAcceptableHTTPSuccessRate {
		return []DiagnosisEntry{{
			Severity:    "warning",
			Category:    "http",
			Description: fmt.Sprintf("HTTP health check success rate is only %.0f%% — intermittent failures detected.", connectivity.HTTPSuccessRate),
			Suggestion:  "The server may be overloaded or restarting. Check system resources and process output.",
		}}
	}

	return nil
}

// diagnoseWebSocketIssues flags WebSocket handshake failures.
func diagnoseWebSocketIssues(connectivity ConnectivitySummary) []DiagnosisEntry {
	if connectivity.TotalProbes == 0 {
		return nil
	}

	// HTTP works but WebSocket fails → likely a WS upgrade issue
	if connectivity.IsHTTPHealthy && !connectivity.IsWebSocketConnected {
		return []DiagnosisEntry{{
			Severity:    "critical",
			Category:    "websocket",
			Description: "HTTP is healthy but WebSocket handshake fails — this is the likely root cause of terminal connection failures.",
			Suggestion:  "Check for: (1) proxy stripping Upgrade headers, (2) antivirus/firewall blocking WS, (3) server-side WS handler errors in stderr.",
		}}
	}

	// Intermittent WS failures
	const minimumAcceptableWSSuccessRate = 80.0
	if connectivity.WSSuccessRate > 0 && connectivity.WSSuccessRate < minimumAcceptableWSSuccessRate {
		return []DiagnosisEntry{{
			Severity:    "warning",
			Category:    "websocket",
			Description: fmt.Sprintf("WebSocket success rate is only %.0f%% — intermittent connection drops.", connectivity.WSSuccessRate),
			Suggestion:  "This may indicate resource exhaustion or connection limits. Check process memory usage.",
		}}
	}

	return nil
}

// diagnoseProcessIssues flags abnormal process lifecycle events.
func diagnoseProcessIssues(processInfo ProcessSummary) []DiagnosisEntry {
	if !processInfo.WasLaunched {
		return nil
	}

	var entries []DiagnosisEntry

	// Process crashed (non-zero exit)
	if !processInfo.IsStillRunning && processInfo.ExitCode != 0 {
		entries = append(entries, DiagnosisEntry{
			Severity:    "critical",
			Category:    "process",
			Description: fmt.Sprintf("fterm.exe exited with code %d: %s", processInfo.ExitCode, processInfo.ExitError),
			Suggestion:  "Check process output for error messages, panics, or unhandled exceptions.",
		})
	}

	// No output captured at all → process may have silently failed
	if processInfo.TotalLogLines == 0 && processInfo.UptimeSeconds > 5 {
		entries = append(entries, DiagnosisEntry{
			Severity:    "warning",
			Category:    "process",
			Description: "No stdout/stderr output captured from fterm.exe after 5+ seconds.",
			Suggestion:  "The process may have frozen or output is being redirected. Try running fterm.exe manually in a terminal.",
		})
	}

	return entries
}

// diagnoseProcessOutputErrors scans the captured process output for common
// error patterns that indicate startup failures or runtime crashes.
func diagnoseProcessOutputErrors(logLines []TimestampedLogLine) []DiagnosisEntry {
	var entries []DiagnosisEntry

	errorPatterns := map[string]string{
		"panic:":                "Go runtime panic detected in fterm.exe output.",
		"bind: address already": "Port bind failure — another process is using the same port.",
		"permission denied":     "Permission denied error — check file/network permissions.",
		"fatal error":           "Fatal error detected in fterm.exe output.",
		"out of memory":         "Out of memory condition — close other applications.",
		"tls handshake":         "TLS handshake error — check certificate configuration.",
	}

	for _, logLine := range logLines {
		loweredText := strings.ToLower(logLine.Text)
		for pattern, description := range errorPatterns {
			if strings.Contains(loweredText, pattern) {
				entries = append(entries, DiagnosisEntry{
					Severity:    "critical",
					Category:    "process_output",
					Description: fmt.Sprintf("%s Found in %s at %s", description, logLine.Stream, logLine.Timestamp.Format(time.RFC3339)),
					Suggestion:  fmt.Sprintf("Relevant log line: %s", truncateString(logLine.Text, 200)),
				})
			}
		}
	}

	return entries
}

// ── Human-Readable Summary ───────────────────────────────────────────────────────

// renderHumanSummary generates a text overview at the top of the report that
// a support person can read without parsing JSON. Includes pass/fail badges
// and the auto-diagnosis results.
func renderHumanSummary(report DiagnosticReport) string {
	var summaryBuilder strings.Builder

	summaryBuilder.WriteString("═══════════════════════════════════════════════════\n")
	summaryBuilder.WriteString("  FORGE TERMINAL DIAGNOSTIC REPORT\n")
	summaryBuilder.WriteString(fmt.Sprintf("  Generated: %s\n", report.GeneratedAt))
	summaryBuilder.WriteString(fmt.Sprintf("  Tool Version: %s\n", report.ToolVersion))
	summaryBuilder.WriteString("═══════════════════════════════════════════════════\n\n")

	// Pre-launch check summary
	summaryBuilder.WriteString("── Pre-Launch Checks ──\n")
	for _, check := range report.PreLaunchChecks {
		badge := formatSummaryBadge(check.Status)
		summaryBuilder.WriteString(fmt.Sprintf("  %s %s: %s\n", badge, check.Name, check.Detail))
	}

	// Connectivity summary
	summaryBuilder.WriteString("\n── Connectivity ──\n")
	summaryBuilder.WriteString(fmt.Sprintf("  Port %d:   %s\n", report.Connectivity.TargetPort, formatBoolBadge(report.Connectivity.IsPortOpen)))
	summaryBuilder.WriteString(fmt.Sprintf("  HTTP:      %s (%.0f%% success)\n", formatBoolBadge(report.Connectivity.IsHTTPHealthy), report.Connectivity.HTTPSuccessRate))
	summaryBuilder.WriteString(fmt.Sprintf("  WebSocket: %s (%.0f%% success)\n", formatBoolBadge(report.Connectivity.IsWebSocketConnected), report.Connectivity.WSSuccessRate))
	summaryBuilder.WriteString(fmt.Sprintf("  Total probes: %d\n", report.Connectivity.TotalProbes))

	// Process summary
	summaryBuilder.WriteString("\n── Process ──\n")
	if report.ProcessInfo.WasLaunched {
		summaryBuilder.WriteString(fmt.Sprintf("  Running: %v | Exit code: %d | Uptime: %ds | Log lines: %d\n",
			report.ProcessInfo.IsStillRunning, report.ProcessInfo.ExitCode,
			report.ProcessInfo.UptimeSeconds, report.ProcessInfo.TotalLogLines))
	} else {
		summaryBuilder.WriteString("  fterm.exe was not launched\n")
	}

	// Auto-diagnosis
	summaryBuilder.WriteString("\n── Auto-Diagnosis ──\n")
	for _, diagnosis := range report.AutoDiagnosis {
		severityBadge := formatSeverityBadge(diagnosis.Severity)
		summaryBuilder.WriteString(fmt.Sprintf("  %s [%s] %s\n", severityBadge, diagnosis.Category, diagnosis.Description))
		if diagnosis.Suggestion != "" {
			summaryBuilder.WriteString(fmt.Sprintf("    → %s\n", diagnosis.Suggestion))
		}
	}

	summaryBuilder.WriteString("\n═══════════════════════════════════════════════════\n")
	summaryBuilder.WriteString("  END OF SUMMARY — Full JSON data follows below\n")
	summaryBuilder.WriteString("═══════════════════════════════════════════════════\n")

	return summaryBuilder.String()
}

// formatSummaryBadge returns a text badge for check status (pass/fail/warn).
func formatSummaryBadge(status string) string {
	switch status {
	case "pass":
		return "[PASS]"
	case "fail":
		return "[FAIL]"
	case "warn":
		return "[WARN]"
	default:
		return "[----]"
	}
}

// formatBoolBadge returns PASS or FAIL based on a boolean value.
func formatBoolBadge(isHealthy bool) string {
	if isHealthy {
		return "[PASS]"
	}
	return "[FAIL]"
}

// formatSeverityBadge returns a severity indicator for diagnosis entries.
func formatSeverityBadge(severity string) string {
	switch severity {
	case "critical":
		return "[!!]"
	case "warning":
		return "[! ]"
	case "info":
		return "[i ]"
	default:
		return "[  ]"
	}
}

// ── Clipboard Export ─────────────────────────────────────────────────────────────

// copyReportToClipboard serializes the report as the human-readable summary
// followed by the full JSON payload, then copies it to the system clipboard.
func copyReportToClipboard(report DiagnosticReport) error {
	jsonBytes, marshalError := json.MarshalIndent(report, "", "  ")
	if marshalError != nil {
		return fmt.Errorf("failed to serialize report: %w", marshalError)
	}

	// Combine human summary + JSON for maximum utility
	fullReport := report.HumanSummary + "\n" + string(jsonBytes)

	if clipboardError := clipboard.WriteAll(fullReport); clipboardError != nil {
		return fmt.Errorf("failed to write to clipboard: %w", clipboardError)
	}

	return nil
}
