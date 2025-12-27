package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/workflows"
)

// init function to override workflows path for testing
func init() {
	// This will be set per test
}

// Helper to set workflows path for testing
func setTestWorkflowsPath(path string) func() {
	// Access the internal package's variable through a helper we'll create
	return workflows.SetPathForTesting(path)
}

func TestWorkflowHandlers(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "forge-workflow-handlers-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	workflowsPath := filepath.Join(tempDir, "workflows.json")
	
	// Set path for all tests
	restore := setTestWorkflowsPath(workflowsPath)
	defer restore()

	// Helper function to reset workflows file
	resetWorkflows := func() {
		os.Remove(workflowsPath)
	}

	t.Run("GET /api/workflows - empty list", func(t *testing.T) {
		resetWorkflows()

		req := httptest.NewRequest("GET", "/api/workflows", nil)
		w := httptest.NewRecorder()

		handleGetWorkflows(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		body, _ := io.ReadAll(resp.Body)
		var workflows []workflows.Workflow
		if err := json.Unmarshal(body, &workflows); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if len(workflows) != 0 {
			t.Errorf("Expected 0 workflows, got %d", len(workflows))
		}
	})

	t.Run("POST /api/workflows - create workflows", func(t *testing.T) {
		resetWorkflows()

		testWorkflows := []workflows.Workflow{
			{
				ID:          1,
				Name:        "Test Workflow",
				Description: "A test workflow",
				Nodes:       []workflows.WorkflowNode{},
				Edges:       []workflows.WorkflowEdge{},
				Settings:    workflows.WorkflowSettings{AutoAdvance: false, RequireConfirmation: true},
				Projects:    []string{"test-project"},
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
				Favorite:    false,
			},
		}

		body, _ := json.Marshal(testWorkflows)
		req := httptest.NewRequest("POST", "/api/workflows", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handleSaveWorkflows(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		// Verify file was created
		if _, err := os.Stat(workflowsPath); os.IsNotExist(err) {
			t.Error("workflows.json was not created")
		}

		// Verify contents
		loaded, err := workflows.LoadWorkflows()
		if err != nil {
			t.Fatalf("Failed to load workflows: %v", err)
		}

		if len(loaded) != 1 {
			t.Errorf("Expected 1 workflow, got %d", len(loaded))
		}

		if loaded[0].Name != "Test Workflow" {
			t.Errorf("Expected 'Test Workflow', got '%s'", loaded[0].Name)
		}
	})

	t.Run("POST /api/workflows - invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/workflows", bytes.NewReader([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handleSaveWorkflows(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}
	})

	t.Run("PUT /api/workflows/{id} - update workflow", func(t *testing.T) {
		resetWorkflows()

		// Create initial workflow
		initial := []workflows.Workflow{
			{
				ID:          1,
				Name:        "Original Name",
				Description: "Original description",
				Nodes:       []workflows.WorkflowNode{},
				Edges:       []workflows.WorkflowEdge{},
				Settings:    workflows.WorkflowSettings{},
				Projects:    []string{},
			},
		}
		workflows.SaveWorkflows(initial)

		// Update workflow
		updated := workflows.Workflow{
			ID:          1,
			Name:        "Updated Name",
			Description: "Updated description",
			Nodes:       []workflows.WorkflowNode{},
			Edges:       []workflows.WorkflowEdge{},
			Settings:    workflows.WorkflowSettings{},
			Projects:    []string{"new-project"},
		}

		body, _ := json.Marshal(updated)
		req := httptest.NewRequest("PUT", "/api/workflows/1", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "1")
		w := httptest.NewRecorder()

		handleUpdateWorkflow(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		// Verify update
		loaded, err := workflows.LoadWorkflows()
		if err != nil {
			t.Fatalf("Failed to load workflows: %v", err)
		}

		if loaded[0].Name != "Updated Name" {
			t.Errorf("Expected 'Updated Name', got '%s'", loaded[0].Name)
		}

		if len(loaded[0].Projects) != 1 || loaded[0].Projects[0] != "new-project" {
			t.Errorf("Expected projects ['new-project'], got %v", loaded[0].Projects)
		}
	})

	t.Run("PUT /api/workflows/{id} - invalid ID", func(t *testing.T) {
		req := httptest.NewRequest("PUT", "/api/workflows/abc", bytes.NewReader([]byte("{}")))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "abc")
		w := httptest.NewRecorder()

		handleUpdateWorkflow(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}
	})

	t.Run("PUT /api/workflows/{id} - workflow not found", func(t *testing.T) {
		resetWorkflows()

		updated := workflows.Workflow{
			ID:       999,
			Name:     "Non-existent",
			Nodes:    []workflows.WorkflowNode{},
			Edges:    []workflows.WorkflowEdge{},
			Settings: workflows.WorkflowSettings{},
			Projects: []string{},
		}

		body, _ := json.Marshal(updated)
		req := httptest.NewRequest("PUT", "/api/workflows/999", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "999")
		w := httptest.NewRecorder()

		handleUpdateWorkflow(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("Expected status 404, got %d", resp.StatusCode)
		}
	})

	t.Run("DELETE /api/workflows/{id} - delete workflow", func(t *testing.T) {
		resetWorkflows()

		// Create workflows
		initial := []workflows.Workflow{
			{
				ID:       1,
				Name:     "Workflow 1",
				Nodes:    []workflows.WorkflowNode{},
				Edges:    []workflows.WorkflowEdge{},
				Settings: workflows.WorkflowSettings{},
				Projects: []string{},
			},
			{
				ID:       2,
				Name:     "Workflow 2",
				Nodes:    []workflows.WorkflowNode{},
				Edges:    []workflows.WorkflowEdge{},
				Settings: workflows.WorkflowSettings{},
				Projects: []string{},
			},
		}
		workflows.SaveWorkflows(initial)

		// Delete workflow 1
		req := httptest.NewRequest("DELETE", "/api/workflows/1", nil)
		req.SetPathValue("id", "1")
		w := httptest.NewRecorder()

		handleDeleteWorkflow(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		// Verify deletion
		loaded, err := workflows.LoadWorkflows()
		if err != nil {
			t.Fatalf("Failed to load workflows: %v", err)
		}

		if len(loaded) != 1 {
			t.Errorf("Expected 1 workflow remaining, got %d", len(loaded))
		}

		if loaded[0].ID != 2 {
			t.Errorf("Expected workflow ID 2, got %d", loaded[0].ID)
		}
	})

	t.Run("DELETE /api/workflows/{id} - invalid ID", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/workflows/abc", nil)
		req.SetPathValue("id", "abc")
		w := httptest.NewRecorder()

		handleDeleteWorkflow(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}
	})

	t.Run("GET /api/workflows/project/{name} - filter by project", func(t *testing.T) {
		resetWorkflows()

		// Create workflows with different projects
		initial := []workflows.Workflow{
			{
				ID:       1,
				Name:     "Global Workflow",
				Nodes:    []workflows.WorkflowNode{},
				Edges:    []workflows.WorkflowEdge{},
				Settings: workflows.WorkflowSettings{},
				Projects: []string{}, // Global
			},
			{
				ID:       2,
				Name:     "Forge Workflow",
				Nodes:    []workflows.WorkflowNode{},
				Edges:    []workflows.WorkflowEdge{},
				Settings: workflows.WorkflowSettings{},
				Projects: []string{"forge-terminal"},
			},
			{
				ID:       3,
				Name:     "Other Workflow",
				Nodes:    []workflows.WorkflowNode{},
				Edges:    []workflows.WorkflowEdge{},
				Settings: workflows.WorkflowSettings{},
				Projects: []string{"other-project"},
			},
		}
		workflows.SaveWorkflows(initial)

		// Get workflows for forge-terminal
		req := httptest.NewRequest("GET", "/api/workflows/project/forge-terminal", nil)
		req.SetPathValue("name", "forge-terminal")
		w := httptest.NewRecorder()

		handleGetWorkflowsByProject(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		body, _ := io.ReadAll(resp.Body)
		var filtered []workflows.Workflow
		if err := json.Unmarshal(body, &filtered); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		// Should include global + forge-terminal
		if len(filtered) != 2 {
			t.Errorf("Expected 2 workflows, got %d", len(filtered))
		}

		// Verify correct workflows
		hasGlobal := false
		hasForge := false
		for _, wf := range filtered {
			if wf.Name == "Global Workflow" {
				hasGlobal = true
			}
			if wf.Name == "Forge Workflow" {
				hasForge = true
			}
		}

		if !hasGlobal {
			t.Error("Expected global workflow to be included")
		}

		if !hasForge {
			t.Error("Expected forge-terminal workflow to be included")
		}
	})
}
