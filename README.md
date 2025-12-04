# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

![Forge Terminal Screenshot](https://via.placeholder.com/800x500?text=Forge+Terminal+Screenshot)

## Features

- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, and `claude`.
- **⚡ Command Cards**: Save frequently used commands (e.g., complex AI prompts).
- **⌨️ Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1`, `Ctrl+Shift+2`, etc.
- **🎨 Beautiful UI**: Dark mode by default, inspired by Catppuccin Mocha.
- **💾 Persistent**: Commands are saved to `~/.forge/commands.json`.

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
3. **Manage Commands**:
   - Click **+ Add** to create a new command card.
   - **Execute (▶️)**: Pastes the command and presses Enter.
   - **Paste (📋)**: Pastes the command into the terminal (useful for editing before running).
   - **Edit (✏️)**: Modify existing commands.
4. **Keyboard Shortcuts**:
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

### Cross-Platform Build
```bash
make build-all
```

## License
MIT
