package workflow

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
	"time"
)

// renderTemplate executes a Go template with the given data and returns the output.
func renderTemplate(name, templateText string, data interface{}) (string, error) {
	funcMap := template.FuncMap{
		"upper":    strings.ToUpper,
		"lower":    strings.ToLower,
		"title":    strings.Title,
		"join":     strings.Join,
		"now":      func() string { return time.Now().Format("2006-01-02") },
		"contains": func(slice []ModuleID, target ModuleID) bool { return containsModule(slice, target) },
	}

	tmpl, err := template.New(name).Funcs(funcMap).Parse(templateText)
	if err != nil {
		return "", fmt.Errorf("parsing template %s: %w", name, err)
	}

	var buffer bytes.Buffer
	if err := tmpl.Execute(&buffer, data); err != nil {
		return "", fmt.Errorf("executing template %s: %w", name, err)
	}

	return buffer.String(), nil
}

// RenderCopilotInstructions generates the .github/copilot-instructions.md content.
func RenderCopilotInstructions(config WorkflowConfig) (string, error) {
	return renderTemplate("copilot-instructions", copilotInstructionsTemplate, config)
}

// RenderChangelog generates the initial CHANGELOG.md content.
func RenderChangelog(config WorkflowConfig) (string, error) {
	return renderTemplate("changelog", changelogTemplate, config)
}

// RenderWorkflowJSON generates the .forge/workflow.json content.
func RenderWorkflowJSON(config WorkflowConfig) (string, error) {
	return renderTemplate("workflow-json", workflowJSONTemplate, config)
}

// RenderSkill generates a skill SKILL.md file for the given module.
func RenderSkill(moduleID ModuleID, config WorkflowConfig) (string, error) {
	templateText, exists := skillTemplates[moduleID]
	if !exists {
		return "", fmt.Errorf("no skill template for module: %s", moduleID)
	}
	return renderTemplate(string(moduleID), templateText, config)
}

// RenderPreCommitPS1 generates the PowerShell pre-commit hook script.
func RenderPreCommitPS1(config WorkflowConfig) (string, error) {
	return renderTemplate("pre-commit-ps1", preCommitPS1Template, config)
}

// RenderPreCommitSH generates the Bash pre-commit hook script.
func RenderPreCommitSH(config WorkflowConfig) (string, error) {
	return renderTemplate("pre-commit-sh", preCommitSHTemplate, config)
}

// RenderPRTemplate generates the .github/pull_request_template.md content.
func RenderPRTemplate(config WorkflowConfig) (string, error) {
	return renderTemplate("pr-template", prTemplateContent, config)
}

// RenderCommitMsgPS1 generates the PowerShell commit-msg hook script.
// Validates commit message format: type: description (e.g. "feat: add login page").
func RenderCommitMsgPS1(config WorkflowConfig) (string, error) {
	return renderTemplate("commit-msg-ps1", commitMsgPS1Template, config)
}

// RenderCommitMsgSH generates the Bash commit-msg hook script.
// Validates commit message format: type: description (e.g. "feat: add login page").
func RenderCommitMsgSH(config WorkflowConfig) (string, error) {
	return renderTemplate("commit-msg-sh", commitMsgSHTemplate, config)
}

// RenderPrePushPS1 generates the PowerShell pre-push hook script.
// Runs build and test suite before allowing a push to proceed.
func RenderPrePushPS1(config WorkflowConfig) (string, error) {
	return renderTemplate("pre-push-ps1", prePushPS1Template, config)
}

// RenderPrePushSH generates the Bash pre-push hook script.
// Runs build and test suite before allowing a push to proceed.
func RenderPrePushSH(config WorkflowConfig) (string, error) {
	return renderTemplate("pre-push-sh", prePushSHTemplate, config)
}

// RenderCopilotAgentSetup generates .github/copilot/setup-steps.yml, which
// configures the GitHub Copilot coding agent's environment by pre-installing
// project dependencies before the agent begins writing code or running tests.
func RenderCopilotAgentSetup(config WorkflowConfig) (string, error) {
	return renderTemplate("copilot-agent-setup", copilotAgentSetupTemplate, config)
}

// RenderClaudeMD generates CLAUDE.md, which Claude Code reads automatically
// at every session start. It imports the canonical agent instructions file so
// both Claude Code and GitHub Copilot share a single source of truth.
func RenderClaudeMD(config WorkflowConfig) (string, error) {
	return renderTemplate("claude-md", claudeMDTemplate, config)
}

// RenderAgentsMD generates AGENTS.md, which Copilot CLI reads at session start.
// It imports the canonical instruction file so project setup has one source of truth.
func RenderAgentsMD(config WorkflowConfig) (string, error) {
	return renderTemplate("agents-md", agentsMDTemplate, config)
}

// ──────────────────────────────────────────────────────────────────────────────
// Template: AI Agent Instructions (generates .github/copilot-instructions.md)
// Read by GitHub Copilot automatically; imported by CLAUDE.md for Claude Code.
// ──────────────────────────────────────────────────────────────────────────────

var copilotInstructionsTemplate = `# AI Agent Instructions — {{.ProjectName}}

> Auto-generated by Forge Terminal Forge Workflow Architect.
> Quality Mode: **{{upper (print .QualityMode)}}** | Project Type: **{{.ProjectType}}**

## Prime Directive

{{if eq .QualityMode "best"}}DO NOT take the fastest or easiest route. Take the BEST route. Your priority is production-readiness, not speed. If a solution is "quick but dirty," it is strictly FORBIDDEN.

Always leverage multiple agents and sub-agents (autopilot_fleet) for parallelizable work. Use Opus-tier models for architecture and complex tasks. Sonnet for features. Haiku only for documentation.{{else}}Balance speed with quality. Use single-agent mode for most tasks. Prioritize working code over perfect code, but maintain minimum quality standards.{{end}}

## Naming Conventions (MANDATORY)

These are not suggestions — they are requirements. Every variable, function, class, and type name MUST be self-documenting.

1. **NEVER use single-letter variable names** — The only exceptions are:
   - ` + "`i`" + `, ` + "`j`" + `, ` + "`k`" + ` for loop iterators
   - ` + "`w`" + ` and ` + "`r`" + ` for HTTP handler (http.ResponseWriter, *http.Request) parameters
   - ` + "`_`" + ` for intentionally unused values
2. **Boolean names** MUST be prefixed with ` + "`is`" + `, ` + "`has`" + `, ` + "`can`" + `, ` + "`should`" + `, or ` + "`was`" + `
   - ✅ ` + "`isActive`" + `, ` + "`hasPermission`" + `, ` + "`canRetry`" + `, ` + "`shouldNotify`" + `
   - ❌ ` + "`active`" + `, ` + "`permission`" + `, ` + "`retry`" + `, ` + "`notify`" + `
3. **Descriptive over clever** — A reader should know a variable's purpose without context:
   - ✅ ` + "`customerLastName`" + `, ` + "`connectionTimeout`" + `, ` + "`retryAttemptCount`" + `
   - ❌ ` + "`x`" + `, ` + "`tmp`" + `, ` + "`val`" + `, ` + "`data`" + `, ` + "`str`" + `
4. **Function names** MUST be verb-first: ` + "`createUser`" + `, ` + "`calculateTotal`" + `, ` + "`validateInput`" + `
5. **Constants** use UPPER_SNAKE_CASE or descriptive camelCase — never abbreviated

## Comment Standards (MANDATORY)

Code comments MUST be readable by someone who is not a developer. Write for a technical project manager, not a compiler.

1. **Every file** MUST have a top-level comment explaining its purpose in one sentence
2. **Every exported/public function** MUST have a doc comment explaining what it does and why
3. **Complex logic blocks** (conditionals, algorithms, state machines) MUST have inline comments explaining the "why," not the "what"
4. **Do NOT comment obvious code** — ` + "`// increment counter`" + ` above ` + "`counter++`" + ` is noise
5. **Write for comprehension** — Comments should answer "Why does this exist?" and "What business problem does this solve?"

## Code Structure

1. **Small functions** — Prefer functions under 40 lines. Extract complex logic into well-named helpers.
2. **Early returns** — Use guard clauses instead of deep nesting
3. **No magic numbers** — Every literal number or string must be a named constant with a comment
4. **Logical grouping** — Group related functions with section comments (` + "`// ── Section ──`" + `)
5. **Import ordering** — Standard library → internal packages → external dependencies

{{if contains .EnabledModules "branching-strategy"}}## Branching Strategy

This project uses **GitHub Flow**:
- All work happens on feature branches: ` + "`feature/*`" + `, ` + "`fix/*`" + `, ` + "`chore/*`" + `, ` + "`docs/*`" + `
- NEVER commit directly to ` + "`main`" + `
- Every merge to ` + "`main`" + ` requires a Pull Request
- Branch names must be descriptive: ` + "`feature/add-user-authentication`" + ` not ` + "`feature/auth`" + `
{{end}}
{{if contains .EnabledModules "documentation"}}## Documentation Discipline

- **CHANGELOG.md** is the single source of truth for "what changed"
- Update CHANGELOG.md in every PR that modifies functionality
- Do NOT create auxiliary summary documents, status files, or task logs
- The README is maintained but never duplicated into other docs
{{end}}
{{if contains .EnabledModules "testing-standards"}}## Testing Requirements

- Write tests BEFORE implementation (TDD: Red → Green → Refactor)
- Separate test layers: Unit (mocked dependencies), Integration (real services), E2E (full stack)
- Unit tests must complete in <10ms each
- Every new source file should have a corresponding test file
{{end}}
{{if contains .EnabledModules "multi-agent"}}## Multi-Agent Orchestration

- For tasks involving 3+ files, use sub-agents (autopilot_fleet) to parallelize
- Architecture tasks → Opus-tier model
- Feature implementation → Sonnet-tier model
- Documentation → Haiku-tier model
- Always classify task complexity before choosing approach
{{end}}
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: AGENTS.md
// ──────────────────────────────────────────────────────────────────────────────

var agentsMDTemplate = `# AGENTS.md — {{.ProjectName}} Agent Instructions

> This file is read automatically by GitHub Copilot CLI at session start.
> It imports the canonical Forge Workflow instructions for this project.

@.github/copilot-instructions.md
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: CHANGELOG.md
// ──────────────────────────────────────────────────────────────────────────────

var changelogTemplate = `# Changelog — {{.ProjectName}}

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Forge Workflow initialized with Forge Terminal Workflow Architect

### Changed

### Fixed

### Removed
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: .forge/workflow.json
// ──────────────────────────────────────────────────────────────────────────────

var workflowJSONTemplate = `{
  "version": "1.0.0",
  "projectName": "{{.ProjectName}}",
  "projectType": "{{.ProjectType}}",
  "qualityMode": "{{.QualityMode}}",
  "enabledModules": [{{range $i, $m := .EnabledModules}}{{if $i}}, {{end}}"{{$m}}"{{end}}],
  "tutorSettings": {

  },
  "prReviewSettings": {
    "strategy": "{{.PRReviewSettings.Strategy}}",
    "autoTrigger": {{.PRReviewSettings.AutoTrigger}},
    "requireChangelog": {{.PRReviewSettings.RequireChangelog}},
    "agentStrictness": "{{.PRReviewSettings.AgentStrictness}}",
    "agentFocusAreas": [{{range $i, $a := .PRReviewSettings.AgentFocusAreas}}{{if $i}}, {{end}}"{{$a}}"{{end}}]
  },
  "appliedAt": "{{now}}"
}
`

// ──────────────────────────────────────────────────────────────────────────────
// Skill Templates
// ──────────────────────────────────────────────────────────────────────────────

var skillTemplates = map[ModuleID]string{
	ModuleBranchingStrategy: branchingStrategySkill,
	ModuleCodeQuality:       codeQualitySkill,
	ModuleTestingStandards:  testingStandardsSkill,
	ModulePRWorkflow:        prWorkflowSkill,
	ModuleDocumentation:     documentationSkill,
	ModuleMultiAgent:        multiAgentSkill,

	ModuleWorkflowEnforcer: workflowEnforcerSkill,
}

var branchingStrategySkill = `---
name: branching-strategy
description: "Enforces GitHub Flow branching strategy. Activates on keywords: branch, merge, commit, push, pull request, PR, git."
---

# Branching Strategy — GitHub Flow

## Rules (MANDATORY)

1. **NEVER commit directly to ` + "`main`" + `** — All work happens on feature branches
2. **Branch naming convention:**
   - ` + "`feature/<descriptive-name>`" + ` — New functionality
   - ` + "`fix/<descriptive-name>`" + ` — Bug fixes
   - ` + "`chore/<descriptive-name>`" + ` — Maintenance, dependency updates
   - ` + "`docs/<descriptive-name>`" + ` — Documentation only
3. **Every merge to main requires a Pull Request** — No exceptions
4. **Branch names MUST be descriptive:** ` + "`feature/add-user-authentication`" + ` not ` + "`feature/auth`" + `
5. **Delete branches after merge** — Keep the branch list clean
6. **Rebase before merge** when the branch is behind main (keep history linear)

## Workflow

` + "```" + `
1. Create branch:  git checkout -b feature/descriptive-name
2. Make changes:   Commit often with clear messages
3. Push:           git push origin feature/descriptive-name
4. Open PR:        Create PR with filled template and checklist
5. Review:         Address feedback, ensure CI passes
6. Merge:          Squash merge for features, merge commit for releases
7. Clean up:       Delete the feature branch
` + "```" + `

## Commit Message Format

` + "```" + `
<type>: <description>

[optional body explaining WHY, not WHAT]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
` + "```" + `

Types: feat, fix, chore, docs, test, refactor, perf
`

var codeQualitySkill = `---
name: code-quality
description: "Enforces human-readable code standards. Activates on ANY implementation, refactor, feature, bugfix, or code modification task."
---

# Code Quality Standards

## Naming Rules (ZERO TOLERANCE)

These rules are not suggestions. They are hard requirements enforced by pre-commit hooks.

### Variable Names
- ❌ FORBIDDEN: ` + "`x`" + `, ` + "`y`" + `, ` + "`z`" + `, ` + "`tmp`" + `, ` + "`val`" + `, ` + "`data`" + `, ` + "`str`" + `, ` + "`buf`" + `, ` + "`res`" + `, ` + "`req`" + ` (except HTTP handler params), ` + "`ctx`" + ` (except Go context.Context)
- ✅ REQUIRED: Self-documenting names that a non-developer can understand
- Examples:
  - ` + "`x`" + ` → ` + "`horizontalPosition`" + ` or ` + "`customerAge`" + ` (depends on context)
  - ` + "`tmp`" + ` → ` + "`temporaryFilePath`" + ` or ` + "`swapValue`" + `
  - ` + "`buf`" + ` → ` + "`responseBuffer`" + ` or ` + "`logMessageBuilder`" + `

### Boolean Names
MUST be prefixed: ` + "`is`" + `, ` + "`has`" + `, ` + "`can`" + `, ` + "`should`" + `, ` + "`was`" + `

### Function Names
MUST be verb-first: ` + "`createUser`" + `, ` + "`validateEmail`" + `, ` + "`calculateTotalRevenue`" + `

### Constants
MUST be descriptive: ` + "`MaxRetryAttempts`" + ` not ` + "`MAX`" + `, ` + "`DefaultTimeoutSeconds`" + ` not ` + "`TIMEOUT`" + `

## Comment Standards

Comments MUST be readable by a non-developer (technical project manager level).

1. Every file: top-level purpose comment
2. Every public function: doc comment explaining WHAT and WHY
3. Complex logic: inline comments explaining the business reasoning
4. NO commenting obvious code (` + "`// increment counter`" + ` is noise)

## Structure Rules

1. Functions under 40 lines preferred; extract helpers for complex logic
2. Early returns / guard clauses over deep nesting
3. No magic numbers — use named constants
4. Group related functions with section comments
5. Imports: stdlib → internal → external
`

var testingStandardsSkill = `---
name: testing-standards
description: "Enforces TDD workflow and test quality standards. Activates on keywords: test, spec, validate, coverage, TDD, unit test, integration test."
---

# Testing Standards

## TDD Workflow (MANDATORY)

1. **RED:** Write a failing test that describes the expected behavior
2. **GREEN:** Write the minimum code to make the test pass
3. **REFACTOR:** Improve the code while keeping tests green

## Test Layer Separation

| Layer | Scope | Dependencies | Speed |
|-------|-------|-------------|-------|
| Unit | Individual functions, components | ALL mocked | <10ms per test |
| Integration | API handlers, data persistence | Real services (testcontainers) | <5s per test |
| E2E | Full user journeys | Real stack | <30s per test |

## Rules

1. **Every new source file MUST have a corresponding test file**
2. **Never mock what you don't own** — wrap external APIs in interfaces first
3. **Test behavior, not implementation** — tests should survive refactoring
4. **Descriptive test names:** ` + "`TestCreateUser_WithDuplicateEmail_ReturnsConflictError`" + `
5. **Arrange / Act / Assert** structure in every test
`

var prWorkflowSkill = `---
name: pr-workflow
description: "Enforces pull request standards. Activates on keywords: PR, pull request, merge, review, code review."
---

# Pull Request Workflow

## PR Requirements

1. **Title:** Clear, descriptive — matches commit message format (` + "`type: description`" + `)
2. **Description:** Explain WHY, not just WHAT. Link to related issues.
3. **Checklist:** Complete the PR template checklist (all items checked)
4. **CHANGELOG:** MUST be updated if the PR changes functionality
5. **Tests:** All new/changed code must have tests. CI must pass.
6. **Review:** At least one approval required before merge.

## Merge Strategy

- **Feature branches:** Squash merge (clean single commit on main)
- **Release branches:** Merge commit (preserve release history)
- **Hotfix branches:** Squash merge

## After Merge

1. Delete the feature branch
2. Verify CI passes on main
3. If applicable, tag a release
`

var documentationSkill = `---
name: documentation
description: "Enforces documentation discipline. Activates on keywords: document, readme, changelog, docs, documentation."
---

# Documentation Discipline

## The One Rule

**CHANGELOG.md is the single source of truth for what changed.**

## What This Means

1. **DO** update CHANGELOG.md in every PR that changes functionality
2. **DO** maintain README.md with setup instructions and architecture overview
3. **DO NOT** create auxiliary summary documents per task
4. **DO NOT** create markdown files to describe what an AI agent just did
5. **DO NOT** create status files, progress logs, or task tracking documents in the repo

## CHANGELOG Format

` + "```markdown" + `
## [Unreleased]

### Added
- One-line summary of new feature (#PR-number)

### Changed
- One-line summary of behavior change (#PR-number)

### Fixed
- One-line summary of bug fix (#PR-number)

### Removed
- One-line summary of removed feature (#PR-number)

## [v1.2.0] - 2026-04-04

### Added
- ...
` + "```" + `

## Architecture Decisions

Document architecture decisions in **code comments**, not separate files.
Use this format in the relevant source file:

` + "```" + `
// ARCHITECTURE DECISION: [Brief title]
// What: [What was decided]
// Why: [Reasoning]
// Alternative: [What else was considered]
` + "```" + `
`

var multiAgentSkill = `---
name: multi-agent
description: "Enforces multi-agent orchestration for quality. Activates on keywords: implement, build, create, refactor, architecture, design, complex."
---

# Multi-Agent Orchestration

## Quality Mode: {{if eq .QualityMode "best"}}BEST{{else}}FAST{{end}}

{{if eq .QualityMode "best"}}### BEST Mode Rules

1. **ALWAYS use sub-agents** (autopilot_fleet) for tasks involving 3+ independent files
2. **Task Classification → Model Routing:**
   - Architecture/Design (complexity 8-10) → Opus-tier model
   - Feature implementation (complexity 5-7) → Sonnet-tier model
   - Bugfix (complexity 4-6) → Sonnet-tier model
   - Documentation (complexity 1-3) → Haiku-tier model
3. **Parallel exploration** — Use explore agents to investigate multiple code areas simultaneously
4. **Never sacrifice quality for speed** — If a task needs 5 turns to get right, take 5 turns
5. **Code review before delivery** — Always review your own output against the project's code quality standards{{else}}### FAST Mode Rules

1. Use single-agent mode for most tasks
2. Use sub-agents only for tasks involving 5+ files
3. Prefer Sonnet-tier for all tasks
4. Minimize conversation turns
{{end}}
`

var codeTutorWorkflowSkill = `---
name: code-tutor-workflow
description: "Integrates Code Tutor with Forge Workflow. Activates on keywords: tutor, teach, explain, walkthrough, learn, understand."
---

# Code Tutor Integration

## Behavior

When Code Tutor is active in the workflow:

1. **File change notifications** — When files are created or modified, the system sends a notification: "N files changed — want a walkthrough?"
2. **Explanation depth levels:**
   - **Overview** — General, mildly technical summary suitable for project managers
   - **Technical** — Standard developer-level explanation of logic and patterns
   - **Line-by-Line** — Detailed walk-through of every significant line
3. **Quality auditing** — Tutor explanations flag naming violations, missing comments, and readability concerns

## Agent Integration

When creating or modifying files with Code Tutor active:

1. Write code that is optimized for learning — clear structure, logical flow
2. Add brief inline comments on non-obvious logic (the "why" moments)
3. Use architecture decision blocks for significant structural decisions
4. Ensure every public/exported symbol has a documentation comment
`

var workflowEnforcerSkill = `---
name: workflow-enforcer
description: "MANDATORY for all code changes. Enforces Forge Workflow standards. Activates on ANY implementation, refactor, bugfix, feature, build, create, modify, update, fix, add, change, or code modification task."
---

# Workflow Enforcer — Enterprise Standards

> ⚠️ This skill is MANDATORY. It applies to EVERY coding task in this project.
> Read .forge/workflow.json for this project's active configuration.

## SELF-CHECK PROTOCOL

Before delivering ANY code change, verify your output against these rules:

### ✅ Naming Check
- [ ] No single-letter variables (except i/j/k in loops, w/r in HTTP handlers)
- [ ] All booleans prefixed with is/has/can/should/was
- [ ] All functions are verb-first
- [ ] A non-developer can understand every name without context

### ✅ Comment Check
- [ ] Every new file has a top-level purpose comment
- [ ] Every public/exported function has a doc comment
- [ ] Complex logic blocks have "why" comments (not "what" comments)
- [ ] Comments are readable by a technical project manager

### ✅ Structure Check
- [ ] No function exceeds 40 lines (extract helpers if needed)
- [ ] Guard clauses used instead of deep nesting
- [ ] No magic numbers or strings (use named constants)
- [ ] Imports are logically grouped

### ✅ Workflow Check
- [ ] Working on a feature branch (not main)
- [ ] CHANGELOG.md updated if functionality changed
- [ ] Tests written for new/changed code
- [ ] Commit message follows format: type: description

### ✅ Quality Mode Check
{{if eq .QualityMode "best"}}- [ ] Sub-agents used for parallelizable work (3+ independent files)
- [ ] Task classified and appropriate model tier selected
- [ ] Code reviewed against quality standards before delivery{{else}}- [ ] Code meets minimum quality bar{{end}}

## ENFORCEMENT

If you find yourself about to deliver code that violates any of these rules:
1. STOP
2. Fix the violation
3. Re-verify the entire checklist
4. Only then deliver

These are not suggestions. They are requirements.
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: .github/copilot/setup-steps.yml
// ──────────────────────────────────────────────────────────────────────────────

// copilotAgentSetupTemplate generates the setup-steps.yml for the GitHub Copilot
// coding agent. Each step runs a shell command that pre-installs dependencies so
// the agent can build and test the project without network access during its run.
var copilotAgentSetupTemplate = `# .github/copilot/setup-steps.yml
# GitHub Copilot Coding Agent — Environment Setup
#
# Pre-installs project dependencies so the Copilot coding agent can run builds
# and tests when it works on issues or pull requests in this repository.
# Without this file, the agent operates without build feedback, reducing quality.
#
# Generated by Forge Terminal for {{.ProjectName}} (type: {{.ProjectType}})
# Docs: https://docs.github.com/en/copilot/customizing-copilot/customizing-the-development-environment-for-copilot-coding-agent

steps:
{{- if eq .ProjectType "go"}}
  - name: Download Go module dependencies
    run: go mod download

  - name: Verify project compiles cleanly
    run: go build ./...
{{- else if eq .ProjectType "node"}}
  - name: Install Node.js dependencies
    run: npm ci
{{- else if eq .ProjectType "python"}}
  - name: Install Python dependencies
    run: |
      pip install --upgrade pip
      pip install -r requirements.txt
{{- else if eq .ProjectType "rust"}}
  - name: Pre-fetch Cargo dependencies
    run: cargo fetch
{{- else if eq .ProjectType "java"}}
  - name: Download Maven dependencies
    run: mvn dependency:go-offline --quiet
{{- else if eq .ProjectType "dotnet"}}
  - name: Restore .NET package dependencies
    run: dotnet restore
{{- else}}
  # Add your project-specific dependency installation steps here.
  # See the docs link above for examples and additional guidance.
  - name: Set up project environment
    run: echo "Customize this step for {{.ProjectName}}"
{{- end}}
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: Pre-Commit Hook (PowerShell)
// ──────────────────────────────────────────────────────────────────────────────

// preCommitPS1Template is built with string concatenation to avoid
// Go raw-string / PowerShell backtick conflicts.
var preCommitPS1Template = "#!/usr/bin/env pwsh\n" +
	"# Forge Workflow Pre-Commit Hook (Enhanced)\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Enforces: main branch block, test file gate, CHANGELOG, naming, branch naming.\n" +
	"# Bypass with: git commit --no-verify (bypasses are logged)\n" +
	"\n" +
	"$ErrorActionPreference = \"Continue\"\n" +
	"$violations = @()\n" +
	"$warnings = @()\n" +
	"\n" +
	"# ── MAIN BRANCH BLOCK (Gate 2) ──────────────────────────────────────────\n" +
	"# Commits directly to main are forbidden. All work must happen on feature branches.\n" +
	"$currentBranch = git branch --show-current 2>$null\n" +
	"if ($currentBranch -eq \"main\" -or $currentBranch -eq \"master\") {\n" +
	"    $violations += \"MAIN BRANCH: Cannot commit directly to main — create a feature branch first\"\n" +
	"}\n" +
	"\n" +
	"# Branch Naming Check\n" +
	"$validBranchPattern = \"^(main|master|develop|feature/.+|fix/.+|chore/.+|docs/.+|hotfix/.+|release/.+)$\"\n" +
	"if ($currentBranch -and $currentBranch -notmatch $validBranchPattern) {\n" +
	"    $violations += \"BRANCH: '$currentBranch' does not match naming convention\"\n" +
	"}\n" +
	"\n" +
	"# Get Staged Files\n" +
	"$stagedFiles = git diff --cached --name-only --diff-filter=ACM 2>$null\n" +
	"if (-not $stagedFiles) { exit 0 }\n" +
	"\n" +
	"$sourceExtensions = @(\".go\", \".js\", \".jsx\", \".ts\", \".tsx\", \".py\", \".rs\", \".java\", \".cs\")\n" +
	"$testPatterns = @(\"_test.go\", \".test.js\", \".test.jsx\", \".test.ts\", \".test.tsx\", \".spec.js\", \".spec.jsx\", \".spec.ts\", \".spec.tsx\", \"_test.py\", \"_test.rs\")\n" +
	"$sourceFiles = $stagedFiles | Where-Object {\n" +
	"    $extension = [System.IO.Path]::GetExtension($_)\n" +
	"    $sourceExtensions -contains $extension\n" +
	"}\n" +
	"\n" +
	"# Naming Convention Check\n" +
	"$allowedSingleLetters = @('i', 'j', 'k', 'w', 'r', '_')\n" +
	"foreach ($filePath in $sourceFiles) {\n" +
	"    if (-not (Test-Path $filePath)) { continue }\n" +
	"    $lineNumber = 0\n" +
	"    foreach ($line in (Get-Content $filePath -ErrorAction SilentlyContinue)) {\n" +
	"        $lineNumber++\n" +
	"        if ($line -match '^\\s*(var|let|const|)\\s*([a-z])\\s*[:=]') {\n" +
	"            $varName = $Matches[2]\n" +
	"            if ($varName -and $varName.Length -eq 1 -and $allowedSingleLetters -notcontains $varName) {\n" +
	"                $warnings += \"NAMING: ${filePath}:${lineNumber} - Single-letter variable '$varName'\"\n" +
	"            }\n" +
	"        }\n" +
	"    }\n" +
	"}\n" +
	"\n" +
	"# ── TEST FILE GATE (Gate 4) ─────────────────────────────────────────────\n" +
	"# Every new source file must have a corresponding test file staged or on disk.\n" +
	"# Build output directories are excluded — they contain compiled artifacts, not\n" +
	"# authored source code, and must never be flagged for missing test coverage.\n" +
	"$buildOutputDirs = @(\"cmd/forge/web/\", \"frontend/dist/\", \"bin/\")\n" +
	"$newSourceFiles = git diff --cached --name-only --diff-filter=A 2>$null | Where-Object {\n" +
	"    $extension = [System.IO.Path]::GetExtension($_)\n" +
	"    if (-not ($sourceExtensions -contains $extension)) { return $false }\n" +
	"    foreach ($buildDir in $buildOutputDirs) {\n" +
	"        if ($_ -like \"$buildDir*\") { return $false }\n" +
	"    }\n" +
	"    return $true\n" +
	"}\n" +
	"# Exclude files that are themselves test files\n" +
	"$isTestFile = { param($f)\n" +
	"    foreach ($pattern in $testPatterns) { if ($f -like \"*$pattern\") { return $true } }\n" +
	"    return $false\n" +
	"}\n" +
	"foreach ($newFile in $newSourceFiles) {\n" +
	"    if (& $isTestFile $newFile) { continue }\n" +
	"    # Determine expected test file path based on language\n" +
	"    $extension = [System.IO.Path]::GetExtension($newFile)\n" +
	"    $baseName = $newFile.Substring(0, $newFile.Length - $extension.Length)\n" +
	"    $hasTest = $false\n" +
	"    if ($extension -eq \".go\") {\n" +
	"        $expectedTest = \"${baseName}_test.go\"\n" +
	"        if (($stagedFiles -contains $expectedTest) -or (Test-Path $expectedTest)) { $hasTest = $true }\n" +
	"    } else {\n" +
	"        # JS/TS: check for .test and .spec variants\n" +
	"        foreach ($testSuffix in @(\".test$extension\", \".spec$extension\")) {\n" +
	"            $expectedTest = \"${baseName}${testSuffix}\"\n" +
	"            if (($stagedFiles -contains $expectedTest) -or (Test-Path $expectedTest)) { $hasTest = $true; break }\n" +
	"        }\n" +
	"    }\n" +
	"    if (-not $hasTest) {\n" +
	"        $violations += \"TEST FILE: New source file '$newFile' has no corresponding test file\"\n" +
	"    }\n" +
	"}\n" +
	"\n" +
	"# ── CHANGELOG CHECK (Gate 7 — upgraded to violation) ────────────────────\n" +
	"# Source files changed but CHANGELOG.md not updated = blocking violation.\n" +
	"# Version-bump commits (only build artifacts / config staged) are exempt\n" +
	"# because the release script manages CHANGELOG in the same commit.\n" +
	"$versionOnlyPattern = '^(internal/updater/updater\\.go|frontend/package\\.json|frontend/src/config/tourSteps\\.js|cmd/forge/web/|resource\\.syso|version\\.json|go\\.sum)$'\n" +
	"$isVersionBump = $true\n" +
	"foreach ($staged in $stagedFiles) {\n" +
	"    if ($staged -notmatch $versionOnlyPattern) { $isVersionBump = $false; break }\n" +
	"}\n" +
	"$hasSourceChanges = ($sourceFiles | Measure-Object).Count -gt 0\n" +
	"$changelogUpdated = $stagedFiles | Where-Object { $_ -match \"CHANGELOG\\.md$\" }\n" +
	"if ($hasSourceChanges -and -not $changelogUpdated -and -not $isVersionBump) {\n" +
	"    $violations += \"CHANGELOG: Source files changed but CHANGELOG.md was not updated\"\n" +
	"}\n" +
	"\n" +
	"# Report Results\n" +
	"if ($violations.Count -gt 0) {\n" +
	"    Write-Host \"\"\n" +
	"    Write-Host \"PRE-COMMIT VIOLATIONS (blocking):\" -ForegroundColor Red\n" +
	"    foreach ($v in $violations) { Write-Host \"  * $v\" -ForegroundColor Red }\n" +
	"}\n" +
	"if ($warnings.Count -gt 0) {\n" +
	"    Write-Host \"\"\n" +
	"    Write-Host \"PRE-COMMIT WARNINGS (non-blocking):\" -ForegroundColor Yellow\n" +
	"    foreach ($w in $warnings) { Write-Host \"  * $w\" -ForegroundColor Yellow }\n" +
	"}\n" +
	"if ($violations.Count -eq 0 -and $warnings.Count -eq 0) {\n" +
	"    Write-Host \"Pre-commit checks passed\" -ForegroundColor Green\n" +
	"}\n" +
	"\n" +
	"if ($violations.Count -gt 0) {\n" +
	"    Write-Host \"Commit blocked. Fix violations or use --no-verify to bypass.\" -ForegroundColor Red\n" +
	"    exit 1\n" +
	"}\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: Pre-Commit Hook (Bash)
// ──────────────────────────────────────────────────────────────────────────────

// preCommitSHTemplate is built with string concatenation to avoid
// Go raw-string delimiter conflicts with shell syntax.
var preCommitSHTemplate = "#!/usr/bin/env bash\n" +
	"# Forge Workflow Pre-Commit Hook (Enhanced)\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Enforces: main branch block, test file gate, CHANGELOG, naming, branch naming.\n" +
	"# Bypass with: git commit --no-verify (bypasses are logged)\n" +
	"\n" +
	"set +e\n" +
	"violations=()\n" +
	"warnings=()\n" +
	"\n" +
	"# ── MAIN BRANCH BLOCK (Gate 2) ──────────────────────────────────────────\n" +
	"# Commits directly to main are forbidden. All work must happen on feature branches.\n" +
	"current_branch=$(git branch --show-current 2>/dev/null)\n" +
	"if [[ \"$current_branch\" == \"main\" || \"$current_branch\" == \"master\" ]]; then\n" +
	"    violations+=(\"MAIN BRANCH: Cannot commit directly to main — create a feature branch first\")\n" +
	"fi\n" +
	"\n" +
	"# Branch Naming Check\n" +
	"if [[ -n \"$current_branch\" ]] && ! echo \"$current_branch\" | grep -qE \"^(main|master|develop|feature/.+|fix/.+|chore/.+|docs/.+|hotfix/.+|release/.+)$\"; then\n" +
	"    violations+=(\"BRANCH: '$current_branch' does not match naming convention\")\n" +
	"fi\n" +
	"\n" +
	"# Get Staged Files\n" +
	"staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)\n" +
	"[[ -z \"$staged_files\" ]] && exit 0\n" +
	"\n" +
	"# Filter to source files\n" +
	"source_files=$(echo \"$staged_files\" | grep -E '\\.(go|js|jsx|ts|tsx|py|rs|java|cs)$')\n" +
	"\n" +
	"# ── TEST FILE GATE (Gate 4) ─────────────────────────────────────────────\n" +
	"# Every new source file must have a corresponding test file staged or on disk.\n" +
	"# Build output directories are excluded — they contain compiled artifacts, not\n" +
	"# authored source code, and must never be flagged for missing test coverage.\n" +
	"new_source_files=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep -E '\\.(go|js|jsx|ts|tsx|py|rs|java|cs)$' | grep -vE '^(cmd/forge/web/|frontend/dist/|bin/)')\n" +
	"if [[ -n \"$new_source_files\" ]]; then\n" +
	"    while IFS= read -r new_file; do\n" +
	"        # Skip files that are themselves test files\n" +
	"        if echo \"$new_file\" | grep -qE '(_test\\.go|\\.test\\.(js|jsx|ts|tsx)|\\.spec\\.(js|jsx|ts|tsx)|_test\\.py|_test\\.rs)$'; then\n" +
	"            continue\n" +
	"        fi\n" +
	"        extension=\"${new_file##*.}\"\n" +
	"        base_name=\"${new_file%.*}\"\n" +
	"        has_test=false\n" +
	"        if [[ \"$extension\" == \"go\" ]]; then\n" +
	"            expected_test=\"${base_name}_test.go\"\n" +
	"            if echo \"$staged_files\" | grep -qF \"$expected_test\" || [[ -f \"$expected_test\" ]]; then\n" +
	"                has_test=true\n" +
	"            fi\n" +
	"        else\n" +
	"            # JS/TS: check for .test and .spec variants\n" +
	"            for test_suffix in \".test.${extension}\" \".spec.${extension}\"; do\n" +
	"                expected_test=\"${base_name}${test_suffix}\"\n" +
	"                if echo \"$staged_files\" | grep -qF \"$expected_test\" || [[ -f \"$expected_test\" ]]; then\n" +
	"                    has_test=true\n" +
	"                    break\n" +
	"                fi\n" +
	"            done\n" +
	"        fi\n" +
	"        if [[ \"$has_test\" == \"false\" ]]; then\n" +
	"            violations+=(\"TEST FILE: New source file '$new_file' has no corresponding test file\")\n" +
	"        fi\n" +
	"    done <<< \"$new_source_files\"\n" +
	"fi\n" +
	"\n" +
	"# ── CHANGELOG CHECK (Gate 7 — upgraded to violation) ────────────────────\n" +
	"# Source files changed but CHANGELOG.md not updated = blocking violation.\n" +
	"has_source_changes=false\n" +
	"[[ -n \"$source_files\" ]] && has_source_changes=true\n" +
	"changelog_updated=$(echo \"$staged_files\" | grep -c \"CHANGELOG\\.md$\")\n" +
	"if $has_source_changes && [[ \"$changelog_updated\" -eq 0 ]]; then\n" +
	"    violations+=(\"CHANGELOG: Source files changed but CHANGELOG.md was not updated\")\n" +
	"fi\n" +
	"\n" +
	"# Report Results\n" +
	"if [[ ${#violations[@]} -gt 0 ]]; then\n" +
	"    echo -e \"\\n\\033[31mPRE-COMMIT VIOLATIONS (blocking):\\033[0m\"\n" +
	"    for v in \"${violations[@]}\"; do echo -e \"  \\033[31m* $v\\033[0m\"; done\n" +
	"fi\n" +
	"if [[ ${#warnings[@]} -gt 0 ]]; then\n" +
	"    echo -e \"\\n\\033[33mPRE-COMMIT WARNINGS (non-blocking):\\033[0m\"\n" +
	"    for w in \"${warnings[@]}\"; do echo -e \"  \\033[33m* $w\\033[0m\"; done\n" +
	"fi\n" +
	"if [[ ${#violations[@]} -eq 0 ]] && [[ ${#warnings[@]} -eq 0 ]]; then\n" +
	"    echo -e \"\\033[32mPre-commit checks passed\\033[0m\"\n" +
	"fi\n" +
	"\n" +
	"if [[ ${#violations[@]} -gt 0 ]]; then\n" +
	"    echo -e \"\\033[31mCommit blocked. Fix violations or use --no-verify to bypass.\\033[0m\"\n" +
	"    exit 1\n" +
	"fi\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: Commit-Msg Hook (PowerShell)
// ──────────────────────────────────────────────────────────────────────────────

// commitMsgPS1Template validates that the commit message follows the
// conventional format: type: description. Built with string concatenation
// because PS1 templates must avoid Go backtick/PowerShell backtick conflicts.
var commitMsgPS1Template = "#!/usr/bin/env pwsh\n" +
	"# Forge Workflow Commit-Msg Hook\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Validates commit message format: type: description\n" +
	"# Bypass with: git commit --no-verify\n" +
	"\n" +
	"$ErrorActionPreference = \"Continue\"\n" +
	"$commitMsgFile = $args[0]\n" +
	"if (-not $commitMsgFile -or -not (Test-Path $commitMsgFile)) {\n" +
	"    Write-Host \"commit-msg hook: no message file provided\" -ForegroundColor Yellow\n" +
	"    exit 0\n" +
	"}\n" +
	"\n" +
	"$commitMessage = Get-Content $commitMsgFile -Raw -ErrorAction SilentlyContinue\n" +
	"if (-not $commitMessage) { exit 0 }\n" +
	"\n" +
	"# Extract the first line (subject) — ignore comments and blank lines\n" +
	"$subjectLine = ($commitMessage -split \"`n\" | Where-Object { $_ -and $_ -notmatch '^#' } | Select-Object -First 1).Trim()\n" +
	"if (-not $subjectLine) { exit 0 }\n" +
	"\n" +
	"# Allow merge commits and revert commits through without format check\n" +
	"if ($subjectLine -match '^(Merge |Revert )') { exit 0 }\n" +
	"\n" +
	"# Validate format: type: description\n" +
	"$validTypes = @(\"feat\", \"fix\", \"chore\", \"docs\", \"test\", \"refactor\", \"perf\")\n" +
	"$formatPattern = '^(feat|fix|chore|docs|test|refactor|perf):\\s+.+'\n" +
	"if ($subjectLine -notmatch $formatPattern) {\n" +
	"    Write-Host \"\" \n" +
	"    Write-Host \"COMMIT-MSG VIOLATION:\" -ForegroundColor Red\n" +
	"    Write-Host \"  Message: '$subjectLine'\" -ForegroundColor Red\n" +
	"    Write-Host \"  Expected format: type: description\" -ForegroundColor Red\n" +
	"    Write-Host \"  Valid types: $($validTypes -join ', ')\" -ForegroundColor Yellow\n" +
	"    Write-Host \"  Example: feat: add user authentication flow\" -ForegroundColor Green\n" +
	"    Write-Host \"\" \n" +
	"    Write-Host \"Commit blocked. Fix the message format or use --no-verify to bypass.\" -ForegroundColor Red\n" +
	"    exit 1\n" +
	"}\n" +
	"\n" +
	"# Check for Co-authored-by trailer (warning only, not blocking)\n" +
	"if ($commitMessage -notmatch 'Co-authored-by:') {\n" +
	"    Write-Host \"COMMIT-MSG WARNING: Missing Co-authored-by trailer\" -ForegroundColor Yellow\n" +
	"}\n" +
	"\n" +
	"Write-Host \"Commit message format valid\" -ForegroundColor Green\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: Commit-Msg Hook (Bash)
// ──────────────────────────────────────────────────────────────────────────────

// commitMsgSHTemplate validates that the commit message follows the
// conventional format: type: description.
var commitMsgSHTemplate = "#!/usr/bin/env bash\n" +
	"# Forge Workflow Commit-Msg Hook\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Validates commit message format: type: description\n" +
	"# Bypass with: git commit --no-verify\n" +
	"\n" +
	"set +e\n" +
	"commit_msg_file=\"$1\"\n" +
	"[[ -z \"$commit_msg_file\" || ! -f \"$commit_msg_file\" ]] && exit 0\n" +
	"\n" +
	"# Extract the first non-comment, non-empty line as the subject\n" +
	"subject_line=$(grep -v '^#' \"$commit_msg_file\" | grep -v '^$' | head -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')\n" +
	"[[ -z \"$subject_line\" ]] && exit 0\n" +
	"\n" +
	"# Allow merge commits and revert commits through without format check\n" +
	"if echo \"$subject_line\" | grep -qE '^(Merge |Revert )'; then\n" +
	"    exit 0\n" +
	"fi\n" +
	"\n" +
	"# Validate format: type: description\n" +
	"valid_types=\"feat|fix|chore|docs|test|refactor|perf\"\n" +
	"if ! echo \"$subject_line\" | grep -qE \"^($valid_types): .+\"; then\n" +
	"    echo -e \"\\n\\033[31mCOMMIT-MSG VIOLATION:\\033[0m\"\n" +
	"    echo -e \"  \\033[31mMessage: '$subject_line'\\033[0m\"\n" +
	"    echo -e \"  \\033[31mExpected format: type: description\\033[0m\"\n" +
	"    echo -e \"  \\033[33mValid types: feat, fix, chore, docs, test, refactor, perf\\033[0m\"\n" +
	"    echo -e \"  \\033[32mExample: feat: add user authentication flow\\033[0m\"\n" +
	"    echo -e \"\\n\\033[31mCommit blocked. Fix the message format or use --no-verify to bypass.\\033[0m\"\n" +
	"    exit 1\n" +
	"fi\n" +
	"\n" +
	"# Check for Co-authored-by trailer (warning only, not blocking)\n" +
	"if ! grep -q 'Co-authored-by:' \"$commit_msg_file\"; then\n" +
	"    echo -e \"\\033[33mCOMMIT-MSG WARNING: Missing Co-authored-by trailer\\033[0m\"\n" +
	"fi\n" +
	"\n" +
	"echo -e \"\\033[32mCommit message format valid\\033[0m\"\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: Pre-Push Hook (PowerShell)
// ──────────────────────────────────────────────────────────────────────────────

// prePushPS1Template runs the full build and test suite before allowing a push.
// Detects project type (Go, Node, etc.) and runs the appropriate commands.
var prePushPS1Template = "#!/usr/bin/env pwsh\n" +
	"# Forge Workflow Pre-Push Hook\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Runs build + test suite before allowing push. Ensures broken code never reaches remote.\n" +
	"# Bypass with: git push --no-verify\n" +
	"\n" +
	"$ErrorActionPreference = \"Continue\"\n" +
	"$failures = @()\n" +
	"\n" +
	"Write-Host \"Running pre-push checks...\" -ForegroundColor Cyan\n" +
	"\n" +
	"# ── Go Build + Test ─────────────────────────────────────────────────────\n" +
	"if (Test-Path \"go.mod\") {\n" +
	"    Write-Host \"  [Go] Building...\" -ForegroundColor Cyan\n" +
	"    $buildOutput = go build ./cmd/forge/ 2>&1\n" +
	"    if ($LASTEXITCODE -ne 0) {\n" +
	"        $failures += \"GO BUILD: go build ./cmd/forge/ failed\"\n" +
	"        Write-Host \"  [Go] Build FAILED\" -ForegroundColor Red\n" +
	"        Write-Host $buildOutput -ForegroundColor Red\n" +
	"    } else {\n" +
	"        Write-Host \"  [Go] Build passed\" -ForegroundColor Green\n" +
	"    }\n" +
	"\n" +
	"    Write-Host \"  [Go] Testing...\" -ForegroundColor Cyan\n" +
	"    $testOutput = go test ./... 2>&1\n" +
	"    if ($LASTEXITCODE -ne 0) {\n" +
	"        $failures += \"GO TEST: go test ./... failed\"\n" +
	"        Write-Host \"  [Go] Tests FAILED\" -ForegroundColor Red\n" +
	"        Write-Host $testOutput -ForegroundColor Red\n" +
	"    } else {\n" +
	"        Write-Host \"  [Go] Tests passed\" -ForegroundColor Green\n" +
	"    }\n" +
	"}\n" +
	"\n" +
	"# ── Frontend Build + Test ───────────────────────────────────────────────\n" +
	"if (Test-Path \"frontend/package.json\") {\n" +
	"    Write-Host \"  [Frontend] Testing...\" -ForegroundColor Cyan\n" +
	"    Push-Location frontend\n" +
	"    $vitestOutput = npx vitest run 2>&1\n" +
	"    if ($LASTEXITCODE -ne 0) {\n" +
	"        $failures += \"FRONTEND TEST: npx vitest run failed\"\n" +
	"        Write-Host \"  [Frontend] Tests FAILED\" -ForegroundColor Red\n" +
	"        Write-Host $vitestOutput -ForegroundColor Red\n" +
	"    } else {\n" +
	"        Write-Host \"  [Frontend] Tests passed\" -ForegroundColor Green\n" +
	"    }\n" +
	"    Pop-Location\n" +
	"}\n" +
	"\n" +
	"# ── Report ──────────────────────────────────────────────────────────────\n" +
	"if ($failures.Count -gt 0) {\n" +
	"    Write-Host \"\"\n" +
	"    Write-Host \"PRE-PUSH FAILURES (blocking):\" -ForegroundColor Red\n" +
	"    foreach ($f in $failures) { Write-Host \"  * $f\" -ForegroundColor Red }\n" +
	"    Write-Host \"Push blocked. Fix failures or use --no-verify to bypass.\" -ForegroundColor Red\n" +
	"    exit 1\n" +
	"}\n" +
	"\n" +
	"Write-Host \"Pre-push checks passed\" -ForegroundColor Green\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: Pre-Push Hook (Bash)
// ──────────────────────────────────────────────────────────────────────────────

// prePushSHTemplate runs the full build and test suite before allowing a push.
var prePushSHTemplate = "#!/usr/bin/env bash\n" +
	"# Forge Workflow Pre-Push Hook\n" +
	"# Generated by Forge Terminal Workflow Architect\n" +
	"# Runs build + test suite before allowing push. Ensures broken code never reaches remote.\n" +
	"# Bypass with: git push --no-verify\n" +
	"\n" +
	"set +e\n" +
	"failures=()\n" +
	"\n" +
	"echo -e \"\\033[36mRunning pre-push checks...\\033[0m\"\n" +
	"\n" +
	"# ── Go Build + Test ─────────────────────────────────────────────────────\n" +
	"if [[ -f \"go.mod\" ]]; then\n" +
	"    echo -e \"  \\033[36m[Go] Building...\\033[0m\"\n" +
	"    build_output=$(go build ./cmd/forge/ 2>&1)\n" +
	"    if [[ $? -ne 0 ]]; then\n" +
	"        failures+=(\"GO BUILD: go build ./cmd/forge/ failed\")\n" +
	"        echo -e \"  \\033[31m[Go] Build FAILED\\033[0m\"\n" +
	"        echo \"$build_output\"\n" +
	"    else\n" +
	"        echo -e \"  \\033[32m[Go] Build passed\\033[0m\"\n" +
	"    fi\n" +
	"\n" +
	"    echo -e \"  \\033[36m[Go] Testing...\\033[0m\"\n" +
	"    test_output=$(go test ./... 2>&1)\n" +
	"    if [[ $? -ne 0 ]]; then\n" +
	"        failures+=(\"GO TEST: go test ./... failed\")\n" +
	"        echo -e \"  \\033[31m[Go] Tests FAILED\\033[0m\"\n" +
	"        echo \"$test_output\"\n" +
	"    else\n" +
	"        echo -e \"  \\033[32m[Go] Tests passed\\033[0m\"\n" +
	"    fi\n" +
	"fi\n" +
	"\n" +
	"# ── Frontend Build + Test ───────────────────────────────────────────────\n" +
	"if [[ -f \"frontend/package.json\" ]]; then\n" +
	"    echo -e \"  \\033[36m[Frontend] Testing...\\033[0m\"\n" +
	"    pushd frontend > /dev/null\n" +
	"    vitest_output=$(npx vitest run 2>&1)\n" +
	"    if [[ $? -ne 0 ]]; then\n" +
	"        failures+=(\"FRONTEND TEST: npx vitest run failed\")\n" +
	"        echo -e \"  \\033[31m[Frontend] Tests FAILED\\033[0m\"\n" +
	"        echo \"$vitest_output\"\n" +
	"    else\n" +
	"        echo -e \"  \\033[32m[Frontend] Tests passed\\033[0m\"\n" +
	"    fi\n" +
	"    popd > /dev/null\n" +
	"fi\n" +
	"\n" +
	"# ── Report ──────────────────────────────────────────────────────────────\n" +
	"if [[ ${#failures[@]} -gt 0 ]]; then\n" +
	"    echo -e \"\\n\\033[31mPRE-PUSH FAILURES (blocking):\\033[0m\"\n" +
	"    for f in \"${failures[@]}\"; do echo -e \"  \\033[31m* $f\\033[0m\"; done\n" +
	"    echo -e \"\\033[31mPush blocked. Fix failures or use --no-verify to bypass.\\033[0m\"\n" +
	"    exit 1\n" +
	"fi\n" +
	"\n" +
	"echo -e \"\\033[32mPre-push checks passed\\033[0m\"\n" +
	"exit 0\n"

// ──────────────────────────────────────────────────────────────────────────────
// Template: PR Template
// ──────────────────────────────────────────────────────────────────────────────

var prTemplateContent = `## Description

<!-- Explain WHY this change is needed, not just WHAT it does. Link related issues. -->

## Changes

<!-- Brief bullet points of what changed -->

-

## PR Checklist

- [ ] CHANGELOG.md updated with summary of changes
- [ ] All variable and function names are self-documenting (no single-letter names)
- [ ] Code comments are readable by non-developers
- [ ] Tests written or updated for changed code
- [ ] Branch follows naming convention (feature/*, fix/*, chore/*, docs/*)
{{if contains .EnabledModules "code-tutor"}}- [ ] Code Tutor walkthrough completed for new/changed files
{{end}}
## Testing

<!-- How was this tested? Include test output or screenshots. -->

## Quality Mode: {{upper (print .QualityMode)}}

{{if eq .QualityMode "best"}}<!-- Confirm multi-agent approach was used where applicable -->
- [ ] Sub-agents leveraged for parallelizable work
- [ ] Appropriate model tier used for task complexity
{{end}}
`

// ──────────────────────────────────────────────────────────────────────────────
// Template: CLAUDE.md
// Claude Code reads this file automatically at every session start.
// It imports the canonical agent instructions so Claude Code and GitHub Copilot
// share a single source of truth without duplicating content.
// ──────────────────────────────────────────────────────────────────────────────

var claudeMDTemplate = `# {{.ProjectName}} — Forge Agent Instructions

> Auto-generated by Forge Terminal. Claude Code reads this file automatically
> at every session start. All workflow rules below are binding — read them
> before beginning any task.

@.github/copilot-instructions.md
`
