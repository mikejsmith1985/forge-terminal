# v1.9.2 Requirements: File Explorer & Monaco Editor Integration

**Status**: Planned  
**Target Release**: v1.9.2  
**Date**: December 6, 2025

---

## 🎯 Vision Statement

Integrate a **full Monaco-powered editor** and **visual file explorer** into Forge Terminal that feels like it was always part of the design. The system should serve both terminal experts (faster workflows) and newcomers (gentler onboarding) while maintaining the "one binary, double-click, works" philosophy.

---

## 🏗️ Architecture Overview

### Three-Panel Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡] Forge Terminal                      [🎨] [☀️] [⚙️]             │
├───────────────┬─────────────────────────────────────────────────────┤
│ WORKSPACE     │  Terminal Tab (60%)      │  Editor Panel (40%)     │
│ ┌───────────┐ │  ┌─────────────────────┐ │ ┌──────────────────┐   │
│ │ 📁 Files  │ │  │ $ pwd               │ │ │ 📝 main.js       │   │
│ │ 📋 Cards  │ │  │ /home/user/project  │ │ │ [🔒 Synced]      │   │
│ └───────────┘ │  │ $ node main.js      │ │ │                  │   │
│               │  │ Hello World!        │ │ │ 1  function main │   │
│ Files         │  │                     │ │ │ 2    console.log │   │
│ ├─📁 src      │  │                     │ │ │ 3      ("Hello") │   │
│ │ ├─📄 main.js│  └─────────────────────┘ │ │ 4  }             │   │
│ │ └─📄 util.js│                          │ │                  │   │
│ ├─📁 node_mod │  [Tab 1] [Tab 2] [+]    │ │ [Pop Out][Close] │   │
│ └─📄 README.md│                          │ └──────────────────┘   │
└───────────────┴─────────────────────────────────────────────────────┘
```

**Key Panels:**
1. **Workspace Sidebar** (left, collapsible): Files + Cards tabs
2. **Terminal Panel** (center, always visible)
3. **Editor Panel** (right, toggleable split or separate tab)

---

## 📋 Core Requirements

### 1. File Explorer (Workspace Sidebar)

#### 1.1 Visual Design
- **Two-tab interface**:
  - 📁 **Files** tab: Visual file tree
  - 📋 **Cards** tab: Existing command cards (unchanged)
- **Collapsible**: Toggle with `Ctrl+B` or hamburger menu
- **Width**: 200-300px default, resizable via drag handle
- **Position**: Always on left side (no right-side toggle for this panel)

#### 1.2 File Tree Behavior
```
Files
├─📁 src
│ ├─📄 main.js
│ ├─📄 util.js (gitignored - dimmed 60% opacity)
│ └─📁 components
│   ├─📄 Button.jsx
│   └─📄 Modal.jsx
├─📁 node_modules (collapsed by default)
├─📁 .git (collapsed by default)
├─📄 package.json
├─📄 .gitignore (dimmed 60% opacity)
└─📄 README.md
```

**Key Features:**
- ✅ Show **all files** (including hidden `.files`)
- ✅ **Dimmed appearance** for `.gitignore` entries:
  - Text opacity: 60%
  - Font style: italic
  - Subtle strikethrough or different icon shade
- ✅ **Smart collapsing**: `node_modules`, `.git`, etc. start collapsed
- ✅ **Icon library**: File type icons (📄 .js, 📝 .md, 📦 .json, etc.)
- ✅ **Sync with terminal**: Shows `pwd` of active terminal tab
- ✅ **Breadcrumb navigation**: `🏠 / user / projects / myapp`

#### 1.3 File Tree Interactions

**Single-click**: Select file (preview in status bar)

**Double-click**:
- **Code files** (`.js`, `.ts`, `.go`, `.py`, etc.): Open in Monaco editor (split panel)
- **Markdown** (`.md`): Open in Monaco editor (with live preview option)
- **Text files** (`.txt`, `.log`, `.json`): Open in Monaco editor
- **AM logs** (`./am/*.md`): Open in Monaco editor with special syntax highlighting
- **Binary files**: Show "Cannot preview binary file" message

**Right-click context menu**:
```
📄 main.js
├─ Open in Editor            (split panel)
├─ Open in New Tab          (pop out to editor tab)
├─ ─────────────────────────
├─ Send to Terminal          (paste filename or cd to directory)
├─ Copy Path                 (absolute path)
├─ Copy Relative Path        (from pwd)
├─ ─────────────────────────
├─ Rename                    (inline rename)
├─ Delete                    (with confirmation)
└─ Properties                (size, permissions, modified)
```

**Folder right-click**:
```
📁 src/
├─ Open in Terminal         (cd src && ls)
├─ Send Path to Terminal    (paste "./src/")
├─ ─────────────────────────
├─ New File                 (create file in folder)
├─ New Folder               (create subfolder)
├─ ─────────────────────────
├─ Rename
└─ Delete
```

#### 1.4 "Send to Terminal" Behavior

**For Files**:
- Pastes the **relative filename** at current cursor position
- Example: User clicks "Send to Terminal" on `deploy.sh`
  - Terminal receives: `./deploy.sh` (typed at cursor, no Enter)
- Use case: `cat file.txt`, `node script.js`, `git add file.js`

**For Folders**:
- Executes `cd <folder> && ls` and presses Enter
- Example: User clicks "Send to Terminal" on `src/`
  - Terminal executes: `cd src && ls`
  - File tree updates to show `src/` contents
- Use case: Quick navigation without typing `cd` commands

**Visual Feedback**:
- Brief flash/highlight on terminal showing what was sent (200ms yellow background)
- Toast notification: "Sent to terminal: ./deploy.sh"

---

### 2. Monaco Editor Integration

#### 2.1 Split Panel Mode (Default)

**Layout**:
```
┌────────────────────────┬─────────────────────────────┐
│ Terminal (60%)         │ Editor (40%)                │
│                        │ ┌─────────────────────────┐ │
│ $ node main.js         │ │ 📝 main.js [🔒] [↗] [✕]│ │
│ Hello World!           │ ├─────────────────────────┤ │
│                        │ │  1  function main() {   │ │
│                        │ │  2    console.log(      │ │
│                        │ │  3      "Hello World!"  │ │
│                        │ │  4    );                │ │
│                        │ │  5  }                   │ │
│                        │ │  6                      │ │
│                        │ │  7  main();             │ │
│                        │ └─────────────────────────┘ │
└────────────────────────┴─────────────────────────────┘
```

**Split Ratio**:
- Default: 60/40 (terminal/editor)
- Adjustable: Drag handle between panels (30/70 to 80/20 range)
- Remembered per-session in localStorage

**Editor Toolbar**:
```
📝 main.js    [🔒 Synced]    [↗ Pop Out]    [✕ Close]
```

**Toolbar Actions**:
- **🔒 Synced (default)**: Editor theme locked to parent terminal tab
  - When terminal changes theme/mode, editor follows
  - Padlock icon is filled/locked
- **🔓 Unlocked**: Editor theme independent
  - User can set different theme for editor
  - Padlock icon is open/unlocked
- **↗ Pop Out**: Convert split panel to separate editor tab
- **✕ Close**: Hide editor panel, return to full terminal view

#### 2.2 Editor Tab Mode (Pop Out)

**Creating Editor Tabs**:
1. Click "Pop Out" (↗) in split panel editor
2. Right-click file → "Open in New Tab"
3. Command card: `Ctrl+Shift+E` (Open in Editor Tab)

**Editor Tab Appearance**:
```
Tabs: [🖥️ Terminal 1] [📝 main.js] [🖥️ Terminal 2] [+]
```

**Tab Icons**:
- 🖥️ Terminal tabs (existing)
- 📝 Editor tabs (new)
- 📄 Viewer tabs (future: MD-only preview)

**Editor Tab Properties**:
- **Full-screen Monaco editor** (no terminal visible)
- **Theme inheritance**:
  - Default: 🔒 Locked to origin terminal tab
  - If terminal tab changes theme/mode → editor tab follows
  - Click 🔓 padlock to unlock and customize independently
- **Right-click tab menu**:
  ```
  📝 main.js
  ├─ Merge to Terminal 1      (convert to split panel)
  ├─ Toggle Theme Lock         (🔒 ↔ 🔓)
  ├─ ─────────────────────────
  ├─ Rename Tab
  ├─ Duplicate
  └─ Close
  ```

#### 2.3 Monaco Editor Features

**Full Monaco Integration**:
- ✅ Syntax highlighting for 40+ languages
- ✅ IntelliSense / Auto-completion (language-specific)
- ✅ Multi-cursor editing (Alt+Click)
- ✅ Find/Replace (Ctrl+F, Ctrl+H)
- ✅ Minimap (optional, toggle in settings)
- ✅ Line numbers
- ✅ Bracket matching
- ✅ Code folding
- ✅ Git diff indicators (if in git repo)

**Theme Synchronization**:
- Maps Forge Terminal themes to Monaco themes:
  ```
  Molten Metal → "monokai"
  Deep Ocean → "vs-dark"
  Emerald Forest → "github-dark"
  High Contrast Dark → "hc-black"
  Light themes → "vs-light"
  ```
- Font size synced with terminal font size
- Font family: Fira Code, Cascadia Code, or user preference

**Auto-Save**:
- Default: Save after 2s of idle typing
- Visual indicator: Dot in tab title when unsaved
- Manual save: Ctrl+S
- Setting to disable auto-save

**File Operations**:
- ✅ Save (Ctrl+S)
- ✅ Save As (Ctrl+Shift+S)
- ✅ Revert to Saved
- ✅ Close without saving (confirmation prompt)

**Quick Actions Toolbar**:
```
[💾 Save] [▶️ Run] [🔄 Reload] [⚙️ Settings] [✕ Close]
```

- **Run**: Executes file based on extension:
  - `.js` → `node filename.js`
  - `.py` → `python filename.py`
  - `.sh` → `bash filename.sh`
  - Output shown in terminal panel (or origin terminal tab if popped out)

#### 2.4 Special: AM Log Viewer

**When opening `./am/*.md` files**:

**Special Toolbar**:
```
📖 session-abc123-2025-12-06.md  [🤖 Summarize] [📋 Copy] [✕]
```

**Enhanced Rendering**:
- **Syntax highlighting**: Different colors for commands vs output
  ```markdown
  ## 14:32:15 - Command
  ```console
  $ git status
  ```
  
  ## 14:32:16 - Output
  On branch main...
  ```
- **Metadata banner**: "AM Session Log | Tab: Terminal 1 | Started: 2:30 PM"
- **Quick Actions**:
  - 🤖 **Summarize**: Pastes Ctrl+Shift+5 prompt to terminal
  - 📋 **Copy**: Copy entire log to clipboard
  - 🔗 **Links**: File paths are clickable (open in editor)

---

### 3. User Experience Flows

#### Flow 1: Beginner Navigates Directories (No `cd` commands)

```
1. User opens Forge Terminal
2. Sees file tree on left (collapsed by default)
3. Clicks "Files" tab to expand tree
4. Sees:
   📁 projects/
   ├─📁 website/
   └─📁 scripts/

5. Right-clicks "website/" → "Open in Terminal"
6. Terminal executes: cd projects/website && ls
7. File tree updates to show website/ contents
8. User sees files, right-clicks "deploy.sh"
9. Selects "Send to Terminal"
10. Terminal shows: "./deploy.sh" at cursor
11. User presses Enter → script runs
```

**Zero terminal commands typed. Pure GUI interaction.**

---

#### Flow 2: Developer Edits File Mid-Session

```
1. User is in terminal, sees error: "Config invalid at line 23"
2. Presses Ctrl+Shift+6 (Open Config command card)
3. Config opens in split panel (terminal 60%, editor 40%)
4. Scrolls to line 23, fixes JSON syntax error
5. Presses Ctrl+S (auto-save also active)
6. Returns focus to terminal (Ctrl+`)
7. Re-runs command: ↑ Enter
8. Success! Closes editor with Ctrl+E
```

**Faster than: `vim config.json`, `:23`, fix, `:wq`, re-run.**

---

#### Flow 3: Multi-Tab Editing Workflow

```
1. User opens main.js in split panel
2. Needs to reference util.js for function signature
3. Clicks "Pop Out" (↗) on main.js editor
4. main.js becomes separate editor tab (🔒 locked to Terminal 1 theme)
5. Switches back to Terminal 1 tab
6. Opens util.js in split panel (terminal + editor split)
7. Now has:
   - Tab 1: Terminal 1 (with util.js split)
   - Tab 2: main.js (full-screen editor)
8. Switches between tabs to compare code
9. Clicks 🔓 on main.js tab to unlock theme
10. Changes main.js to light mode (better for reading)
11. Terminal 1 stays dark mode
12. Edits complete → closes editor tabs
```

**Flexible multi-file editing with theme independence.**

---

#### Flow 4: Review AM Logs with AI Summary

```
1. User worked for 1 hour with AM logging enabled
2. Presses Ctrl+Shift+7 (View AM Logs command card)
3. File picker filtered to ./am/*.md appears
4. Selects today's log: session-abc-2025-12-06.md
5. Opens in editor with special AM log rendering
6. Sees commands highlighted in blue, output in white
7. Clicks "🤖 Summarize" button
8. Ctrl+Shift+5 prompt pastes into terminal:
   "Read and analyze the AM session log in ./am/..."
9. User pastes to Claude/Copilot
10. Receives 200-word summary of session
```

**Seamless integration of AM logs with AI workflow.**

---

### 4. Theme Synchronization System

#### 4.1 Parent-Child Relationship

**Default Behavior (🔒 Locked)**:
```
Terminal Tab 1 (Molten Metal, Dark Mode)
  └─ Editor Tab: main.js (🔒 Inherits Molten Metal, Dark Mode)

User changes Terminal Tab 1 → Deep Ocean
  └─ Editor Tab: main.js (🔒 Auto-updates to Deep Ocean)

User toggles Terminal Tab 1 → Light Mode
  └─ Editor Tab: main.js (🔒 Auto-updates to Light Mode)
```

**Visual Indicator**:
- Locked: 🔒 icon in editor tab title, filled padlock
- Unlocked: 🔓 icon in editor tab title, open padlock

**Unlocking Behavior (🔓)**:
```
User clicks 🔓 on Editor Tab: main.js
  └─ Editor now independent

User changes Terminal Tab 1 → Emerald Forest
  └─ Editor Tab: main.js (🔓 Stays on Deep Ocean)
```

**Persistence**:
- Lock state saved in session storage per editor tab
- On app restart, locked tabs reconnect to parent terminal
- Orphaned editors (parent terminal closed) default to global theme

#### 4.2 Split Panel Theme Inheritance

**Split panel always inherits from host terminal tab**:
```
Terminal Tab 1 (Rose Gold, Dark Mode)
  ├─ Terminal pane: Rose Gold Dark
  └─ Editor pane (split): Rose Gold Dark (always synced)
```

**Why?**:
- Split panel is part of the terminal tab's visual context
- No lock/unlock option for split mode
- Converting to tab (pop out) enables lock/unlock

---

### 5. Keyboard Shortcuts

#### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Toggle file browser sidebar |
| `Ctrl+E` | Toggle editor panel (split view) |
| `Ctrl+Shift+E` | Open file picker (fuzzy search) |
| `Ctrl+P` | Quick open file (VS Code style) |
| `Ctrl+Shift+F` | Focus file browser search |
| `` Ctrl+` `` | Toggle focus: Terminal ↔ Editor |

#### Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+F` | Find in file |
| `Ctrl+H` | Find and replace |
| `Alt+Click` | Add cursor (multi-cursor) |
| `Ctrl+/` | Toggle comment |
| `Ctrl+]` | Increase indent |
| `Ctrl+[` | Decrease indent |

#### File Tree Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑↓` | Navigate files |
| `Enter` | Open file/expand folder |
| `Space` | Preview file (quick look) |
| `Delete` | Delete file/folder |
| `F2` | Rename |
| `Ctrl+C` | Copy path |

---

### 6. Settings & Configuration

#### New Settings Panel Section: "File Management & Editor"

```
┌─ File Management & Editor ─────────────────────────┐
│                                                     │
│ File Browser                                        │
│ ├─ [✓] Show hidden files (.git, .env, etc.)        │
│ ├─ [✓] Dimmed appearance for .gitignore entries    │
│ │      Opacity: [60%          ] (30-100%)          │
│ ├─ [✓] Collapse node_modules by default            │
│ ├─ [ ] Collapse .git by default                    │
│ └─ [✓] Follow terminal directory (sync pwd)        │
│                                                     │
│ Monaco Editor                                       │
│ ├─ Font Family: [Fira Code          ▼]            │
│ ├─ Font Size: [14px] (synced with terminal)        │
│ ├─ [✓] Enable IntelliSense (auto-completion)       │
│ ├─ [✓] Auto-save after idle: [2s]                  │
│ ├─ [✓] Show minimap                                │
│ ├─ [✓] Show line numbers                           │
│ └─ [ ] Vim keybindings (experimental)              │
│                                                     │
│ Split Panel                                         │
│ ├─ Default ratio: [60/40 ▼] (Terminal/Editor)     │
│ │                  Options: 50/50, 60/40, 70/30    │
│ ├─ [✓] Remember split ratio per session            │
│ └─ Position: [Right ▼] (Editor panel placement)    │
│                                                     │
│ Editor Tabs                                         │
│ ├─ [✓] Lock theme to parent terminal by default    │
│ ├─ [ ] Always open files in new editor tab         │
│ │      (vs split panel by default)                 │
│ └─ [✓] Confirm before closing unsaved editors      │
│                                                     │
│ "Send to Terminal" Behavior                         │
│ ├─ Files:   [Paste relative path ▼]               │
│ │           Options:                               │
│ │           - Paste relative path (./file.js)      │
│ │           - Paste absolute path                  │
│ │           - Paste filename only                  │
│ └─ Folders: [cd + ls + Enter ▼]                   │
│             Options:                                │
│             - cd + ls and execute                   │
│             - cd only (no ls, no enter)            │
│             - Paste path only                       │
│                                                     │
│ AM Log Viewer                                       │
│ ├─ [✓] Syntax highlight commands vs output         │
│ ├─ [✓] Make file paths clickable                   │
│ └─ [✓] Show metadata banner                        │
│                                                     │
└─────────────────────────────────────[Save]─────────┘
```

---

### 7. Command Cards Integration

#### New Default Command Cards (v1.9.2)

```
📋 Card 6: "Open Config"
Command: Opens ~/.forge/config.json in editor
Shortcut: Ctrl+Shift+6
Icon: emoji-gear (⚙️)
Paste-only: false (opens directly)

📋 Card 7: "View AM Logs"
Command: Opens file picker filtered to ./am/*.md
Shortcut: Ctrl+Shift+7
Icon: emoji-book (📖)
Paste-only: false (opens picker)

📋 Card 8: "Quick Open File"
Command: Opens fuzzy file search (Ctrl+P)
Shortcut: Ctrl+Shift+8
Icon: emoji-folder (📁)
Paste-only: false (opens search)
```

**Updated Default Commands Count**: 8 total (was 5 in v1.9.1)

---

### 8. Technical Implementation

#### 8.1 Frontend Architecture

**New Components**:
```
src/components/
├── FileExplorer/
│   ├── FileTree.jsx              # Recursive tree component
│   ├── FileItem.jsx               # File/folder item with icons
│   ├── FileContextMenu.jsx        # Right-click menu
│   ├── Breadcrumb.jsx             # Path navigation
│   ├── FileSearch.jsx             # Quick search in tree
│   └── GitIgnoreParser.jsx        # Parse .gitignore for dimming
│
├── MonacoEditor/
│   ├── MonacoEditorWrapper.jsx    # Monaco integration
│   ├── EditorToolbar.jsx          # Save/Run/Close controls
│   ├── EditorTab.jsx              # Tab component for editors
│   ├── SplitPanel.jsx             # Terminal + Editor split
│   ├── PanelResizer.jsx           # Drag handle for resizing
│   └── ThemeSyncManager.jsx       # 🔒/🔓 theme inheritance
│
├── AMLogViewer/
│   ├── AMLogEditor.jsx            # Special AM log rendering
│   ├── AMSyntaxHighlighter.jsx    # Command vs output colors
│   └── AMLogToolbar.jsx           # Summarize/Copy actions
│
└── TabManager/
    ├── TabTypes.jsx               # 🖥️ Terminal, 📝 Editor, 📄 Viewer
    ├── EditorTabComponent.jsx     # Full-screen editor tab
    └── TabThemeLock.jsx           # 🔒/🔓 padlock UI
```

**State Management**:
```javascript
// New state slices
const fileExplorerState = {
  currentPath: string,           // Current directory
  expandedFolders: string[],     // Expanded folder paths
  selectedFile: string | null,   // Currently selected file
  gitignoreEntries: string[],    // Parsed .gitignore patterns
  sortBy: 'name' | 'modified',   // Sort order
};

const editorState = {
  openFiles: Map<fileId, {
    path: string,
    content: string,
    modified: boolean,
    language: string,
    parentTabId: string | null,  // For theme locking
    themeLocked: boolean,         // 🔒 or 🔓
  }>,
  activeEditorId: string | null,
  splitRatio: number,             // 0-100 (% for terminal)
  splitMode: 'horizontal',        // Only horizontal for now
};

const tabState = {
  tabs: Tab[],  // Existing
  editorTabs: EditorTab[],  // New: separate editor tabs
  tabThemeLinks: Map<editorTabId, terminalTabId>,  // Lock tracking
};
```

#### 8.2 Backend API

**New Endpoints**:
```go
// File system operations
GET    /api/files/list?path={path}             // List directory contents
GET    /api/files/read?path={path}              // Read file content
POST   /api/files/write                         // Write file content
       Body: { path: string, content: string }
PUT    /api/files/rename                        // Rename file/folder
       Body: { oldPath: string, newPath: string }
DELETE /api/files/delete?path={path}            // Delete file/folder
POST   /api/files/mkdir                         // Create directory
       Body: { path: string }

// File metadata
GET    /api/files/stat?path={path}              // File stats (size, mtime, permissions)
GET    /api/files/gitignore?path={path}         // Parse .gitignore for directory
GET    /api/files/language?path={path}          // Detect language from extension

// Editor operations
POST   /api/files/execute                       // Execute file (node, python, etc.)
       Body: { path: string, args: string[] }
GET    /api/files/git-diff?path={path}          // Git diff for file (if in repo)

// Integration
POST   /api/terminal/send-text                  // Send text to terminal
       Body: { tabId: string, text: string, execute: boolean }
POST   /api/terminal/execute-command             // Execute command in terminal
       Body: { tabId: string, command: string }
```

**File System Security**:
- Restrict operations to user's home directory and below
- No access to system files (`/etc`, `/sys`, `/proc`)
- Symlink resolution with cycle detection
- File size limits (10MB for editor, configurable)

#### 8.3 Monaco Bundle Integration

**Webpack Configuration**:
```javascript
// Monaco loader configuration
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};
```

**Bundle Size Impact**:
- Monaco editor: ~2.5MB gzipped
- Workers: ~500KB gzipped
- Total impact: ~3MB added to bundle
- **Mitigation**: Code splitting, lazy load Monaco on first editor open

---

### 9. Visual Design Specifications

#### 9.1 File Tree Styling

**Regular File**:
```css
.file-item {
  padding: 4px 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition: background 150ms;
}
.file-item:hover {
  background: var(--hover-bg);
}
```

**Gitignored File** (60% opacity, italic):
```css
.file-item.gitignored {
  opacity: 0.6;
  font-style: italic;
  color: var(--text-muted);
}
.file-item.gitignored::before {
  content: "⊘ ";  /* Optional: strikethrough icon */
  opacity: 0.5;
}
```

**Folder**:
```css
.file-item.folder {
  font-weight: 500;
}
.file-item.folder.expanded::before {
  content: "📂 ";
}
.file-item.folder.collapsed::before {
  content: "📁 ";
}
```

#### 9.2 Editor Theme Mapping

| Forge Theme | Monaco Theme | Mode |
|-------------|--------------|------|
| Molten Metal | monokai | Dark |
| Deep Ocean | vs-dark | Dark |
| Emerald Forest | github-dark | Dark |
| Midnight Purple | night-owl | Dark |
| Rose Gold | dracula | Dark |
| Arctic Frost | vs-light | Light |
| High Contrast Dark | hc-black | Dark |
| High Contrast Light | hc-light | Light |
| Blue/Yellow CVD | custom-cvd-1 | Dark |
| Yellow/Purple CVD | custom-cvd-2 | Dark |

**Custom CVD Themes**: Create custom Monaco themes matching our accessibility color palettes.

#### 9.3 Split Panel Resizer

```css
.split-panel-resizer {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  position: relative;
  transition: background 150ms;
}
.split-panel-resizer:hover {
  background: var(--accent);
}
.split-panel-resizer::before {
  content: "";
  position: absolute;
  left: -4px;
  right: -4px;
  top: 0;
  bottom: 0;
}
```

**Drag Behavior**:
- Minimum widths: Terminal 30%, Editor 20%
- Smooth dragging with requestAnimationFrame
- Double-click resizer to reset to default ratio
- Show percentage tooltip while dragging

---

### 10. Testing Strategy

#### 10.1 E2E Tests (Playwright)

**File Explorer Tests**:
```javascript
test('should display file tree synced with terminal pwd', async ({ page }) => {
  // Navigate in terminal
  await terminal.executeCommand('cd src');
  
  // File tree should update
  await expect(fileTree).toContainText('src');
  await expect(breadcrumb).toHaveText('/home/user/project/src');
});

test('should dim .gitignore entries', async ({ page }) => {
  // Open project with .gitignore
  const gitignoreFile = page.locator('.file-item:has-text("node_modules")');
  
  // Should have dimmed class
  await expect(gitignoreFile).toHaveClass(/gitignored/);
  await expect(gitignoreFile).toHaveCSS('opacity', '0.6');
});

test('should open file in split panel on double-click', async ({ page }) => {
  await page.dblclick('.file-item:has-text("main.js")');
  
  await expect(editor).toBeVisible();
  await expect(editorTitle).toHaveText('main.js');
  await expect(splitPanel).toHaveAttribute('data-ratio', '60/40');
});
```

**Editor Tests**:
```javascript
test('should sync editor theme with terminal tab', async ({ page }) => {
  // Open editor in split
  await openFileInEditor('main.js');
  
  // Change terminal theme
  await changeTheme('Deep Ocean');
  
  // Editor should update
  await expect(editor).toHaveAttribute('data-theme', 'vs-dark');
});

test('should maintain independent theme when unlocked', async ({ page }) => {
  await openFileInEditorTab('main.js');
  
  // Unlock theme
  await page.click('.theme-lock-icon');
  await expect('.theme-lock-icon').toHaveClass(/unlocked/);
  
  // Change parent terminal theme
  await changeTerminalTheme('Molten Metal');
  
  // Editor should NOT change
  await expect(editorTab).toHaveAttribute('data-theme', 'vs-dark');
});

test('should execute file with Run button', async ({ page }) => {
  await openFileInEditor('test.js');
  await page.click('.editor-toolbar button:has-text("Run")');
  
  // Output should appear in terminal
  await expect(terminal).toContainText('Hello World');
});
```

**"Send to Terminal" Tests**:
```javascript
test('should paste filename when sending file to terminal', async ({ page }) => {
  await page.click('.file-item:has-text("deploy.sh")', { button: 'right' });
  await page.click('.context-menu-item:has-text("Send to Terminal")');
  
  // Should paste relative path
  await expect(terminal).toContainText('./deploy.sh');
  
  // Cursor should be after pasted text
  const cursorPos = await terminal.getCursorPosition();
  expect(cursorPos.column).toBeGreaterThan(13);
});

test('should cd to directory when sending folder to terminal', async ({ page }) => {
  await page.click('.file-item:has-text("src")', { button: 'right' });
  await page.click('.context-menu-item:has-text("Open in Terminal")');
  
  // Should execute cd command
  await expect(terminal).toContainText('cd src && ls');
  await expect(fileTree).toShowDirectory('/home/user/project/src');
});
```

#### 10.2 Unit Tests

**GitIgnore Parser**:
```javascript
test('parseGitignore should identify ignored files', () => {
  const gitignore = `
    node_modules/
    *.log
    .env
    dist/
  `;
  
  const parser = new GitIgnoreParser(gitignore);
  
  expect(parser.isIgnored('node_modules/pkg.json')).toBe(true);
  expect(parser.isIgnored('debug.log')).toBe(true);
  expect(parser.isIgnored('.env')).toBe(true);
  expect(parser.isIgnored('src/main.js')).toBe(false);
});
```

**Theme Sync Logic**:
```javascript
test('should sync editor theme when locked', () => {
  const editor = new EditorTab({ parentTabId: 'term1', locked: true });
  const terminal = { theme: 'Molten Metal', mode: 'dark' };
  
  editor.syncTheme(terminal);
  
  expect(editor.monacoTheme).toBe('monokai');
});

test('should not sync editor theme when unlocked', () => {
  const editor = new EditorTab({ parentTabId: 'term1', locked: false, theme: 'vs-dark' });
  const terminal = { theme: 'Emerald Forest', mode: 'dark' };
  
  editor.syncTheme(terminal);
  
  expect(editor.monacoTheme).toBe('vs-dark'); // unchanged
});
```

---

### 11. Performance Considerations

#### 11.1 File Tree Performance

**Lazy Loading**:
- Only load first 2 levels on mount
- Load deeper levels on folder expansion
- Virtualize list if > 100 items in folder
- Debounce search input (300ms)

**File Watching**:
- Use native file watchers (fsevents on macOS, inotify on Linux)
- Batch updates (max 10 events/second)
- Ignore rapid changes in `node_modules`

#### 11.2 Monaco Editor Performance

**Lazy Loading**:
- Load Monaco bundle only when first editor opens
- Show loading spinner during bundle load (200ms)
- Cache compiled Monaco in memory

**Memory Management**:
- Dispose Monaco instances when editor closes
- Limit to 5 open editors max (close oldest if exceeded)
- Clear undo history for large files (> 1MB)

**Large File Handling**:
- Warn if file > 1MB: "Large file, editor may be slow"
- Disable IntelliSense for files > 5MB
- Read-only mode for files > 10MB

---

### 12. Migration Path

#### 12.1 Backward Compatibility

**Existing Users**:
- File explorer hidden by default on first launch
- Show one-time tutorial tooltip: "New: File Explorer (Ctrl+B)"
- All existing features unchanged
- No breaking changes to command cards or tabs

**Session Storage**:
- Extend session format to include:
  ```json
  {
    "tabs": [...],
    "editorTabs": [
      {
        "id": "editor-abc123",
        "filePath": "/home/user/main.js",
        "parentTabId": "term-xyz789",
        "themeLocked": true,
        "unsavedChanges": false
      }
    ],
    "fileExplorerCollapsed": false,
    "activeEditorId": "editor-abc123"
  }
  ```

#### 12.2 Settings Migration

**New Default Settings**:
```json
{
  "fileExplorer": {
    "showHiddenFiles": true,
    "dimGitignored": true,
    "gitignoreOpacity": 0.6,
    "followTerminalPwd": true
  },
  "editor": {
    "fontFamily": "Fira Code",
    "enableIntelliSense": true,
    "autoSaveDelay": 2000,
    "showMinimap": true
  },
  "splitPanel": {
    "defaultRatio": 60,
    "rememberRatio": true
  },
  "editorTabs": {
    "lockThemeByDefault": true,
    "confirmCloseUnsaved": true
  }
}
```

---

### 13. Documentation Updates

#### 13.1 README.md Additions

**New Features Section**:
```markdown
### File Management & Editor
- **📁 Visual File Explorer**: Browse files without `cd` commands
- **📝 Monaco Editor**: Full VS Code-style code editing
- **🔄 Split Panel**: Edit files alongside terminal (adjustable ratio)
- **📑 Editor Tabs**: Pop out editors to separate tabs
- **🔒 Theme Sync**: Editor themes lock to parent terminal (unlockable)
- **📂 "Send to Terminal"**: Right-click files/folders to interact with terminal
- **👁️ GitIgnore Aware**: Dimmed appearance for ignored files (60% opacity)
- **📖 AM Log Viewer**: Enhanced markdown viewer for AM session logs
```

#### 13.2 User Guide Additions

**New Section: "File Explorer & Editor"**
- How to open file explorer (Ctrl+B)
- Navigating directories visually
- "Send to Terminal" workflows
- Opening files in split panel vs separate tabs
- Theme locking/unlocking
- Keyboard shortcuts reference
- Editing AM logs
- Settings customization

---

### 14. Release Timeline

#### Milestone 1: Foundation (v1.10.0) - 2 weeks
- ✅ File explorer sidebar (Files + Cards tabs)
- ✅ File tree rendering (all files, gitignore dimming)
- ✅ Basic navigation (click, expand, breadcrumb)
- ✅ Right-click context menu
- ✅ "Send to Terminal" for files and folders
- ✅ Terminal pwd sync
- ✅ Collapsible sidebar (Ctrl+B)

**Testing Focus**: File tree rendering, gitignore parsing, terminal sync

---

#### Milestone 2: Monaco Integration (v1.10.5) - 3 weeks
- ✅ Monaco editor bundle integration
- ✅ Split panel layout (terminal + editor)
- ✅ Open files in split panel (double-click)
- ✅ Adjustable split ratio (drag handle)
- ✅ Editor toolbar (Save, Run, Close)
- ✅ Auto-save functionality
- ✅ Syntax highlighting (40+ languages)
- ✅ Basic IntelliSense

**Testing Focus**: Editor functionality, split panel resizing, save/run

---

#### Milestone 3: Editor Tabs (v1.11.0) - 2 weeks
- ✅ Pop out editor to separate tab
- ✅ Editor tab type (📝 icon)
- ✅ Full-screen Monaco in tab
- ✅ "Merge to Terminal" (convert back to split)
- ✅ Theme sync system (🔒/🔓 padlock)
- ✅ Parent-child theme inheritance
- ✅ Unlock and customize editor themes

**Testing Focus**: Tab management, theme synchronization, lock/unlock

---

#### Milestone 4: Polish & Features (v1.11.5) - 2 weeks
- ✅ Quick open file (Ctrl+P fuzzy search)
- ✅ File search in tree (Ctrl+Shift+F)
- ✅ AM log special viewer
- ✅ Command cards integration (Cards 6-8)
- ✅ Git diff indicators in editor
- ✅ Settings panel for file/editor options
- ✅ Keyboard navigation in file tree

**Testing Focus**: Quick open, AM viewer, settings, keyboard nav

---

#### Milestone 5: Production Ready (v1.12.0) - 1 week
- ✅ Performance optimization (lazy loading, virtualization)
- ✅ Comprehensive E2E tests
- ✅ Documentation (README, user guide, API docs)
- ✅ Bug fixes from beta testing
- ✅ Accessibility audit (screen reader, keyboard-only)

**Testing Focus**: Performance benchmarks, full regression suite

---

**Total Timeline**: 10 weeks (2.5 months)

---

### 15. Success Metrics

**User Adoption**:
- 30% of users open file explorer within first session
- 20% of users edit files in Monaco editor
- 10% of users create editor tabs (pop out)

**Productivity**:
- Average time to open file: < 3 seconds (vs 10s with terminal commands)
- Files per session: Increase from 0 to 2-3 average

**Quality**:
- < 5 bugs reported in first month
- 95% uptime (no crashes related to editor)
- Editor load time < 1 second

---

### 16. Future Enhancements (Post-v1.12.0)

**Not in v1.9.2, but planned**:
- 📄 **Viewer Tabs**: Read-only markdown preview tabs (no editing)
- 🔍 **Global File Search**: Search across all files in project (Ctrl+Shift+F)
- 📝 **Multi-file Editing**: Split view with 2+ editors side-by-side
- 🔄 **File History**: Undo/redo across sessions
- 🎨 **Custom Monaco Themes**: Import/export VS Code themes
- 🐙 **Git Integration**: Stage/commit from file explorer
- 📦 **Project Support**: Remember last opened directory per project
- 🔌 **Extension API**: Plugin system for custom file handlers
- 🌐 **Remote Files**: Edit files over SSH/SFTP
- 💾 **Backup System**: Auto-backup edited files every 5 minutes

---

## 🎯 Summary

This plan delivers a **fully-integrated, professional-grade file management and editing system** that:

1. ✅ **Serves beginners**: Visual file browser eliminates `cd` commands
2. ✅ **Empowers developers**: Full Monaco editor with IntelliSense
3. ✅ **Maintains identity**: Terminal-first, files as enhancement
4. ✅ **Feels native**: Consistent themes, keyboard shortcuts, design language
5. ✅ **Zero configuration**: Works immediately after update
6. ✅ **Theme flexibility**: Lock/unlock editor themes independently

**Key Innovations**:
- **"Send to Terminal"**: Bridge GUI and CLI seamlessly
- **Theme Sync System**: 🔒/🔓 padlock for parent-child theme inheritance
- **Split + Tab modes**: Flexible workflow (edit alongside terminal OR full-screen)
- **GitIgnore Awareness**: Dimmed files provide visual context
- **AM Log Integration**: Special viewer with AI summary button

**Bundle Impact**: +3MB (Monaco editor)
**Timeline**: 10 weeks
**Risk**: Low - additive changes, no breaking modifications

---

**Next Steps**: Review and approve plan, then begin Milestone 1 implementation.
