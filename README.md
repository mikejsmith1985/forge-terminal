# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

![Forge Terminal Screenshot](https://via.placeholder.com/800x500?text=Forge+Terminal+Screenshot)

## Features

- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, and `claude`.
- **📑 Multi-Tab Support**: Open multiple terminal tabs (up to 20) with `Ctrl+T`.
- **⚡ Command Cards**: Save frequently used commands (e.g., complex AI prompts).
- **⌨️ Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1`, `Ctrl+Shift+2`, etc.
- **🔍 Terminal Search**: Find text in terminal output with `Ctrl+F`.
- **💾 Session Persistence**: Tabs are restored automatically when you refresh or restart.
- **🎨 Beautiful UI**: 6 color themes (Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost).
- **🔄 Auto-Updates**: Automatically checks for new versions and offers one-click updates.

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
> **PowerShell**: The terminal uses PowerShell by default. If you have issues, ensure PowerShell is available and not restricted by execution policies.
>
> **Firewall**: If the browser opens but shows a connection error, check that your firewall allows localhost connections. The app tries ports 8333, 8080, 9000, 3000, 3333 in order.

### macOS
Download `forge-darwin-amd64` (Intel) or `forge-darwin-arm64` (Apple Silicon).
```bash
chmod +x forge-darwin-*
./forge-darwin-arm64
```

### Linux
Download `forge-linux-amd64`.
```bash
chmod +x forge-linux-amd64
./forge-linux-amd64
```

## Usage

1. **Run the app**: It will automatically open your default browser (typically at `http://127.0.0.1:8333`). If that port is busy, it will try other ports automatically.
2. **Use the Terminal**: It works just like your system terminal.
3. **Manage Tabs**:
   - `Ctrl+T`: New tab
   - `Ctrl+W`: Close current tab
   - `Ctrl+1-9`: Switch to tab by number
   - `Ctrl+Tab`: Cycle through tabs
4. **Search in Terminal**:
   - `Ctrl+F`: Open search bar
   - Type to search, use prev/next buttons or `Enter`/`Shift+Enter`
   - `Escape`: Close search
5. **Manage Commands**:
   - Click **+ Add** to create a new command card.
   - **Execute (▶️)**: Pastes the command and presses Enter.
   - **Paste (📋)**: Pastes the command into the terminal (useful for editing before running).
   - **Edit (✏️)**: Modify existing commands.
6. **Command Shortcuts**:
   - `Ctrl+Shift+1`: Run/Paste Command #1
   - `Ctrl+Shift+2`: Run/Paste Command #2
   - ...and so on.

## Development

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

## Changelog

### v1.5.0 (Latest)
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
