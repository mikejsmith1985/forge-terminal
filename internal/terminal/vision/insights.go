// Package vision provides insights tracking for terminal patterns.
package vision

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Severity levels for insights
type Severity string

const (
	SeverityInfo     Severity = "INFO"
	SeverityWarning  Severity = "WARNING"
	SeverityError    Severity = "ERROR"
	SeverityCritical Severity = "CRITICAL"
)

// Insight represents a detected pattern with metadata.
type Insight struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"timestamp"`
	Type        string                 `json:"type"` // "COMPILER_ERROR", "GIT_CONFLICT", etc.
	Severity    Severity               `json:"severity"`
	Message     string                 `json:"message"`
	Payload     map[string]interface{} `json:"payload"`
	SessionInfo SessionInfo            `json:"sessionInfo"`
	AutoDismiss bool                   `json:"autoDismiss"` // Auto-dismiss on next command
}

// SessionInfo captures context about when insight was detected.
type SessionInfo struct {
	TabID       string `json:"tabId"`
	TabName     string `json:"tabName,omitempty"`
	WorkingDir  string `json:"workingDir,omitempty"`
	ShellType   string `json:"shellType,omitempty"`
	InAutoMode  bool   `json:"inAutoMode"`
	CommandLine string `json:"commandLine,omitempty"` // Last executed command
}

// InsightsTracker manages insights collection and persistence.
type InsightsTracker struct {
	mu           sync.RWMutex
	insights     []*Insight
	sessionInfo  SessionInfo
	amDir        string
	maxInsights  int  // Max insights to keep in memory
	persistOnAdd bool // Whether to persist after each add
}

// NewInsightsTracker creates a new insights tracker.
func NewInsightsTracker(amDir string, sessionInfo SessionInfo) *InsightsTracker {
	return &InsightsTracker{
		insights:     make([]*Insight, 0),
		sessionInfo:  sessionInfo,
		amDir:        amDir,
		maxInsights:  100, // Keep last 100 insights
		persistOnAdd: true,
	}
}

// AddInsight adds a new insight to the tracker.
func (t *InsightsTracker) AddInsight(insightType string, severity Severity, message string, payload map[string]interface{}) *Insight {
	t.mu.Lock()
	defer t.mu.Unlock()

	insight := &Insight{
		ID:          fmt.Sprintf("%s-%d", insightType, time.Now().UnixNano()),
		Timestamp:   time.Now(),
		Type:        insightType,
		Severity:    severity,
		Message:     message,
		Payload:     payload,
		SessionInfo: t.sessionInfo,
		AutoDismiss: severity == SeverityInfo, // Auto-dismiss info messages
	}

	t.insights = append(t.insights, insight)

	// Trim if exceeded max
	if len(t.insights) > t.maxInsights {
		t.insights = t.insights[len(t.insights)-t.maxInsights:]
	}

	// Persist to disk
	if t.persistOnAdd {
		go t.persist() // Non-blocking
	}

	return insight
}

// GetInsights returns all insights.
func (t *InsightsTracker) GetInsights() []*Insight {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]*Insight, len(t.insights))
	copy(result, t.insights)
	return result
}

// GetInsightsSince returns insights after a specific time.
func (t *InsightsTracker) GetInsightsSince(since time.Time) []*Insight {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]*Insight, 0)
	for _, insight := range t.insights {
		if insight.Timestamp.After(since) {
			result = append(result, insight)
		}
	}
	return result
}

// GetInsightsBySeverity returns insights matching severity.
func (t *InsightsTracker) GetInsightsBySeverity(severity Severity) []*Insight {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]*Insight, 0)
	for _, insight := range t.insights {
		if insight.Severity == severity {
			result = append(result, insight)
		}
	}
	return result
}

// ClearInsights removes all insights.
func (t *InsightsTracker) ClearInsights() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.insights = make([]*Insight, 0)
}

// DismissAutoDismissable removes insights marked for auto-dismiss.
func (t *InsightsTracker) DismissAutoDismissable() int {
	t.mu.Lock()
	defer t.mu.Unlock()

	filtered := make([]*Insight, 0)
	dismissed := 0
	for _, insight := range t.insights {
		if !insight.AutoDismiss {
			filtered = append(filtered, insight)
		} else {
			dismissed++
		}
	}
	t.insights = filtered
	return dismissed
}

// UpdateSessionInfo updates the current session context.
func (t *InsightsTracker) UpdateSessionInfo(info SessionInfo) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.sessionInfo = info
}

// persist writes insights to disk (should be called with lock held or async).
func (t *InsightsTracker) persist() {
	t.mu.RLock()
	data := make([]*Insight, len(t.insights))
	copy(data, t.insights)
	tabID := t.sessionInfo.TabID
	t.mu.RUnlock()

	if t.amDir == "" || tabID == "" {
		return
	}

	// Ensure AM directory exists
	if err := os.MkdirAll(t.amDir, 0755); err != nil {
		return
	}

	// Write to vision-insights-{tabID}.json
	filename := filepath.Join(t.amDir, fmt.Sprintf("vision-insights-%s.json", tabID))
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return
	}

	_ = os.WriteFile(filename, jsonData, 0644)
}

// LoadInsights loads insights from disk for a specific tab.
func LoadInsights(amDir string, tabID string) ([]*Insight, error) {
	filename := filepath.Join(amDir, fmt.Sprintf("vision-insights-%s.json", tabID))
	
	data, err := os.ReadFile(filename)
	if err != nil {
		if os.IsNotExist(err) {
			return []*Insight{}, nil
		}
		return nil, err
	}

	var insights []*Insight
	if err := json.Unmarshal(data, &insights); err != nil {
		return nil, err
	}

	return insights, nil
}

// GetInsightSummary generates a summary report for insights.
func GetInsightSummary(insights []*Insight) map[string]interface{} {
	summary := map[string]interface{}{
		"total":      len(insights),
		"bySeverity": make(map[Severity]int),
		"byType":     make(map[string]int),
		"recent":     make([]*Insight, 0),
	}

	for _, insight := range insights {
		summary["bySeverity"].(map[Severity]int)[insight.Severity]++
		summary["byType"].(map[string]int)[insight.Type]++
	}

	// Get last 5 insights
	start := len(insights) - 5
	if start < 0 {
		start = 0
	}
	summary["recent"] = insights[start:]

	return summary
}
