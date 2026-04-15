// report_test.go — Unit tests for the diagnostic report builder and auto-diagnosis engine.
package main

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestBuildDiagnosticReport_NilSources(t *testing.T) {
	checks := []CheckResult{{Name: "Test", Status: "pass", Detail: "OK"}}
	report := buildDiagnosticReport(checks, nil, nil, 9119)

	if report.ToolVersion != DebugToolVersion {
		t.Errorf("tool version mismatch: %q", report.ToolVersion)
	}
	if report.ForgePort != 9119 {
		t.Errorf("port mismatch: %d", report.ForgePort)
	}
	if report.ProcessInfo.IsRunning {
		t.Error("should not be running with nil launcher")
	}
	if len(report.MonitorTimeline) != 0 {
		t.Error("expected empty timeline for nil monitor")
	}
	if len(report.ProcessLog) != 0 {
		t.Error("expected empty process log for nil launcher")
	}
}

func TestCollectProcessOutput_Nil(t *testing.T) {
	if len(collectProcessOutput(nil)) != 0 {
		t.Error("expected empty for nil launcher")
	}
}

func TestExtractProbeResults_Nil(t *testing.T) {
	if len(extractProbeResults(nil)) != 0 {
		t.Error("expected empty for nil timeline")
	}
}

func TestBuildConnectivitySummary_NilTimeline(t *testing.T) {
	summary := buildConnectivitySummary(nil)
	if summary.TotalProbes != 0 || summary.IsPortOpen || summary.IsHTTPResponding {
		t.Error("expected zeroed summary for nil timeline")
	}
}

func TestDiagnosePreLaunchFailures_OnlyFlagsFailStatus(t *testing.T) {
	checks := []CheckResult{
		{Name: "Good", Status: "pass"},
		{Name: "Bad Port", Status: "fail", Detail: "broken", Suggestion: "fix"},
		{Name: "Meh", Status: "warn"},
	}
	entries := diagnosePreLaunchFailures(checks)
	if len(entries) != 1 || entries[0].Severity != SeverityCritical {
		t.Errorf("unexpected entries: %v", entries)
	}
}

func TestDiagnoseNoConnectivity_AllDown(t *testing.T) {
	entry := diagnoseNoConnectivity(ConnectivitySummary{
		IsPortOpen: false, IsHTTPResponding: false, IsWebSocketConnecting: false, TotalProbes: 6,
	})
	if entry.Issue == "" {
		t.Fatal("expected diagnosis for completely down connectivity")
	}
	if entry.Severity != SeverityCritical {
		t.Errorf("expected critical severity, got %s", entry.Severity)
	}
}

func TestDiagnoseConnectivityPatterns_NoProbes(t *testing.T) {
	entries := diagnoseConnectivityPatterns(ConnectivitySummary{TotalProbes: 0})
	if entries != nil {
		t.Error("expected nil for no probes")
	}
}

func TestDiagnoseHTTPUpWebSocketDown(t *testing.T) {
	entry := diagnoseHTTPUpWebSocketDown(ConnectivitySummary{
		IsHTTPResponding: true, IsWebSocketConnecting: false, TotalProbes: 6,
	})
	if entry.Issue == "" {
		t.Fatal("expected WebSocket diagnosis")
	}
	if !strings.Contains(entry.Issue, "WebSocket") {
		t.Errorf("expected WebSocket in issue, got: %s", entry.Issue)
	}
}

func TestDiagnoseCommonLogErrors_PanicDetected(t *testing.T) {
	lines := []TimestampedLogLine{
		{Timestamp: time.Now(), Stream: "stderr", Text: "panic: runtime error: nil pointer"},
	}
	entries := diagnoseCommonLogErrors(lines)
	if len(entries) == 0 {
		t.Fatal("expected panic diagnosis")
	}
}

func TestMapCheckStatusToEmoji_AllStatuses(t *testing.T) {
	cases := map[string]string{"pass": emojiPass, "fail": emojiFail, "warn": emojiWarn, "x": emojiWarn}
	for status, want := range cases {
		if got := mapCheckStatusToEmoji(status); got != want {
			t.Errorf("mapCheckStatusToEmoji(%q) = %q, want %q", status, got, want)
		}
	}
}

func TestFormatBoolEmoji_Values(t *testing.T) {
	if formatBoolEmoji(true) != emojiPass || formatBoolEmoji(false) != emojiFail {
		t.Error("emoji mismatch")
	}
}

func TestMapSeverityToEmoji_Values(t *testing.T) {
	if mapSeverityToEmoji(SeverityCritical) != emojiCritical || mapSeverityToEmoji(SeverityInfo) != emojiInfoIcon {
		t.Error("severity emoji mismatch")
	}
}

func TestFormatReportAsJSON_ValidOutput(t *testing.T) {
	report := &DiagnosticReport{
		GeneratedAt: time.Now().UTC(),
		ToolVersion: DebugToolVersion,
		ForgePort:   9119,
	}
	jsonOutput, formatError := formatReportAsJSON(report)
	if formatError != nil {
		t.Fatalf("unexpected error: %v", formatError)
	}
	if !strings.Contains(jsonOutput, "generatedAt") {
		t.Error("expected JSON to contain generatedAt field")
	}
}

func TestTailLogLines_UnderLimit(t *testing.T) {
	lines := []TimestampedLogLine{{Text: "a"}, {Text: "b"}}
	result := tailLogLines(lines, 10)
	if len(result) != 2 {
		t.Errorf("expected 2 lines, got %d", len(result))
	}
}

func TestTailLogLines_OverLimit(t *testing.T) {
	lines := make([]TimestampedLogLine, 100)
	for idx := range lines {
		lines[idx] = TimestampedLogLine{Text: fmt.Sprintf("line-%d", idx)}
	}
	result := tailLogLines(lines, 10)
	if len(result) != 10 {
		t.Errorf("expected 10 lines, got %d", len(result))
	}
	if result[0].Text != "line-90" {
		t.Errorf("expected first line to be line-90, got %s", result[0].Text)
	}
}

func TestTruncateResponseBody_Short(t *testing.T) {
	if truncateResponseBody("short", nil) != "short" {
		t.Error("should not truncate short body")
	}
}

func TestTruncateResponseBody_ReadError(t *testing.T) {
	if truncateResponseBody("", fmt.Errorf("err")) != "[unreadable body]" {
		t.Error("should return placeholder on error")
	}
}
