// report_test.go — Unit tests for the diagnostic report builder and auto-diagnosis engine.
package main

import (
	"fmt"
	"testing"
	"time"
)

func TestBuildDiagnosticReport_NilSources(t *testing.T) {
	checks := []CheckResult{{Name: "Test", Status: "pass", Detail: "OK"}}
	report := buildDiagnosticReport(checks, nil, nil, 9119)

	if report.FormatVersion != ReportFormatVersion {
		t.Errorf("format version mismatch: %q", report.FormatVersion)
	}
	if report.Connectivity.TargetPort != 9119 {
		t.Errorf("port mismatch: %d", report.Connectivity.TargetPort)
	}
	if report.ProcessInfo.WasLaunched {
		t.Error("should not be launched with nil launcher")
	}
}

func TestCollectProcessOutput_Nil(t *testing.T) {
	if len(collectProcessOutput(nil)) != 0 {
		t.Error("expected empty for nil launcher")
	}
}

func TestCollectProbeTimeline_Nil(t *testing.T) {
	if len(collectProbeTimeline(nil)) != 0 {
		t.Error("expected empty for nil timeline")
	}
}

func TestDiagnosePreCheckFailures_OnlyFlagsFailStatus(t *testing.T) {
	checks := []CheckResult{
		{Name: "Good", Status: "pass"},
		{Name: "Bad", Status: "fail", Detail: "broken", Suggestion: "fix"},
		{Name: "Meh", Status: "warn"},
	}
	entries := diagnosePreCheckFailures(checks)
	if len(entries) != 1 || entries[0].Severity != "critical" {
		t.Errorf("unexpected entries: %v", entries)
	}
}

func TestDiagnosePortIssues_Closed(t *testing.T) {
	entries := diagnosePortIssues(ConnectivitySummary{IsPortOpen: false, TotalProbes: 6, TargetPort: 9119})
	if len(entries) != 1 {
		t.Fatal("expected 1 entry")
	}
}

func TestDiagnosePortIssues_NoProbes(t *testing.T) {
	if diagnosePortIssues(ConnectivitySummary{TotalProbes: 0}) != nil {
		t.Error("expected nil for no probes")
	}
}

func TestDiagnoseWebSocketIssues_HTTPUpWSDown(t *testing.T) {
	entries := diagnoseWebSocketIssues(ConnectivitySummary{IsHTTPHealthy: true, IsWebSocketConnected: false, TotalProbes: 6})
	if len(entries) != 1 || entries[0].Category != "websocket" {
		t.Errorf("unexpected: %v", entries)
	}
}

func TestDiagnoseProcessOutputErrors_PanicDetected(t *testing.T) {
	lines := []TimestampedLogLine{
		{Timestamp: time.Now(), Stream: "stderr", Text: "panic: runtime error: nil pointer"},
	}
	entries := diagnoseProcessOutputErrors(lines)
	if len(entries) == 0 {
		t.Fatal("expected panic diagnosis")
	}
}

func TestFormatSummaryBadge_AllStatuses(t *testing.T) {
	cases := map[string]string{"pass": "[PASS]", "fail": "[FAIL]", "warn": "[WARN]", "x": "[----]"}
	for status, want := range cases {
		if got := formatSummaryBadge(status); got != want {
			t.Errorf("formatSummaryBadge(%q) = %q, want %q", status, got, want)
		}
	}
}

func TestFormatBoolBadge_Values(t *testing.T) {
	if formatBoolBadge(true) != "[PASS]" || formatBoolBadge(false) != "[FAIL]" {
		t.Error("badge mismatch")
	}
}

func TestFormatSeverityBadge_Values(t *testing.T) {
	if formatSeverityBadge("critical") != "[!!]" || formatSeverityBadge("info") != "[i ]" {
		t.Error("severity badge mismatch")
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
