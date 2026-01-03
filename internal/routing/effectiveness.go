package routing

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// EffectivenessLog represents a single task completion record
type EffectivenessLog struct {
	Pattern      TaskPattern `json:"pattern"`
	Model        string      `json:"model"`
	Prompts      int         `json:"prompts"`
	Success      bool        `json:"success"`
	Timestamp    time.Time   `json:"timestamp"`
	FilesChanged int         `json:"files_changed,omitempty"`
}

// ModelRecommendation represents a routing recommendation
type ModelRecommendation struct {
	RecommendedModel string                `json:"recommended_model"`
	Reasoning        string                `json:"reasoning"`
	HistoricalData   bool                  `json:"historical_data"`
	TotalSamples     int                   `json:"total_samples"`
	ModelComparison  []ModelPerformance    `json:"model_comparison"`
	CostComparison   *CostComparison       `json:"cost_comparison,omitempty"`
	ExpectedPrompts  float64               `json:"expected_prompts"`
}

// ModelPerformance represents performance stats for a model
type ModelPerformance struct {
	Model           string  `json:"model"`
	AveragePrompts  float64 `json:"average_prompts"`
	SuccessRate     float64 `json:"success_rate"`
	SampleCount     int     `json:"sample_count"`
}

// CostComparison shows cost difference between models
type CostComparison struct {
	RecommendedCost float64 `json:"recommended_cost"`
	CurrentCost     float64 `json:"current_cost"`
	CostDelta       float64 `json:"cost_delta"`
	PromptsSaved    float64 `json:"prompts_saved"`
}

// EffectivenessTracker manages the effectiveness log
type EffectivenessTracker struct {
	logPath string
}

// NewEffectivenessTracker creates a new tracker
func NewEffectivenessTracker(dataDir string) *EffectivenessTracker {
	return &EffectivenessTracker{
		logPath: filepath.Join(dataDir, "effectiveness-log.jsonl"),
	}
}

// LogCompletion appends a task completion to the log
func (et *EffectivenessTracker) LogCompletion(log EffectivenessLog) error {
	// Ensure directory exists
	dir := filepath.Dir(et.logPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	// Open file for append
	f, err := os.OpenFile(et.logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer f.Close()

	// Write JSON line
	data, err := json.Marshal(log)
	if err != nil {
		return fmt.Errorf("failed to marshal log: %w", err)
	}

	if _, err := f.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("failed to write log: %w", err)
	}

	return nil
}

// GetRecommendation analyzes historical data and recommends the best model
func (et *EffectivenessTracker) GetRecommendation(pattern TaskPattern, currentModel string) (*ModelRecommendation, error) {
	logs, err := et.readLogs()
	if err != nil {
		// If file doesn't exist yet, return default recommendation
		if os.IsNotExist(err) {
			return et.getDefaultRecommendation(pattern, currentModel), nil
		}
		return nil, err
	}

	// Filter logs for this pattern
	var patternLogs []EffectivenessLog
	for _, log := range logs {
		if log.Pattern == pattern && log.Success {
			patternLogs = append(patternLogs, log)
		}
	}

	// If no historical data, return default
	if len(patternLogs) == 0 {
		return et.getDefaultRecommendation(pattern, currentModel), nil
	}

	// Calculate performance by model
	modelStats := make(map[string]*statsData)
	for _, log := range patternLogs {
		if _, exists := modelStats[log.Model]; !exists {
			modelStats[log.Model] = &statsData{}
		}
		modelStats[log.Model].totalPrompts += log.Prompts
		modelStats[log.Model].count++
		if log.Success {
			modelStats[log.Model].successes++
		}
	}

	// Build comparison
	var comparison []ModelPerformance
	for model, stats := range modelStats {
		comparison = append(comparison, ModelPerformance{
			Model:          model,
			AveragePrompts: float64(stats.totalPrompts) / float64(stats.count),
			SuccessRate:    float64(stats.successes) / float64(stats.count) * 100,
			SampleCount:    stats.count,
		})
	}

	// Sort by average prompts (ascending - lower is better)
	sort.Slice(comparison, func(i, j int) bool {
		return comparison[i].AveragePrompts < comparison[j].AveragePrompts
	})

	// Best model is the one with lowest average prompts
	recommended := comparison[0]

	// Build recommendation
	rec := &ModelRecommendation{
		RecommendedModel: recommended.Model,
		Reasoning:        fmt.Sprintf("Based on %d similar tasks, %s averages %.1f prompts (%.0f%% success rate)", len(patternLogs), recommended.Model, recommended.AveragePrompts, recommended.SuccessRate),
		HistoricalData:   true,
		TotalSamples:     len(patternLogs),
		ModelComparison:  comparison,
		ExpectedPrompts:  recommended.AveragePrompts,
	}

	// Add cost comparison if recommended model differs from current
	if currentModel != "" && recommended.Model != currentModel {
		rec.CostComparison = et.calculateCostComparison(recommended.Model, currentModel, comparison)
	}

	return rec, nil
}

// GetAllLogs returns all effectiveness logs
func (et *EffectivenessTracker) GetAllLogs() ([]EffectivenessLog, error) {
	return et.readLogs()
}

// readLogs reads all logs from the JSONL file
func (et *EffectivenessTracker) readLogs() ([]EffectivenessLog, error) {
	f, err := os.Open(et.logPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var logs []EffectivenessLog
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var log EffectivenessLog
		if err := json.Unmarshal(scanner.Bytes(), &log); err != nil {
			// Skip invalid lines
			continue
		}
		logs = append(logs, log)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return logs, nil
}

// getDefaultRecommendation returns a recommendation based on complexity when no historical data exists
func (et *EffectivenessTracker) getDefaultRecommendation(pattern TaskPattern, currentModel string) *ModelRecommendation {
	var recommended string
	var reasoning string
	var expectedPrompts float64

	switch pattern {
	case PatternArchitecture:
		recommended = "claude-opus-4.5"
		reasoning = "Based on task complexity: architectural design requires advanced reasoning"
		expectedPrompts = 3.0
	case PatternMultiFileRefactor:
		recommended = "claude-opus-4.5"
		reasoning = "Based on task complexity: multi-file refactors benefit from advanced planning"
		expectedPrompts = 2.5
	case PatternFeature:
		recommended = "claude-sonnet-4.5"
		reasoning = "Based on task complexity: feature implementation works well with balanced model"
		expectedPrompts = 3.0
	case PatternBugfix:
		recommended = "claude-sonnet-4.5"
		reasoning = "Based on task complexity: bug fixes typically need good reasoning without highest cost"
		expectedPrompts = 2.0
	case PatternTesting:
		recommended = "claude-sonnet-4.5"
		reasoning = "Based on task complexity: test writing requires code understanding"
		expectedPrompts = 2.0
	case PatternDocumentation:
		recommended = "claude-haiku"
		reasoning = "Based on task complexity: documentation is straightforward"
		expectedPrompts = 1.0
	default:
		recommended = "claude-sonnet-4.5"
		reasoning = "Default recommendation for general tasks"
		expectedPrompts = 2.5
	}

	return &ModelRecommendation{
		RecommendedModel: recommended,
		Reasoning:        reasoning,
		HistoricalData:   false,
		TotalSamples:     0,
		ModelComparison:  []ModelPerformance{},
		ExpectedPrompts:  expectedPrompts,
	}
}

// calculateCostComparison estimates cost difference
func (et *EffectivenessTracker) calculateCostComparison(recommended, current string, comparison []ModelPerformance) *CostComparison {
	// Model costs (credits per prompt)
	costs := map[string]float64{
		"claude-opus-4.5":   3.0,
		"claude-sonnet-4.5": 1.0,
		"claude-haiku":      0.33,
		"gpt-5":             1.0,
		"gpt-5-mini":        0.33,
	}

	recommendedCost := costs[recommended]
	currentCost := costs[current]

	// Find average prompts for each model
	var recommendedPrompts, currentPrompts float64
	for _, perf := range comparison {
		if perf.Model == recommended {
			recommendedPrompts = perf.AveragePrompts
		}
		if perf.Model == current {
			currentPrompts = perf.AveragePrompts
		}
	}

	return &CostComparison{
		RecommendedCost: recommendedCost,
		CurrentCost:     currentCost,
		CostDelta:       recommendedCost - currentCost,
		PromptsSaved:    currentPrompts - recommendedPrompts,
	}
}

type statsData struct {
	totalPrompts int
	count        int
	successes    int
}
