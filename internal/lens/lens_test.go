// Package lens provides the "Context Builder" file picker with swappable view modes.
// This is TDD - tests first.
package lens

import (
	"testing"
	"time"
)

// Test FileInfo basic functionality
func TestFileInfo(t *testing.T) {
	f := FileInfo{
		Name:       "main.go",
		Path:       "/project/main.go",
		TokenCount: 1200,
		ModTime:    time.Now(),
		Size:       4800,
	}

	// FilterValue should return the name for filtering
	if f.FilterValue() != "main.go" {
		t.Errorf("FilterValue() = %s, want main.go", f.FilterValue())
	}

	// Title should return the name
	if f.Title() != "main.go" {
		t.Errorf("Title() = %s, want main.go", f.Title())
	}

	// Description should include token count
	desc := f.Description()
	if desc == "" {
		t.Error("Description() should not be empty")
	}
}

// Test ContextCart functionality
func TestContextCart(t *testing.T) {
	cart := NewContextCart(128000) // 128k token budget

	// Initially empty
	if cart.TotalTokens() != 0 {
		t.Errorf("TotalTokens() = %d, want 0", cart.TotalTokens())
	}
	if len(cart.Items()) != 0 {
		t.Errorf("len(Items()) = %d, want 0", len(cart.Items()))
	}

	// Add a file
	f1 := FileInfo{Name: "main.go", Path: "/main.go", TokenCount: 1000}
	cart.Add(f1)

	if cart.TotalTokens() != 1000 {
		t.Errorf("TotalTokens() = %d, want 1000", cart.TotalTokens())
	}
	if len(cart.Items()) != 1 {
		t.Errorf("len(Items()) = %d, want 1", len(cart.Items()))
	}

	// Add another file
	f2 := FileInfo{Name: "auth.go", Path: "/auth.go", TokenCount: 500}
	cart.Add(f2)

	if cart.TotalTokens() != 1500 {
		t.Errorf("TotalTokens() = %d, want 1500", cart.TotalTokens())
	}

	// Contains check
	if !cart.Contains(f1.Path) {
		t.Error("cart should contain main.go")
	}
	if !cart.Contains(f2.Path) {
		t.Error("cart should contain auth.go")
	}
	if cart.Contains("/nonexistent.go") {
		t.Error("cart should not contain nonexistent.go")
	}

	// Remove a file
	cart.Remove(f1.Path)
	if cart.TotalTokens() != 500 {
		t.Errorf("TotalTokens() = %d, want 500", cart.TotalTokens())
	}
	if cart.Contains(f1.Path) {
		t.Error("cart should not contain main.go after removal")
	}

	// Toggle (should remove since it exists)
	cart.Toggle(f2)
	if cart.Contains(f2.Path) {
		t.Error("cart should not contain auth.go after toggle")
	}

	// Toggle again (should add)
	cart.Toggle(f2)
	if !cart.Contains(f2.Path) {
		t.Error("cart should contain auth.go after second toggle")
	}

	// Budget check
	if cart.Budget() != 128000 {
		t.Errorf("Budget() = %d, want 128000", cart.Budget())
	}
	if cart.RemainingBudget() != 127500 {
		t.Errorf("RemainingBudget() = %d, want 127500", cart.RemainingBudget())
	}
}

// Test token estimation
func TestEstimateTokens(t *testing.T) {
	// Rough estimate: ~4 chars per token
	tests := []struct {
		size     int64
		expected int
	}{
		{0, 0},
		{4, 1},
		{100, 25},
		{4000, 1000},
	}

	for _, tt := range tests {
		result := EstimateTokens(tt.size)
		if result != tt.expected {
			t.Errorf("EstimateTokens(%d) = %d, want %d", tt.size, result, tt.expected)
		}
	}
}

// Test HeatmapLens sorting (by modification time)
func TestHeatmapLensSorting(t *testing.T) {
	now := time.Now()
	files := []FileInfo{
		{Name: "old.go", Path: "/old.go", ModTime: now.Add(-24 * time.Hour)},
		{Name: "new.go", Path: "/new.go", ModTime: now},
		{Name: "mid.go", Path: "/mid.go", ModTime: now.Add(-1 * time.Hour)},
	}

	lens := NewHeatmapLens(files)
	sorted := lens.GetSortedFiles()

	// Should be sorted newest first
	if sorted[0].Name != "new.go" {
		t.Errorf("First file should be new.go, got %s", sorted[0].Name)
	}
	if sorted[1].Name != "mid.go" {
		t.Errorf("Second file should be mid.go, got %s", sorted[1].Name)
	}
	if sorted[2].Name != "old.go" {
		t.Errorf("Third file should be old.go, got %s", sorted[2].Name)
	}
}

// Test HeatmapLens heat score
func TestHeatmapHeatScore(t *testing.T) {
	now := time.Now()
	
	// File modified just now should have high heat
	hot := FileInfo{ModTime: now}
	if GetHeatScore(hot) < 0.9 {
		t.Error("Recently modified file should have high heat score")
	}

	// File modified 7 days ago should have low heat
	cold := FileInfo{ModTime: now.Add(-7 * 24 * time.Hour)}
	if GetHeatScore(cold) > 0.3 {
		t.Error("Old file should have low heat score")
	}
}

// Test GraphLens dependency representation
func TestGraphLensDependencies(t *testing.T) {
	// Mock dependency graph
	deps := map[string][]string{
		"/main.go":  {"/auth.go", "/db.go"},
		"/auth.go":  {"/utils.go"},
		"/db.go":    {"/utils.go"},
		"/utils.go": {},
	}

	lens := NewGraphLens(deps, "/main.go")
	
	// Should show dependencies of main.go
	children := lens.GetDependencies("/main.go")
	if len(children) != 2 {
		t.Errorf("main.go should have 2 dependencies, got %d", len(children))
	}
}

// Test MainModel lens switching
func TestMainModelLensSwitching(t *testing.T) {
	model := NewMainModel()

	// Should start with first lens active
	if model.ActiveLensIndex() != 0 {
		t.Errorf("Should start with lens 0, got %d", model.ActiveLensIndex())
	}

	// Switch to next lens
	model.NextLens()
	if model.ActiveLensIndex() != 1 {
		t.Errorf("After NextLens, should be 1, got %d", model.ActiveLensIndex())
	}

	// Switch again (should wrap)
	numLenses := model.LensCount()
	for i := 0; i < numLenses; i++ {
		model.NextLens()
	}
	// Should wrap back to start
	if model.ActiveLensIndex() != 1 {
		t.Errorf("Should wrap around, got %d", model.ActiveLensIndex())
	}
}
