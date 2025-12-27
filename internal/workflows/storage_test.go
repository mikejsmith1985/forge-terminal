package workflows

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadWorkflows(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "forge-workflows-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock storage directory
	originalGetPath := getWorkflowsPath
	defer func() { getWorkflowsPath = originalGetPath }()
	getWorkflowsPath = func() string {
		return filepath.Join(tempDir, "workflows.json")
	}

	t.Run("returns empty array when file does not exist", func(t *testing.T) {
		workflows, err := LoadWorkflows()
		if err != nil {
			t.Fatalf("LoadWorkflows failed: %v", err)
		}

		if len(workflows) != 0 {
			t.Errorf("Expected 0 workflows, got %d", len(workflows))
		}
	})

	t.Run("loads workflows from existing file", func(t *testing.T) {
		// Create test workflow data
		testWorkflows := []Workflow{
			{
				ID:          1,
				Name:        "Test Workflow",
				Description: "A test workflow",
				Nodes: []WorkflowNode{
					{
						ID:       "node-1",
						Type:     "start",
						Label:    "Start",
						Position: Position{X: 100, Y: 100},
						Status:   "pending",
					},
				},
				Edges:     []WorkflowEdge{},
				Settings:  WorkflowSettings{AutoAdvance: false, RequireConfirmation: true},
				Projects:  []string{"test-project"},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
				Favorite:  false,
			},
		}

		// Write test data to file
		path := getWorkflowsPath()
		data, err := json.MarshalIndent(testWorkflows, "", "  ")
		if err != nil {
			t.Fatalf("Failed to marshal test data: %v", err)
		}

		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("Failed to create directory: %v", err)
		}

		if err := os.WriteFile(path, data, 0644); err != nil {
			t.Fatalf("Failed to write test file: %v", err)
		}

		// Load workflows
		workflows, err := LoadWorkflows()
		if err != nil {
			t.Fatalf("LoadWorkflows failed: %v", err)
		}

		if len(workflows) != 1 {
			t.Fatalf("Expected 1 workflow, got %d", len(workflows))
		}

		if workflows[0].Name != "Test Workflow" {
			t.Errorf("Expected workflow name 'Test Workflow', got '%s'", workflows[0].Name)
		}

		if workflows[0].ID != 1 {
			t.Errorf("Expected workflow ID 1, got %d", workflows[0].ID)
		}

		if len(workflows[0].Nodes) != 1 {
			t.Errorf("Expected 1 node, got %d", len(workflows[0].Nodes))
		}
	})

	t.Run("returns error for corrupted JSON", func(t *testing.T) {
		path := getWorkflowsPath()

		// Write invalid JSON
		if err := os.WriteFile(path, []byte("invalid json {"), 0644); err != nil {
			t.Fatalf("Failed to write invalid file: %v", err)
		}

		_, err := LoadWorkflows()
		if err == nil {
			t.Error("Expected error for corrupted JSON, got nil")
		}
	})
}

func TestSaveWorkflows(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "forge-workflows-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock storage directory
	originalGetPath := getWorkflowsPath
	defer func() { getWorkflowsPath = originalGetPath }()
	getWorkflowsPath = func() string {
		return filepath.Join(tempDir, "workflows.json")
	}

	t.Run("creates new file with workflows", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:          1,
				Name:        "Test Workflow",
				Description: "Test",
				Nodes:       []WorkflowNode{},
				Edges:       []WorkflowEdge{},
				Settings:    WorkflowSettings{AutoAdvance: false, RequireConfirmation: true},
				Projects:    []string{},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		// Verify file was created
		path := getWorkflowsPath()
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("workflows.json was not created at %s", path)
		}

		// Verify contents
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("Failed to read workflows file: %v", err)
		}

		var loaded []Workflow
		if err := json.Unmarshal(data, &loaded); err != nil {
			t.Fatalf("Failed to parse workflows file: %v", err)
		}

		if len(loaded) != 1 {
			t.Errorf("Expected 1 workflow in file, got %d", len(loaded))
		}

		if loaded[0].Name != "Test Workflow" {
			t.Errorf("Expected workflow name 'Test Workflow', got '%s'", loaded[0].Name)
		}
	})

	t.Run("updates timestamps on save", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:          1,
				Name:        "Test",
				Description: "Test",
				Nodes:       []WorkflowNode{},
				Edges:       []WorkflowEdge{},
				Settings:    WorkflowSettings{},
				Projects:    []string{},
			},
		}

		// Save first time
		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		// Load and verify timestamps
		loaded, err := LoadWorkflows()
		if err != nil {
			t.Fatalf("LoadWorkflows failed: %v", err)
		}

		if loaded[0].CreatedAt.IsZero() {
			t.Error("Expected CreatedAt to be set, got zero time")
		}

		if loaded[0].UpdatedAt.IsZero() {
			t.Error("Expected UpdatedAt to be set, got zero time")
		}

		// Save again and verify UpdatedAt changes
		time.Sleep(10 * time.Millisecond) // Ensure time difference
		firstUpdate := loaded[0].UpdatedAt

		err = SaveWorkflows(loaded)
		if err != nil {
			t.Fatalf("Second SaveWorkflows failed: %v", err)
		}

		loaded2, err := LoadWorkflows()
		if err != nil {
			t.Fatalf("Second LoadWorkflows failed: %v", err)
		}

		if !loaded2[0].UpdatedAt.After(firstUpdate) {
			t.Error("Expected UpdatedAt to be updated on second save")
		}
	})

	t.Run("handles directory creation", func(t *testing.T) {
		// Point to nested directory that doesn't exist
		nestedPath := filepath.Join(tempDir, "nested", "deep", "workflows.json")
		getWorkflowsPath = func() string {
			return nestedPath
		}

		workflows := []Workflow{
			{
				ID:       1,
				Name:     "Test",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed with nested directory: %v", err)
		}

		// Verify file was created
		if _, err := os.Stat(nestedPath); os.IsNotExist(err) {
			t.Error("workflows.json was not created in nested directory")
		}
	})
}

func TestGetWorkflowsByProject(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "forge-workflows-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Mock storage directory
	originalGetPath := getWorkflowsPath
	defer func() { getWorkflowsPath = originalGetPath }()
	getWorkflowsPath = func() string {
		return filepath.Join(tempDir, "workflows.json")
	}

	t.Run("returns workflows for specific project", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:       1,
				Name:     "Forge Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{"forge-terminal"},
			},
			{
				ID:       2,
				Name:     "Other Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{"other-project"},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		filtered, err := GetWorkflowsByProject("forge-terminal")
		if err != nil {
			t.Fatalf("GetWorkflowsByProject failed: %v", err)
		}

		if len(filtered) != 1 {
			t.Fatalf("Expected 1 workflow, got %d", len(filtered))
		}

		if filtered[0].Name != "Forge Workflow" {
			t.Errorf("Expected 'Forge Workflow', got '%s'", filtered[0].Name)
		}
	})

	t.Run("includes global workflows (empty projects array)", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:       1,
				Name:     "Global Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{}, // Global
			},
			{
				ID:       2,
				Name:     "Project Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{"specific-project"},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		filtered, err := GetWorkflowsByProject("any-project")
		if err != nil {
			t.Fatalf("GetWorkflowsByProject failed: %v", err)
		}

		// Should include global workflow
		if len(filtered) != 1 {
			t.Fatalf("Expected 1 workflow (global), got %d", len(filtered))
		}

		if filtered[0].Name != "Global Workflow" {
			t.Errorf("Expected 'Global Workflow', got '%s'", filtered[0].Name)
		}
	})

	t.Run("includes workflows with multiple project associations", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:       1,
				Name:     "Multi-Project Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{"project-a", "project-b", "project-c"},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		// Should match project-b
		filtered, err := GetWorkflowsByProject("project-b")
		if err != nil {
			t.Fatalf("GetWorkflowsByProject failed: %v", err)
		}

		if len(filtered) != 1 {
			t.Fatalf("Expected 1 workflow, got %d", len(filtered))
		}

		if filtered[0].Name != "Multi-Project Workflow" {
			t.Errorf("Expected 'Multi-Project Workflow', got '%s'", filtered[0].Name)
		}
	})

	t.Run("returns empty array when no matches", func(t *testing.T) {
		workflows := []Workflow{
			{
				ID:       1,
				Name:     "Project A Workflow",
				Nodes:    []WorkflowNode{},
				Edges:    []WorkflowEdge{},
				Settings: WorkflowSettings{},
				Projects: []string{"project-a"},
			},
		}

		err := SaveWorkflows(workflows)
		if err != nil {
			t.Fatalf("SaveWorkflows failed: %v", err)
		}

		filtered, err := GetWorkflowsByProject("non-existent-project")
		if err != nil {
			t.Fatalf("GetWorkflowsByProject failed: %v", err)
		}

		if len(filtered) != 0 {
			t.Errorf("Expected 0 workflows, got %d", len(filtered))
		}
	})
}
