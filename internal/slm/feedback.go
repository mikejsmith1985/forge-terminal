// Package slm provides feedback storage for learning.
package slm

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	feedbackSubdir = "learning"
	feedbackFile   = "feedback.jsonl"
	maxFeedbackAge = 90 * 24 * time.Hour // Keep 90 days of feedback
)

// JSONLFeedbackStore stores feedback in a JSON Lines file.
type JSONLFeedbackStore struct {
	mu       sync.RWMutex
	filePath string
}

// NewFeedbackStore creates a feedback store at the default location.
func NewFeedbackStore() (*JSONLFeedbackStore, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	dir := filepath.Join(home, ".forge", feedbackSubdir)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create feedback directory: %w", err)
	}

	return &JSONLFeedbackStore{
		filePath: filepath.Join(dir, feedbackFile),
	}, nil
}

// Record appends a feedback entry to the file.
func (s *JSONLFeedbackStore) Record(feedback FeedbackRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Ensure timestamp is set
	if feedback.Timestamp.IsZero() {
		feedback.Timestamp = time.Now()
	}

	// Marshal to JSON
	data, err := json.Marshal(feedback)
	if err != nil {
		return fmt.Errorf("failed to marshal feedback: %w", err)
	}

	// Append to file
	f, err := os.OpenFile(s.filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("failed to open feedback file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("failed to write feedback: %w", err)
	}

	return nil
}

// GetRecent returns the most recent N feedback entries.
func (s *JSONLFeedbackStore) GetRecent(n int) ([]FeedbackRecord, error) {
	all, err := s.GetAll()
	if err != nil {
		return nil, err
	}

	if len(all) <= n {
		return all, nil
	}

	return all[len(all)-n:], nil
}

// GetAll returns all feedback entries.
func (s *JSONLFeedbackStore) GetAll() ([]FeedbackRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	f, err := os.Open(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []FeedbackRecord{}, nil
		}
		return nil, fmt.Errorf("failed to open feedback file: %w", err)
	}
	defer f.Close()

	var records []FeedbackRecord
	scanner := bufio.NewScanner(f)

	// Increase buffer size for long lines
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var record FeedbackRecord
		if err := json.Unmarshal(line, &record); err != nil {
			// Skip malformed lines
			continue
		}

		records = append(records, record)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading feedback file: %w", err)
	}

	return records, nil
}

// GetStats calculates aggregate statistics from feedback data.
func (s *JSONLFeedbackStore) GetStats() (FeedbackStats, error) {
	records, err := s.GetAll()
	if err != nil {
		return FeedbackStats{}, err
	}

	stats := FeedbackStats{
		TotalSamples:     len(records),
		TaskTypeAccuracy: make(map[TaskType]float64),
		ModelAccuracy:    make(map[string]float64),
	}

	if len(records) == 0 {
		return stats, nil
	}

	// Calculate accuracy metrics
	var correctPredictions int
	var totalError float64
	taskCorrect := make(map[TaskType]int)
	taskTotal := make(map[TaskType]int)
	modelCorrect := make(map[string]int)
	modelTotal := make(map[string]int)

	var lastUpdate time.Time

	for _, r := range records {
		// Track last update time
		if r.Timestamp.After(lastUpdate) {
			lastUpdate = r.Timestamp
		}

		// Get predicted iterations for the actual model used
		predictedIter := 0
		if r.PredictedIterations != nil {
			// Try to find prediction for the actual model
			if pred, ok := r.PredictedIterations[r.ActualModel]; ok {
				predictedIter = pred
			} else if pred, ok := r.PredictedIterations[r.PredictedModel]; ok {
				predictedIter = pred
			}
		}

		// Accuracy: prediction within ±1 iteration
		iterError := abs(predictedIter - r.ActualIterations)
		if iterError <= 1 {
			correctPredictions++
		}
		totalError += float64(iterError)

		// Per-task-type accuracy
		taskTotal[r.PredictedTaskType]++
		if iterError <= 1 {
			taskCorrect[r.PredictedTaskType]++
		}

		// Per-model accuracy
		modelTotal[r.ActualModel]++
		if iterError <= 1 {
			modelCorrect[r.ActualModel]++
		}
	}

	// Calculate rates
	stats.AccuracyRate = float64(correctPredictions) / float64(len(records))
	stats.AvgIterationError = totalError / float64(len(records))

	for taskType, total := range taskTotal {
		if total > 0 {
			stats.TaskTypeAccuracy[taskType] = float64(taskCorrect[taskType]) / float64(total)
		}
	}

	for model, total := range modelTotal {
		if total > 0 {
			stats.ModelAccuracy[model] = float64(modelCorrect[model]) / float64(total)
		}
	}

	if !lastUpdate.IsZero() {
		stats.LastUpdated = lastUpdate.Format(time.RFC3339)
	}

	return stats, nil
}

// Clear removes all feedback data.
func (s *JSONLFeedbackStore) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(s.filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove feedback file: %w", err)
	}

	return nil
}

// Prune removes feedback entries older than maxFeedbackAge.
func (s *JSONLFeedbackStore) Prune() (int, error) {
	records, err := s.GetAll()
	if err != nil {
		return 0, err
	}

	cutoff := time.Now().Add(-maxFeedbackAge)
	var kept []FeedbackRecord
	pruned := 0

	for _, r := range records {
		if r.Timestamp.After(cutoff) {
			kept = append(kept, r)
		} else {
			pruned++
		}
	}

	if pruned == 0 {
		return 0, nil
	}

	// Rewrite file with kept records
	s.mu.Lock()
	defer s.mu.Unlock()

	f, err := os.Create(s.filePath)
	if err != nil {
		return 0, fmt.Errorf("failed to create feedback file: %w", err)
	}
	defer f.Close()

	for _, r := range kept {
		data, err := json.Marshal(r)
		if err != nil {
			continue
		}
		f.Write(append(data, '\n'))
	}

	return pruned, nil
}

// GetFilePath returns the path to the feedback file.
func (s *JSONLFeedbackStore) GetFilePath() string {
	return s.filePath
}

// abs returns the absolute value of an int.
func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
