package workflows

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// getWorkflowsPath is a variable to allow mocking in tests
var getWorkflowsPath = func() string {
	return filepath.Join(storage.GetTerminalDir(), "workflows.json")
}

// SetPathForTesting allows tests to override the workflows path
// Returns a function to restore the original path
func SetPathForTesting(path string) func() {
	original := getWorkflowsPath
	getWorkflowsPath = func() string {
		return path
	}
	return func() {
		getWorkflowsPath = original
	}
}

// LoadWorkflows loads all workflows from disk
func LoadWorkflows() ([]Workflow, error) {
	path := getWorkflowsPath()

	// Return empty array if file doesn't exist
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return []Workflow{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read workflows: %w", err)
	}

	var workflows []Workflow
	if err := json.Unmarshal(data, &workflows); err != nil {
		return nil, fmt.Errorf("failed to parse workflows: %w", err)
	}

	return workflows, nil
}

// SaveWorkflows persists workflows to disk
func SaveWorkflows(workflows []Workflow) error {
	path := getWorkflowsPath()

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Update timestamps
	now := time.Now()
	for i := range workflows {
		if workflows[i].CreatedAt.IsZero() {
			workflows[i].CreatedAt = now
		}
		workflows[i].UpdatedAt = now
	}

	data, err := json.MarshalIndent(workflows, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize workflows: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write workflows: %w", err)
	}

	return nil
}

// GetWorkflowsByProject filters workflows associated with a project
func GetWorkflowsByProject(projectName string) ([]Workflow, error) {
	workflows, err := LoadWorkflows()
	if err != nil {
		return nil, err
	}

	var filtered []Workflow
	for _, wf := range workflows {
		// Include if no projects specified (global) or matches project
		if len(wf.Projects) == 0 {
			filtered = append(filtered, wf)
			continue
		}

		for _, proj := range wf.Projects {
			if proj == projectName {
				filtered = append(filtered, wf)
				break
			}
		}
	}

	return filtered, nil
}
