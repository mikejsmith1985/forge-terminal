// Package review provides a Quality Agent that performs automated code review
// on pull request diffs. It analyzes changed files for naming violations,
// excessive complexity, missing tests, architectural concerns, and security
// issues — producing structured findings that can be displayed in the UI or
// posted as PR comments.
package review

import "time"

// ReviewStrategy mirrors the PRReviewStrategy from the workflow package,
// repeated here to avoid a circular dependency.
type ReviewStrategy string

const (
	StrategyManual       ReviewStrategy = "manual"
	StrategyTutor        ReviewStrategy = "tutor"
	StrategyAgent        ReviewStrategy = "agent"
	StrategyTutorAndAgent ReviewStrategy = "tutor-and-agent"
)

// Strictness controls how aggressively the Quality Agent flags issues.
type Strictness string

const (
	StrictnessLenient  Strictness = "lenient"  // Only flag clear violations
	StrictnessStandard Strictness = "standard" // Flag violations + common smells
	StrictnessStrict   Strictness = "strict"   // Flag everything including style nitpicks
)

// FocusArea represents a category the Quality Agent can analyze.
type FocusArea string

const (
	FocusNaming       FocusArea = "naming"
	FocusComplexity   FocusArea = "complexity"
	FocusTests        FocusArea = "tests"
	FocusArchitecture FocusArea = "architecture"
	FocusSecurity     FocusArea = "security"
)

// ReviewRequest is the input for a quality review.
type ReviewRequest struct {
	ProjectPath  string       `json:"projectPath"`
	Diff         string       `json:"diff"`         // Unified diff of the PR
	ChangedFiles []string     `json:"changedFiles"`  // List of file paths changed
	Strictness   Strictness   `json:"strictness"`
	FocusAreas   []FocusArea  `json:"focusAreas"`
}

// Severity indicates how serious a finding is.
type Severity string

const (
	SeverityCritical Severity = "critical" // Must fix before merge
	SeverityWarning  Severity = "warning"  // Should fix, not blocking
	SeverityInfo     Severity = "info"     // Suggestion or style note
)

// ReviewFinding is a single issue found by the Quality Agent.
type ReviewFinding struct {
	FilePath    string    `json:"filePath"`
	Line        int       `json:"line"`        // 0 = file-level finding
	Severity    Severity  `json:"severity"`
	FocusArea   FocusArea `json:"focusArea"`
	Title       string    `json:"title"`       // One-line summary
	Description string    `json:"description"` // Detailed explanation
	Suggestion  string    `json:"suggestion"`  // How to fix it
}

// ReviewReport is the complete output of a quality review.
type ReviewReport struct {
	ProjectPath  string          `json:"projectPath"`
	FilesReviewed int            `json:"filesReviewed"`
	Findings     []ReviewFinding `json:"findings"`
	Summary      string          `json:"summary"`      // AI-generated one-paragraph summary
	Score        int             `json:"score"`         // 0-100 quality score
	ReviewedAt   time.Time       `json:"reviewedAt"`
	ModelUsed    string          `json:"modelUsed"`     // Which LLM performed the review
}

// CountBySeverity returns the number of findings at each severity level.
func (r *ReviewReport) CountBySeverity() map[Severity]int {
	counts := map[Severity]int{
		SeverityCritical: 0,
		SeverityWarning:  0,
		SeverityInfo:     0,
	}
	for _, finding := range r.Findings {
		counts[finding.Severity]++
	}
	return counts
}

// HasCritical returns true if any finding is critical severity.
func (r *ReviewReport) HasCritical() bool {
	for _, finding := range r.Findings {
		if finding.Severity == SeverityCritical {
			return true
		}
	}
	return false
}
