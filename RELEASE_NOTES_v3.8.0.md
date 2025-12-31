# Forge Terminal v3.8.0 Release Notes

**Release Date:** December 31, 2025  
**Commit:** a41d730  
**Tag:** v3.8.0

---

## 🎉 Major Features: Agentic Notebook Interface

### Alternate View Mode
Users can now cycle through **three view modes** using the view toggle button:
- **Chat** - AI assistant with message history (existing)
- **Terminal** - Raw terminal with PTY stream (existing)
- **Notebook** - *NEW* Jupyter-style cell-based interface

The Notebook mode provides a clean, organized interface for workflows that blend AI planning with terminal execution.

### Notebook Components

#### TerminalBlock (Green)
- Raw xterm.js terminal cell for command execution
- Command input bar with syntax: `$ command`
- Run/Stop buttons, copy output, collapse/expand
- Status indicator (Idle, Running, Complete, Error)
- Keyboard shortcut: Enter in input field to run command

#### AgentBlock (Purple)
- Markdown rendering for AI-generated content
- Supports: headers, code blocks, lists, inline code
- Types: Plan, Explanation, Code Review, Error Analysis, Thinking
- Copy content, regenerate, collapse/expand
- Streaming animation for real-time responses
- Model/timestamp attribution

#### LensBlock (Blue)
- File reference cells injected from sidebar Lens File Picker
- Shows file metadata: name, path, size, estimated tokens
- Permission controls: Read-only or Edit mode
- Preview first 500 chars with expand/collapse
- Permission bar indicates agent access level
- Remove from context with single click

### Notebook Features
- **Add Cell Toolbar** - Quick buttons to add new cells (Terminal, Agent, File)
- **Cell Ordering** - Move cells up/down via arrow buttons
- **Cell Deletion** - Delete individual cells (preserves at least one)
- **Cell Focus** - Visual highlight shows focused cell
- **Run All** - Execute all terminal cells sequentially
- **Status Bar** - Shows count of each cell type
- **Quick Add** - Plus button at bottom to add cells

---

## 🔧 Bug Fixes & Improvements

### ForgeTerminal Clipboard Paste
**Fixed:** Clipboard text is now visible immediately to the user in the terminal.
- Text now writes to local terminal FIRST (xterm.js)
- Backend echo follows, preventing perceived lag
- Critical for paste usability in interactive CLI scenarios

### Command Deduplication
**Fixed:** Command storage now automatically deduplicates by ID.
- Prevents duplicate command cards from accumulating
- Auto-cleans corrupted command databases
- Saves deduplicated version back to disk

### Tour Steps Documentation
**Improved:** Command Cards help text updated.
- Old: "right-click to edit"
- New: "click the pencil icon to edit"
- Matches actual UI affordance

---

## 🏗️ Architecture Changes

### Backend (No Breaking Changes)
The existing PTY async pipeline and AM (Artificial Memory) system already support the notebook:
- PTY output fan-out: WebSocket (UI) + AM async pipeline (logging)
- Non-blocking enqueue prevents terminal freezes
- Backend unchanged - ready for notebook integration

### Frontend View System
```
Tab.viewMode can now be: 'chat' | 'terminal' | 'notebook'

Cycle: chat → terminal → notebook → chat

Each view:
- ChatView: Message bubbles, AI responses
- ForgeTerminal: Full PTY terminal with all features
- NotebookLayout: Cell-based workspace
```

All three views coexist per tab, preserving state when switching.

---

## 📁 New Files

```
frontend/src/components/notebook/
├── NotebookLayout.jsx      (11KB) - Main container, cell management
├── TerminalBlock.jsx       (8KB)  - xterm.js cell wrapper
├── AgentBlock.jsx          (7KB)  - Markdown AI cell
├── LensBlock.jsx           (6KB)  - File reference cell
├── NotebookLayout.css      (14KB) - Complete styling
└── index.js                (0.3KB) - Barrel export
```

## 📝 Modified Files

| File | Changes |
|------|---------|
| `frontend/src/App.jsx` | +1 line: Added `onToggleViewMode={toggleTabViewMode}` to TabBar props |
| `frontend/src/components/TabBar.jsx` | +8 lines: Added `onToggleViewMode` callback and handler |
| `frontend/src/components/Tab.jsx` | +13 lines: Added view mode toggle button to context menu |
| `frontend/src/hooks/useTabManager.js` | Updated `toggleTabViewMode()` to cycle 3 modes + support target mode |
| `frontend/src/components/ForgeTerminal.jsx` | +8 lines: Clipboard paste fix (write to xterm immediately) |
| `frontend/src/config/tourSteps.js` | Updated Command Cards help text |
| `internal/commands/storage.go` | +17 lines: Command deduplication logic |
| `cmd/forge/web/assets/*` | Rebuilt assets (CSS + JS bundles) |

---

## 🚀 How to Use Notebook

1. **Open a tab** - Click to create new terminal tab
2. **Toggle view mode** - Right-click on tab and select "View Mode: chat" to cycle through Chat → Terminal → Notebook
3. **In Notebook** - Add Terminal, Agent (AI), or File (Lens) cells
4. **Run commands** - Type command and press Enter in TerminalBlock
5. **Plan with AI** - Add AgentBlock for reasoning/planning
6. **Reference files** - Select files in sidebar Lens picker to auto-inject LensBlocks
7. **Organize** - Reorder cells, collapse/expand sections as needed

---

## ⚙️ System Requirements

- No new dependencies required
- Builds on existing xterm.js, React infrastructure
- CSS uses existing theme variables (--accent-color, --bg-primary, etc.)
- Compatible with all existing terminal features

---

## 📊 Version Info

```
Version:      3.8.0
Build:        npm run build (successful)
Bundle Size:  1,335 KB (minified), 367 KB (gzipped)
Files:        +6 new component files
Lines Added:  ~2,081 (across all files)
```

---

## 🔮 Future Enhancements

### Phase 2 Integration
- Persist notebook cell state to backend
- Share notebooks via links
- Notebook templates (debugging, feature development, learning)
- Export notebooks as markdown/PDF

### Advanced Features
- Cell dependencies and execution order
- Cell history/version control per tab
- Notebook-specific shortcuts (Ctrl+Enter to run, Ctrl+B for new cell)
- Collaborative notebooks (when implementing backend persistence)

---

## 💡 Design Philosophy

The Agentic Notebook follows Forge Terminal's core principles:
- **Performance First** - No chat bubble parsing of PTY output
- **User Choice** - Three view modes, pick your workflow
- **Keyboard Friendly** - All operations via keyboard shortcuts
- **Minimal Chrome** - Focus on content, not UI
- **Theme Integration** - Seamless with existing theme system

---

## 🙏 Thank You

The Agentic Notebook pivot represents a shift in how we support AI-assisted development:
- **Before (Chat):** AI tries to explain terminal output → breaks CLI tools
- **After (Notebook):** AI plans in markdown blocks, terminal stays raw xterm.js

This solves the core "fluff" problem mentioned in the architecture review.

---

## 📞 Support

Found an issue? Please report:
- Title format: `[Notebook] Brief description`
- Include: notebook cell type, reproduction steps
- Attach: screenshot showing cell state

View modes don't break existing workflows - users can continue using Terminal or Chat exclusively if preferred.

---

**Happy coding! 🚀**  
Forge Terminal Team
