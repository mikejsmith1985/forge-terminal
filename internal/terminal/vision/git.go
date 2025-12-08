package vision

import (
	"bytes"
	"regexp"
	"strings"
	"sync"
)

// GitStatusDetector detects git status output.
type GitStatusDetector struct {
	mu      sync.RWMutex
	enabled bool
}

// NewGitStatusDetector creates a new git status detector.
func NewGitStatusDetector() *GitStatusDetector {
	return &GitStatusDetector{
		enabled: true, // Enabled by default
	}
}

func (g *GitStatusDetector) Name() string {
	return "git_status"
}

func (g *GitStatusDetector) Enabled() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.enabled
}

func (g *GitStatusDetector) SetEnabled(enabled bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.enabled = enabled
}

// stripAnsi removes ANSI escape codes
func stripAnsi(text string) string {
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	return ansiRegex.ReplaceAllString(text, "")
}

// Detect analyzes buffer for git status output.
func (g *GitStatusDetector) Detect(buffer []byte) *Match {
	text := string(buffer)
	cleanText := stripAnsi(text)
	
	// Must contain "On branch" indicator
	if !strings.Contains(cleanText, "On branch") {
		return nil
	}
	
	// Look for common git status sections
	hasStagedFiles := strings.Contains(cleanText, "Changes to be committed:")
	hasUnstagedFiles := strings.Contains(cleanText, "Changes not staged for commit:")
	hasUntrackedFiles := strings.Contains(cleanText, "Untracked files:")
	
	// Must have at least one section
	if !hasStagedFiles && !hasUnstagedFiles && !hasUntrackedFiles {
		// Clean status (no changes), skip overlay
		return nil
	}
	
	// Extract branch name
	branch := extractBranch(cleanText)
	
	// Parse files from each section
	stagedFiles := extractFilesFromSection(cleanText, "Changes to be committed:", []string{"new file:", "modified:", "deleted:", "renamed:"})
	unstagedFiles := extractFilesFromSection(cleanText, "Changes not staged for commit:", []string{"modified:", "deleted:"})
	untrackedFiles := extractFilesFromSection(cleanText, "Untracked files:", nil)
	
	// Build payload
	payload := map[string]interface{}{
		"branch":     branch,
		"staged":     stagedFiles,
		"unstaged":   unstagedFiles,
		"untracked":  untrackedFiles,
		"hasSummary": true,
	}
	
	return &Match{
		Type:    "GIT_STATUS",
		Payload: payload,
		Offset:  bytes.Index(buffer, []byte("On branch")),
		Length:  len(buffer),
	}
}

// extractBranch finds branch name from git status output.
func extractBranch(text string) string {
	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "On branch ") {
			return strings.TrimPrefix(line, "On branch ")
		}
	}
	return "unknown"
}

// extractFilesFromSection parses files from a git status section.
func extractFilesFromSection(text, sectionMarker string, statusPrefixes []string) []map[string]interface{} {
	files := make([]map[string]interface{}, 0)
	
	// Find section start
	sectionIdx := strings.Index(text, sectionMarker)
	if sectionIdx == -1 {
		return files
	}
	
	// Find next section or end
	remainingText := text[sectionIdx+len(sectionMarker):]
	nextSectionIdx := strings.Index(remainingText, "\n\n")
	if nextSectionIdx == -1 {
		nextSectionIdx = len(remainingText)
	}
	sectionText := remainingText[:nextSectionIdx]
	
	// Parse lines
	lines := strings.Split(sectionText, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		// Skip empty and instruction lines
		if line == "" || strings.HasPrefix(line, "(use ") || strings.HasPrefix(line, "no changes added") {
			continue
		}
		
		// Untracked files section (no status prefix)
		if statusPrefixes == nil {
			if !strings.HasPrefix(line, "(") {
				files = append(files, map[string]interface{}{
					"name":   line,
					"status": "untracked",
				})
			}
			continue
		}
		
		// Staged/unstaged files (has status prefix)
		var status, filename string
		for _, prefix := range statusPrefixes {
			if strings.Contains(line, prefix) {
				parts := strings.SplitN(line, prefix, 2)
				if len(parts) == 2 {
					status = strings.TrimSuffix(prefix, ":")
					filename = strings.TrimSpace(parts[1])
					
					// Handle "renamed: old -> new" format
					if status == "renamed" && strings.Contains(filename, " -> ") {
						parts := strings.Split(filename, " -> ")
						if len(parts) == 2 {
							filename = strings.TrimSpace(parts[1])
						}
					}
					
					files = append(files, map[string]interface{}{
						"name":   filename,
						"status": status,
					})
					break
				}
			}
		}
	}
	
	return files
}
