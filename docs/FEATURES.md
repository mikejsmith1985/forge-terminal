# Forge Terminal - Feature Implementation Map

**Purpose:** This document maps features to their implementation files, making it easy to understand what each file does and where to find specific functionality.

---

## Core Terminal Features

### PTY/Shell Management
**What it does:** Manages pseudo-terminal sessions, shell processes, and terminal I/O

**Key Files:**
- `internal/terminal/handler.go` - WebSocket handler, terminal lifecycle, PTY creation
- `internal/terminal/pty.go` - PTY allocation, shell spawning, I/O bridging
- `internal/terminal/session.go` - Session state management, reconnection
- `cmd/forge/handlers_terminal.go` - HTTP endpoints for terminal operations

**Capabilities:**
- Create/destroy terminal sessions
- Handle stdin/stdout streaming via WebSocket
- Support CMD, PowerShell, WSL shells
- Window resizing (cols/rows)
- Session persistence and recovery

---

### Shell Configuration
**What it does:** Manages shell type selection and shell-specific settings

**Key Files:**
- `internal/config/shell_config.go` - Shell configuration data structures
- `cmd/forge/handlers_config.go` - GET/POST `/api/config` endpoints
- `internal/terminal/wsl_detector.go` - WSL distribution detection

**Capabilities:**
- Switch between CMD/PowerShell/WSL
- Configure WSL distribution and home path
- Detect available WSL distros
- Persist shell preferences

---

## Artificial Memory (AM) System

### LLM Conversation Logging
**What it does:** Captures terminal-based LLM conversations (Copilot CLI, Claude CLI)

**Key Files:**
- `internal/am/llm_logger.go` - Conversation capture, turn extraction, file writing
- `internal/am/prompt_detector.go` - LLM process detection (CLI launch patterns)
- `internal/am/async_pipeline.go` - Async I/O buffering and flushing
- `internal/am/system.go` - AM initialization, logger registry

**Capabilities:**
- Detect LLM CLI launches (copilot/claude commands)
- Capture user prompts and assistant responses
- Parse TUI-based conversations into turns
- Save conversations as JSON files
- Support both line-based and TUI capture modes

**Data Flow:**
```
Terminal Output → AsyncPipeline → LLMLogger → JSON File
                       ↓
                 PromptDetector (triggers conversation start)
```

---

### AM Health Monitoring
**What it does:** Monitors AM system health and provides status indicators

**Key Files:**
- `internal/am/health_monitor.go` - Health checks, status computation
- `cmd/forge/handlers_am.go` - GET `/api/am/tab-status/:tabId` endpoint

**Capabilities:**
- Detect when AM is enabled but not capturing
- Distinguish system turns from actual content
- Provide 3-state health: GREEN (active), RED (broken), YELLOW (disabled)
- Track last capture time and turn counts

**Status Logic:**
- RED: Only system turn for 10+ seconds OR no user/assistant turns after 30s
- GREEN: Has user AND assistant turns
- YELLOW: AM disabled for tab

---

### Time Travel / Snapshots
**What it does:** Records terminal state snapshots for historical playback

**Key Files:**
- `internal/am/state_store.go` - Snapshot storage and retrieval
- `internal/am/llm_logger.go` (ScreenSnapshot) - TUI screen capture
- `cmd/forge/handlers_am.go` - GET `/api/am/session/:tabId/rewind` endpoint

**Capabilities:**
- Capture terminal state at intervals
- Store snapshots with timestamps
- Rewind to any point in time
- Display historical terminal content

---

## Auto Response System

### Executive Trigger (LLM Intent Detection)
**What it does:** Detects when user needs help and suggests responses

**Key Files:**
- `internal/autoresponse/executive_trigger.go` - Intent classification (error, question, stuck)
- `internal/autoresponse/prompt_detector.go` - Shell prompt state tracking
- `internal/terminal/handler.go` (sendAutoResponseSuggestion) - Suggestion delivery

**Capabilities:**
- Detect error patterns (exit codes, "command not found")
- Detect user questions ("how do I...", "what is...")
- Detect when user is stuck (repeated commands, long idle)
- Use local SLM for intent analysis
- Send suggestions via WebSocket

**Trigger Conditions:**
- Error: Exit code != 0 or error keywords
- Question: Question mark + command-like pattern
- Stuck: Same command 3+ times OR 2+ minutes idle

---

### Auto-Response Toggle
**What it does:** Per-tab enable/disable of auto-response suggestions

**Key Files:**
- `cmd/forge/main.go` (autoResponseEnabled map) - Per-tab state
- `cmd/forge/handlers_terminal.go` (handleAutoResponseToggle) - POST `/api/terminal/:sessionId/auto-respond`

**Capabilities:**
- Enable/disable per tab
- Persist state in-memory (not saved to session)

---

## Smart Routing (SLM Integration)

### Model Tier Classification
**What it does:** Analyzes prompts to select optimal model tier (Haiku/Sonnet/Opus)

**Key Files:**
- `internal/slm/engine.go` - SLM API client, prompt classification
- `internal/slm/classifier.go` - Intent + complexity analysis
- `cmd/forge/handlers_llm.go` - POST `/api/llm/model-tier` endpoint

**Capabilities:**
- Classify intent: debug, explain, refactor, generate, architecture
- Assess complexity: simple, medium, complex
- Recommend model tier: economy (Haiku), balanced (Sonnet), power (Opus)
- Use local Ollama or embedded ONNX model

**Classification Logic:**
```
Intent Detection → Complexity Analysis → Model Tier Recommendation
    (keywords)         (length, scope)        (economy/balanced/power)
```

---

### SLM Provider Management
**What it does:** Manages Ollama connection and model downloads

**Key Files:**
- `internal/slm/engine.go` (DetectOllama, PullModel) - Ollama detection and setup
- `cmd/forge/handlers_slm.go` - GET `/api/slm/status`, POST `/api/slm/pull` endpoints

**Capabilities:**
- Detect Ollama installation
- Check if routing model is available
- Pull qwen2.5:0.5b model
- Fallback to disabled mode if Ollama not found

---

## Command Cards

### Command Storage & Execution
**What it does:** Save and execute frequently-used commands

**Key Files:**
- `internal/commands/card.go` - Command card data structure
- `internal/commands/store.go` - JSON persistence
- `cmd/forge/handlers_commands.go` - CRUD endpoints for command cards

**Capabilities:**
- Create/read/update/delete command cards
- Store command, name, tags, keybinding
- Execute commands by sending to terminal stdin
- Support paste-only mode (no auto-execute)
- Persist to `~/.forge/commands.json`

**Data Structure:**
```json
{
  "id": "uuid",
  "command": "git status",
  "name": "Check Git Status",
  "tags": ["git", "status"],
  "keyBinding": "Ctrl+Shift+1",
  "pasteOnly": false
}
```

---

## File System Integration

### Lens File Picker
**What it does:** Browse and select files for LLM context

**Key Files:**
- `cmd/forge/handlers_files.go` - GET `/api/files/flat` endpoint
- Frontend: `frontend/src/components/LensFilePicker.jsx`

**Capabilities:**
- List files with size, modification time, token count
- 4 view modes: Heatmap (recent), Features (grouped), Graph (tree), Search
- Token budget tracking (default 128k)
- Feature auto-categorization (AM, Terminal, SLM, etc.)

**Categorization Logic:**
- Path/filename pattern matching
- Groups files by feature area
- Estimates token count (size ÷ 4)

---

### File Access Control
**What it does:** Restricts file access to project scope or full system

**Key Files:**
- `cmd/forge/handlers_files.go` (validatePath) - Path validation
- `cmd/forge/handlers_files.go` (handleSetFileAccessMode) - POST `/api/files/access-mode`

**Capabilities:**
- Restricted mode: Only access files under CWD
- Unrestricted mode: Full filesystem access (user permissions)
- Prevent directory traversal attacks

---

## Session Management

### Tab State Persistence
**What it does:** Save/restore terminal tabs across restarts

**Key Files:**
- `cmd/forge/handlers_sessions.go` - GET/POST `/api/sessions` endpoints
- `internal/sessions/store.go` - Session file storage

**Capabilities:**
- Save tab state: shell type, color theme, mode, directory
- Restore tabs on startup
- Persist to `~/.forge/sessions.json`

**Session Data:**
```json
{
  "tabs": [
    {
      "id": "tab-1",
      "title": "Terminal 1",
      "shellConfig": { "shellType": "powershell" },
      "colorTheme": "molten",
      "mode": "dark",
      "currentDirectory": "/path/to/project"
    }
  ],
  "activeTabId": "tab-1"
}
```

---

## Theme System

### Color Themes
**What it does:** Provides 10 color themes including high-contrast accessibility options

**Key Files:**
- `frontend/src/themes/themes.js` - Theme definitions
- `frontend/src/themes/themeInjector.js` - CSS injection

**Available Themes:**
- molten, ocean, forest, sunset, midnight, synthwave, coffee, lavender
- Accessibility: contrast-blue, contrast-amber, contrast-green, contrast-pink

**Theme Structure:**
```javascript
{
  name: "Molten Metal",
  dark: {
    terminal: { background, foreground, cursor, selection, ansi[16] },
    ui: { background, text, border, accent }
  },
  light: { ... }
}
```

---

## CLI Integration

### GitHub Copilot CLI Support
**What it does:** Detects and logs Copilot CLI conversations

**Key Files:**
- `internal/am/prompt_detector.go` (DetectCommand) - Pattern: `copilot|gh copilot`
- `internal/am/llm_logger.go` - TUI capture mode for interactive sessions

**Detected Patterns:**
- `copilot`, `gh copilot`, `gh copilot suggest`, `gh copilot explain`
- `copilot --allow-all-tools`

---

### Claude CLI Support
**What it does:** Detects and logs Claude CLI conversations

**Key Files:**
- `internal/am/prompt_detector.go` (DetectCommand) - Pattern: `claude`

**Detected Patterns:**
- `claude`, `claude --help`, etc.

---

## API Endpoints Reference

### Terminal Management
- `POST /api/terminal/create` - Create new terminal session
- `POST /api/terminal/:id/resize` - Resize terminal window
- `GET /api/terminal/:id/reconnect` - Reconnect to session
- `POST /api/terminal/:id/auto-respond` - Toggle auto-response

### AM System
- `GET /api/am/tab-status/:tabId` - Get AM health status
- `GET /api/am/session/:tabId/range` - Get snapshot time range
- `GET /api/am/session/:tabId/rewind` - Get snapshot at timestamp
- `GET /api/am/llm/conversations/:tabId` - List conversations for tab

### Configuration
- `GET /api/config` - Get shell configuration
- `POST /api/config` - Update shell configuration
- `GET /api/wsl/detect` - Detect available WSL distros

### Smart Routing
- `POST /api/llm/model-tier` - Classify prompt and recommend model
- `GET /api/slm/status` - Get SLM provider status
- `POST /api/slm/pull` - Pull routing model

### Command Cards
- `GET /api/commands` - List all command cards
- `POST /api/commands` - Create command card
- `PUT /api/commands/:id` - Update command card
- `DELETE /api/commands/:id` - Delete command card

### Files
- `GET /api/files/flat` - List files (with token estimates)
- `POST /api/files/access-mode` - Set file access mode

### Sessions
- `GET /api/sessions` - Load saved session
- `POST /api/sessions` - Save current session

---

## Frontend Component Map

### Main Application
- `frontend/src/App.jsx` - Root component, tab management, state coordination

### Terminal View
- `frontend/src/components/Terminal.jsx` - xterm.js wrapper, PTY WebSocket
- `frontend/src/components/TabBar.jsx` - Tab rendering, context menus
- `frontend/src/components/SearchBar.jsx` - Terminal search (Ctrl+F)

### Sidebar
- `frontend/src/components/CommandCard.jsx` - Command card UI
- `frontend/src/components/LensFilePicker.jsx` - File browser with 4 views
- `frontend/src/components/Sidebar.jsx` - Sidebar container

### Modals
- `frontend/src/components/SettingsModal.jsx` - Settings UI (Shell, CLI, Intelligence)
- `frontend/src/components/ForgeAssist.jsx` - Command palette (Ctrl+/)
- `frontend/src/components/HistorySlider.jsx` - Time travel UI (Ctrl+Shift+H)

### Utilities
- `frontend/src/diagnostics/` - Performance monitoring, freeze detection
- `frontend/src/event-log/` - Debug event capture system

---

## Testing

### Backend Tests
- `cmd/forge/*_test.go` - HTTP handler tests
- `internal/am/*_test.go` - AM system unit tests
- `internal/terminal/*_test.go` - Terminal logic tests

### Frontend Tests
- `frontend/e2e/*.spec.js` - Playwright end-to-end tests
- `frontend/tests/*.html` - Manual test reports

---

## How to Find a Feature

**Want to modify AM logging?**
→ Start with `internal/am/llm_logger.go` and `internal/am/async_pipeline.go`

**Want to change shell detection?**
→ Look at `internal/am/prompt_detector.go` and `internal/terminal/handler.go`

**Want to add a new theme?**
→ Edit `frontend/src/themes/themes.js`

**Want to modify health detection?**
→ Check `internal/am/health_monitor.go`

**Want to understand API endpoints?**
→ Search `cmd/forge/main.go` for `http.HandleFunc` calls

---

## Build & Run

```bash
# Backend
go build -o forge.exe ./cmd/forge

# Frontend (dev)
cd frontend && npm run dev

# Frontend (production build)
cd frontend && npm run build
```

**Entry Point:** `cmd/forge/main.go`
