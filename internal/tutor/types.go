// Package tutor provides a "Learn As You Build" code walkthrough system.
// It analyzes project codebases, generates learning paths, and uses LLM
// to explain files interactively while agents build code in parallel.
package tutor

import (
	"time"
)

// FileStatus tracks the review state of a file in the learning path.
type FileStatus string

const (
	StatusPending  FileStatus = "pending"
	StatusCurrent  FileStatus = "current"
	StatusReviewed FileStatus = "reviewed"
	StatusSkipped  FileStatus = "skipped"
)

// FileCategory classifies files by their role in the project architecture.
type FileCategory string

const (
	CategoryConfig   FileCategory = "config"
	CategoryTypes    FileCategory = "types"
	CategoryUtils    FileCategory = "utils"
	CategoryCore     FileCategory = "core"
	CategoryHandlers FileCategory = "handlers"
	CategoryUI       FileCategory = "ui"
	CategoryTests    FileCategory = "tests"
	CategoryDocs     FileCategory = "docs"
	CategoryAssets   FileCategory = "assets"
)

// ExplanationDepth controls how detailed tutor explanations are.
type ExplanationDepth string

const (
	DepthBrief    ExplanationDepth = "brief"
	DepthStandard ExplanationDepth = "standard"
	DepthDeep     ExplanationDepth = "deep"
)

// NamingStrictness controls how aggressively naming issues are flagged.
type NamingStrictness string

const (
	NamingLenient  NamingStrictness = "lenient"
	NamingStandard NamingStrictness = "standard"
	NamingStrict   NamingStrictness = "strict"
)

// TutorMode determines how the tutor operates.
type TutorMode string

const (
	ModeOnDemand TutorMode = "on_demand" // User-initiated walkthrough
	ModeLive     TutorMode = "live"      // Auto-detects file changes during builds
)

// ProjectType identifies the primary language/framework of a project.
type ProjectType string

const (
	ProjectGo     ProjectType = "go"
	ProjectNode   ProjectType = "node"
	ProjectPython ProjectType = "python"
	ProjectRust   ProjectType = "rust"
	ProjectJava   ProjectType = "java"
	ProjectGeneric ProjectType = "generic"
)

// FileEntry represents a single file in the learning path.
type FileEntry struct {
	Path       string       `json:"path"`
	Category   FileCategory `json:"category"`
	Complexity int          `json:"complexity"` // 1-5 difficulty rating
	DependsOn  []string     `json:"dependsOn"`  // Files that should be understood first
	Summary    string       `json:"summary"`     // One-line description
	LineCount  int          `json:"lineCount"`
}

// LearningPath is an ordered sequence of files for teaching a codebase.
type LearningPath struct {
	ProjectPath string       `json:"projectPath"`
	ProjectType ProjectType  `json:"projectType"`
	ProjectName string       `json:"projectName"`
	Files       []FileEntry  `json:"files"`
	GeneratedAt time.Time    `json:"generatedAt"`
}

// TutorSession tracks a user's progress through a learning path.
type TutorSession struct {
	ID           string                `json:"id"`
	ProjectPath  string                `json:"projectPath"`
	LearningPath *LearningPath         `json:"learningPath"`
	CurrentIndex int                   `json:"currentIndex"`
	Progress     map[string]FileStatus `json:"progress"` // path → status
	Mode         TutorMode             `json:"mode"`
	Settings     TutorSettings         `json:"settings"`
	CreatedAt    time.Time             `json:"createdAt"`
	UpdatedAt    time.Time             `json:"updatedAt"`
}

// TutorSettings holds user-configurable tutor preferences.
type TutorSettings struct {
	Enabled         bool             `json:"enabled"`
	Depth           ExplanationDepth `json:"depth"`
	NamingReview    NamingStrictness `json:"namingReview"`
	LiveMode        bool             `json:"liveMode"`
	AutoOpenOnBuild bool             `json:"autoOpenOnBuild"`
}

// DefaultSettings returns sensible tutor defaults.
func DefaultSettings() TutorSettings {
	return TutorSettings{
		Enabled:         false,
		Depth:           DepthStandard,
		NamingReview:    NamingStandard,
		LiveMode:        false,
		AutoOpenOnBuild: false,
	}
}

// ExplanationSection represents one section of a file explanation.
type ExplanationSection struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// FileExplanation is the complete LLM-generated explanation for a file.
type FileExplanation struct {
	FilePath    string               `json:"filePath"`
	ContentHash string               `json:"contentHash"` // SHA-256 of file contents for cache invalidation
	Sections    []ExplanationSection `json:"sections"`
	GeneratedAt time.Time            `json:"generatedAt"`
	ModelUsed   string               `json:"modelUsed"`
	Depth       ExplanationDepth     `json:"depth"`
}

// FileChangeEvent represents a file modification detected by the watcher.
type FileChangeEvent struct {
	Path      string    `json:"path"`
	Operation string    `json:"operation"` // "create", "modify", "delete"
	Timestamp time.Time `json:"timestamp"`
}

// WatcherNotification is sent to the frontend when files change during builds.
type WatcherNotification struct {
	SessionID string            `json:"sessionId"`
	Files     []FileChangeEvent `json:"files"`
	Message   string            `json:"message"` // e.g., "3 files modified — want a walkthrough?"
}

// SessionProgress provides a summary of learning progress.
type SessionProgress struct {
	TotalFiles    int     `json:"totalFiles"`
	ReviewedCount int     `json:"reviewedCount"`
	SkippedCount  int     `json:"skippedCount"`
	PendingCount  int     `json:"pendingCount"`
	PercentDone   float64 `json:"percentDone"`
	CurrentFile   string  `json:"currentFile"`
	CurrentIndex  int     `json:"currentIndex"`
}

// GetProgress computes the current progress summary for a session.
func (s *TutorSession) GetProgress() SessionProgress {
	if s.LearningPath == nil {
		return SessionProgress{}
	}

	total := len(s.LearningPath.Files)
	reviewed := 0
	skipped := 0
	pending := 0

	for _, f := range s.LearningPath.Files {
		status, ok := s.Progress[f.Path]
		if !ok {
			pending++
			continue
		}
		switch status {
		case StatusReviewed:
			reviewed++
		case StatusSkipped:
			skipped++
		default:
			pending++
		}
	}

	var currentFile string
	if s.CurrentIndex >= 0 && s.CurrentIndex < total {
		currentFile = s.LearningPath.Files[s.CurrentIndex].Path
	}

	pct := 0.0
	if total > 0 {
		pct = float64(reviewed+skipped) / float64(total) * 100
	}

	return SessionProgress{
		TotalFiles:    total,
		ReviewedCount: reviewed,
		SkippedCount:  skipped,
		PendingCount:  pending,
		PercentDone:   pct,
		CurrentFile:   currentFile,
		CurrentIndex:  s.CurrentIndex,
	}
}
