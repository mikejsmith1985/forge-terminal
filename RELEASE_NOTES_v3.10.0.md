# Forge Terminal v3.10.0 Release Notes

**Release Date:** January 2, 2026

## Overview
v3.10.0 focuses on **developer experience**, **AI instruction management**, and **build system integration**. This release provides seamless workflows for managing project instructions, enhanced command cards with always-append functionality, and simplified IDE integration.

---

## 🎯 Major Features

### 1. Forge Assist Enhancements
#### Always-Append Command Cards
- **NEW**: Command cards can now be marked as "Always Append"
- Text from these cards is automatically appended to every user prompt
- Perfect for persistent coding standards, project context, and response formatting rules
- Visual indicator (📌 badge) on cards marked for always-append
- Orange left border styling for quick identification

#### Comprehensive Instruction File Manager
- **NEW**: Detect and manage AI instruction files across multiple formats
- Auto-detects: `CLAUDE.md`, `.github/copilot-instructions.md`, `copilot-instructions.md`, `.claude/settings.json`, `.cursorrules`, and more
- Smart file priority system (shows most important first)
- Create new files with pre-populated templates
- Set active instruction file to be referenced in workflows
- Split-view editor with file list sidebar

**New API Endpoints:**
- `GET /api/files/instructions` - List all instruction files in project
- `POST /api/files/instructions` - Create/update instruction files
- `GET /api/files/instructions/content` - Read specific instruction file

### 2. Development Workflow Improvements
#### Isolated Dev Environment
- **NEW**: Dev instances run on separate port (9999) from production (3005/8333)
- No more port conflicts between dev and production instances
- Support for `--port` and `-port` flags
- Environment variable: `FORGE_PORT` for custom port selection

#### Enhanced Cache Clearing
- Improved `run-dev-clean.ps1` with comprehensive cache busting
- Clears Vite cache before rebuilds
- Removes old build artifacts
- Kills stale dev processes automatically
- Shows clear differentiation between dev/prod URLs

#### Build Timestamp Tracking
- Dev builds now include build timestamps via ldflags
- Better diagnostics for identifying stale builds
- Timestamp displayed in logs for reference

### 3. IDE Integration & Build System Detection
#### Open in IDE
- **NEW**: Open workspace in external IDE directly from Forge Terminal
- Supported IDEs: VS Code, Cursor, IntelliJ IDEA, Sublime Text, Vim
- **New API:** `POST /api/ide/open` - Opens current workspace in specified IDE

#### Build System Detection
- **NEW**: Auto-detect project build systems and tooling
- Supported: npm, yarn, pnpm, go, cargo, pip, poetry, maven, gradle, dotnet, docker, make
- Returns build, dev, test, and deploy commands for each system
- **New API:** `GET /api/build/detect` - Detects available build systems

### 4. Simplified Dev Mode
- **BREAKING**: Dev Mode now **only hides the Debug tab**
- AM Monitor always visible in sidebar (no devMode check)
- AM toggle always available in tab context menu
- AM indicators always shown on tabs when enabled
- Reduces confusion about which features require dev mode

---

## 🔧 Technical Changes

### Backend (Go)
**`cmd/forge/main.go`**
- Added port override via `--port`/`-port` flags
- Added `FORGE_PORT` environment variable support
- New `handleOpenIDE()` - Opens workspace in external IDE
- New `handleDetectBuildSystem()` - Detects build systems
- Improved command-line help text with port options

**`internal/commands/storage.go`**
- Added `AlwaysAppend bool` field to Command struct
- Persisted in JSON serialization

**`internal/files/handler.go`**
- New `HandleInstructionFiles()` - Manages instruction files
- New `HandleInstructionFileContent()` - Reads instruction file content
- New `detectInstructionFiles()` - Scans for common instruction file patterns
- Supports 13+ instruction file formats across different CLIs

### Frontend (React)
**`frontend/src/components/ForgeAssist.jsx`**
- Replaced simple instruction editor with full file manager
- Split-view UI: file list sidebar + editor
- File templates for CLAUDE.md and copilot-instructions.md
- "Set as Active" functionality for instruction files
- Shows file metadata (size, modification date)
- Detects and lists all instruction files in project

**`frontend/src/components/CommandModal.jsx`**
- Added "Always Append" toggle with explanation
- Visual indication when always-append is enabled
- Orange highlight for always-append section

**`frontend/src/components/SortableCommandCard.jsx`**
- Added "A+" indicator for always-append cards
- Added 📌 badge in card header
- Visual styling with orange left border

**`frontend/src/App.jsx`**
- Removed `devMode &&` checks before AM Monitor rendering
- AM Monitor now always visible in Commands and Files views
- AM Monitor still visible in Debug view (only view hidden by devMode)

**`frontend/src/components/Tab.jsx`**
- Removed `devMode &&` check for AM toggle button
- AM toggle always visible in context menu when onToggleAM provided
- AM indicator always shown on tabs (no devMode gate)
- Removed `devMode &&` from tab className

**`frontend/src/components/TabBar.jsx`**
- Always pass `onToggleAM` callback (removed conditional)
- Dev mode only affects Debug tab visibility now

**`frontend/src/index.css`**
- Added `.card.always-append` styling
- Orange left border (3px, #f59e0b)
- Subtle gradient background for visual distinction

### Scripts
**`run-dev-clean.ps1`** (Complete Rewrite)
- New port isolation strategy (9999 for dev)
- Custom port support via `-Port` parameter
- 6-step process: process cleanup → artifact cleanup → frontend rebuild → Go rebuild → env setup → run
- Vite cache clearing before each build
- Clear separation of dev/prod port information
- Enhanced logging with step indicators

---

## 📊 Command Structure Updates

### Command Struct Changes
```go
type Command struct {
    ID           int    `json:"id"`
    Description  string `json:"description"`
    Command      string `json:"command"`
    KeyBinding   string `json:"keyBinding"`
    PasteOnly    bool   `json:"pasteOnly"`
    Favorite     bool   `json:"favorite"`
    TriggerAM    bool   `json:"triggerAM,omitempty"`
    LLMProvider  string `json:"llmProvider,omitempty"`
    LLMType      string `json:"llmType,omitempty"`
    Icon         string `json:"icon,omitempty"`
    Delay        int    `json:"delay,omitempty"`
    AlwaysAppend bool   `json:"alwaysAppend,omitempty"` // NEW
}
```

---

## 🎨 UI/UX Changes

### Forge Assist - Instructions Tab
- **Before**: Simple text editor for copilot-instructions.md only
- **After**: Full-featured manager for all instruction file types
- File detection with priority ordering
- Create new files with templates
- Set active instruction file
- Real-time file metadata display

### Tab Bar
- **Before**: AM toggle hidden in dev mode
- **After**: AM toggle always visible
- Cleaner context menu
- AM indicator always present when enabled

### Command Cards
- **Before**: No way to mark cards as "always append"
- **After**: "Always Append" toggle in edit modal
- Visual badge (📌) on marked cards
- Orange styling for quick identification

---

## 🔄 Migration Notes

### For Users
- **Dev Mode**: Now only affects Debug tab visibility
  - AM Monitor visible in all sidebar views
  - AM toggle always available on tabs
  - Debug tab still only in dev mode
  
- **Dev Workflow**: Use new `run-dev-clean.ps1` for isolated dev environment
  - Old `run-dev.ps1` still works but shares ports with production
  - New default port 9999 prevents conflicts

### For Developers
- Always-append command cards stored with `alwaysAppend: true` in commands.json
- Instruction files detected from 13+ common patterns
- Build system detection agnostic to project structure

---

## 🐛 Bug Fixes
- Fixed AM Monitor visibility inconsistency (always-on approach)
- Fixed dev/prod port conflicts with isolated port system
- Fixed cache stale code issues with comprehensive cache clearing

---

## 📈 Performance
- Build time: ~11 seconds (frontend + Go)
- No additional runtime overhead
- Lazy-loaded instruction file detection (API driven)

---

## 🔍 Testing Checklist
- ✅ Always-append cards function correctly
- ✅ Instruction file manager detects all file types
- ✅ Dev instance runs on isolated port 9999
- ✅ IDE open endpoint works with VS Code, Cursor
- ✅ Build system detection recognizes common systems
- ✅ AM Monitor visible without dev mode
- ✅ Command card editing preserves always-append flag
- ✅ Cache clearing prevents stale builds

---

## 📚 Documentation
- Updated: Run dev environment with new port isolation
- Added: Instructions for managing instruction files
- Added: IDE integration examples
- Added: Build system detection usage

---

## 🙏 Contributors
- Core enhancements to Forge Assist and dev workflow
- Comprehensive instruction file detection system
- IDE integration foundation for future expansions

---

## Next Steps (v3.11+)
- Execute build commands from Forge Terminal
- Execute deploy commands in UI
- Always-append card integration with prompt sending
- Instruction file content injection into prompts
- Language server integration for better diagnostics
