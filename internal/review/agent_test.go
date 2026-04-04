package review

import (
	"testing"
)

func TestExtractJSON_FromCodeFence(t *testing.T) {
	input := "Here's the review:\n```json\n{\"findings\": [], \"summary\": \"Clean code\", \"score\": 95}\n```\n"
	result := extractJSON(input)
	if result != `{"findings": [], "summary": "Clean code", "score": 95}` {
		t.Errorf("extractJSON code fence: got %q", result)
	}
}

func TestExtractJSON_RawJSON(t *testing.T) {
	input := `{"findings": [{"filePath": "main.go", "line": 1, "severity": "info", "focusArea": "naming", "title": "Good", "description": "ok", "suggestion": "none"}], "summary": "Fine", "score": 90}`
	result := extractJSON(input)
	if result != input {
		t.Errorf("extractJSON raw: got %q", result)
	}
}

func TestExtractJSON_WithPreamble(t *testing.T) {
	input := `Some preamble text before the JSON: {"findings": [], "summary": "ok", "score": 100}`
	result := extractJSON(input)
	expected := `{"findings": [], "summary": "ok", "score": 100}`
	if result != expected {
		t.Errorf("extractJSON with preamble: got %q, want %q", result, expected)
	}
}

func TestParseReviewResponse_ValidJSON(t *testing.T) {
	input := `{"findings": [{"filePath": "handler.go", "line": 42, "severity": "warning", "focusArea": "naming", "title": "Generic name", "description": "Variable 'data' is too generic", "suggestion": "Rename to 'sessionData'"}], "summary": "One naming issue found", "score": 85}`

	report, err := parseReviewResponse(input)
	if err != nil {
		t.Fatalf("parseReviewResponse: unexpected error: %v", err)
	}

	if len(report.Findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(report.Findings))
	}

	finding := report.Findings[0]
	if finding.FilePath != "handler.go" {
		t.Errorf("finding.FilePath = %q, want 'handler.go'", finding.FilePath)
	}
	if finding.Line != 42 {
		t.Errorf("finding.Line = %d, want 42", finding.Line)
	}
	if finding.Severity != SeverityWarning {
		t.Errorf("finding.Severity = %q, want 'warning'", finding.Severity)
	}
	if finding.FocusArea != FocusNaming {
		t.Errorf("finding.FocusArea = %q, want 'naming'", finding.FocusArea)
	}

	if report.Score != 85 {
		t.Errorf("score = %d, want 85", report.Score)
	}
	if report.Summary != "One naming issue found" {
		t.Errorf("summary = %q, want 'One naming issue found'", report.Summary)
	}
}

func TestParseReviewResponse_InvalidJSON(t *testing.T) {
	_, err := parseReviewResponse("not json at all")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestTruncateDiff_ShortDiff(t *testing.T) {
	diff := "short diff"
	result := truncateDiff(diff, 100)
	if result != diff {
		t.Errorf("truncateDiff short: got %q, want %q", result, diff)
	}
}

func TestTruncateDiff_LongDiff(t *testing.T) {
	// Create a diff with multiple lines that exceeds the limit
	diff := ""
	for i := 0; i < 100; i++ {
		diff += "+added line number " + string(rune('0'+i%10)) + "\n"
	}

	result := truncateDiff(diff, 200)
	if len(result) > 300 { // Some slack for the truncation notice
		t.Errorf("truncateDiff long: result too long (%d chars)", len(result))
	}
	if !containsSubstring(result, "diff truncated") {
		t.Error("truncateDiff long: missing truncation notice")
	}
}

func TestReviewReport_CountBySeverity(t *testing.T) {
	report := &ReviewReport{
		Findings: []ReviewFinding{
			{Severity: SeverityCritical},
			{Severity: SeverityWarning},
			{Severity: SeverityWarning},
			{Severity: SeverityInfo},
			{Severity: SeverityInfo},
			{Severity: SeverityInfo},
		},
	}

	counts := report.CountBySeverity()
	if counts[SeverityCritical] != 1 {
		t.Errorf("critical count = %d, want 1", counts[SeverityCritical])
	}
	if counts[SeverityWarning] != 2 {
		t.Errorf("warning count = %d, want 2", counts[SeverityWarning])
	}
	if counts[SeverityInfo] != 3 {
		t.Errorf("info count = %d, want 3", counts[SeverityInfo])
	}
}

func TestReviewReport_HasCritical(t *testing.T) {
	withCritical := &ReviewReport{
		Findings: []ReviewFinding{{Severity: SeverityCritical}},
	}
	if !withCritical.HasCritical() {
		t.Error("HasCritical should return true when critical finding present")
	}

	withoutCritical := &ReviewReport{
		Findings: []ReviewFinding{{Severity: SeverityWarning}, {Severity: SeverityInfo}},
	}
	if withoutCritical.HasCritical() {
		t.Error("HasCritical should return false when no critical findings")
	}

	emptyReport := &ReviewReport{Findings: []ReviewFinding{}}
	if emptyReport.HasCritical() {
		t.Error("HasCritical should return false for empty report")
	}
}

func TestReviewAgent_EmptyDiff(t *testing.T) {
	agent := NewAgent()
	request := ReviewRequest{
		ProjectPath:  "/tmp/test",
		Diff:         "",
		ChangedFiles: []string{},
		Strictness:   StrictnessStandard,
		FocusAreas:   []FocusArea{FocusNaming},
	}

	report, err := agent.Review(t.Context(), request)
	if err != nil {
		t.Fatalf("Review empty diff: unexpected error: %v", err)
	}
	if report.Score != 100 {
		t.Errorf("empty diff score = %d, want 100", report.Score)
	}
	if report.Summary != "No changes to review." {
		t.Errorf("empty diff summary = %q", report.Summary)
	}
}

func containsSubstring(haystack, needle string) bool {
	return len(haystack) >= len(needle) && searchSubstring(haystack, needle)
}

func searchSubstring(haystack, needle string) bool {
	for i := 0; i <= len(haystack)-len(needle); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
