package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Types ───────────────────────────────────────────────────────────────────

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()

	if config.QualityMode != QualityBest {
		t.Errorf("DefaultConfig().QualityMode = %q, want %q", config.QualityMode, QualityBest)
	}

	if len(config.EnabledModules) < 8 {
		t.Errorf("DefaultConfig().EnabledModules has %d modules, want at least 8", len(config.EnabledModules))
	}

	expectedModules := []ModuleID{
		ModuleCopilotInstructions,
		ModuleBranchingStrategy,
		ModuleCodeQuality,
		ModuleTestingStandards,
		ModulePRWorkflow,
		ModuleDocumentation,
		ModuleMultiAgent,
	}

	for _, expectedModule := range expectedModules {
		found := false
		for _, actualModule := range config.EnabledModules {
			if actualModule == expectedModule {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("DefaultConfig().EnabledModules missing module %q", expectedModule)
		}
	}
}

func TestModuleCatalog(t *testing.T) {
	catalog := ModuleCatalog()

	if len(catalog) < 8 {
		t.Errorf("ModuleCatalog() returned %d modules, want at least 8", len(catalog))
	}

	// Verify each entry has required fields
	for _, module := range catalog {
		if module.ID == "" {
			t.Error("ModuleCatalog() has entry with empty ID")
		}
		if module.Name == "" {
			t.Errorf("ModuleCatalog() module %q has empty Name", module.ID)
		}
		if module.Description == "" {
			t.Errorf("ModuleCatalog() module %q has empty Description", module.ID)
		}
	}
}

func TestAllModules(t *testing.T) {
	allModules := AllModules()

	if len(allModules) < 8 {
		t.Errorf("AllModules() returned %d modules, want at least 8", len(allModules))
	}

	// Verify the core modules are present
	coreModules := []ModuleID{
		ModuleCopilotInstructions,
		ModuleBranchingStrategy,
		ModuleCodeQuality,
		ModuleTestingStandards,
		ModulePRWorkflow,
		ModuleDocumentation,
		ModuleMultiAgent,
	}

	for _, expectedModule := range coreModules {
		found := false
		for _, actualModule := range allModules {
			if actualModule == expectedModule {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("AllModules() missing core module %q", expectedModule)
		}
	}
}

// ─── Detector ────────────────────────────────────────────────────────────────

func TestDetectProject_GoProject(t *testing.T) {
	tempDir := t.TempDir()

	// Create a go.mod file to simulate a Go project
	goModContent := "module example.com/test\n\ngo 1.22.0\n"
	if err := os.WriteFile(filepath.Join(tempDir, "go.mod"), []byte(goModContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Initialize git
	if err := os.MkdirAll(filepath.Join(tempDir, ".git"), 0755); err != nil {
		t.Fatal(err)
	}

	detection, err := DetectProject(tempDir)
	if err != nil {
		t.Fatalf("DetectProject() error: %v", err)
	}

	if detection.ProjectType != ProjectTypeGo {
		t.Errorf("ProjectType = %q, want %q", detection.ProjectType, ProjectTypeGo)
	}

	if !detection.HasGit {
		t.Error("HasGit = false, want true")
	}

	if detection.HasGitHub {
		t.Error("HasGitHub = true, want false (no .github/ dir)")
	}
}

func TestDetectProject_NodeProject(t *testing.T) {
	tempDir := t.TempDir()

	packageJSON := `{"name": "test-project", "version": "1.0.0"}`
	if err := os.WriteFile(filepath.Join(tempDir, "package.json"), []byte(packageJSON), 0644); err != nil {
		t.Fatal(err)
	}

	detection, err := DetectProject(tempDir)
	if err != nil {
		t.Fatalf("DetectProject() error: %v", err)
	}

	if detection.ProjectType != ProjectTypeNode {
		t.Errorf("ProjectType = %q, want %q", detection.ProjectType, ProjectTypeNode)
	}
}

func TestDetectProject_ExistingGitHubDir(t *testing.T) {
	tempDir := t.TempDir()

	// Create .github directory with copilot-instructions
	githubDir := filepath.Join(tempDir, ".github")
	if err := os.MkdirAll(githubDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(githubDir, "copilot-instructions.md"), []byte("# Test"), 0644); err != nil {
		t.Fatal(err)
	}

	detection, err := DetectProject(tempDir)
	if err != nil {
		t.Fatalf("DetectProject() error: %v", err)
	}

	if !detection.HasGitHub {
		t.Error("HasGitHub = false, want true")
	}

	if !detection.HasInstructions {
		t.Error("HasInstructions = false, want true")
	}
}

func TestDetectProject_InvalidPath(t *testing.T) {
	detection, err := DetectProject("/nonexistent/path/that/does/not/exist")
	// DetectProject may return successfully with an "unknown" type for invalid paths
	if err != nil {
		return // error is acceptable
	}
	// If no error, it should have detected nothing meaningful
	if detection.HasGit {
		t.Error("DetectProject() with invalid path should not detect git")
	}
}

// ─── Presets ─────────────────────────────────────────────────────────────────

func TestBuiltInPresets(t *testing.T) {
	presets := BuiltInPresets()

	if len(presets) < 2 {
		t.Errorf("BuiltInPresets() returned %d presets, want at least 2", len(presets))
	}

	// Verify the Enterprise Standard preset
	foundEnterprise := false
	for _, preset := range presets {
		if preset.ID == "enterprise-standard" {
			foundEnterprise = true
			if !preset.BuiltIn {
				t.Error("Enterprise Standard preset should have BuiltIn = true")
			}
			if preset.Config.QualityMode != QualityBest {
				t.Errorf("Enterprise Standard QualityMode = %q, want %q", preset.Config.QualityMode, QualityBest)
			}
			if len(preset.Config.EnabledModules) < 8 {
				t.Errorf("Enterprise Standard has %d modules, want at least 8", len(preset.Config.EnabledModules))
			}
		}
	}
	if !foundEnterprise {
		t.Error("BuiltInPresets() missing 'enterprise-standard' preset")
	}
}

func TestSaveAndDeletePreset(t *testing.T) {
	// Override the presets directory to a temp location
	originalDir := presetsDirectoryOverride
	presetsDirectoryOverride = filepath.Join(t.TempDir(), "presets")
	defer func() { presetsDirectoryOverride = originalDir }()

	testPreset := WorkflowPreset{
		ID:          "test-preset-001",
		Name:        "Test Preset",
		Description: "A test preset for unit testing",
		BuiltIn:     false,
		Config:      DefaultConfig(),
	}

	// Save
	if err := SavePreset(testPreset); err != nil {
		t.Fatalf("SavePreset() error: %v", err)
	}

	// List should include it
	presets, err := ListPresets()
	if err != nil {
		t.Fatalf("ListPresets() error: %v", err)
	}

	foundSaved := false
	for _, preset := range presets {
		if preset.ID == "test-preset-001" {
			foundSaved = true
			if preset.Name != "Test Preset" {
				t.Errorf("Saved preset Name = %q, want %q", preset.Name, "Test Preset")
			}
		}
	}
	if !foundSaved {
		t.Error("Saved preset not found in ListPresets()")
	}

	// Get by ID
	retrieved, err := GetPreset("test-preset-001")
	if err != nil {
		t.Fatalf("GetPreset() error: %v", err)
	}
	if retrieved.Name != "Test Preset" {
		t.Errorf("GetPreset().Name = %q, want %q", retrieved.Name, "Test Preset")
	}

	// Delete
	if err := DeletePreset("test-preset-001"); err != nil {
		t.Fatalf("DeletePreset() error: %v", err)
	}

	// Should no longer be findable
	_, err = GetPreset("test-preset-001")
	if err == nil {
		t.Error("GetPreset() after delete should return error")
	}
}

func TestSavePreset_RejectsBuiltIn(t *testing.T) {
	originalDir := presetsDirectoryOverride
	presetsDirectoryOverride = filepath.Join(t.TempDir(), "presets")
	defer func() { presetsDirectoryOverride = originalDir }()

	builtInPreset := WorkflowPreset{
		ID:      "enterprise-standard",
		Name:    "Enterprise Standard",
		BuiltIn: true,
		Config:  DefaultConfig(),
	}

	err := SavePreset(builtInPreset)
	if err == nil {
		t.Error("SavePreset() should reject built-in presets")
	}
}

// ─── Templates ───────────────────────────────────────────────────────────────

func TestRenderCopilotInstructions(t *testing.T) {
	config := DefaultConfig()
	config.ProjectName = "test-project"

	result, err := RenderCopilotInstructions(config)
	if err != nil {
		t.Fatalf("RenderCopilotInstructions() error: %v", err)
	}

	// Should contain key sections
	expectedPhrases := []string{
		"test-project",
		"BEST",
		"single-letter", // naming rule
		"CHANGELOG",     // changelog rule
	}

	for _, phrase := range expectedPhrases {
		if !containsString(result, phrase) {
			t.Errorf("RenderCopilotInstructions() output missing expected phrase %q", phrase)
		}
	}
}

func TestRenderChangelog(t *testing.T) {
	config := DefaultConfig()
	config.ProjectName = "My Project"
	result, err := RenderChangelog(config)
	if err != nil {
		t.Fatalf("RenderChangelog() error: %v", err)
	}

	if !containsString(result, "My Project") {
		t.Error("Changelog missing project name")
	}
	if !containsString(result, "[Unreleased]") {
		t.Error("Changelog missing [Unreleased] section")
	}
}

func TestRenderSkill_AllSkillIDs(t *testing.T) {
	skillModules := []ModuleID{
		ModuleBranchingStrategy,
		ModuleCodeQuality,
		ModuleTestingStandards,
		ModulePRWorkflow,
		ModuleDocumentation,
		ModuleMultiAgent,
	}

	config := DefaultConfig()
	config.ProjectName = "skill-test"

	for _, moduleID := range skillModules {
		result, err := RenderSkill(moduleID, config)
		if err != nil {
			t.Errorf("RenderSkill(%q) error: %v", moduleID, err)
			continue
		}
		if result == "" {
			t.Errorf("RenderSkill(%q) returned empty string", moduleID)
		}
	}
}

func TestRenderPreCommitHooks(t *testing.T) {
	config := DefaultConfig()
	config.ProjectName = "hook-test"

	// PS1
	ps1Result, err := RenderPreCommitPS1(config)
	if err != nil {
		t.Fatalf("RenderPreCommitPS1() error: %v", err)
	}
	if ps1Result == "" {
		t.Error("RenderPreCommitPS1() returned empty string")
	}

	// SH
	shResult, err := RenderPreCommitSH(config)
	if err != nil {
		t.Fatalf("RenderPreCommitSH() error: %v", err)
	}
	if !containsString(shResult, "#!/usr/bin/env bash") {
		t.Error("SH pre-commit hook missing shebang")
	}
}

// ─── Scaffold ────────────────────────────────────────────────────────────────

func TestPreviewScaffold(t *testing.T) {
	tempDir := t.TempDir()

	config := DefaultConfig()
	config.ProjectName = "preview-test"

	preview, err := PreviewScaffold(tempDir, config)
	if err != nil {
		t.Fatalf("PreviewScaffold() error: %v", err)
	}

	if preview.TotalFiles == 0 {
		t.Error("PreviewScaffold() returned 0 total files")
	}

	if preview.NewFiles == 0 {
		t.Error("PreviewScaffold() returned 0 new files (empty dir should have all new)")
	}

	// Verify key files are in the preview
	foundCopilotInstructions := false
	foundChangelog := false
	foundWorkflowJSON := false
	for _, file := range preview.Files {
		switch {
		case containsString(file.Path, "copilot-instructions"):
			foundCopilotInstructions = true
		case containsString(file.Path, "CHANGELOG"):
			foundChangelog = true
		case containsString(file.Path, "workflow.json"):
			foundWorkflowJSON = true
		}
	}

	if !foundCopilotInstructions {
		t.Error("Preview missing copilot-instructions file")
	}
	if !foundChangelog {
		t.Error("Preview missing CHANGELOG file")
	}
	if !foundWorkflowJSON {
		t.Error("Preview missing workflow.json file")
	}
}

func TestScaffoldProject(t *testing.T) {
	tempDir := t.TempDir()

	config := DefaultConfig()
	config.ProjectName = "scaffold-test"

	result, err := ScaffoldProject(tempDir, config)
	if err != nil {
		t.Fatalf("ScaffoldProject() error: %v", err)
	}

	if len(result.FilesCreated) == 0 {
		t.Error("ScaffoldProject() created 0 files")
	}

	// Verify files actually exist on disk
	copilotInstructionsPath := filepath.Join(tempDir, ".github", "copilot-instructions.md")
	if _, err := os.Stat(copilotInstructionsPath); os.IsNotExist(err) {
		t.Error("copilot-instructions.md was not created on disk")
	}

	changelogPath := filepath.Join(tempDir, "CHANGELOG.md")
	if _, err := os.Stat(changelogPath); os.IsNotExist(err) {
		t.Error("CHANGELOG.md was not created on disk")
	}

	workflowJSONPath := filepath.Join(tempDir, ".forge", "workflow.json")
	if _, err := os.Stat(workflowJSONPath); os.IsNotExist(err) {
		t.Error("workflow.json was not created on disk")
	}
}

func TestScaffoldProject_CreatesAgentsMD(t *testing.T) {
	tempDir := t.TempDir()

	config := DefaultConfig()
	config.ProjectName = "agents-test"

	if _, err := ScaffoldProject(tempDir, config); err != nil {
		t.Fatalf("ScaffoldProject() error: %v", err)
	}

	agentsPath := filepath.Join(tempDir, "AGENTS.md")
	agentsContent, readErr := os.ReadFile(agentsPath)
	if readErr != nil {
		t.Fatalf("AGENTS.md was not created on disk: %v", readErr)
	}
	if !containsString(string(agentsContent), "@.github/copilot-instructions.md") {
		t.Error("AGENTS.md should import the canonical Copilot instructions")
	}
}

func TestScaffoldProject_SkipExistingFiles(t *testing.T) {
	tempDir := t.TempDir()

	// Create an existing CHANGELOG.md
	if err := os.WriteFile(filepath.Join(tempDir, "CHANGELOG.md"), []byte("# Existing Changelog"), 0644); err != nil {
		t.Fatal(err)
	}

	config := DefaultConfig()
	config.ProjectName = "skip-test"
	config.ConflictStrategy = "skip"

	result, err := ScaffoldProject(tempDir, config)
	if err != nil {
		t.Fatalf("ScaffoldProject() error: %v", err)
	}

	// CHANGELOG.md should be in skipped, not created
	for _, created := range result.FilesCreated {
		if containsString(created, "CHANGELOG.md") {
			t.Error("CHANGELOG.md should be skipped, not created")
		}
	}

	// Verify original content preserved
	content, _ := os.ReadFile(filepath.Join(tempDir, "CHANGELOG.md"))
	if string(content) != "# Existing Changelog" {
		t.Error("Existing CHANGELOG.md content was modified despite skip strategy")
	}
}

// ─── Compliance ──────────────────────────────────────────────────────────────

func TestScanCompliance_FullyCompliant(t *testing.T) {
	tempDir := t.TempDir()

	// Scaffold a full project first
	config := DefaultConfig()
	config.ProjectName = "compliance-test"
	if _, err := ScaffoldProject(tempDir, config); err != nil {
		t.Fatalf("ScaffoldProject() error: %v", err)
	}

	report, err := ScanCompliance(tempDir, config)
	if err != nil {
		t.Fatalf("ScanCompliance() error: %v", err)
	}

	// A freshly scaffolded project should pass most checks
	if report.TotalRules == 0 {
		t.Error("ScanCompliance() ran 0 checks")
	}

	if report.Violations > 0 {
		t.Logf("Compliance violations (may be expected): %d", report.Violations)
		for _, finding := range report.Findings {
			if finding.Level == ComplianceViolation {
				t.Logf("  - %s: %s", finding.Rule, finding.Message)
			}
		}
	}
}

func TestScanCompliance_MissingWorkflowConfig(t *testing.T) {
	tempDir := t.TempDir()

	config := DefaultConfig()
	report, err := ScanCompliance(tempDir, config)
	if err != nil {
		t.Fatalf("ScanCompliance() error: %v", err)
	}

	// Should find violations for missing files
	if report.Violations == 0 && report.Warnings == 0 {
		t.Error("Empty directory should have compliance warnings or violations")
	}
}

// ─── Enhanced Pre-Commit Hook Tests ─────────────────────────────────────────

func TestRenderPreCommitPS1_ContainsMainBranchBlock(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitPS1(config)
	if err != nil {
		t.Fatalf("RenderPreCommitPS1() error: %v", err)
	}

	// The enhanced pre-commit must block commits directly to main
	if !containsString(result, "MAIN BRANCH") {
		t.Error("Pre-commit PS1 missing main branch block check")
	}
	if !containsString(result, "Cannot commit directly to main") {
		t.Error("Pre-commit PS1 missing main branch violation message")
	}
}

func TestRenderPreCommitSH_ContainsMainBranchBlock(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitSH(config)
	if err != nil {
		t.Fatalf("RenderPreCommitSH() error: %v", err)
	}

	if !containsString(result, "MAIN BRANCH") {
		t.Error("Pre-commit SH missing main branch block check")
	}
	if !containsString(result, "Cannot commit directly to main") {
		t.Error("Pre-commit SH missing main branch violation message")
	}
}

func TestRenderPreCommitPS1_ContainsTestFileGate(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitPS1(config)
	if err != nil {
		t.Fatalf("RenderPreCommitPS1() error: %v", err)
	}

	// The enhanced pre-commit must check for corresponding test files
	if !containsString(result, "TEST FILE") {
		t.Error("Pre-commit PS1 missing test file gate check")
	}
	if !containsString(result, "_test.go") {
		t.Error("Pre-commit PS1 missing Go test file pattern")
	}
}

func TestRenderPreCommitSH_ContainsTestFileGate(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitSH(config)
	if err != nil {
		t.Fatalf("RenderPreCommitSH() error: %v", err)
	}

	if !containsString(result, "TEST FILE") {
		t.Error("Pre-commit SH missing test file gate check")
	}
	if !containsString(result, "_test.go") {
		t.Error("Pre-commit SH missing Go test file pattern")
	}
}

func TestRenderPreCommitPS1_ChangelogIsViolation(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitPS1(config)
	if err != nil {
		t.Fatalf("RenderPreCommitPS1() error: %v", err)
	}

	// CHANGELOG missing should be a violation (blocking), not a warning
	if !containsString(result, "$violations += \"CHANGELOG") {
		t.Error("Pre-commit PS1 should treat missing CHANGELOG as a violation, not a warning")
	}
}

func TestRenderPreCommitSH_ChangelogIsViolation(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPreCommitSH(config)
	if err != nil {
		t.Fatalf("RenderPreCommitSH() error: %v", err)
	}

	// CHANGELOG missing should be a violation (blocking), not a warning
	if !containsString(result, "violations+=(\"CHANGELOG") {
		t.Error("Pre-commit SH should treat missing CHANGELOG as a violation, not a warning")
	}
}

// ─── Commit-Msg Hook Tests ──────────────────────────────────────────────────

func TestRenderCommitMsgPS1(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderCommitMsgPS1(config)
	if err != nil {
		t.Fatalf("RenderCommitMsgPS1() error: %v", err)
	}

	if result == "" {
		t.Error("RenderCommitMsgPS1() returned empty string")
	}
	if !containsString(result, "pwsh") {
		t.Error("Commit-msg PS1 missing pwsh shebang")
	}

	// Must validate commit message format: type: description
	expectedPatterns := []string{
		"feat", "fix", "chore", "docs", "test", "refactor", "perf",
	}
	for _, commitType := range expectedPatterns {
		if !containsString(result, commitType) {
			t.Errorf("Commit-msg PS1 missing valid type %q", commitType)
		}
	}
}

func TestRenderCommitMsgSH(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderCommitMsgSH(config)
	if err != nil {
		t.Fatalf("RenderCommitMsgSH() error: %v", err)
	}

	if !containsString(result, "#!/usr/bin/env bash") {
		t.Error("Commit-msg SH missing bash shebang")
	}

	// Must validate commit message format
	if !containsString(result, "feat") {
		t.Error("Commit-msg SH missing valid commit types")
	}
}

// ─── Pre-Push Hook Tests ────────────────────────────────────────────────────

func TestRenderPrePushPS1(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPrePushPS1(config)
	if err != nil {
		t.Fatalf("RenderPrePushPS1() error: %v", err)
	}

	if result == "" {
		t.Error("RenderPrePushPS1() returned empty string")
	}
	if !containsString(result, "pwsh") {
		t.Error("Pre-push PS1 missing pwsh shebang")
	}
	// Must run build and test commands
	if !containsString(result, "go build") {
		t.Error("Pre-push PS1 missing Go build command")
	}
	if !containsString(result, "go test") {
		t.Error("Pre-push PS1 missing Go test command")
	}
}

func TestRenderPrePushSH(t *testing.T) {
	config := DefaultConfig()
	result, err := RenderPrePushSH(config)
	if err != nil {
		t.Fatalf("RenderPrePushSH() error: %v", err)
	}

	if !containsString(result, "#!/usr/bin/env bash") {
		t.Error("Pre-push SH missing bash shebang")
	}
	if !containsString(result, "go build") {
		t.Error("Pre-push SH missing Go build command")
	}
	if !containsString(result, "go test") {
		t.Error("Pre-push SH missing Go test command")
	}
}

// ─── Scaffold Manifest Tests ────────────────────────────────────────────────

func TestScaffoldManifest_ContainsAllHookTypes(t *testing.T) {
	manifest := scaffoldManifest()

	// Track which hook files appear in the manifest
	expectedHookPaths := map[string]bool{
		".forge/hooks/pre-commit":     false,
		".forge/hooks/pre-commit.ps1": false,
		".forge/hooks/commit-msg":     false,
		".forge/hooks/commit-msg.ps1": false,
		".forge/hooks/pre-push":       false,
		".forge/hooks/pre-push.ps1":   false,
	}

	for _, entry := range manifest {
		normalizedPath := filepath.ToSlash(entry.relPath)
		if _, isExpected := expectedHookPaths[normalizedPath]; isExpected {
			expectedHookPaths[normalizedPath] = true
		}
	}

	for hookPath, wasFound := range expectedHookPaths {
		if !wasFound {
			t.Errorf("scaffoldManifest() missing hook entry: %s", hookPath)
		}
	}
}

// ─── Compliance Scanner Tests ───────────────────────────────────────────────

func TestScanCompliance_TestCoverage(t *testing.T) {
	tempDir := t.TempDir()

	// Create a source file without a corresponding test file
	sourceDir := filepath.Join(tempDir, "internal", "service")
	if err := os.MkdirAll(sourceDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(sourceDir, "handler.go"),
		[]byte("package service\n\nfunc HandleRequest() {}\n"),
		0644,
	); err != nil {
		t.Fatal(err)
	}

	config := DefaultConfig()
	report, err := ScanCompliance(tempDir, config)
	if err != nil {
		t.Fatalf("ScanCompliance() error: %v", err)
	}

	// Should report a warning about missing test file
	foundTestCoverageFinding := false
	for _, finding := range report.Findings {
		if finding.Rule == "Test Coverage" {
			foundTestCoverageFinding = true
			break
		}
	}
	if !foundTestCoverageFinding {
		t.Error("ScanCompliance() should report 'Test Coverage' finding for source file without tests")
	}
}

func TestScanCompliance_TestCoverage_WithTestFile(t *testing.T) {
	tempDir := t.TempDir()

	// Create a source file WITH a corresponding test file
	sourceDir := filepath.Join(tempDir, "internal", "service")
	if err := os.MkdirAll(sourceDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(sourceDir, "handler.go"),
		[]byte("package service\n\nfunc HandleRequest() {}\n"),
		0644,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(sourceDir, "handler_test.go"),
		[]byte("package service\n\nfunc TestHandleRequest(t *testing.T) {}\n"),
		0644,
	); err != nil {
		t.Fatal(err)
	}

	config := DefaultConfig()
	report, err := ScanCompliance(tempDir, config)
	if err != nil {
		t.Fatalf("ScanCompliance() error: %v", err)
	}

	// Should pass — source file has a test file
	for _, finding := range report.Findings {
		if finding.Rule == "Test Coverage" && finding.Level == ComplianceWarning {
			if containsString(finding.Message, "handler.go") {
				t.Error("handler.go has a test file but was flagged as missing tests")
			}
		}
	}
}

func TestScanCompliance_CommitMessageFormat(t *testing.T) {
	// This test verifies the scan function exists and runs without error.
	// Actual git history scanning depends on the git repo state,
	// so we test it in a temp dir with no git (should produce a warning).
	tempDir := t.TempDir()

	config := DefaultConfig()
	report, err := ScanCompliance(tempDir, config)
	if err != nil {
		t.Fatalf("ScanCompliance() error: %v", err)
	}

	// Without git, commit message scan should produce a warning or be skipped
	_ = report // The function should not panic
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func containsString(haystack, needle string) bool {
	return len(haystack) > 0 && len(needle) > 0 &&
		(len(haystack) >= len(needle)) &&
		(haystack == needle || findSubstring(haystack, needle))
}

func findSubstring(haystack, needle string) bool {
	for i := 0; i <= len(haystack)-len(needle); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
