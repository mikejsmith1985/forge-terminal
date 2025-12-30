// Package lens provides the Bubble Tea TUI for the Context Builder file picker.
package lens

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// --- CYBERPUNK-LITE STYLES ---
var (
	// Colors
	accentColor    = lipgloss.Color("#7D56F4") // Purple accent
	selectedColor  = lipgloss.Color("#04B575") // Green for selected
	hotColor       = lipgloss.Color("#FF6B6B") // Red for hot/recent
	warmColor      = lipgloss.Color("#FFE66D") // Yellow for warm
	coldColor      = lipgloss.Color("#4ECDC4") // Cyan for cold
	dimColor       = lipgloss.Color("#666666") // Grey for old
	cartBorderColor = lipgloss.Color("#00D9FF") // Cyan cart border
	lensBorderColor = lipgloss.Color("#7D56F4") // Purple lens border

	// Layout styles
	appStyle = lipgloss.NewStyle().Margin(1, 2)

	lensStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lensBorderColor).
			Padding(1).
			MarginRight(2)

	cartStyle = lipgloss.NewStyle().
			Border(lipgloss.DoubleBorder()).
			BorderForeground(cartBorderColor).
			Padding(1)

	headerStyle = lipgloss.NewStyle().
			Foreground(accentColor).
			Bold(true).
			MarginBottom(1)

	selectedItemStyle = lipgloss.NewStyle().
				Foreground(selectedColor).
				Bold(true)

	cartItemStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFFFF"))

	tokenCountStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			Italic(true)

	budgetStyle = lipgloss.NewStyle().
			Foreground(cartBorderColor).
			Bold(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(dimColor).
			MarginTop(1)
)

// TUIModel is the main Bubble Tea model for the context builder.
type TUIModel struct {
	lenses       []TUILens
	activeLens   int
	cart         *ContextCart
	width        int
	height       int
	quitting     bool
	rootPath     string
}

// TUILens is the interface for TUI-compatible lenses.
type TUILens interface {
	Lens
	Init() tea.Cmd
	Update(msg tea.Msg) (TUILens, tea.Cmd)
	View() string
	SetSize(width, height int)
}

// HeatmapTUILens is the Bubble Tea version of HeatmapLens.
type HeatmapTUILens struct {
	list   list.Model
	files  []FileInfo
	width  int
	height int
}

// NewHeatmapTUILens creates a new heatmap lens from a directory.
func NewHeatmapTUILens(rootPath string) *HeatmapTUILens {
	files := scanDirectory(rootPath)
	
	// Sort by modification time (newest first)
	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.After(files[j].ModTime)
	})

	// Convert to list items
	items := make([]list.Item, len(files))
	for i, f := range files {
		items[i] = f
	}

	delegate := list.NewDefaultDelegate()
	delegate.Styles.SelectedTitle = delegate.Styles.SelectedTitle.Foreground(selectedColor)
	delegate.Styles.SelectedDesc = delegate.Styles.SelectedDesc.Foreground(selectedColor)

	l := list.New(items, delegate, 40, 15)
	l.SetShowTitle(false)
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(true)

	return &HeatmapTUILens{
		list:  l,
		files: files,
	}
}

func (h *HeatmapTUILens) Init() tea.Cmd { return nil }

func (h *HeatmapTUILens) Update(msg tea.Msg) (TUILens, tea.Cmd) {
	var cmd tea.Cmd
	h.list, cmd = h.list.Update(msg)
	return h, cmd
}

func (h *HeatmapTUILens) View() string {
	return h.list.View()
}

func (h *HeatmapTUILens) Name() string {
	return "🔥 HEATMAP (Recent Activity)"
}

func (h *HeatmapTUILens) GetHighlightedItem() *FileInfo {
	if item, ok := h.list.SelectedItem().(FileInfo); ok {
		return &item
	}
	return nil
}

func (h *HeatmapTUILens) GetItems() []FileInfo {
	return h.files
}

func (h *HeatmapTUILens) SetSize(width, height int) {
	h.width = width
	h.height = height
	h.list.SetSize(width-4, height-4)
}

// GraphTUILens displays dependencies.
type GraphTUILens struct {
	files    []FileInfo
	cursor   int
	rootFile string
	width    int
	height   int
}

// NewGraphTUILens creates a new graph lens.
func NewGraphTUILens(rootPath string) *GraphTUILens {
	files := scanDirectory(rootPath)
	return &GraphTUILens{
		files:    files,
		cursor:   0,
		rootFile: rootPath,
	}
}

func (g *GraphTUILens) Init() tea.Cmd { return nil }

func (g *GraphTUILens) Update(msg tea.Msg) (TUILens, tea.Cmd) {
	if msg, ok := msg.(tea.KeyMsg); ok {
		switch msg.String() {
		case "down", "j":
			if g.cursor < len(g.files)-1 {
				g.cursor++
			}
		case "up", "k":
			if g.cursor > 0 {
				g.cursor--
			}
		}
	}
	return g, nil
}

func (g *GraphTUILens) View() string {
	var s strings.Builder
	s.WriteString("Dependencies:\n\n")
	
	for i, f := range g.files {
		cursor := "  "
		style := lipgloss.NewStyle().Foreground(dimColor)
		if i == g.cursor {
			cursor = "▶ "
			style = selectedItemStyle
		}
		
		// Color by heat
		heat := GetHeatScore(f)
		if heat > 0.7 {
			style = style.Foreground(hotColor)
		} else if heat > 0.4 {
			style = style.Foreground(warmColor)
		}
		
		s.WriteString(cursor)
		s.WriteString(style.Render(f.Name))
		s.WriteString("\n")
		
		// Show mock imports
		if len(f.Imports) > 0 {
			for _, imp := range f.Imports {
				s.WriteString(fmt.Sprintf("   └── %s\n", imp))
			}
		}
	}
	
	return s.String()
}

func (g *GraphTUILens) Name() string {
	return "🕸️ GRAPH (Dependencies)"
}

func (g *GraphTUILens) GetHighlightedItem() *FileInfo {
	if len(g.files) == 0 || g.cursor < 0 || g.cursor >= len(g.files) {
		return nil
	}
	return &g.files[g.cursor]
}

func (g *GraphTUILens) GetItems() []FileInfo {
	return g.files
}

func (g *GraphTUILens) SetSize(width, height int) {
	g.width = width
	g.height = height
}

// SearchTUILens for fuzzy file search.
type SearchTUILens struct {
	list   list.Model
	files  []FileInfo
	width  int
	height int
}

// NewSearchTUILens creates a new search lens.
func NewSearchTUILens(rootPath string) *SearchTUILens {
	files := scanDirectory(rootPath)
	
	items := make([]list.Item, len(files))
	for i, f := range files {
		items[i] = f
	}

	delegate := list.NewDefaultDelegate()
	l := list.New(items, delegate, 40, 15)
	l.SetShowTitle(false)
	l.SetFilteringEnabled(true)
	l.SetShowStatusBar(false)

	return &SearchTUILens{
		list:  l,
		files: files,
	}
}

func (s *SearchTUILens) Init() tea.Cmd { return nil }

func (s *SearchTUILens) Update(msg tea.Msg) (TUILens, tea.Cmd) {
	var cmd tea.Cmd
	s.list, cmd = s.list.Update(msg)
	return s, cmd
}

func (s *SearchTUILens) View() string {
	return s.list.View()
}

func (s *SearchTUILens) Name() string {
	return "🔍 SEARCH (Fuzzy Find)"
}

func (s *SearchTUILens) GetHighlightedItem() *FileInfo {
	if item, ok := s.list.SelectedItem().(FileInfo); ok {
		return &item
	}
	return nil
}

func (s *SearchTUILens) GetItems() []FileInfo {
	return s.files
}

func (s *SearchTUILens) SetSize(width, height int) {
	s.width = width
	s.height = height
	s.list.SetSize(width-4, height-4)
}

// NewTUIModel creates a new TUI model for the given directory.
func NewTUIModel(rootPath string) TUIModel {
	cart := NewContextCart(128000) // 128k token budget
	
	return TUIModel{
		lenses: []TUILens{
			NewHeatmapTUILens(rootPath),
			NewGraphTUILens(rootPath),
			NewSearchTUILens(rootPath),
		},
		activeLens: 0,
		cart:       cart,
		rootPath:   rootPath,
	}
}

func (m TUIModel) Init() tea.Cmd {
	return nil
}

func (m TUIModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		// Distribute space: 60% lens, 40% cart
		lensWidth := int(float64(msg.Width) * 0.55)
		cartWidth := msg.Width - lensWidth - 10
		_ = cartWidth // used for styling
		for i := range m.lenses {
			m.lenses[i].SetSize(lensWidth, msg.Height-6)
		}
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit

		case "tab":
			m.activeLens++
			if m.activeLens >= len(m.lenses) {
				m.activeLens = 0
			}
			return m, nil

		case "shift+tab":
			m.activeLens--
			if m.activeLens < 0 {
				m.activeLens = len(m.lenses) - 1
			}
			return m, nil

		case " ": // Spacebar to toggle selection
			if selected := m.lenses[m.activeLens].GetHighlightedItem(); selected != nil {
				m.cart.Toggle(*selected)
			}
			return m, nil

		case "c": // Clear cart
			m.cart.Clear()
			return m, nil

		case "enter": // Confirm selection and exit
			m.quitting = true
			return m, tea.Quit
		}
	}

	// Update active lens
	updatedLens, cmd := m.lenses[m.activeLens].Update(msg)
	m.lenses[m.activeLens] = updatedLens
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

func (m TUIModel) View() string {
	if m.quitting {
		// Output selected files on exit
		var files []string
		for _, f := range m.cart.Items() {
			files = append(files, f.Path)
		}
		return fmt.Sprintf("Selected %d files (%d tokens):\n%s\n", 
			len(files), 
			m.cart.TotalTokens(),
			strings.Join(files, "\n"))
	}

	// Calculate sizes
	lensWidth := int(float64(m.width) * 0.55)
	if lensWidth < 30 {
		lensWidth = 30
	}
	cartWidth := m.width - lensWidth - 10
	if cartWidth < 20 {
		cartWidth = 20
	}
	contentHeight := m.height - 6
	if contentHeight < 10 {
		contentHeight = 10
	}

	// Render lens
	lensContent := m.lenses[m.activeLens].View()
	lensHeader := headerStyle.Render(fmt.Sprintf("MODE: %s", m.lenses[m.activeLens].Name()))
	lensView := lensStyle.Width(lensWidth).Height(contentHeight).Render(
		lipgloss.JoinVertical(lipgloss.Left, lensHeader, lensContent),
	)

	// Render cart
	var cartContent strings.Builder
	cartContent.WriteString(budgetStyle.Render(fmt.Sprintf("📦 %d / %d tokens", 
		m.cart.TotalTokens(), 
		m.cart.Budget())))
	cartContent.WriteString("\n\n")

	if len(m.cart.Items()) == 0 {
		cartContent.WriteString(tokenCountStyle.Render("(empty - press Space to add files)"))
	} else {
		for _, f := range m.cart.Items() {
			cartContent.WriteString(cartItemStyle.Render(fmt.Sprintf("☑ %s", f.Name)))
			cartContent.WriteString("\n")
			cartContent.WriteString(tokenCountStyle.Render(fmt.Sprintf("   %d tokens", f.TokenCount)))
			cartContent.WriteString("\n")
		}
	}

	cartHeader := headerStyle.Render("CONTEXT CART")
	cartView := cartStyle.Width(cartWidth).Height(contentHeight).Render(
		lipgloss.JoinVertical(lipgloss.Left, cartHeader, cartContent.String()),
	)

	// Combine views
	mainView := lipgloss.JoinHorizontal(lipgloss.Top, lensView, cartView)

	// Add help
	help := helpStyle.Render("Tab: switch mode • Space: toggle file • c: clear cart • Enter: confirm • q: quit")

	return appStyle.Render(lipgloss.JoinVertical(lipgloss.Left, mainView, help))
}

// GetSelectedFiles returns the files in the cart.
func (m TUIModel) GetSelectedFiles() []FileInfo {
	return m.cart.Items()
}

// scanDirectory scans a directory and returns file info.
func scanDirectory(rootPath string) []FileInfo {
	var files []FileInfo

	err := filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip hidden files/directories
		if strings.HasPrefix(info.Name(), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Skip common non-code directories
		if info.IsDir() {
			skipDirs := []string{"node_modules", "vendor", "dist", "build", "__pycache__", ".git"}
			for _, skip := range skipDirs {
				if info.Name() == skip {
					return filepath.SkipDir
				}
			}
			return nil
		}

		// Only include code files
		ext := strings.ToLower(filepath.Ext(info.Name()))
		codeExts := map[string]bool{
			".go": true, ".js": true, ".jsx": true, ".ts": true, ".tsx": true,
			".py": true, ".rb": true, ".java": true, ".c": true, ".cpp": true,
			".h": true, ".hpp": true, ".cs": true, ".rs": true, ".swift": true,
			".md": true, ".txt": true, ".json": true, ".yaml": true, ".yml": true,
			".toml": true, ".xml": true, ".html": true, ".css": true, ".scss": true,
			".sh": true, ".bash": true, ".ps1": true, ".sql": true,
		}

		if codeExts[ext] {
			relPath, _ := filepath.Rel(rootPath, path)
			files = append(files, FileInfo{
				Name:       info.Name(),
				Path:       relPath,
				Size:       info.Size(),
				TokenCount: EstimateTokens(info.Size()),
				ModTime:    info.ModTime(),
			})
		}

		return nil
	})

	if err != nil {
		return files
	}

	return files
}

// RunTUI starts the Bubble Tea TUI.
func RunTUI(rootPath string) ([]FileInfo, error) {
	if rootPath == "" {
		var err error
		rootPath, err = os.Getwd()
		if err != nil {
			return nil, err
		}
	}

	model := NewTUIModel(rootPath)
	p := tea.NewProgram(model, tea.WithAltScreen())
	
	finalModel, err := p.Run()
	if err != nil {
		return nil, err
	}

	if m, ok := finalModel.(TUIModel); ok {
		return m.GetSelectedFiles(), nil
	}

	return nil, nil
}
