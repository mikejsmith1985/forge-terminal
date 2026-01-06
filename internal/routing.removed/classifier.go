package routing

import (
	"strings"
)

// TaskPattern represents different types of development tasks
type TaskPattern string

const (
	PatternArchitecture      TaskPattern = "architecture"
	PatternMultiFileRefactor TaskPattern = "multi-file-refactor"
	PatternFeature           TaskPattern = "feature"
	PatternBugfix            TaskPattern = "bugfix"
	PatternTesting           TaskPattern = "testing"
	PatternDocumentation     TaskPattern = "documentation"
	PatternUnknown           TaskPattern = "unknown"
)

// Classification represents the result of task pattern detection
type Classification struct {
	Pattern    TaskPattern `json:"pattern"`
	Complexity int         `json:"complexity"`
	FileCount  int         `json:"file_count"`
	Reasoning  string      `json:"reasoning"`
}

// ClassifyTask analyzes a prompt and determines its pattern and complexity
// This is fast keyword-based detection (no LLM needed)
func ClassifyTask(prompt string, mentionedFiles []string) Classification {
	lower := strings.ToLower(prompt)
	fileCount := len(mentionedFiles)

	// Architecture (Complexity: 9-10)
	if containsAny(lower, []string{"design", "architecture", "system", "integrate", "plan"}) {
		return Classification{
			Pattern:    PatternArchitecture,
			Complexity: 9,
			FileCount:  fileCount,
			Reasoning:  "Architectural design requiring system-level planning",
		}
	}

	// Multi-File Refactor (Complexity: 7-8)
	if strings.Contains(lower, "refactor") && fileCount >= 5 {
		return Classification{
			Pattern:    PatternMultiFileRefactor,
			Complexity: 8,
			FileCount:  fileCount,
			Reasoning:  "Complex refactoring across multiple files",
		}
	}

	// Simple refactor with fewer files
	if strings.Contains(lower, "refactor") {
		return Classification{
			Pattern:    PatternMultiFileRefactor,
			Complexity: 6,
			FileCount:  fileCount,
			Reasoning:  "Refactoring task",
		}
	}

	// Bugfix (Complexity: 4-6)
	if containsAny(lower, []string{"fix", "bug", "broken", "not working", "issue", "error"}) {
		complexity := 5
		if fileCount <= 1 {
			complexity = 4
		} else if fileCount >= 3 {
			complexity = 6
		}
		return Classification{
			Pattern:    PatternBugfix,
			Complexity: complexity,
			FileCount:  fileCount,
			Reasoning:  "Bug fix requiring investigation",
		}
	}

	// Feature Implementation (Complexity: 5-7)
	if containsAny(lower, []string{"add", "create", "implement", "build", "new feature"}) {
		complexity := 6
		if fileCount <= 2 {
			complexity = 5
		} else if fileCount >= 5 {
			complexity = 7
		}
		return Classification{
			Pattern:    PatternFeature,
			Complexity: complexity,
			FileCount:  fileCount,
			Reasoning:  "New feature implementation",
		}
	}

	// Testing (Complexity: 3-5)
	if containsAny(lower, []string{"test", "validate", "spec", "e2e", "playwright", "unit test"}) {
		return Classification{
			Pattern:    PatternTesting,
			Complexity: 4,
			FileCount:  fileCount,
			Reasoning:  "Test coverage creation",
		}
	}

	// Documentation (Complexity: 1-3)
	if containsAny(lower, []string{"document", "readme", "guide", "comment", "docs"}) {
		return Classification{
			Pattern:    PatternDocumentation,
			Complexity: 2,
			FileCount:  fileCount,
			Reasoning:  "Documentation update",
		}
	}

	// Unknown/default
	return Classification{
		Pattern:    PatternUnknown,
		Complexity: 5,
		FileCount:  fileCount,
		Reasoning:  "General task",
	}
}

// containsAny checks if the text contains any of the given keywords
func containsAny(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}
