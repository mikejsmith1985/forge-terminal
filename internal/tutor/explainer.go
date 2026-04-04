package tutor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const maxFileContentBytes = 100 * 1024 // 100KB prompt limit

var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// Explainer generates structured teaching explanations for source files using LLMs.
type Explainer struct {
	mu    sync.RWMutex
	cache map[string]*FileExplanation // "contentHash:depth" → cached explanation
}

// NewExplainer creates an Explainer with an empty cache.
func NewExplainer() *Explainer {
	return &Explainer{
		cache: make(map[string]*FileExplanation),
	}
}

// cacheKey builds a composite cache key from content hash and explanation depth.
func cacheKey(contentHash string, depth ExplanationDepth) string {
	return contentHash + ":" + string(depth)
}

// ExplainFile reads a source file, generates a structured teaching explanation via an LLM,
// and caches the result keyed by content hash and depth.
func (e *Explainer) ExplainFile(
	ctx context.Context,
	projectPath string,
	entry FileEntry,
	learningPath *LearningPath,
	depth ExplanationDepth,
	namingStrictness NamingStrictness,
	reviewedFiles []string,
) (*FileExplanation, error) {
	fullPath := filepath.Join(projectPath, entry.Path)

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("reading file %s: %w", entry.Path, err)
	}

	hash := sha256.Sum256(content)
	contentHash := hex.EncodeToString(hash[:])

	// Check cache (hash + depth must match).
	key := cacheKey(contentHash, depth)
	e.mu.RLock()
	if cached, ok := e.cache[key]; ok {
		e.mu.RUnlock()
		log.Printf("[Tutor Explainer] cache hit for %s (depth=%s)", entry.Path, depth)
		return cached, nil
	}
	e.mu.RUnlock()

	fileContents := string(content)
	if len(content) > maxFileContentBytes {
		fileContents = string(content[:maxFileContentBytes]) + "\n\n[...truncated — file exceeds 100KB]"
		log.Printf("[Tutor Explainer] truncated %s from %d to %d bytes", entry.Path, len(content), maxFileContentBytes)
	}

	prompt := e.buildPrompt(entry, fileContents, learningPath, depth, namingStrictness, reviewedFiles)

	// Augment prompt with enterprise workflow quality audit if active
	auditContext := DetectWorkflowContext(projectPath)
	auditSection := BuildAuditPromptSection(auditContext)
	if auditSection != "" {
		prompt += auditSection
	}

	log.Printf("[Tutor Explainer] generating explanation for %s (depth=%s, audit=%v)", entry.Path, depth, auditContext.WorkflowActive)
	response, modelUsed, err := e.callLLM(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("LLM call for %s: %w", entry.Path, err)
	}

	explanation := e.parseExplanation(response, entry.Path, contentHash, modelUsed, depth)

	e.mu.Lock()
	e.cache[key] = explanation
	e.mu.Unlock()

	log.Printf("[Tutor Explainer] cached explanation for %s (model=%s, sections=%d)", entry.Path, modelUsed, len(explanation.Sections))
	return explanation, nil
}

// buildPrompt constructs a structured teaching prompt for the LLM.
func (e *Explainer) buildPrompt(
	entry FileEntry,
	fileContents string,
	learningPath *LearningPath,
	depth ExplanationDepth,
	namingStrictness NamingStrictness,
	reviewedFiles []string,
) string {
	var b strings.Builder

	// System instruction
	b.WriteString("You are an expert code tutor. Your job is to teach a developer about a codebase ")
	b.WriteString("by explaining files one at a time in a structured, educational way. ")
	b.WriteString("Be clear, precise, and insightful. Avoid filler.\n\n")

	// Project context
	if learningPath != nil {
		b.WriteString(fmt.Sprintf("PROJECT: %s (type: %s)\n", learningPath.ProjectName, learningPath.ProjectType))
	}
	b.WriteString(fmt.Sprintf("FILE: %s\n", entry.Path))
	b.WriteString(fmt.Sprintf("CATEGORY: %s\n", entry.Category))
	b.WriteString(fmt.Sprintf("COMPLEXITY: %d/5\n", entry.Complexity))
	if entry.Summary != "" {
		b.WriteString(fmt.Sprintf("SUMMARY: %s\n", entry.Summary))
	}
	if len(entry.DependsOn) > 0 {
		b.WriteString(fmt.Sprintf("DEPENDS ON: %s\n", strings.Join(entry.DependsOn, ", ")))
	}

	// Previously reviewed files for context
	if len(reviewedFiles) > 0 {
		b.WriteString(fmt.Sprintf("\nFILES ALREADY REVIEWED (the reader knows these): %s\n", strings.Join(reviewedFiles, ", ")))
	}

	// Depth and naming instructions
	b.WriteString("\n" + depthInstruction(depth) + "\n")
	b.WriteString(namingInstruction(namingStrictness) + "\n")

	// Required response format
	b.WriteString(`
Respond using EXACTLY these markdown sections in this order:

## Purpose
What this file does and why it exists in the project.

## Architecture Decisions
Why it's structured this way and what alternatives exist.

## Code Walkthrough
Key functions, types, and logic explained. ` + depthInstruction(depth) + `

## Naming Review
Review variable, function, and type names. ` + namingInstruction(namingStrictness) + `

## How It Connects
How this file relates to previously reviewed files and the broader project.
`)

	// File contents
	b.WriteString("\n---\nFILE CONTENTS:\n```\n")
	b.WriteString(fileContents)
	b.WriteString("\n```\n")

	return b.String()
}

// tutorModelChain defines the ordered model fallback for tutor explanations.
// Cheap/fast models first to preserve premium quota for development work.
var tutorModelChain = []struct {
	model   string
	label   string
}{
	{"gpt-4o-mini", "gpt-4o-mini"},
	{"gpt-4.1-nano", "gpt-4.1-nano"},
	{"gpt-4.1-mini", "gpt-4.1-mini"},
	{"gpt-4o", "gpt-4o"},
}

// callLLM invokes an LLM with a model fallback chain and returns the response,
// model name, and any error.  It walks the cheap-first chain via the Copilot CLI,
// then falls back to the Claude CLI as a last resort.
func (e *Explainer) callLLM(ctx context.Context, prompt string) (string, string, error) {
	timeout := 180 * time.Second

	// Walk the Copilot model chain.
	for i, m := range tutorModelChain {
		response, err := runCLI(ctx, timeout, "copilot", []string{
			"--model", m.model,
			"-p", prompt,
			"-s",
			"--no-color",
			"--allow-all-tools",
		})
		if err == nil && strings.TrimSpace(response) != "" {
			log.Printf("[Tutor Explainer] got response from copilot/%s (%d bytes)", m.label, len(response))
			return response, "copilot/" + m.label, nil
		}
		if i < len(tutorModelChain)-1 {
			if err != nil {
				log.Printf("[Tutor Explainer] %s rate-limited or failed: %v, trying next model…", m.label, err)
			} else {
				log.Printf("[Tutor Explainer] %s returned empty response, trying next model…", m.label)
			}
		}
	}

	log.Printf("[Tutor Explainer] all copilot models exhausted, falling back to claude")

	// Final fallback: Claude CLI (no model flag — uses user's default).
	response, err := runCLI(ctx, timeout, "claude", []string{
		"-p", prompt,
		"--output-format", "text",
	})
	if err != nil {
		return "", "", fmt.Errorf("all LLM backends failed (claude: %w)", err)
	}
	if strings.TrimSpace(response) == "" {
		return "", "", fmt.Errorf("all LLM backends returned empty responses")
	}

	log.Printf("[Tutor Explainer] got response from claude (%d bytes)", len(response))
	return response, "claude", nil
}

// runCLI executes a CLI command with a timeout and returns cleaned output.
func runCLI(ctx context.Context, timeout time.Duration, command string, args []string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")
	hideExecWindow(cmd) // Prevent CMD window flash on Windows

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("executing %s: %w", command, err)
	}

	return cleanOutput(string(output)), nil
}

// cleanOutput strips ANSI escape codes, carriage returns, and excess whitespace.
func cleanOutput(output string) string {
	clean := ansiRegex.ReplaceAllString(output, "")
	clean = strings.ReplaceAll(clean, "\r", "")
	return strings.TrimSpace(clean)
}

// parseExplanation splits the LLM response into structured sections by ## headers.
func (e *Explainer) parseExplanation(
	response string,
	filePath string,
	contentHash string,
	modelUsed string,
	depth ExplanationDepth,
) *FileExplanation {
	sections := parseSections(response)

	if len(sections) == 0 {
		sections = []ExplanationSection{
			{Title: "Explanation", Content: strings.TrimSpace(response)},
		}
	}

	return &FileExplanation{
		FilePath:    filePath,
		ContentHash: contentHash,
		Sections:    sections,
		GeneratedAt: time.Now(),
		ModelUsed:   modelUsed,
		Depth:       depth,
	}
}

// parseSections splits markdown text on "## " headers into ExplanationSection slices.
func parseSections(text string) []ExplanationSection {
	lines := strings.Split(text, "\n")
	var sections []ExplanationSection
	var currentTitle string
	var currentContent strings.Builder

	for _, line := range lines {
		if strings.HasPrefix(line, "## ") {
			// Flush previous section.
			if currentTitle != "" {
				sections = append(sections, ExplanationSection{
					Title:   currentTitle,
					Content: strings.TrimSpace(currentContent.String()),
				})
			}
			currentTitle = strings.TrimSpace(strings.TrimPrefix(line, "## "))
			currentContent.Reset()
		} else if currentTitle != "" {
			currentContent.WriteString(line)
			currentContent.WriteString("\n")
		}
	}

	// Flush last section.
	if currentTitle != "" {
		sections = append(sections, ExplanationSection{
			Title:   currentTitle,
			Content: strings.TrimSpace(currentContent.String()),
		})
	}

	return sections
}

// ClearCache removes all cached explanations.
func (e *Explainer) ClearCache() {
	e.mu.Lock()
	e.cache = make(map[string]*FileExplanation)
	e.mu.Unlock()
	log.Printf("[Tutor Explainer] cache cleared")
}

// InvalidateFile removes cached explanations for a specific file path.
func (e *Explainer) InvalidateFile(filePath string) {
	e.mu.Lock()
	for key, expl := range e.cache {
		if expl.FilePath == filePath {
			delete(e.cache, key)
		}
	}
	e.mu.Unlock()
	log.Printf("[Tutor Explainer] invalidated cache for %s", filePath)
}

// depthInstruction returns a prompt modifier based on explanation depth.
func depthInstruction(depth ExplanationDepth) string {
	switch depth {
	case DepthBrief:
		return "Keep explanations concise. Cover only the most important 3 functions/types."
	case DepthDeep:
		return "Provide a detailed line-by-line walkthrough. Explain every function, type, and important variable."
	default: // DepthStandard
		return "Explain all exported functions and types. Be thorough but not exhaustive."
	}
}

// namingInstruction returns a prompt modifier based on naming strictness.
func namingInstruction(strictness NamingStrictness) string {
	switch strictness {
	case NamingLenient:
		return "Only flag naming issues that are genuinely confusing or misleading."
	case NamingStrict:
		return "Critically review every variable, function, and type name. Flag single-letter variables, unclear abbreviations, and inconsistent conventions."
	default: // NamingStandard
		return "Review variable and function names for clarity. Suggest improvements for ambiguous names."
	}
}
