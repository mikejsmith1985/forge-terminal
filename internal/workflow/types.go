// Package workflow provides an enterprise-grade project scaffolding system.
// It generates standardized AI agent instructions, skills, git hooks, PR templates,
// and workflow configuration for any project — ensuring repeatable, enforceable
// development practices across teams and AI coding tools.
package workflow

import (
	"time"
)

// QualityMode determines how aggressively the workflow enforces best practices
// and how agents prioritize quality versus speed.
type QualityMode string

const (
	// QualityBest instructs agents to use multi-agent orchestration, thorough testing,
	// Code Tutor integration, and Opus-tier models for complex tasks.
	QualityBest QualityMode = "best"

	// QualityFast allows agents to use single-agent mode, lighter models,
	// and skip optional quality gates for faster iteration.
	QualityFast QualityMode = "fast"
)

// ProjectType identifies the primary language or framework of a project.
type ProjectType string

const (
	ProjectTypeGo      ProjectType = "go"
	ProjectTypeNode    ProjectType = "node"
	ProjectTypePython  ProjectType = "python"
	ProjectTypeRust    ProjectType = "rust"
	ProjectTypeJava    ProjectType = "java"
	ProjectTypeDotNet  ProjectType = "dotnet"
	ProjectTypeGeneric ProjectType = "generic"
)

// ModuleID uniquely identifies a workflow module that can be toggled on or off.
type ModuleID string

const (
	ModuleCopilotInstructions ModuleID = "copilot-instructions"
	ModuleBranchingStrategy   ModuleID = "branching-strategy"
	ModuleCodeQuality         ModuleID = "code-quality"
	ModuleTestingStandards    ModuleID = "testing-standards"
	ModulePRWorkflow          ModuleID = "pr-workflow"
	ModuleDocumentation       ModuleID = "documentation"
	ModuleMultiAgent          ModuleID = "multi-agent"
	// ModuleCodeTutor removed — Code Tutor fully disabled
	ModuleWorkflowEnforcer ModuleID = "workflow-enforcer"
	ModuleGitHooks         ModuleID = "git-hooks"
	ModulePRTemplate       ModuleID = "pr-template"
	// ModuleCopilotAgentSetup generates .github/copilot/setup-steps.yml, which
	// pre-installs project dependencies in the Copilot coding agent's environment
	// before it begins writing code or running tests.
	ModuleCopilotAgentSetup ModuleID = "copilot-agent-setup"

	// Forge MCP Tool Skills — teach agents about Forge Terminal's built-in MCP tools.
	// These are universally useful in any project opened inside Forge Terminal.

	// ModuleForgeVault teaches agents to check the encrypted local credential store
	// before asking the user for API keys, usernames, or passwords.
	ModuleForgeVault ModuleID = "forge-vault"

	// ModuleAdaptiveBuildEnv teaches agents to use environment_detect and
	// environment_run to run Linux-compatible builds from a Windows host without
	// GitHub Actions or manual WSL configuration.
	ModuleAdaptiveBuildEnv ModuleID = "adaptive-build-environments"

	// ModuleForgeReleaseProcess enforces the local gh-CLI release pipeline so
	// agents never create GitHub Actions workflows to publish releases.
	ModuleForgeReleaseProcess ModuleID = "forge-release-process"

	// ModuleSequentialTasks enforces task completion discipline: finish the
	// active task before accepting a new one, preventing mid-task context switches.
	ModuleSequentialTasks ModuleID = "sequential-tasks"
)

// AllModules returns every available module ID in recommended activation order.
func AllModules() []ModuleID {
	return []ModuleID{
		ModuleCopilotInstructions,
		ModuleBranchingStrategy,
		ModuleCodeQuality,
		ModuleTestingStandards,
		ModulePRWorkflow,
		ModuleDocumentation,
		ModuleMultiAgent,
		ModuleWorkflowEnforcer,
		ModuleGitHooks,
		ModulePRTemplate,
		ModuleCopilotAgentSetup,
		// Forge MCP Tool Skills
		ModuleForgeVault,
		ModuleAdaptiveBuildEnv,
		ModuleForgeReleaseProcess,
		ModuleSequentialTasks,
	}
}

// ModuleInfo provides human-readable metadata about a workflow module.
type ModuleInfo struct {
	ID          ModuleID `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Category    string   `json:"category"` // "core", "enforcement", "integration"
	Required    bool     `json:"required"` // true = cannot be disabled
}

// ModuleCatalog returns metadata for every available module.
func ModuleCatalog() []ModuleInfo {
	return []ModuleInfo{
		{
			ID:          ModuleCopilotInstructions,
			Name:        "Agent Instructions",
			Description: "AI agent behavior directives, coding standards, naming conventions, and quality mode configuration. Generates .github/copilot-instructions.md and CLAUDE.md.",
			Category:    "core",
			Required:    true,
		},
		{
			ID:          ModuleBranchingStrategy,
			Name:        "Branching Strategy",
			Description: "GitHub Flow enforcement: feature branches → main, PR required, branch naming conventions.",
			Category:    "core",
			Required:    false,
		},
		{
			ID:          ModuleCodeQuality,
			Name:        "Code Quality Standards",
			Description: "Human-readable naming, non-developer-friendly comments, no magic numbers, self-documenting code bias.",
			Category:    "core",
			Required:    false,
		},
		{
			ID:          ModuleTestingStandards,
			Name:        "Testing Standards",
			Description: "TDD workflow (Red → Green → Refactor), test layer separation, coverage expectations.",
			Category:    "core",
			Required:    false,
		},
		{
			ID:          ModulePRWorkflow,
			Name:        "PR Workflow",
			Description: "PR creation standards, review requirements, merge strategy, CHANGELOG update mandate.",
			Category:    "core",
			Required:    false,
		},
		{
			ID:          ModuleDocumentation,
			Name:        "Documentation Discipline",
			Description: "Living CHANGELOG as single source of truth. No doc sprawl. README maintained, not duplicated.",
			Category:    "core",
			Required:    false,
		},
		{
			ID:          ModuleMultiAgent,
			Name:        "Multi-Agent Orchestration",
			Description: "Leverage sub-agents and autopilot_fleet for parallelizable work. Model routing by task complexity.",
			Category:    "integration",
			Required:    false,
		},

		{
			ID:          ModuleWorkflowEnforcer,
			Name:        "Workflow Enforcer Skill",
			Description: "Broadest-activation AI skill that enforces all rules on every coding task. Primary AI enforcement layer.",
			Category:    "enforcement",
			Required:    true,
		},
		{
			ID:          ModuleGitHooks,
			Name:        "Git Pre-Commit Hooks",
			Description: "Automated naming scan, comment density check, CHANGELOG verification, branch naming validation on every commit.",
			Category:    "enforcement",
			Required:    false,
		},
		{
			ID:          ModulePRTemplate,
			Name:        "PR Template + Checklist",
			Description: "Mandatory compliance checklist on every pull request. Visible to reviewers.",
			Category:    "enforcement",
			Required:    false,
		},
		{
			ID:          ModuleCopilotAgentSetup,
			Name:        "CI Agent Environment Setup",
			Description: "Generates .github/copilot/setup-steps.yml to pre-install project dependencies in the coding agent environment before it writes code or runs tests.",
			Category:    "integration",
			Required:    false,
		},
		// Forge MCP Tool Skills
		{
			ID:          ModuleForgeVault,
			Name:        "Forge Vault Credential Access",
			Description: "Teaches agents to check Forge Terminal's encrypted local vault before asking for API keys, passwords, or tokens.",
			Category:    "integration",
			Required:    false,
		},
		{
			ID:          ModuleAdaptiveBuildEnv,
			Name:        "Adaptive Build Environments",
			Description: "Teaches agents to use environment_detect and environment_run MCP tools for Linux-compatible builds from Windows. Prevents broken chunk filenames and Windows-path build failures.",
			Category:    "integration",
			Required:    false,
		},
		{
			ID:          ModuleForgeReleaseProcess,
			Name:        "Forge Release Process",
			Description: "Enforces the local gh-CLI release pipeline. Agents never create GitHub Actions workflows to publish releases.",
			Category:    "enforcement",
			Required:    false,
		},
		{
			ID:          ModuleSequentialTasks,
			Name:        "Sequential Task Discipline",
			Description: "Agents complete the active task before accepting a new one, preventing mid-task context switches.",
			Category:    "core",
			Required:    false,
		},
	}
}

// FileConflictStrategy controls how the scaffold engine handles existing files.
type FileConflictStrategy string

const (
	ConflictSkip      FileConflictStrategy = "skip"      // Leave existing file untouched
	ConflictOverwrite FileConflictStrategy = "overwrite"  // Replace existing file entirely
	ConflictMerge     FileConflictStrategy = "merge"      // Attempt to merge content (append new sections)
)

// WorkflowConfig represents the complete configuration for scaffolding a project.
type WorkflowConfig struct {
	QualityMode      QualityMode          `json:"qualityMode"`
	EnabledModules   []ModuleID           `json:"enabledModules"`
	ConflictStrategy FileConflictStrategy `json:"conflictStrategy"`
	ProjectName      string               `json:"projectName"`
	ProjectType      ProjectType          `json:"projectType"`

	PRReviewSettings PRReviewConfig       `json:"prReviewSettings"`
}

// TutorWorkflowConfig holds tutor-specific settings within the workflow.
type TutorWorkflowConfig struct {
	AutoNotify       bool   `json:"autoNotify"`       // Show notifications on file changes
	DefaultDepth     string `json:"defaultDepth"`     // "brief", "standard", "deep"
	AuditNaming      bool   `json:"auditNaming"`      // Flag naming violations in explanations
	AuditComments    bool   `json:"auditComments"`    // Flag missing comments in explanations
}

// PRReviewStrategy determines how pull requests are reviewed in this project.
type PRReviewStrategy string

const (
	// PRReviewManual means the user reviews diffs themselves with no AI assistance.
	PRReviewManual PRReviewStrategy = "manual"

	// PRReviewTutor triggers Code Tutor to auto-explain each changed file when a PR
	// is created or updated, with toast notifications and streaming explanations.
	PRReviewTutor PRReviewStrategy = "tutor"

	// PRReviewAgent runs a dedicated Quality Agent persona that analyzes the diff
	// and posts structured findings (naming, complexity, test coverage, architecture).
	PRReviewAgent PRReviewStrategy = "agent"

	// PRReviewTutorAndAgent combines both: Code Tutor explains changes to the user
	// while the Quality Agent performs an automated code review in parallel.
	PRReviewTutorAndAgent PRReviewStrategy = "tutor-and-agent"
)

// PRReviewConfig holds settings for how PRs are reviewed in this project.
type PRReviewConfig struct {
	Strategy          PRReviewStrategy `json:"strategy"`          // How PRs get reviewed
	AutoTrigger       bool             `json:"autoTrigger"`       // Trigger review automatically on PR create/update
	RequireChangelog  bool             `json:"requireChangelog"`  // CHANGELOG must be updated in every PR
	AgentStrictness   string           `json:"agentStrictness"`   // "lenient", "standard", "strict"
	AgentFocusAreas   []string         `json:"agentFocusAreas"`   // e.g. ["naming", "complexity", "tests", "architecture", "security"]
}

// HasModule reports whether the given module is enabled in this config.
func (c *WorkflowConfig) HasModule(moduleID ModuleID) bool {
	for _, enabledID := range c.EnabledModules {
		if enabledID == moduleID {
			return true
		}
	}
	return false
}

// DefaultConfig returns a sensible default configuration with all modules enabled
// and BEST quality mode — the "Enterprise Standard" baseline.
func DefaultConfig() WorkflowConfig {
	return WorkflowConfig{
		QualityMode: QualityBest,
		EnabledModules: []ModuleID{
			ModuleCopilotInstructions,
			ModuleBranchingStrategy,
			ModuleCodeQuality,
			ModuleTestingStandards,
			ModulePRWorkflow,
			ModuleDocumentation,
			ModuleMultiAgent,
			ModuleWorkflowEnforcer,
			ModuleGitHooks,
			ModulePRTemplate,
			ModuleCopilotAgentSetup,
			// Forge MCP Tool Skills — always enabled for Forge-managed projects
			ModuleForgeVault,
			ModuleAdaptiveBuildEnv,
			ModuleForgeReleaseProcess,
			ModuleSequentialTasks,
		},
		ConflictStrategy: ConflictSkip,

		PRReviewSettings: PRReviewConfig{
			Strategy:         PRReviewTutorAndAgent,
			AutoTrigger:      true,
			RequireChangelog: true,
			AgentStrictness:  "standard",
			AgentFocusAreas:  []string{"naming", "complexity", "tests", "architecture", "security"},
		},
	}
}

// WorkflowPreset is a saved, reusable workflow configuration with metadata.
type WorkflowPreset struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	BuiltIn     bool           `json:"builtIn"` // true = ships with Forge, cannot be deleted
	Config      WorkflowConfig `json:"config"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

// ProjectDetection holds the results of scanning a project directory
// to determine its type, existing structure, and recommended configuration.
type ProjectDetection struct {
	ProjectPath    string      `json:"projectPath"`
	ProjectName    string      `json:"projectName"`
	ProjectType    ProjectType `json:"projectType"`
	ExistingFiles  []string    `json:"existingFiles"`  // Paths of workflow-relevant files already present
	HasGit         bool        `json:"hasGit"`
	HasGitHub      bool        `json:"hasGitHub"`      // .github/ directory exists
	HasInstructions bool       `json:"hasInstructions"` // .github/copilot-instructions.md or CLAUDE.md exists
	HasSkills      bool        `json:"hasSkills"`       // .github/skills/ directory exists
	HasChangelog   bool        `json:"hasChangelog"`    // CHANGELOG.md exists
	HasWorkflow    bool        `json:"hasWorkflow"`     // .forge/workflow.json exists
	HasTests       bool        `json:"hasTests"`        // Test directory or test files found
	RecommendedModules []ModuleID `json:"recommendedModules"`
}

// ScaffoldFile represents a single file that will be created or modified
// during the scaffold process. Used for dry-run previews.
type ScaffoldFile struct {
	Path      string               `json:"path"`      // Relative to project root
	Action    string               `json:"action"`    // "create", "overwrite", "merge", "skip"
	Category  string               `json:"category"`  // "skill", "config", "hook", "template", "changelog"
	SizeBytes int                  `json:"sizeBytes"` // Approximate size of generated content
	Conflict  FileConflictStrategy `json:"conflict"`  // What will happen if file exists
	Exists    bool                 `json:"exists"`    // Whether the file already exists
}

// ScaffoldPreview is the dry-run result showing what would change.
type ScaffoldPreview struct {
	Files       []ScaffoldFile `json:"files"`
	TotalFiles  int            `json:"totalFiles"`
	NewFiles    int            `json:"newFiles"`
	UpdateFiles int            `json:"updateFiles"`
	SkipFiles   int            `json:"skipFiles"`
}

// ScaffoldResult is returned after the scaffold operation completes.
type ScaffoldResult struct {
	Success      bool           `json:"success"`
	FilesCreated []string       `json:"filesCreated"`
	FilesUpdated []string       `json:"filesUpdated"`
	FilesSkipped []string       `json:"filesSkipped"`
	Errors       []string       `json:"errors"`
	AppliedAt    time.Time      `json:"appliedAt"`
}

// ComplianceLevel categorizes the severity of a compliance finding.
type ComplianceLevel string

const (
	CompliancePassing  ComplianceLevel = "passing"  // Rule satisfied
	ComplianceWarning  ComplianceLevel = "warning"  // Minor issue, non-blocking
	ComplianceViolation ComplianceLevel = "violation" // Hard failure
)

// ComplianceFinding represents a single rule check result.
type ComplianceFinding struct {
	Rule        string          `json:"rule"`        // Human-readable rule name
	Level       ComplianceLevel `json:"level"`
	FilePath    string          `json:"filePath"`    // Empty for project-level findings
	Line        int             `json:"line"`        // 0 for file-level or project-level findings
	Message     string          `json:"message"`
	Suggestion  string          `json:"suggestion"`  // How to fix
}

// ComplianceStatus summarizes the overall compliance state.
type ComplianceStatus string

const (
	StatusCompliant ComplianceStatus = "compliant"  // All rules pass
	StatusWarnings  ComplianceStatus = "warnings"   // Only warnings, no violations
	StatusViolations ComplianceStatus = "violations" // At least one violation
)

// ComplianceReport is the full result of a compliance scan.
type ComplianceReport struct {
	Status      ComplianceStatus    `json:"status"`
	Findings    []ComplianceFinding `json:"findings"`
	TotalRules  int                 `json:"totalRules"`
	Passing     int                 `json:"passing"`
	Warnings    int                 `json:"warnings"`
	Violations  int                 `json:"violations"`
	ScannedAt   time.Time           `json:"scannedAt"`
}

// WorkflowStatus represents the current workflow state of a project.
type WorkflowStatus struct {
	Configured   bool              `json:"configured"`   // .forge/workflow.json exists
	PresetName   string            `json:"presetName"`   // Name of the preset used
	QualityMode  QualityMode       `json:"qualityMode"`
	ModuleCount  int               `json:"moduleCount"`  // Number of enabled modules
	Compliance   *ComplianceReport `json:"compliance"`   // Latest compliance scan (nil if not scanned)
	AppliedAt    *time.Time        `json:"appliedAt"`    // When the workflow was last applied
}

// ─── Release Preflight Types ─────────────────────────────────────────────────

// PreflightSeverity indicates whether a failed check blocks the release.
type PreflightSeverity string

const (
	// PreflightBlocking means the release CANNOT proceed until this is fixed.
	PreflightBlocking PreflightSeverity = "blocking"
	// PreflightWarning means the release CAN proceed but the issue should be addressed.
	PreflightWarning PreflightSeverity = "warning"
)

// PreflightCheckStatus indicates whether an individual check passed or failed.
type PreflightCheckStatus string

const (
	PreflightPass PreflightCheckStatus = "pass"
	PreflightFail PreflightCheckStatus = "fail"
)

// PreflightCheck represents one release-readiness check with a fix suggestion.
type PreflightCheck struct {
	ID         string               `json:"id"`         // Machine-readable ID (e.g. "changelog-exists")
	Name       string               `json:"name"`       // Human-readable name
	Severity   PreflightSeverity    `json:"severity"`   // blocking or warning
	Status     PreflightCheckStatus `json:"status"`     // pass or fail
	Message    string               `json:"message"`    // What happened
	Suggestion string               `json:"suggestion"` // How to fix it
	FilePath   string               `json:"filePath,omitempty"` // Relevant file if applicable
}

// PreflightReport is the complete result of a release preflight scan.
// When CanRelease is false, the FixPrompt field contains a ready-to-paste
// message the user can send to an AI agent to resolve all blocking issues.
type PreflightReport struct {
	Status       string            `json:"status"`       // "pass", "fail", or "warning"
	Checks       []PreflightCheck  `json:"checks"`
	BlockingCount int              `json:"blockingCount"`
	WarningCount int               `json:"warningCount"`
	PassingCount int               `json:"passingCount"`
	CanRelease   bool              `json:"canRelease"`   // true only when blockingCount == 0
	FixPrompt    string            `json:"fixPrompt"`    // Ready-to-paste agent prompt for fixing violations
	CheckedAt    time.Time         `json:"checkedAt"`
}
