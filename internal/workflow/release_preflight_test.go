package workflow

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCheckChangelogExists verifies the CHANGELOG presence check.
func TestCheckChangelogExists(t *testing.T) {
	t.Run("pass when CHANGELOG.md exists", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte("# Changelog\n"), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkChangelogExists(dir, report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		check := report.Checks[0]
		if check.ID != "changelog-exists" {
			t.Errorf("expected id 'changelog-exists', got '%s'", check.ID)
		}
		if check.Status != PreflightPass {
			t.Errorf("expected pass, got %s", check.Status)
		}
		if check.Severity != PreflightBlocking {
			t.Errorf("expected blocking severity, got %s", check.Severity)
		}
	})

	t.Run("fail when CHANGELOG.md missing", func(t *testing.T) {
		dir := t.TempDir()

		report := &PreflightReport{}
		checkChangelogExists(dir, report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		check := report.Checks[0]
		if check.Status != PreflightFail {
			t.Errorf("expected fail, got %s", check.Status)
		}
		if check.Suggestion == "" {
			t.Error("expected a suggestion on failure")
		}
	})
}

// TestCheckChangelogUpdated verifies version mention detection.
func TestCheckChangelogUpdated(t *testing.T) {
	t.Run("pass when version is present", func(t *testing.T) {
		dir := t.TempDir()
		content := "# Changelog\n\n## [5.3.0] - 2026-04-10\n\n### Added\n- Feature X\n"
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkChangelogUpdated(dir, "5.3.0", report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		if report.Checks[0].Status != PreflightPass {
			t.Errorf("expected pass, got %s", report.Checks[0].Status)
		}
	})

	t.Run("pass when v-prefixed version is present", func(t *testing.T) {
		dir := t.TempDir()
		content := "# Changelog\n\n## [v5.3.0] - 2026-04-10\n"
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkChangelogUpdated(dir, "v5.3.0", report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		if report.Checks[0].Status != PreflightPass {
			t.Errorf("expected pass, got %s", report.Checks[0].Status)
		}
	})

	t.Run("fail when version is missing", func(t *testing.T) {
		dir := t.TempDir()
		content := "# Changelog\n\n## [5.2.0] - 2026-04-01\n"
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkChangelogUpdated(dir, "5.3.0", report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		if report.Checks[0].Status != PreflightFail {
			t.Errorf("expected fail, got %s", report.Checks[0].Status)
		}
	})

	t.Run("skip when no version specified", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte("# Changelog\n"), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkChangelogUpdated(dir, "", report)

		if len(report.Checks) != 0 {
			t.Errorf("expected 0 checks when version is empty, got %d", len(report.Checks))
		}
	})

	t.Run("skip when CHANGELOG.md missing", func(t *testing.T) {
		dir := t.TempDir()

		report := &PreflightReport{}
		checkChangelogUpdated(dir, "5.3.0", report)

		// Should silently skip — changelog-exists handles the missing file
		if len(report.Checks) != 0 {
			t.Errorf("expected 0 checks when file missing, got %d", len(report.Checks))
		}
	})
}

// TestCheckWorkflowConfig verifies workflow.json detection.
func TestCheckWorkflowConfig(t *testing.T) {
	t.Run("pass when .forge/workflow.json exists", func(t *testing.T) {
		dir := t.TempDir()
		forgeDir := filepath.Join(dir, ".forge")
		if err := os.MkdirAll(forgeDir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(forgeDir, "workflow.json"), []byte("{}"), 0644); err != nil {
			t.Fatal(err)
		}

		report := &PreflightReport{}
		checkWorkflowConfig(dir, report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		if report.Checks[0].Status != PreflightPass {
			t.Errorf("expected pass, got %s", report.Checks[0].Status)
		}
	})

	t.Run("fail when .forge/workflow.json missing", func(t *testing.T) {
		dir := t.TempDir()

		report := &PreflightReport{}
		checkWorkflowConfig(dir, report)

		if len(report.Checks) != 1 {
			t.Fatalf("expected 1 check, got %d", len(report.Checks))
		}
		if report.Checks[0].Status != PreflightFail {
			t.Errorf("expected fail, got %s", report.Checks[0].Status)
		}
	})
}

// TestTruncateOutput verifies the string truncation helper.
func TestTruncateOutput(t *testing.T) {
	t.Run("short string unchanged", func(t *testing.T) {
		result := truncateOutput("hello", 10)
		if result != "hello" {
			t.Errorf("expected 'hello', got '%s'", result)
		}
	})

	t.Run("long string truncated with suffix", func(t *testing.T) {
		input := strings.Repeat("x", 100)
		result := truncateOutput(input, 50)
		if !strings.HasSuffix(result, "... (truncated)") {
			t.Errorf("expected truncated suffix, got '%s'", result)
		}
		// The truncated portion should be 50 chars (before suffix)
		if !strings.Contains(result, strings.Repeat("x", 50)) {
			t.Error("expected first 50 chars to be preserved")
		}
	})

	t.Run("trims whitespace", func(t *testing.T) {
		result := truncateOutput("  hello  ", 100)
		if result != "hello" {
			t.Errorf("expected 'hello', got '%s'", result)
		}
	})
}

// TestGenerateFixPrompt verifies the fix prompt output format.
func TestGenerateFixPrompt(t *testing.T) {
	t.Run("includes blocking items with numbered list", func(t *testing.T) {
		report := &PreflightReport{
			Checks: []PreflightCheck{
				{
					ID:         "changelog-exists",
					Name:       "CHANGELOG Exists",
					Severity:   PreflightBlocking,
					Status:     PreflightFail,
					Message:    "CHANGELOG.md not found",
					Suggestion: "Create CHANGELOG.md",
				},
				{
					ID:       "go-build",
					Name:     "Go Build",
					Severity: PreflightBlocking,
					Status:   PreflightPass,
					Message:  "Build succeeded",
				},
				{
					ID:         "branch-naming",
					Name:       "Branch Naming",
					Severity:   PreflightWarning,
					Status:     PreflightFail,
					Message:    "Branch 'xyz' invalid",
					Suggestion: "Rename to feature/xyz",
				},
			},
		}

		prompt := generateFixPrompt(report)

		if !strings.Contains(prompt, "BLOCKING") {
			t.Error("expected BLOCKING section header")
		}
		if !strings.Contains(prompt, "CHANGELOG Exists") {
			t.Error("expected changelog check name in prompt")
		}
		if !strings.Contains(prompt, "Create CHANGELOG.md") {
			t.Error("expected suggestion in prompt")
		}
		// The passing check should NOT appear in the fix prompt
		if strings.Contains(prompt, "Build succeeded") {
			t.Error("passing checks should not appear in fix prompt")
		}
		if !strings.Contains(prompt, "WARNINGS") {
			t.Error("expected WARNINGS section for warning-level failures")
		}
		if !strings.Contains(prompt, "Branch Naming") {
			t.Error("expected warning item in prompt")
		}
	})

	t.Run("empty when all checks pass", func(t *testing.T) {
		report := &PreflightReport{
			Checks: []PreflightCheck{
				{Status: PreflightPass, Severity: PreflightBlocking},
				{Status: PreflightPass, Severity: PreflightWarning},
			},
		}

		prompt := generateFixPrompt(report)

		// No blocking or warning items — should still produce the header and footer
		if !strings.Contains(prompt, "re-run the release") {
			t.Error("expected footer text even with no failures")
		}
	})
}

// TestPreflightReportSummary verifies the pass/block/warning counting logic.
func TestPreflightReportSummary(t *testing.T) {
	// Simulate the counting logic from ScanReleasePreflight
	report := &PreflightReport{
		Checks: []PreflightCheck{
			{Status: PreflightPass, Severity: PreflightBlocking},
			{Status: PreflightPass, Severity: PreflightWarning},
			{Status: PreflightFail, Severity: PreflightBlocking},
			{Status: PreflightFail, Severity: PreflightWarning},
			{Status: PreflightPass, Severity: PreflightBlocking},
		},
	}

	// Replicate the summary logic from ScanReleasePreflight
	for _, check := range report.Checks {
		if check.Status == PreflightPass {
			report.PassingCount++
		} else if check.Severity == PreflightBlocking {
			report.BlockingCount++
		} else {
			report.WarningCount++
		}
	}

	if report.PassingCount != 3 {
		t.Errorf("expected 3 passing, got %d", report.PassingCount)
	}
	if report.BlockingCount != 1 {
		t.Errorf("expected 1 blocking, got %d", report.BlockingCount)
	}
	if report.WarningCount != 1 {
		t.Errorf("expected 1 warning, got %d", report.WarningCount)
	}

	// With blockers present, should be fail status
	if report.BlockingCount > 0 {
		report.Status = "fail"
		report.CanRelease = false
	}
	if report.CanRelease {
		t.Error("expected CanRelease=false when blocking count > 0")
	}
	if report.Status != "fail" {
		t.Errorf("expected status 'fail', got '%s'", report.Status)
	}
}

// TestCheckGoBuildsSkipsNonGoProject verifies the Go build check is
// skipped when no go.mod exists (not a Go project).
func TestCheckGoBuildsSkipsNonGoProject(t *testing.T) {
	dir := t.TempDir()

	report := &PreflightReport{}
	checkGoBuilds(dir, report)

	if len(report.Checks) != 0 {
		t.Errorf("expected 0 checks for non-Go project, got %d", len(report.Checks))
	}
}

// TestCheckGoTestsSkipsNonGoProject verifies the Go test check is
// skipped when no go.mod exists.
func TestCheckGoTestsSkipsNonGoProject(t *testing.T) {
	dir := t.TempDir()

	report := &PreflightReport{}
	checkGoTests(dir, report)

	if len(report.Checks) != 0 {
		t.Errorf("expected 0 checks for non-Go project, got %d", len(report.Checks))
	}
}

// TestCheckFrontendTestsSkipsNonFrontendProject verifies the frontend test check
// is skipped when no frontend/package.json exists.
func TestCheckFrontendTestsSkipsNonFrontendProject(t *testing.T) {
	dir := t.TempDir()

	report := &PreflightReport{}
	checkFrontendTests(dir, report)

	if len(report.Checks) != 0 {
		t.Errorf("expected 0 checks for non-frontend project, got %d", len(report.Checks))
	}
}
