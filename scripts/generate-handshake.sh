#!/bin/bash
# Generate Forge Terminal Handshake Document
# This script extracts features, APIs, and components to create a comprehensive spec

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$SCRIPT_DIR/.."
OUTPUT_FILE="$ROOT_DIR/FORGE_HANDSHAKE.md"

echo "🔥 Generating Forge Terminal Handshake Document..."

# Extract version from git tag or use "dev"
BACKEND_VERSION=$(cd "$ROOT_DIR" && git describe --tags --always --dirty 2>/dev/null || echo "dev")
BACKEND_VERSION=${BACKEND_VERSION#v}  # Remove 'v' prefix
echo "📦 Backend Version: $BACKEND_VERSION"

# Extract version from package.json
FRONTEND_VERSION=$(grep '"version"' "$ROOT_DIR/frontend/package.json" | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo "📦 Frontend Version: $FRONTEND_VERSION"

# Count components
COMPONENT_COUNT=$(find "$ROOT_DIR/frontend/src/components" -name "*.jsx" 2>/dev/null | wc -l)
echo "🎨 React Components: $COMPONENT_COUNT"

# Extract API endpoints from main.go
echo "🔌 Extracting API endpoints..."
API_ENDPOINTS_FILE=$(mktemp)
grep -E 'http.HandleFunc\("/' "$ROOT_DIR/cmd/forge/main.go" | \
    sed 's/.*http.HandleFunc("\([^"]*\)".*/\1/' | \
    sort > "$API_ENDPOINTS_FILE"

# Count endpoints
ENDPOINT_COUNT=$(wc -l < "$API_ENDPOINTS_FILE")
echo "🔌 Found $ENDPOINT_COUNT API endpoints"

# Extract default commands
COMMAND_COUNT=$(grep -c 'ID:' "$ROOT_DIR/internal/commands/storage.go" | head -1 || echo "5")

# Get current timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Generate document
cat > "$OUTPUT_FILE" << 'HANDSHAKE_DOC'
# Forge Terminal → Forge Orchestrator Handshake Specification

**Version**: VERSION_PLACEHOLDER  
**Last Updated**: TIMESTAMP_PLACEHOLDER  
**Purpose**: Define 1:1 feature parity requirements between Forge Terminal (free) and Forge Orchestrator (paid)

---

## 🎯 Core Architecture

### Application Type
- **Platform**: Desktop application (native binary + embedded web UI)
- **Backend**: Go HTTP server with WebSocket support
- **Frontend**: React SPA with XTerm.js terminal emulator
- **Distribution**: Single executable binary (Windows, macOS, Linux)

### Technical Stack
```
Backend:
  - Language: Go 1.x
  - Web Server: net/http (stdlib)
  - WebSocket: gorilla/websocket
  - Terminal: pty (Unix) / conpty (Windows)

Frontend:
  - Framework: React 18
  - Build Tool: Vite
  - Terminal: XTerm.js + addons
  - UI Library: lucide-react icons
  - Drag & Drop: @dnd-kit
```

---

## 🔌 API Endpoints (AUTO-DETECTED)

API_ENDPOINTS_PLACEHOLDER

---

## 🎨 UI Components (COMPONENT_COUNT_PLACEHOLDER React Components)

### Core Components
1. **App.jsx** - Main application shell and state management
2. **ForgeTerminal.jsx** - XTerm.js terminal wrapper with WebSocket
3. **TabBar.jsx** - Multi-tab interface with drag-to-reorder
4. **CommandCards.jsx** - Sortable list of command cards
5. **SortableCommandCard.jsx** - Individual draggable command card

### Modal Components
6. **CommandModal.jsx** - Add/Edit command card dialog
7. **FeedbackModal.jsx** - User feedback form with screenshots
8. **SettingsModal.jsx** - Application settings and configuration
9. **UpdateModal.jsx** - Update notifications and management
10. **WelcomeModal.jsx** - First-run welcome screen

### Utility Components
11. **ShellToggle.jsx** - PowerShell/WSL/Bash shell switcher
12. **SearchBar.jsx** - Terminal search with match navigation
13. **Toast.jsx** - Toast notification system
14. **AMRestoreCard.jsx** - Session recovery card

### Supporting Components
15. **ThemeSwitcher** (integrated in App)
16. **FontSizeControls** (integrated in App)
17. **SidebarPositionToggle** (integrated in App)

---

## 🎯 Feature Catalog (Complete)

### 1. Terminal Management
- [x] Multi-tab terminal (up to 20 tabs)
- [x] Tab creation, closing, switching
- [x] Tab reordering via drag-and-drop
- [x] Tab renaming (manual or auto from directory)
- [x] Auto-rename tabs based on current directory
- [x] Per-tab shell configuration (PowerShell, WSL, Bash)
- [x] Per-tab color themes (8 themes: molten, ocean, forest, sunset, midnight, sakura, neon, monochrome)
- [x] Per-tab dark/light mode toggle
- [x] Tab state persistence across sessions
- [x] Tab directory restoration on reload

### 2. Shell Support
- [x] Windows PowerShell
- [x] WSL (all distributions)
- [x] Bash (Unix-like systems)
- [x] CMD (via PowerShell)
- [x] Custom shell detection
- [x] WSL distribution auto-detection
- [x] WSL home path configuration

### 3. Terminal Features
- [x] Full XTerm.js compatibility
- [x] 256-color support
- [x] Unicode/UTF-8 support
- [x] Mouse support (clicks, scrolling)
- [x] Copy/paste via keyboard shortcuts
- [x] Font size controls (10-24px, +/- buttons, reset)
- [x] Search functionality with regex support
- [x] Search navigation (next/previous match)
- [x] Match count display
- [x] Auto-scroll to bottom
- [x] Manual scroll preservation
- [x] Scroll-to-bottom button (appears when scrolled up)

### 4. Command Cards
- [x] Create custom command cards
- [x] Edit command cards
- [x] Delete command cards
- [x] Reorder cards via drag-and-drop
- [x] Execute commands (paste + enter)
- [x] Paste-only mode (paste without enter)
- [x] Keyboard shortcuts (Ctrl+Shift+1-9, 0)
- [x] Favorite cards
- [x] Card icons (emoji support)
- [x] Multi-line command support
- [x] Command search/filter
- [x] Export/import cards (via JSON)
- [x] COMMAND_COUNT_PLACEHOLDER default cards included

#### Default Command Cards
1. **Run Claude Code** - Execute `claude` command
2. **Design Command** - AI-powered design specification prompt
3. **Execute Command** - TDD implementation prompt
4. **F*** THIS!** - Context-breaking reset prompt
5. **Summarize Last Session** - AM session log analysis prompt

### 5. Artificial Memory (AM) System
- [x] Session logging (per-tab)
- [x] Enable/disable per tab
- [x] Markdown log format
- [x] User input tracking
- [x] Agent output tracking
- [x] Command execution tracking
- [x] File modification tracking
- [x] Error logging
- [x] Session start/end markers
- [x] Interrupted session detection
- [x] Session recovery UI
- [x] View session logs
- [x] Archive old sessions
- [x] 7-day retention policy
- [x] Log file location: `.forge/am/session-{tabId}-{date}.md`

### 6. Auto-Respond (Prompt Watcher)
- [x] Enable/disable per tab
- [x] Detect shell prompts
- [x] Auto-paste commands on prompt detection
- [x] Visual indicator (waiting state badge)
- [x] Configurable prompt patterns
- [x] Support for PowerShell, Bash, WSL prompts
- [x] Buffer-based detection (no polling)

### 7. Theme System
- [x] 8 color themes (molten, ocean, forest, sunset, midnight, sakura, neon, monochrome)
- [x] Dark/light mode per tab
- [x] Global theme toggle
- [x] Terminal color synchronization
- [x] CSS variable-based theming
- [x] Gradient backgrounds
- [x] Theme persistence

### 8. Settings & Configuration
- [x] Shell type configuration
- [x] WSL distribution selection
- [x] WSL home path configuration
- [x] Sidebar position (left/right)
- [x] Font size preferences
- [x] Theme preferences
- [x] Configuration persistence (localStorage + backend)
- [x] Settings modal UI
- [x] Restore default cards feature
- [x] Desktop shortcut creation

### 9. Update System
- [x] GitHub Releases integration
- [x] Auto-check for updates on startup
- [x] Manual update check
- [x] One-click update application
- [x] Version comparison
- [x] Release notes display
- [x] Multi-version support (rollback capability)
- [x] In-app update modal
- [x] Update notification badges
- [x] Binary replacement mechanism

### 10. User Feedback System
- [x] In-app feedback form
- [x] Screenshot capture
- [x] Browser info collection
- [x] Timestamp tracking
- [x] Application logs inclusion
- [x] GitHub Issues API integration
- [x] Automatic issue creation
- [x] Feedback modal UI

### 11. Welcome Experience
- [x] First-run welcome modal
- [x] Feature introduction
- [x] Quick start guide
- [x] One-time display (tracked via API)
- [x] Skip/dismiss option

### 12. Search Functionality
- [x] Terminal content search
- [x] Regular expression support
- [x] Case-sensitive toggle
- [x] Match highlighting
- [x] Navigation (next/prev)
- [x] Match counter
- [x] Keyboard shortcuts (Ctrl+F)

### 13. Drag & Drop
- [x] Reorder command cards
- [x] Reorder tabs
- [x] Smooth animations
- [x] Visual feedback during drag
- [x] Keyboard accessibility

### 14. Keyboard Shortcuts
- [x] Command execution: Ctrl+Shift+1-9, 0
- [x] New tab: Ctrl+Shift+N
- [x] Close tab: Ctrl+Shift+W
- [x] Switch tabs: Ctrl+1-9
- [x] Font size: Ctrl+Plus/Minus
- [x] Search: Ctrl+F
- [x] Copy: Ctrl+Shift+C
- [x] Paste: Ctrl+Shift+V

### 15. Persistence & Storage
- [x] Command cards: `~/.forge/commands.json`
- [x] Shell config: `~/.forge/config.json`
- [x] Tab sessions: `~/.forge/sessions.json`
- [x] Welcome state: `~/.forge/welcome.json`
- [x] AM logs: `.forge/am/session-*.md`
- [x] Theme preferences: localStorage
- [x] Font size: localStorage
- [x] Sidebar position: localStorage

### 16. Error Handling
- [x] Connection loss detection
- [x] WebSocket reconnection
- [x] Auto-retry on failure
- [x] User-visible error toasts
- [x] Graceful degradation
- [x] Timeout handling (10s for API calls)
- [x] Loading states
- [x] Error recovery UI

### 17. Performance Features
- [x] Debounced search
- [x] Efficient terminal rendering
- [x] Lazy component loading
- [x] Optimized WebSocket buffer handling
- [x] Memory cleanup on tab close
- [x] Log file cleanup (7-day retention)

### 18. Platform-Specific Features
- [x] Windows: PowerShell integration
- [x] Windows: ConPTY support
- [x] Windows: Desktop shortcut creation
- [x] WSL: Distribution detection
- [x] WSL: Home path mapping
- [x] Unix: PTY support
- [x] macOS: Native terminal support
- [x] Linux: Bash integration

---

## 📊 Data Models

### Command Card
```json
{
  "id": 1,
  "description": "Command description",
  "command": "command text",
  "keyBinding": "Ctrl+Shift+1",
  "pasteOnly": false,
  "favorite": true,
  "icon": "emoji-name"
}
```

### Tab State
```json
{
  "id": "tab-1-abc123",
  "title": "Terminal 1",
  "shellConfig": {
    "shellType": "powershell",
    "wslDistro": "",
    "wslHomePath": ""
  },
  "colorTheme": "molten",
  "mode": "dark",
  "directory": "~/projects",
  "autoRespond": false,
  "amEnabled": false
}
```

### Shell Config
```json
{
  "shellType": "powershell",
  "wslDistro": "Ubuntu-24.04",
  "wslHomePath": "/home/user"
}
```

### AM Session Log
```markdown
# Forge AM (Artificial Memory) Log

| Property | Value |
|----------|-------|
| Tab ID | tab-1-abc123 |
| Tab Name | Terminal 1 |
| Workspace | /home/user/project |
| Session Start | 2025-12-06T16:28:21Z |
| Last Updated | 2025-12-06T16:30:00Z |

---

## Session Activity

### 16:28:21 [SESSION_STARTED]
Session logging started

### 16:28:30 [USER_INPUT]
git status

### 16:28:31 [COMMAND_EXECUTED]
git status
```

---

## 🔐 Security Considerations

### Data Storage
- All user data stored locally
- No cloud synchronization
- No telemetry or tracking
- File permissions: 0600 (user-only)
- Directory permissions: 0700 (user-only)

### Network
- No external API calls (except GitHub for updates/feedback)
- Local-only HTTP server (127.0.0.1)
- WebSocket over localhost
- No authentication required (local app)

### Updates
- Binary verification via GitHub releases
- Checksum validation (future)
- User-initiated updates only
- Rollback capability

---

## 🎯 Orchestrator-Specific Considerations

### Features That Should Scale
1. **Tab Limit**: Increase from 20 to unlimited
2. **Command Cards**: Add cloud sync capability
3. **AM Logs**: Add cloud backup/sync
4. **Themes**: Add custom theme creation
5. **Shortcuts**: Add global hotkeys
6. **Collaboration**: Add session sharing
7. **AI Integration**: Add built-in AI chat
8. **Templates**: Add command templates
9. **Automation**: Add workflow automation
10. **Analytics**: Add usage analytics (opt-in)

### Features That Should Remain Identical
1. Terminal rendering engine (XTerm.js)
2. WebSocket protocol structure
3. API endpoint signatures
4. Data model schemas
5. File storage formats
6. Keyboard shortcuts
7. Shell support
8. Theme color schemes (base 8)

---

## 🔄 Automated Update Process

### Version Tracking
- Backend version: `internal/updater/updater.go` line 16
- Frontend version: `frontend/package.json` line 3
- Build version: Set via `-ldflags` during `make build`

### Update Mechanism
1. Parse current version from build
2. Fetch latest release from GitHub API
3. Compare versions (semver)
4. Download matching binary for platform
5. Replace current binary
6. Restart application

### Document Update Automation
This document is auto-generated via:
```bash
./scripts/generate-handshake.sh
```

Or via make target:
```bash
make handshake-doc
```

**Automation Strategy**:
- Run script before each release
- Add to CI/CD pipeline
- Git pre-commit hook (optional)
- Validate feature checklist completeness

---

## 📝 Change Log Tracking

### When to Update This Document
- [ ] New API endpoint added/removed
- [ ] New React component added/removed
- [ ] Feature flag added/changed
- [ ] Data model schema changed
- [ ] Configuration option added/removed
- [ ] Version number changed
- [ ] Keyboard shortcut added/modified
- [ ] Default card added/removed

### Validation Checklist
- [ ] All API endpoints documented
- [ ] All components listed
- [ ] All features have checkboxes
- [ ] All data models have examples
- [ ] Version matches codebase
- [ ] Last updated timestamp current

---

## 🤝 Compatibility Promise

Forge Terminal and Forge Orchestrator commit to:
1. **API Compatibility**: All endpoints work identically
2. **Data Portability**: All config files are compatible
3. **Feature Subset**: Orchestrator ⊇ Terminal (superset)
4. **No Breaking Changes**: Terminal features never removed
5. **Migration Path**: Seamless upgrade Terminal → Orchestrator

---

**Document Signature**: `forge-terminal-vVERSION_PLACEHOLDER-DATESTAMP_PLACEHOLDER`
HANDSHAKE_DOC

# Replace placeholders
# Replace placeholders (portable sed syntax for both Linux and macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/VERSION_PLACEHOLDER/$BACKEND_VERSION/g" "$OUTPUT_FILE"
    sed -i '' "s/TIMESTAMP_PLACEHOLDER/$TIMESTAMP/g" "$OUTPUT_FILE"
    sed -i '' "s/COMPONENT_COUNT_PLACEHOLDER/$COMPONENT_COUNT/g" "$OUTPUT_FILE"
    sed -i '' "s/COMMAND_COUNT_PLACEHOLDER/$COMMAND_COUNT/g" "$OUTPUT_FILE"
else
    sed -i "s/VERSION_PLACEHOLDER/$BACKEND_VERSION/g" "$OUTPUT_FILE"
    sed -i "s/TIMESTAMP_PLACEHOLDER/$TIMESTAMP/g" "$OUTPUT_FILE"
    sed -i "s/COMPONENT_COUNT_PLACEHOLDER/$COMPONENT_COUNT/g" "$OUTPUT_FILE"
    sed -i "s/COMMAND_COUNT_PLACEHOLDER/$COMMAND_COUNT/g" "$OUTPUT_FILE"
fi

# Insert API endpoints after the marker
awk -v endpoints="$(<"$API_ENDPOINTS_FILE")" '
/API_ENDPOINTS_PLACEHOLDER/ {
    split(endpoints, lines, "\n")
    for (i in lines) {
        if (lines[i] != "") {
            print "- `" lines[i] "`"
        }
    }
    next
}
{ print }
' "$OUTPUT_FILE" > "$OUTPUT_FILE.tmp" && mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"

# Update datestamp at bottom
DATESTAMP=$(date -u +"%Y-%m-%d")
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/DATESTAMP_PLACEHOLDER/$DATESTAMP/g" "$OUTPUT_FILE"
else
    sed -i "s/DATESTAMP_PLACEHOLDER/$DATESTAMP/g" "$OUTPUT_FILE"
fi

# Cleanup
rm -f "$API_ENDPOINTS_FILE"

echo "✅ Handshake document generated: $OUTPUT_FILE"
echo "📋 Version: $BACKEND_VERSION"
echo "📅 Timestamp: $TIMESTAMP"
echo "🎨 Components: $COMPONENT_COUNT"
echo "🔌 API Endpoints: $ENDPOINT_COUNT"
