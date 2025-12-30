// Package lens provides the "Context Builder" file picker with swappable view modes.
// It implements a Lens architecture for intelligent file selection for LLM context windows.
package lens

import (
	"fmt"
	"sort"
	"time"
)

// FileInfo represents a file with metadata for the context builder.
type FileInfo struct {
	Name       string
	Path       string
	TokenCount int
	ModTime    time.Time
	Size       int64
	Score      float64 // Relevance score for search/heatmap
	IsDir      bool
	Imports    []string // For dependency graph
}

// FilterValue implements list.Item interface for bubbles/list
func (f FileInfo) FilterValue() string { return f.Name }

// Title implements list.Item interface
func (f FileInfo) Title() string { return f.Name }

// Description implements list.Item interface
func (f FileInfo) Description() string {
	return fmt.Sprintf("%d tokens • %s", f.TokenCount, humanizeTime(f.ModTime))
}

// humanizeTime returns a human-readable time description
func humanizeTime(t time.Time) string {
	if t.IsZero() {
		return "unknown"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	case d < 7*24*time.Hour:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	default:
		return t.Format("Jan 2")
	}
}

// EstimateTokens estimates token count from file size.
// Rough heuristic: ~4 characters per token on average.
func EstimateTokens(size int64) int {
	if size <= 0 {
		return 0
	}
	return int(size / 4)
}

// GetHeatScore calculates a heat score (0.0-1.0) based on recency.
// Files modified recently have higher heat.
func GetHeatScore(f FileInfo) float64 {
	if f.ModTime.IsZero() {
		return 0.0
	}
	hoursSince := time.Since(f.ModTime).Hours()
	// Exponential decay: 1.0 at 0 hours, ~0.5 at 24 hours, ~0.1 at 72 hours
	score := 1.0 / (1.0 + hoursSince/24.0)
	if score > 1.0 {
		score = 1.0
	}
	if score < 0.0 {
		score = 0.0
	}
	return score
}

// ContextCart manages the selected files for the context window.
type ContextCart struct {
	items  []FileInfo
	budget int // Max token budget
}

// NewContextCart creates a new cart with the given token budget.
func NewContextCart(budget int) *ContextCart {
	return &ContextCart{
		items:  make([]FileInfo, 0),
		budget: budget,
	}
}

// Items returns all items in the cart.
func (c *ContextCart) Items() []FileInfo {
	return c.items
}

// TotalTokens returns the total token count of all items.
func (c *ContextCart) TotalTokens() int {
	total := 0
	for _, f := range c.items {
		total += f.TokenCount
	}
	return total
}

// Budget returns the maximum token budget.
func (c *ContextCart) Budget() int {
	return c.budget
}

// RemainingBudget returns how many tokens are left.
func (c *ContextCart) RemainingBudget() int {
	return c.budget - c.TotalTokens()
}

// Contains checks if a file path is in the cart.
func (c *ContextCart) Contains(path string) bool {
	for _, f := range c.items {
		if f.Path == path {
			return true
		}
	}
	return false
}

// Add adds a file to the cart.
func (c *ContextCart) Add(f FileInfo) {
	if !c.Contains(f.Path) {
		c.items = append(c.items, f)
	}
}

// Remove removes a file from the cart by path.
func (c *ContextCart) Remove(path string) {
	for i, f := range c.items {
		if f.Path == path {
			c.items = append(c.items[:i], c.items[i+1:]...)
			return
		}
	}
}

// Toggle adds if not present, removes if present.
func (c *ContextCart) Toggle(f FileInfo) {
	if c.Contains(f.Path) {
		c.Remove(f.Path)
	} else {
		c.Add(f)
	}
}

// Clear removes all items from the cart.
func (c *ContextCart) Clear() {
	c.items = make([]FileInfo, 0)
}

// Lens is the interface for swappable view modes.
type Lens interface {
	Name() string
	GetHighlightedItem() *FileInfo
	GetItems() []FileInfo
}

// HeatmapLens displays files sorted by modification time (newest first).
type HeatmapLens struct {
	files  []FileInfo
	cursor int
}

// NewHeatmapLens creates a new heatmap lens with the given files.
func NewHeatmapLens(files []FileInfo) *HeatmapLens {
	// Sort by modification time (newest first)
	sorted := make([]FileInfo, len(files))
	copy(sorted, files)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].ModTime.After(sorted[j].ModTime)
	})
	return &HeatmapLens{
		files:  sorted,
		cursor: 0,
	}
}

// Name returns the lens name.
func (h *HeatmapLens) Name() string {
	return "🔥 HEATMAP (Recent Activity)"
}

// GetSortedFiles returns files sorted by modification time.
func (h *HeatmapLens) GetSortedFiles() []FileInfo {
	return h.files
}

// GetHighlightedItem returns the currently selected file.
func (h *HeatmapLens) GetHighlightedItem() *FileInfo {
	if len(h.files) == 0 || h.cursor < 0 || h.cursor >= len(h.files) {
		return nil
	}
	return &h.files[h.cursor]
}

// GetItems returns all items.
func (h *HeatmapLens) GetItems() []FileInfo {
	return h.files
}

// MoveUp moves the cursor up.
func (h *HeatmapLens) MoveUp() {
	if h.cursor > 0 {
		h.cursor--
	}
}

// MoveDown moves the cursor down.
func (h *HeatmapLens) MoveDown() {
	if h.cursor < len(h.files)-1 {
		h.cursor++
	}
}

// GraphLens displays file dependencies as a tree.
type GraphLens struct {
	dependencies map[string][]string
	rootFile     string
	cursor       int
	items        []FileInfo
}

// NewGraphLens creates a new graph lens.
func NewGraphLens(deps map[string][]string, root string) *GraphLens {
	items := make([]FileInfo, 0)
	// Build flat list from root and its dependencies
	if children, ok := deps[root]; ok {
		for _, child := range children {
			items = append(items, FileInfo{Path: child, Name: child})
		}
	}
	return &GraphLens{
		dependencies: deps,
		rootFile:     root,
		cursor:       0,
		items:        items,
	}
}

// Name returns the lens name.
func (g *GraphLens) Name() string {
	return "🕸️ GRAPH (Dependencies)"
}

// GetDependencies returns dependencies for a given file.
func (g *GraphLens) GetDependencies(path string) []string {
	return g.dependencies[path]
}

// GetHighlightedItem returns the currently selected file.
func (g *GraphLens) GetHighlightedItem() *FileInfo {
	if len(g.items) == 0 || g.cursor < 0 || g.cursor >= len(g.items) {
		return nil
	}
	return &g.items[g.cursor]
}

// GetItems returns all items.
func (g *GraphLens) GetItems() []FileInfo {
	return g.items
}

// MainModel is the root model managing lenses and cart.
type MainModel struct {
	lenses     []Lens
	activeLens int
	cart       *ContextCart
}

// NewMainModel creates a new main model with default lenses.
func NewMainModel() *MainModel {
	return &MainModel{
		lenses: []Lens{
			NewHeatmapLens([]FileInfo{}),
			NewGraphLens(map[string][]string{}, ""),
		},
		activeLens: 0,
		cart:       NewContextCart(128000),
	}
}

// ActiveLensIndex returns the index of the active lens.
func (m *MainModel) ActiveLensIndex() int {
	return m.activeLens
}

// LensCount returns the number of lenses.
func (m *MainModel) LensCount() int {
	return len(m.lenses)
}

// NextLens switches to the next lens (with wrap-around).
func (m *MainModel) NextLens() {
	m.activeLens++
	if m.activeLens >= len(m.lenses) {
		m.activeLens = 0
	}
}

// PrevLens switches to the previous lens (with wrap-around).
func (m *MainModel) PrevLens() {
	m.activeLens--
	if m.activeLens < 0 {
		m.activeLens = len(m.lenses) - 1
	}
}

// ActiveLens returns the currently active lens.
func (m *MainModel) ActiveLens() Lens {
	return m.lenses[m.activeLens]
}

// Cart returns the context cart.
func (m *MainModel) Cart() *ContextCart {
	return m.cart
}
