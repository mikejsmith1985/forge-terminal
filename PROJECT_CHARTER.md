# Forge Terminal - Project Charter

## Mission Statement
Build a standalone, cross-platform terminal application with command cards for AI-assisted development. Ship a single executable that works on Mac, Linux, and Windows without any dependencies.

## Target User
Mike's brother - a developer who needs quick access to AI commands (like Claude Code) without complex setup.

## Core Value Proposition
**"One binary, double-click, works."**
- No Docker
- No Node.js installation
- No configuration files to edit
- Opens browser automatically
- Command cards with keyboard shortcuts

---

## What We're Building

### The Product
A terminal emulator in the browser with a sidebar of "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

### Key Features
1. **Full Terminal** - Real PTY (not just output), supports interactive programs (vim, htop, etc.)
2. **Command Cards** - Saved commands with descriptions, keyboard shortcuts, and paste-only mode
3. **4 Default Commands** - Pre-loaded with useful AI development commands
4. **Persistent Storage** - Commands saved to `~/.forge/commands.json`
5. **Cross-Platform** - Single binary for Mac, Linux, Windows
6. **Dark Theme** - Catppuccin Mocha inspired colors

### What We're NOT Building
- File editor (use your normal IDE)
- File tree browser
- AI chat interface
- Project management
- Git integration
- Multiple terminal tabs (v1 - single terminal)

---

## Technical Architecture

### Stack
```
┌─────────────────────────────────────┐
│         Browser (localhost)          │
│  ┌─────────────┬─────────────────┐  │
│  │  Terminal   │  Command Cards  │  │
│  │  (xterm.js) │    Sidebar      │  │
│  └─────────────┴─────────────────┘  │
└──────────────────┬──────────────────┘
                   │ WebSocket (/ws)
                   │ REST (/api/commands)
┌──────────────────┴──────────────────┐
│          Go Binary (forge)           │
│  ┌─────────────┬─────────────────┐  │
│  │  PTY        │  Commands       │  │
│  │  Session    │  Storage        │  │
│  └─────────────┴─────────────────┘  │
│  ┌──────────────────────────────┐   │
│  │  Embedded Frontend (go:embed) │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │  ~/.forge/commands.json   │
     └───────────────────────────┘
```

### Key Dependencies
| Package | Purpose |
|---------|---------|
| `github.com/creack/pty` | Unix PTY (Mac/Linux) |
| `github.com/UserExistsError/conpty` | Windows ConPTY |
| `github.com/gorilla/websocket` | WebSocket for terminal I/O |
| `@xterm/xterm` | Terminal emulator in browser |
| `@xterm/addon-fit` | Auto-resize terminal |
| React 18 + Vite | Frontend build |

### Cross-Platform PTY Strategy
```go
// pty_unix.go (build tag: !windows)
func startPTY(cmd *exec.Cmd) (*os.File, error) {
    return pty.Start(cmd)  // creack/pty
}

// pty_windows.go (build tag: windows)  
func startPTY(cmd *exec.Cmd) (*os.File, error) {
    return conpty.Start(cmd)  // UserExistsError/conpty
}
```

---

## Default Command Cards

These 4 commands are created automatically on first run:

```json
[
  {
    "id": 1,
    "description": "🤖 Run Claude Code",
    "command": "claude",
    "keyBinding": "Ctrl+Shift+1",
    "pasteOnly": false,
    "favorite": true
  },
  {
    "id": 2,
    "description": "📝 Design Command",
    "command": "You are an expert software architect...",
    "keyBinding": "Ctrl+Shift+2",
    "pasteOnly": true,
    "favorite": false
  },
  {
    "id": 3,
    "description": "⚡ Execute Command",
    "command": "Implement the design from our last conversation...",
    "keyBinding": "Ctrl+Shift+3",
    "pasteOnly": true,
    "favorite": false
  },
  {
    "id": 4,
    "description": "🛑 F*** THIS!",
    "command": "STOP. You are stuck in a loop...",
    "keyBinding": "Ctrl+Shift+4",
    "pasteOnly": true,
    "favorite": true
  }
]
```

### Command Card Behavior
- **Execute** (`pasteOnly: false`): Pastes command AND presses Enter
- **Paste Only** (`pasteOnly: true`): Pastes command, user adds context and presses Enter
- **Favorite**: Shown at top of list with yellow highlight

---

## Implementation Plan

### Issue #1: Project Scaffold ✅ DONE
- [x] Directory structure created
- [x] go.mod with dependencies
- [x] Makefile with build targets
- [x] main.go skeleton with embed
- [x] Frontend package.json

### Issue #2: PTY Backend
**Goal**: Working terminal in browser

**Files to create/modify**:
- `internal/terminal/session.go` - Clean up copied file, remove Docker references
- `internal/terminal/handler.go` - Clean up copied file, remove auth
- `internal/terminal/pty_unix.go` - Unix PTY wrapper
- `internal/terminal/pty_windows.go` - Windows ConPTY wrapper

**Remove from copied files**:
- Docker path translation (`translatePath`, `ResolvePath`)
- Workspace mount logic
- Auth middleware
- Portal client
- GitHub token injection
- Image upload handling

**Test criteria**:
- [ ] `go build ./cmd/forge` succeeds
- [ ] Run binary, terminal connects via WebSocket
- [ ] Can type commands and see output
- [ ] Can run interactive programs (vim, htop)
- [ ] Terminal resize works

### Issue #3: Commands API ✅ DONE
**Goal**: Load/save commands from JSON file

**Files to create/modify**:
- [x] `internal/commands/storage.go` - Already created, may need tweaks
- [ ] `cmd/forge/main.go` - Add HTTP handlers

**Endpoints**:
```
GET  /api/commands  → returns []Command as JSON
POST /api/commands  → saves []Command to file
```

**Test criteria**:
- [x] First run creates `~/.forge/commands.json` with 4 defaults
- [x] `curl http://localhost:3333/api/commands` returns JSON
- [x] Restart app, commands persist

### Issue #4: Frontend ✅ DONE
**Goal**: Terminal + command cards UI

**Files to create/modify**:
- `frontend/src/components/ForgeTerminal.jsx` - Already copied, needs import fixes
- `frontend/src/components/CommandCards.jsx` - New file, extracted from ForgePage
- `frontend/src/components/CommandModal.jsx` - New file, add/edit dialog
- `frontend/src/App.jsx` - Wire everything together

**UI Layout**:
```
┌────────────────────────────────────────┬──────────────────┐
│                                        │  ⚡ Commands     │
│                                        │  [+ Add]         │
│                                        │                  │
│           Terminal                     │  ┌────────────┐  │
│           (xterm.js)                   │  │ 🤖 Claude  │  │
│                                        │  │ Ctrl+Shift+1│  │
│                                        │  │ [▶️] [📋]  │  │
│                                        │  └────────────┘  │
│                                        │                  │
│                                        │  ┌────────────┐  │
│                                        │  │ 📝 Design  │  │
│                                        │  └────────────┘  │
│                                        │                  │
└────────────────────────────────────────┴──────────────────┘
```

**Keyboard shortcuts**:
- Cards respond to their configured shortcuts (Ctrl+Shift+1/2/3/4)
- Focus stays on terminal

**Test criteria**:
- [x] Terminal connects and works
- [x] Cards display with correct info
- [x] Click Execute → command runs
- [x] Click Paste → command pasted (no Enter)
- [x] Keyboard shortcuts work
- [x] Add/Edit/Delete commands works
- [x] `npm run build` creates working `web/` folder

### Issue #5: Polish & Release
**Goal**: Ship binaries

**Tasks**:
- [ ] Add graceful shutdown (Ctrl+C)
- [ ] Test on Mac, Linux, Windows
- [ ] Write README with screenshots
- [ ] Create GitHub Actions workflow for releases
- [ ] Tag v1.0.0 and publish binaries

**Build commands**:
```bash
make build-all
# Creates:
# - bin/forge-linux-amd64
# - bin/forge-darwin-amd64
# - bin/forge-darwin-arm64
# - bin/forge-windows-amd64.exe
```

---

## Source Files Reference

Files were copied from DevSmith-Modular-Platform and need cleanup:

### `internal/terminal/session.go` (from `internal/forge/terminal_session.go`)
**Keep**:
- `TerminalSession` struct
- `NewTerminalSession()` function
- `Read()`, `Write()`, `Resize()`, `Close()` methods
- Shell detection logic

**Remove**:
- `translatePath()` function
- `ResolvePath()` function
- Docker volume path logic
- Any workspace-related code

### `internal/terminal/handler.go` (from `internal/forge/terminal_handler.go`)
**Keep**:
- WebSocket upgrader
- PTY → WebSocket goroutine
- WebSocket → PTY goroutine
- Resize message handling

**Remove**:
- Auth middleware integration
- Portal client
- GitHub token injection
- Image upload handler
- Any references to external services

### `frontend/src/components/ForgeTerminal.jsx`
**Keep as-is**, but:
- Fix import paths
- Remove any DevSmith-specific props
- WebSocket URL: `ws://localhost:3333/ws`

### `frontend/src/pages/ForgePage.jsx`
**Reference only** - extract these parts into new components:
- `DEFAULT_CARDS` array → move to `CommandCards.jsx`
- `parseKeyBinding()`, `matchesBinding()` helpers
- Card state management (`commands`, `editingCommand`, `showCommandModal`)
- Card CRUD handlers
- Card UI rendering (the sidebar section)

---

## Success Criteria

### MVP (v1.0.0)
1. ✅ Single binary, no dependencies
2. ✅ Terminal works (type, output, resize)
3. ✅ 4 default command cards
4. ✅ Add/edit/delete commands
5. ✅ Keyboard shortcuts
6. ✅ Commands persist across restarts
7. ✅ Works on Mac, Linux, Windows

### Non-Goals (v1.0.0)
- ❌ Multiple terminal tabs
- ❌ Split panes
- ❌ SSH connections
- ❌ Themes/customization
- ❌ Plugin system

---

## Branch Strategy

```
main (protected)
  │
  ├── feature/pty-backend     (Issue #2)
  │
  ├── feature/commands-api    (Issue #3) - can parallel with #2
  │
  ├── feature/frontend        (Issue #4) - after #2 and #3
  │
  └── feature/release         (Issue #5) - final polish
```

**Merge order**: #2 → #3 → #4 → #5 → main

---

## Agent Instructions

### For Antigravity / AI Agents

When working on this project:

1. **Read the relevant Issue first** - Each issue has detailed specs
2. **Check what's already done** - Some files are scaffolded
3. **Test incrementally** - Build and run after each change
4. **Keep it simple** - This is a minimal app, don't over-engineer
5. **Cross-platform matters** - Use build tags for platform-specific code

### Common Commands
```bash
# Install dependencies
cd frontend && npm install

# Build frontend
cd frontend && npm run build

# Build Go binary
go build -o bin/forge ./cmd/forge

# Run (opens browser automatically)
./bin/forge

# Build for all platforms
make build-all
```

### Key Files to Understand
1. `cmd/forge/main.go` - Entry point, HTTP server, embed
2. `internal/terminal/session.go` - PTY session lifecycle
3. `internal/terminal/handler.go` - WebSocket bridge
4. `internal/commands/storage.go` - JSON file storage
5. `frontend/src/components/ForgeTerminal.jsx` - xterm.js wrapper
6. `frontend/src/App.jsx` - Main React component

---

## Questions?

If anything is unclear, check:
1. The GitHub Issues (#1-#5) for detailed specs
2. The copied source files for reference implementations
3. The DevSmith-Modular-Platform repo for original context

**Owner**: Mike (mikejsmith1985)
**Repository**: https://github.com/mikejsmith1985/forge-terminal
