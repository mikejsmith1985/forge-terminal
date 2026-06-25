package workflow

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// scaffoldEntry maps a module to the file it generates.
type scaffoldEntry struct {
	moduleID ModuleID
	relPath  string
	category string
	render   func(WorkflowConfig) (string, error)
}

// scaffoldManifest defines every file the scaffold engine can generate,
// the module that owns it, and the function that renders its content.
func scaffoldManifest() []scaffoldEntry {
	return []scaffoldEntry{
		// Core: Agent instructions — read by GitHub Copilot automatically
		{
			moduleID: ModuleCopilotInstructions,
			relPath:  filepath.Join(".github", "copilot-instructions.md"),
			category: "config",
			render:   RenderCopilotInstructions,
		},
		// CLAUDE.md — read by Claude Code automatically at every session start;
		// imports .github/copilot-instructions.md so both tools share one source.
		{
			moduleID: ModuleCopilotInstructions,
			relPath:  "CLAUDE.md",
			category: "config",
			render:   RenderClaudeMD,
		},
		// Project Constitution — the GitHub Spec Kit (Spec-Driven Development)
		// source of truth, read first by every speckit stage. Emitted natively so
		// new projects get Forge's merged rules without per-repo reconstruction.
		{
			moduleID: ModuleConstitution,
			relPath:  filepath.Join(".specify", "memory", "constitution.md"),
			category: "config",
			render:   RenderConstitution,
		},
		// Workflow config
		{
			moduleID: ModuleCopilotInstructions, // Tied to core module
			relPath:  filepath.Join(".forge", "workflow.json"),
			category: "config",
			render:   RenderWorkflowJSON,
		},
		// Skills
		{
			moduleID: ModuleBranchingStrategy,
			relPath:  filepath.Join(".github", "skills", "branching-strategy", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleBranchingStrategy, c) },
		},
		{
			moduleID: ModuleCodeQuality,
			relPath:  filepath.Join(".github", "skills", "code-quality", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleCodeQuality, c) },
		},
		{
			moduleID: ModuleTestingStandards,
			relPath:  filepath.Join(".github", "skills", "testing-standards", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleTestingStandards, c) },
		},
		{
			moduleID: ModulePRWorkflow,
			relPath:  filepath.Join(".github", "skills", "pr-workflow", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModulePRWorkflow, c) },
		},
		{
			moduleID: ModuleDocumentation,
			relPath:  filepath.Join(".github", "skills", "documentation", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleDocumentation, c) },
		},
		{
			moduleID: ModuleMultiAgent,
			relPath:  filepath.Join(".github", "skills", "multi-agent", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleMultiAgent, c) },
		},
		{
			moduleID: ModuleWorkflowEnforcer,
			relPath:  filepath.Join(".github", "skills", "workflow-enforcer", "SKILL.md"),
			category: "skill",
			render:   func(c WorkflowConfig) (string, error) { return RenderSkill(ModuleWorkflowEnforcer, c) },
		},
		// Documentation: CHANGELOG
		{
			moduleID: ModuleDocumentation,
			relPath:  "CHANGELOG.md",
			category: "changelog",
			render:   RenderChangelog,
		},
		// Enforcement: Git hooks
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "pre-commit"),
			category: "hook",
			render:   RenderPreCommitSH,
		},
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "pre-commit.ps1"),
			category: "hook",
			render:   RenderPreCommitPS1,
		},
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "commit-msg"),
			category: "hook",
			render:   RenderCommitMsgSH,
		},
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "commit-msg.ps1"),
			category: "hook",
			render:   RenderCommitMsgPS1,
		},
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "pre-push"),
			category: "hook",
			render:   RenderPrePushSH,
		},
		{
			moduleID: ModuleGitHooks,
			relPath:  filepath.Join(".forge", "hooks", "pre-push.ps1"),
			category: "hook",
			render:   RenderPrePushPS1,
		},
		// Enforcement: PR template
		{
			moduleID: ModulePRTemplate,
			relPath:  filepath.Join(".github", "pull_request_template.md"),
			category: "template",
			render:   RenderPRTemplate,
		},
		// Integration: Copilot coding agent environment setup
		{
			moduleID: ModuleCopilotAgentSetup,
			relPath:  filepath.Join(".github", "copilot", "setup-steps.yml"),
			category: "config",
			render:   RenderCopilotAgentSetup,
		},
	}
}

// PreviewScaffold generates a dry-run preview of what files would be
// created or modified if the workflow config were applied to the project.
func PreviewScaffold(projectPath string, config WorkflowConfig) (*ScaffoldPreview, error) {
	absolutePath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolving project path: %w", err)
	}

	manifest := scaffoldManifest()
	preview := &ScaffoldPreview{}

	for _, entry := range manifest {
		if !config.HasModule(entry.moduleID) {
			continue
		}

		fullPath := filepath.Join(absolutePath, entry.relPath)
		exists := fileExistsSimple(fullPath)

		// Determine the action based on conflict strategy
		action := "create"
		conflict := config.ConflictStrategy
		if exists {
			switch config.ConflictStrategy {
			case ConflictSkip:
				action = "skip"
			case ConflictOverwrite:
				action = "overwrite"
			case ConflictMerge:
				action = "merge"
			}
		}

		// Estimate the generated content size
		content, renderErr := entry.render(config)
		sizeBytes := 0
		if renderErr == nil {
			sizeBytes = len(content)
		}

		scaffoldFile := ScaffoldFile{
			Path:      entry.relPath,
			Action:    action,
			Category:  entry.category,
			SizeBytes: sizeBytes,
			Conflict:  conflict,
			Exists:    exists,
		}

		preview.Files = append(preview.Files, scaffoldFile)
		preview.TotalFiles++

		switch action {
		case "create":
			preview.NewFiles++
		case "overwrite", "merge":
			preview.UpdateFiles++
		case "skip":
			preview.SkipFiles++
		}
	}

	return preview, nil
}

// ScaffoldProject applies the workflow configuration to a project directory,
// creating or updating files according to the manifest and conflict strategy.
func ScaffoldProject(projectPath string, config WorkflowConfig) (*ScaffoldResult, error) {
	absolutePath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolving project path: %w", err)
	}

	// Guard: the resolved path must actually exist as a directory.
	// This catches contaminated paths (e.g., PowerShell exe path prepended to cwd)
	// that arrive from the frontend before sanitization catches them.
	if stat, statErr := os.Stat(absolutePath); statErr != nil || !stat.IsDir() {
		return nil, fmt.Errorf("project path does not exist or is not a directory: %s", absolutePath)
	}

	manifest := scaffoldManifest()
	result := &ScaffoldResult{
		Success:   true,
		AppliedAt: time.Now(),
	}

	for _, entry := range manifest {
		if !config.HasModule(entry.moduleID) {
			continue
		}

		fullPath := filepath.Join(absolutePath, entry.relPath)
		exists := fileExistsSimple(fullPath)

		// Handle conflict resolution
		if exists {
			switch config.ConflictStrategy {
			case ConflictSkip:
				result.FilesSkipped = append(result.FilesSkipped, entry.relPath)
				log.Printf("[Workflow] Skipped existing file: %s", entry.relPath)
				continue
			case ConflictOverwrite:
				// Fall through to write
			case ConflictMerge:
				// For now, merge behaves like skip for non-appendable files.
				// CHANGELOG is the exception — we could append sections.
				if entry.category != "changelog" {
					result.FilesSkipped = append(result.FilesSkipped, entry.relPath)
					log.Printf("[Workflow] Merge mode — skipped non-appendable: %s", entry.relPath)
					continue
				}
			}
		}

		// Render the template content
		content, renderErr := entry.render(config)
		if renderErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("render %s: %s", entry.relPath, renderErr))
			result.Success = false
			continue
		}

		// Ensure parent directories exist
		parentDir := filepath.Dir(fullPath)
		if mkdirErr := os.MkdirAll(parentDir, 0o755); mkdirErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("mkdir %s: %s", parentDir, mkdirErr))
			result.Success = false
			continue
		}

		// Write the file
		filePermission := os.FileMode(0o644)
		if entry.category == "hook" {
			filePermission = 0o755 // Hooks must be executable
		}

		if writeErr := os.WriteFile(fullPath, []byte(content), filePermission); writeErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("write %s: %s", entry.relPath, writeErr))
			result.Success = false
			continue
		}

		if exists {
			result.FilesUpdated = append(result.FilesUpdated, entry.relPath)
			log.Printf("[Workflow] Updated: %s", entry.relPath)
		} else {
			result.FilesCreated = append(result.FilesCreated, entry.relPath)
			log.Printf("[Workflow] Created: %s", entry.relPath)
		}
	}

	// Replay the embedded Spec Kit pipeline (.specify/ payload + speckit-* skills)
	// so the project can run Spec-Driven Development offline. Done outside the
	// manifest loop because it writes a whole embedded directory tree rather than
	// a single rendered file. The constitution is excluded from the payload — the
	// manifest's RenderConstitution owns .specify/memory/constitution.md.
	if config.HasModule(ModuleSpecKit) {
		specKitPaths, specKitErr := ScaffoldSpecKit(absolutePath, config.ConflictStrategy)
		if specKitErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("speckit pipeline: %s", specKitErr))
			result.Success = false
		} else {
			result.FilesCreated = append(result.FilesCreated, specKitPaths...)
			log.Printf("[Workflow] Spec Kit pipeline: %d files written", len(specKitPaths))
		}

		// Project the pipeline onto the other tools' skill surfaces so SDD is
		// runnable cross-tool, not just under Claude. ScaffoldSpecKit above already
		// wrote Claude's .claude/skills/ via the embedded payload mapping, so only
		// the additional tools are projected here. (Google's instruction-based
		// surface is added in a later increment.)
		copilotPaths, copilotErr := ProjectSpecKitForTool(absolutePath, "copilot", config.ConflictStrategy)
		if copilotErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("speckit copilot projection: %s", copilotErr))
			result.Success = false
		} else {
			result.FilesCreated = append(result.FilesCreated, copilotPaths...)
			log.Printf("[Workflow] Spec Kit Copilot projection: %d files written", len(copilotPaths))
		}
	}

	// Configure git hooks path if git hooks module is enabled and git is present
	if config.HasModule(ModuleGitHooks) {
		configureGitHooks(absolutePath)
	}

	totalProcessed := len(result.FilesCreated) + len(result.FilesUpdated)
	log.Printf("[Workflow] Scaffold complete: %d created, %d updated, %d skipped, %d errors",
		len(result.FilesCreated), len(result.FilesUpdated), len(result.FilesSkipped), len(result.Errors))

	if totalProcessed == 0 && len(result.Errors) == 0 {
		log.Printf("[Workflow] No files were generated — all existing files were skipped")
	}

	return result, nil
}

// configureGitHooks sets the project's git hooks path to .forge/hooks/
// using a project-local git config (does not affect global git settings).
func configureGitHooks(projectPath string) {
	hooksPath := filepath.Join(".forge", "hooks")

	// Use forward slashes for git config compatibility across platforms
	hooksPathNormalized := strings.ReplaceAll(hooksPath, "\\", "/")

	gitConfigCmd := exec.Command("git", "config", "--local", "core.hooksPath", hooksPathNormalized)
	gitConfigCmd.Dir = projectPath
	hideExecWindow(gitConfigCmd) // Prevent CMD window flash on Windows when applying workflow

	if output, err := gitConfigCmd.CombinedOutput(); err != nil {
		log.Printf("[Workflow] Warning: failed to configure git hooks path: %s (output: %s)", err, string(output))
	} else {
		log.Printf("[Workflow] Configured git hooks path: %s", hooksPathNormalized)
	}

	// On Unix systems, ensure all hook scripts are executable
	if runtime.GOOS != "windows" {
		hookNames := []string{"pre-commit", "commit-msg", "pre-push"}
		for _, hookName := range hookNames {
			hookFile := filepath.Join(projectPath, ".forge", "hooks", hookName)
			if err := os.Chmod(hookFile, 0o755); err != nil {
				log.Printf("[Workflow] Warning: could not chmod hook %s: %s", hookName, err)
			}
		}
	}
}
