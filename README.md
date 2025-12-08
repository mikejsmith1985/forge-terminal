# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

![Forge Terminal Screenshot](https://via.placeholder.com/800x500?text=Forge+Terminal+Screenshot)

## ✨ Features

### Core Terminal
- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full PTY Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, `claude`, and more.
- **📑 Multi-Tab Support**: Open up to 20 terminal tabs with drag-and-drop reordering.
- **💾 Session Persistence**: Tabs, themes, and positions are restored automatically across restarts.
- **🔍 Terminal Search**: Find text in terminal output with match highlighting.

### Command Cards
- **⚡ Quick Commands**: Save frequently used commands with descriptions and icons.
- **🎭 Emoji & Lucide Icons**: Choose from 40+ colorful emoji icons or professional Lucide icons for command cards.
- **⌨️ Keyboard Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1` through `Ctrl+Shift+9` (and beyond with letters).
- **📋 Paste vs Execute**: Choose to paste commands for editing or execute immediately.
- **🔄 Drag & Drop**: Reorder command cards to your preference.
- **⭐ Favorites**: Mark important commands as favorites.

### Theming & Customization
- **🎨 10 Color Themes**: Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost, plus 4 high-contrast accessibility themes.
- **🌗 Per-Tab Light/Dark Mode**: Each tab can independently toggle between light and dark modes (10 themes × 2 modes = 20 unique visuals).
- **♿ High-Contrast Themes**: Includes color-blind friendly themes for visual accessibility.
- **📏 Font Size Control**: Adjust terminal font size (10-24px).
- **📐 Flexible Layout**: Position the command sidebar on the left or right.
- **🎯 Per-Tab Themes**: Each tab can have its own color theme.

### Windows-Specific Features
- **🐚 Shell Selection**: Switch between CMD, PowerShell, and WSL.
- **🐧 WSL Integration**: Native WSL support with automatic distro detection.
- **📂 Path Translation**: Automatic conversion of Windows paths to WSL paths.

### Quality of Life
- **📖 AM (Artificial Memory)**: Optional per-tab session logging for crash recovery and context restoration. Logs are stored in `./am/` directory.
- **🔄 Auto-Updates**: Automatic update checking with one-click installation.
- **📜 Version History**: View and rollback to previous versions.
- **🤖 Auto-Respond**: Auto-respond to CLI confirmation prompts (per-tab toggle).
- **📍 Scroll to Bottom**: Quick button to jump to latest output.
- **🔌 Disconnect Reasons**: Clear messages when terminal sessions end.
- **🖥️ Desktop Shortcut**: Create a desktop shortcut from Settings for quick access.

## Installation

Download the latest release for your platform from the [Releases](https://github.com/mikejsmith1985/forge-terminal/releases) page.

### Windows
Download `forge-windows-amd64.exe` and double-click it.

> **⚠️ Windows Troubleshooting**
> 
> **SmartScreen Warning**: Since the binary isn't code-signed, Windows may show "Windows protected your PC". Click "More info" → "Run anyway", or right-click the file → Properties → check "Unblock" → OK.
>
> **Requirements**: Windows 10 version 1809 (October 2018 Update) or later is required for ConPTY support.
>
> **PowerShell**: The terminal uses CMD by default. Switch to PowerShell or WSL via the shell toggle or settings.
>
> **Firewall**: If the browser opens but shows a connection error, check that your firewall allows localhost connections. The app tries ports 8333, 8080, 9000, 3000, 3333 in order.

### macOS
Download `forge-darwin-amd64` (Intel) or `forge-darwin-arm64` (Apple Silicon).
```bash
chmod +x forge-darwin-*
./forge-darwin-arm64
```

> **⚠️ macOS Gatekeeper Security Warning**
>
> **"Cannot verify developer" error?** This is normal—the binary needs code signing. Choose one:
> 
> **Quick Fix** (Recommended):
> 1. **Right-click** the binary → **Open** → **Open** in the security dialog
> 2. Or use Terminal: `xattr -d com.apple.quarantine ./forge-darwin-arm64 && ./forge-darwin-arm64`
>
> **Full Solution** (No warnings on future updates):
> - Fork the repository and set up code signing with your own Apple Developer ID
> - See [Fork & Self-Sign Guide](docs/developer/macos-fork-setup.md) for instructions
> - Once configured, your releases will be automatically notarized

### Linux
Download `forge-linux-amd64`.
```bash
chmod +x forge-linux-amd64
./forge-linux-amd64
```

## ⌨️ Keyboard Shortcuts

### Tab Management
| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+1-9` | Switch to tab by number |
| `Ctrl+Tab` | Cycle through tabs |
| `Ctrl+Shift+Tab` | Cycle backwards through tabs |

### Terminal
| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Open search bar |
| `Enter` | Find next match (in search) |
| `Shift+Enter` | Find previous match (in search) |
| `Escape` | Close search |
| `Ctrl+End` | Scroll to bottom |

### Command Cards
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+1` | Execute/Paste Command #1 |
| `Ctrl+Shift+2` | Execute/Paste Command #2 |
| `Ctrl+Shift+...` | Execute/Paste Command #N |
| `Ctrl+Shift+0` | Execute/Paste Command #10 |
| `Ctrl+Shift+A-Z` | Execute/Paste Commands #11+ |

## 🚀 Usage

1. **Run the app**: It will automatically open your default browser (typically at `http://127.0.0.1:8333`). If that port is busy, it will try other ports automatically.

2. **Use the Terminal**: Works just like your system terminal. Supports all interactive programs.

3. **Manage Command Cards**:
   - Click **+ Add** to create a new command card.
   - Choose an **emoji** 🎨 or **icon** for visual identification.
   - **Execute (▶️)**: Pastes the command and presses Enter.
   - **Paste (📋)**: Pastes the command into the terminal (for editing before running).
   - **Edit (✏️)**: Modify existing commands.
   - **Drag**: Reorder cards by dragging.

4. **Customize Appearance**:
   - Click the **palette icon** to cycle through 10 color themes.
   - **Right-click a tab** and select "Light Mode" or "Dark Mode" for per-tab themes.
   - Use **+/-** buttons to adjust font size.
   - Click the **panel icon** to move sidebar left/right.

5. **Enable AM Logging** (Optional):
   - Right-click a tab → "AM Logging" to enable session recording.
   - Logs are saved to `./am/` directory.
   - Use the "📖 Summarize Last Session" command card to review previous work.

6. **Windows Shell Selection**:
   - Click the shell indicator (CMD/PS/WSL) to cycle through shells.
   - Use the **settings gear** for detailed WSL configuration.

## 🔄 Updating Forge Terminal

Forge Terminal checks for updates automatically. When an update is available:

1. A notification toast appears in the bottom-right corner
2. Click **"View Update"** or click the download icon in the sidebar
3. The Update modal opens showing the new version and release notes
4. Click **"Update Now"** to download and apply the update
5. A **new browser tab** opens automatically with the updated version
6. The old tab remains open but becomes unresponsive (the server process has been replaced)

**After the update:**
- **Close the old tab** and continue using the new tab with the updated version, OR
- **Press Refresh (F5 or Ctrl+R)** in the old tab to reconnect to the new server

If the spacebar or other features don't work in a tab after an update, simply refresh that tab to reconnect with the new server.

## 🛠️ Development

### Prerequisites
- Go 1.21+
- Node.js 18+ (for frontend build)

### Build from Source

```bash
# 1. Clone the repo
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal

# 2. Build Frontend
cd frontend
npm install
npm run build
cd ..

# 3. Build Binary
go build -o bin/forge ./cmd/forge

# 4. Run
./bin/forge
```

### Run Tests

```bash
# Unit tests
cd frontend && npm run test

# End-to-end tests (requires Playwright)
cd frontend && npx playwright test
```

### Cross-Platform Build
```bash
make build-all
```

## 📁 Configuration

Forge Terminal stores configuration in `~/.forge/`:

| File | Purpose |
|------|---------|
| `commands.json` | Saved command cards |
| `config.json` | Shell and app settings |
| `sessions.json` | Tab state for session restore |
| `welcome_shown` | Tracks if welcome screen was shown for current version |

AM logs are stored in the working directory:
- `./am/` - Active session logs (Markdown format)
- `./am_archive/` - Archived logs from completed sessions

## Changelog

### v1.16.1
- **Update Modal Cleanup**: Removed dead hard-refresh code that never executed
- **16 New Unit Tests**: Comprehensive test coverage for update flow
- **Improved Documentation**: Clear README guide for updating and spacebar recovery
- **Better UX Messages**: "Update applied. New version launching in new tab..." message

### v1.9.0 (Latest)
- **Per-Tab Light/Dark Mode**: Each tab can independently toggle between light and dark modes (20 unique visual combinations)
- **Emoji Icons**: 40+ colorful emoji icons for command cards alongside existing Lucide icons
- **High-Contrast Accessibility Themes**: 4 new themes including color-blind friendly options (10 total themes)
- **Desktop Shortcut Creation**: Create desktop shortcuts from Settings > Installation
- **Enhanced Welcome Screen**: Updated with AM, Auto-Respond, Self-Naming Tabs, and accessibility info

### v1.8.0
- **Desktop Shortcut**: Create shortcuts from Settings modal
- **4 High-Contrast Themes**: Accessibility-focused themes for visual impairments
- **Welcome Screen Enhancements**: Added feature descriptions for AM, Auto-Respond, and Self-Naming Tabs

### v1.7.0
- **AM (Artificial Memory)**: Per-tab session logging for crash recovery
- **Self-Naming Tabs**: Tabs automatically rename to current working directory
- **Auto-Respond**: Per-tab toggle for CLI confirmation prompt automation

### v1.6.0
- **Welcome Screen**: First-launch splash screen with feature overview
- **Enhanced Documentation**: Comprehensive README with all features documented
- **Prompt Watcher**: Auto-respond to CLI confirmation prompts (per-tab toggle)
- **Disconnect Reasons**: Clear messages when terminal sessions end

### v1.5.7
- Bug fixes for tab creation and theme application
- Improved prompt watcher reliability

### v1.5.0
- **Session Persistence**: Tabs are now restored automatically when you refresh or restart the app
- **Terminal Search**: Find text in terminal output with `Ctrl+F` (prev/next navigation, highlights matches)

### v1.4.2
- Per-tab color theming
- Bug fixes for max tabs warning

### v1.4.0
- Multi-tab terminal support (up to 20 tabs)
- Tab keyboard shortcuts (`Ctrl+T`, `Ctrl+W`, `Ctrl+1-9`)

### v1.3.9
- 6 color themes
- Sidebar positioning (left/right)
- Font size controls
- Auto-update system

## License
MIT
