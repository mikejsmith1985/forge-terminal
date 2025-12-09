// Package terminal provides insights API helpers.
package terminal

import (
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// LoadVisionInsights loads insights from disk for a specific tab.
func LoadVisionInsights(amDir string, tabID string) ([]*vision.Insight, error) {
	return vision.LoadInsights(amDir, tabID)
}

// GetVisionInsightSummary generates a summary report for insights.
func GetVisionInsightSummary(insights []*vision.Insight) map[string]interface{} {
	return vision.GetInsightSummary(insights)
}
