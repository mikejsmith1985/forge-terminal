package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

type projectCreateRequest struct {
	Name         string `json:"name"`
	RootPath     string `json:"rootPath"`
	CreateGitHub bool   `json:"createGitHub"`
	Visibility   string `json:"visibility"` // "private" or "public"
}

type projectCreateResponse struct {
	Path         string        `json:"path"`
	FilesCreated int           `json:"filesCreated"`
	GitHub       *githubResult `json:"github,omitempty"`
}

type githubResult struct {
	Created bool   `json:"created"`
	URL     string `json:"url,omitempty"`
	Error   string `json:"error,omitempty"`
}

// handleProjectCreate handles POST /api/project/create.
// Creates a new directory, runs git init, scaffolds Forge workflow files,
// and optionally creates a GitHub repository via the gh CLI.
func handleProjectCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req projectCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	// Validate name: must be non-empty and contain no path separators or traversal
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		http.Error(w, "name must not contain path separators or '..'", http.StatusBadRequest)
		return
	}

	rootPath := strings.TrimSpace(req.RootPath)
	if rootPath == "" {
		http.Error(w, "rootPath is required", http.StatusBadRequest)
		return
	}

	// Resolve absolute paths and guard against traversal
	absRoot, err := filepath.Abs(rootPath)
	if err != nil {
		http.Error(w, "invalid rootPath", http.StatusBadRequest)
		return
	}
	fullPath := filepath.Join(absRoot, name)
	absProject, err := filepath.Abs(fullPath)
	if err != nil || !strings.HasPrefix(absProject, absRoot+string(filepath.Separator)) {
		http.Error(w, "resolved project path escapes rootPath", http.StatusBadRequest)
		return
	}

	// Create the directory
	if err := os.MkdirAll(absProject, 0o755); err != nil {
		http.Error(w, fmt.Sprintf("failed to create directory: %s", err), http.StatusInternalServerError)
		return
	}

	if err := initializeGitRepo(absProject); err != nil {
		http.Error(w, fmt.Sprintf("git init failed: %s", err), http.StatusInternalServerError)
		return
	}

	// Scaffold Forge workflow files
	cfg := workflow.DefaultConfig()
	cfg.ProjectName = name
	cfg.ConflictStrategy = workflow.ConflictSkip
	result, err := workflow.ScaffoldProject(absProject, cfg)
	if err != nil {
		http.Error(w, fmt.Sprintf("scaffold failed: %s", err), http.StatusInternalServerError)
		return
	}

	resp := projectCreateResponse{
		Path:         absProject,
		FilesCreated: len(result.FilesCreated),
	}

	// Optional GitHub repo creation. `gh repo create --push` refuses a
	// repository with zero commits, so the scaffold is committed first.
	if req.CreateGitHub {
		if err := createInitialCommit(absProject); err != nil {
			resp.GitHub = &githubResult{Created: false, Error: fmt.Sprintf("initial commit failed: %s", err)}
		} else {
			resp.GitHub = createGitHubRepo(name, absProject, req.Visibility)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

const (
	// initialCommitMessage labels the bootstrap commit that captures the
	// scaffolded files so the repository can be pushed to GitHub.
	initialCommitMessage = "chore: initial project scaffold"
	// fallbackCommitAuthorName/Email are used only when the machine has no
	// git identity configured, so the bootstrap commit never fails on it.
	fallbackCommitAuthorName  = "Forge Terminal"
	fallbackCommitAuthorEmail = "forge-terminal@localhost"
)

// initializeGitRepo creates the project's git repository with "main" as the
// default branch (matching GitHub), falling back to a plain init when the
// installed git predates the -b flag (git < 2.28).
func initializeGitRepo(projectPath string) error {
	modernInitCmd := exec.Command("git", "init", "-b", "main", projectPath)
	hideWindow(modernInitCmd)
	if _, err := modernInitCmd.CombinedOutput(); err == nil {
		return nil
	}
	legacyInitCmd := exec.Command("git", "init", projectPath)
	hideWindow(legacyInitCmd)
	if out, err := legacyInitCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s — %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// createInitialCommit stages the scaffolded files and records the project's
// first commit. Without it, `gh repo create --push` fails because git cannot
// push a repository that has no commits. The commit runs with --no-verify:
// the scaffold's own pre-commit hook intentionally blocks commits on
// main/master for day-to-day work, but the bootstrap commit is made by Forge
// itself before any user work exists.
func createInitialCommit(projectPath string) error {
	stageCmd := exec.Command("git", "-C", projectPath, "add", "-A")
	hideWindow(stageCmd)
	if out, err := stageCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add failed: %s — %s", err, strings.TrimSpace(string(out)))
	}

	commitArgs := []string{"-C", projectPath}
	if !hasGitIdentity(projectPath) {
		commitArgs = append(commitArgs,
			"-c", "user.name="+fallbackCommitAuthorName,
			"-c", "user.email="+fallbackCommitAuthorEmail)
	}
	commitArgs = append(commitArgs, "commit", "--no-verify", "-m", initialCommitMessage)
	commitCmd := exec.Command("git", commitArgs...)
	hideWindow(commitCmd)
	if out, err := commitCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git commit failed: %s — %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// hasGitIdentity reports whether git can already resolve a commit author
// (user.email set at any config level) for the project.
func hasGitIdentity(projectPath string) bool {
	identityCmd := exec.Command("git", "-C", projectPath, "config", "user.email")
	hideWindow(identityCmd)
	configuredEmail, err := identityCmd.Output()
	return err == nil && strings.TrimSpace(string(configuredEmail)) != ""
}

// createGitHubRepo attempts to create a GitHub repo from the local directory
// using the gh CLI. Returns a githubResult describing what happened.
func createGitHubRepo(name, projectPath, visibility string) *githubResult {
	if _, err := exec.LookPath("gh"); err != nil {
		return &githubResult{
			Created: false,
			Error:   "gh CLI not found — install GitHub CLI (https://cli.github.com) to enable this feature",
		}
	}

	if visibility != "public" {
		visibility = "private"
	}

	ghCmd := exec.Command("gh", "repo", "create", name,
		"--source="+projectPath,
		"--"+visibility,
		"--push",
		"--remote=origin",
	)
	hideWindow(ghCmd)
	out, err := ghCmd.CombinedOutput()
	if err != nil {
		return &githubResult{
			Created: false,
			Error:   fmt.Sprintf("gh repo create failed: %s", strings.TrimSpace(string(out))),
		}
	}

	// gh prints the repo URL as the last line of output
	url := ""
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, "https://") {
			url = line
			break
		}
	}

	return &githubResult{Created: true, URL: url}
}
