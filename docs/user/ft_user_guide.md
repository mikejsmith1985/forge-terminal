# 🔥 Forge Terminal User Guide

**The Easiest Way to Use AI Coding Tools**

---

## 📖 Table of Contents

1. [What is Forge Terminal?](#-what-is-forge-terminal)
2. [Getting Started](#-getting-started)
3. [The Terminal](#-the-terminal)
4. [Tabs - Run Multiple Terminals](#-tabs---run-multiple-terminals)
5. [Command Cards](#-command-cards)
6. [Keyboard Shortcuts](#-keyboard-shortcuts)
7. [Themes & Customization](#-themes--customization)
8. [Font Size Control](#-font-size-control)
9. [Resizable Sidebar](#-resizable-sidebar)
10. [Windows Features (CMD, PowerShell, WSL)](#-windows-features-cmd-powershell-wsl)
11. [Search Your Terminal](#-search-your-terminal)
12. [Auto-Respond (Prompt Watcher)](#-auto-respond-prompt-watcher)
13. [AM (Artificial Memory) Logging](#-am-artificial-memory-logging)
14. [Forge Assistant (Experimental)](#-forge-assistant-experimental)
15. [Vision Detection (Experimental)](#-vision-detection-experimental)
16. [Updates & Versions](#-updates--versions)
17. [Where Settings Are Saved](#-where-settings-are-saved)
18. [Technical Details](#-technical-details)
19. [Troubleshooting](#-troubleshooting)

---

## 🔥 What is Forge Terminal?

**Forge Terminal** is a terminal application designed to make using AI coding assistants (like Claude, GitHub Copilot, or any command-line AI tool) super easy.

### What Makes It Special?

Think of it like your computer's command prompt or terminal, but with superpowers:

- **One File = Everything**: Just download one file, double-click, and it works. No complicated setup!
- **Command Cards**: Save your favorite commands and run them with a single click or keyboard shortcut
- **Multiple Tabs**: Open up to 20 different terminals at once with per-tab customization
- **10 Beautiful Themes**: Choose from 10 color themes including high-contrast accessibility options
- **Per-Tab Modes**: Each tab can be light or dark mode independently (20 unique visual combinations)
- **AM Logging**: Optional session recording to never lose your work context
- **Works Everywhere**: Runs on Windows, Mac, and Linux

### The "One Binary, Double-Click, Works" Promise

Unlike many developer tools that need you to install Node.js, Python, Docker, or edit configuration files, Forge Terminal is self-contained. Everything you need is packed into a single file.

---

## 🚀 Getting Started

### Step 1: Download

Go to the [Releases page](https://github.com/mikejsmith1985/forge-terminal/releases) and download the file for your computer:

| Your Computer | Download This File |
|---------------|-------------------|
| **Windows** | `forge-windows-amd64.exe` |
| **Mac (Intel)** | `forge-darwin-amd64` |
| **Mac (Apple Silicon/M1/M2/M3)** | `forge-darwin-arm64` |
| **Linux** | `forge-linux-amd64` |

### Step 2: Run It

**On Windows:**
1. Double-click `forge-windows-amd64.exe`
2. If you see "Windows protected your PC", click "More info" → "Run anyway"

**On Mac or Linux:**
1. Open Terminal
2. Run these commands:
   ```bash
   chmod +x forge-darwin-arm64   # Makes it runnable
   ./forge-darwin-arm64          # Starts it
   ```

### Step 3: Use It!

Your web browser will automatically open to `http://127.0.0.1:8333` with Forge Terminal ready to use!

---

## 💻 The Terminal

The big area on the left side of the screen is your terminal. It works just like the terminal you already know:

### What You Can Do

- **Type commands** and press Enter to run them
- **Run interactive programs** like:
  - `vim` (text editor)
  - `htop` (system monitor)
  - `claude` (AI assistant)
  - Any command-line program!
- **Copy and paste** using `Ctrl+C` and `Ctrl+V` (or `Cmd+C`/`Cmd+V` on Mac)

### How It Works (The Technical Stuff)

Forge Terminal creates a "PTY" (pseudo-terminal), which is the same technology that lets programs like `ssh` work. This means interactive programs that need to know about your screen size, colors, and keyboard input all work perfectly.

The terminal display uses **xterm.js**, which is the same technology that powers VS Code's terminal. It supports:
- Full color (256 colors and true color)
- All keyboard keys including arrow keys, Ctrl, Alt, etc.
- Mouse support for programs that use it
- Scrollback history (you can scroll up to see old output)

---

## 📑 Tabs - Run Multiple Terminals

You can have up to **20 terminals** open at the same time, each in its own tab!

### Creating Tabs

- **Click the + button** next to your tabs
- **Press `Ctrl+T`** to create a new tab

### Switching Between Tabs

- **Click on a tab** to switch to it
- **Press `Ctrl+1` through `Ctrl+9`** to jump to tabs 1-9
- **Press `Ctrl+Tab`** to go to the next tab
- **Press `Ctrl+Shift+Tab`** to go to the previous tab

### Closing Tabs

- **Click the X** on a tab
- **Press `Ctrl+W`** to close the current tab
- **Middle-click** on a tab to close it

### Renaming Tabs

- **Double-click** on a tab's title to rename it
- **Right-click** on a tab and select "Rename"

### Tab Features

Each tab remembers:
- Its own **color theme** (you can have different colors for different tabs!)
- Its **shell type** (on Windows: CMD, PowerShell, or WSL)
- Its **auto-respond** setting (more on this later)

### Session Persistence

When you close Forge Terminal and open it again, **all your tabs come back** exactly as you left them! This includes:
- Tab names
- Which tab was active
- Each tab's theme and settings

---

## ⚡ Command Cards

Command Cards are the sidebar on the right (or left, you can move it!). They're your saved commands that you can trigger instantly.

### What's a Command Card?

Each card has:
- **Name**: A friendly title (like "🤖 Run Claude")
- **Description**: What the command does
- **The Command**: The actual text that gets sent to the terminal
- **Keyboard Shortcut**: A quick way to trigger it (like `Ctrl+Shift+1`)
- **Icon**: An emoji or icon to help you spot it quickly

### Pre-Made Commands

Forge Terminal comes with 5 default commands designed for AI coding:

| Command | What It Does |
|---------|-------------|
| 🤖 **Run Claude Code** | Types `claude` and runs it |
| 📝 **Design Command** | Pastes a prompt asking AI to design before coding |
| ⚡ **Execute Command** | Pastes a prompt to implement the design using TDD |
| 🛑 **F*** THIS!** | A "reset" prompt when the AI gets stuck in a loop |
| 📖 **Summarize Last Session** | AI prompt to read AM logs and summarize where you left off |

### Execute vs. Paste

There are two ways to use a command:

1. **Run Button (▶️)**: Pastes the command AND presses Enter (runs immediately)
2. **Paste Button (📋)**: Just pastes the command (so you can edit it first)

Some commands (like the AI prompts) are "paste only" - they don't have a Run button because you usually want to add more context before sending.

### Creating Your Own Commands

1. Click the **+ Add** button at the top of the sidebar
2. Fill in:
   - **Icon**: Choose from 40+ colorful emoji icons or professional Lucide icons
   - **Description**: A friendly name for the card
   - **Command**: The actual text to paste/run
   - **Keyboard Shortcut**: Automatically assigned, or customize it
   - **Paste Only**: Check if you don't want an Execute button
   - **Favorite**: Check to highlight it in yellow
3. Click **Save**

### Choosing Icons

When creating or editing a command, click the icon button to open the icon picker:

**Emoji Category** 🎭
- 40+ colorful emoji icons: 🤖 🚀 🔥 ✨ 💡 🎯 🏆 💎 and more!
- Perfect for personal projects and quick visual identification
- Works on all platforms (native emoji rendering)

**Other Categories**
- AI & Automation, Development, Git, Infrastructure, etc.
- Professional Lucide icons for a consistent look
- Great for team environments

### Reordering Commands

Drag cards by the **grip handle** (the dotted lines on the left) to reorder them.

### Keyboard Shortcuts for Commands

Commands automatically get shortcuts assigned:

| Position | Shortcut |
|----------|----------|
| Command 1 | `Ctrl+Shift+1` |
| Command 2 | `Ctrl+Shift+2` |
| Command 3 | `Ctrl+Shift+3` |
| ... | ... |
| Command 10 | `Ctrl+Shift+0` |
| Command 11 | `Ctrl+Shift+A` |
| Command 12 | `Ctrl+Shift+B` |
| And so on... | Letters A-Z |

---

## ⌨️ Keyboard Shortcuts

### Tab Management

| Shortcut | What It Does |
|----------|--------------|
| `Ctrl+T` | Open a new tab |
| `Ctrl+W` | Close the current tab |
| `Ctrl+1` through `Ctrl+9` | Jump to tab 1-9 |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |

### Terminal

| Shortcut | What It Does |
|----------|--------------|
| `Ctrl+F` | Open search bar |
| `Enter` (in search) | Find next match |
| `Shift+Enter` (in search) | Find previous match |
| `Escape` (in search) | Close search |
| `Ctrl+End` | Scroll to bottom of terminal |

### Command Cards

| Shortcut | What It Does |
|----------|--------------|
| `Ctrl+Shift+1` | Trigger Command #1 |
| `Ctrl+Shift+2` | Trigger Command #2 |
| `Ctrl+Shift+...` | Trigger Command #N |
| `Ctrl+Shift+0` | Trigger Command #10 |
| `Ctrl+Shift+A` through `Ctrl+Shift+Z` | Commands #11 and beyond |

---

## 🎨 Themes & Customization

### Color Themes

Forge Terminal has **10 beautiful color themes** including high-contrast accessibility options:

**Standard Themes:**
| Theme | Colors |
|-------|--------|
| 🔥 **Molten Metal** | Orange and red, like lava |
| 🌊 **Deep Ocean** | Blue and cyan, like the sea |
| 🌲 **Emerald Forest** | Green, like a forest |
| 🌙 **Midnight Purple** | Purple and pink |
| 🌹 **Rose Gold** | Pink and rose colors |
| ❄️ **Arctic Frost** | Light blue and cyan, like ice |

**High-Contrast Accessibility Themes:**
| Theme | Purpose |
|-------|---------|
| ♿ **High Contrast Dark** | Black background, bright cyan/magenta accents |
| ♿ **High Contrast Light** | Strong contrast with yellow accents |
| ♿ **Blue/Yellow (CVD)** | Colorblind-friendly, avoids red/green |
| ♿ **Yellow/Purple (CVD)** | Tritanopia-friendly palette |

### Changing Themes

**For the current tab:**
- Click the **palette icon (🎨)** in the sidebar to cycle through all 10 themes

**Per-Tab Theming:**
Each tab can have its own color theme! When you switch tabs, the theme changes too.

### Per-Tab Light/Dark Mode

Each tab can independently be in light or dark mode!

**To toggle a tab's mode:**
1. **Right-click** on the tab
2. Select **"Light Mode"** or **"Dark Mode"**
3. The tab indicator shows "Light" when in light mode

**Why is this cool?**
- 10 themes × 2 modes = **20 unique visual combinations**
- New tabs automatically alternate modes for visual variety
- Perfect for distinguishing different projects or workspaces

### Font Size

You can independently adjust the terminal and assistant chat font sizes using the font control module in the toolbar.

#### Changing Font Size

1. **Select Target**: Click the icon that represents what you want to adjust:
   - **⌨️ (Keyboard)** = Terminal font size
   - **🤖 (Robot)** = Assistant chat font size
2. **Adjust Size**: Use the **+** and **−** buttons to increase or decrease
3. **Display**: Shows current size in pixels (8–30px range)

The selected target is highlighted. Font size preference is saved automatically.

#### Font Size Range

- **Minimum**: 8px (for high-density displays)
- **Maximum**: 30px (for accessibility or large screens)
- **Default**: 14px

### Sidebar Position

Click the **panel icon** to move the command cards sidebar between left and right sides of the screen.

### Resizable Sidebar

The sidebar edge can be dragged to adjust its width:

1. **Position cursor** at the left edge of the sidebar (the thin line between terminal and sidebar)
2. **Drag left or right** to resize (200–800px range)
3. **Width persists** across sessions automatically

Why resize?
- Narrow for more terminal space
- Widen for better chat readability
- Adapt to your workflow

### Desktop Shortcut

Create a desktop shortcut for quick access:
1. Click the ⚙️ **settings gear** icon
2. Scroll to the **Installation** section
3. Click **"Create Desktop Shortcut"**

Works on Windows, macOS, and Linux!

---

## 🖥️ Windows Features (CMD, PowerShell, WSL)

If you're on Windows, you get extra options for which shell to use:

### Available Shells

| Shell | Description |
|-------|-------------|
| **CMD** | Classic Windows command prompt |
| **PowerShell** | Modern Windows shell with more features |
| **WSL** | Windows Subsystem for Linux (run Linux commands!) |

### Switching Shells

**Quick Toggle:**
Click the shell indicator button (shows "CMD", "PS", or "🐧 WSL") to cycle through available shells.

**Settings Modal:**
Click the ⚙️ gear icon to open detailed shell settings, where you can:
- Choose your preferred shell
- Select which WSL distribution to use (Ubuntu, Debian, etc.)
- Set the starting directory for WSL

### WSL Integration

If you have WSL installed, Forge Terminal can:
- Automatically detect your installed Linux distributions
- Find your Linux home directory
- Convert Windows paths to Linux paths

**Note:** Changing shells will end your current terminal session.

---

## 🔍 Search Your Terminal

Need to find something you saw earlier? Use the search feature!

### Opening Search

- Press **`Ctrl+F`** to open the search bar
- Or look for the search icon in the interface

### Using Search

1. Type what you're looking for
2. Press **Enter** to find the next match
3. Press **Shift+Enter** to find the previous match
4. Press **Escape** to close search

The search bar shows you how many matches were found and highlights them in the terminal.

### Tips

- Search is case-insensitive (finds "Error" when you type "error")
- Search looks through all visible terminal history (scrollback)

---

## 🤖 Auto-Respond (Prompt Watcher)

When using AI coding tools like GitHub Copilot CLI, you often see prompts like:

```
? Run this command? (y/n)
```

The **Auto-Respond** feature can automatically respond "yes" to these prompts!

### How to Enable

1. **Right-click** on a tab
2. Select **"Auto-respond"**
3. A ⚡ icon appears on the tab

### What It Detects

The Prompt Watcher looks for common confirmation patterns:

- `? Run this command?`
- `(y/n)` or `[Y/n]` prompts
- `Proceed?` or `Continue?` questions
- Inquirer-style selection menus with "Yes" highlighted

### Safety

- Auto-respond is **per-tab** - enable it only where you want it
- It only responds to **confirmation prompts**, not passwords or other input
- Turn it off when you need manual control

---

## 📖 AM (Artificial Memory) Logging

**AM** stands for **Artificial Memory** - it's an optional feature that records everything that happens in your terminal session so you never lose your work context.

### What Is It?

When you enable AM logging for a tab, Forge Terminal creates a Markdown file that records:
- Every command you type
- All terminal output
- Timestamps for when things happened
- The working directory and tab name

Think of it like a detailed lab notebook for your terminal sessions!

### Why Use It?

- **Crash Recovery**: If your terminal crashes or you accidentally close it, you have a complete record
- **Session Resuming**: Use the "📖 Summarize Last Session" command card to get an AI-powered summary of where you left off
- **Documentation**: Perfect audit trail for debugging or explaining what you did
- **Team Collaboration**: Share logs with teammates to show exact steps you took

### How to Enable

1. **Right-click** on a tab
2. Select **"AM Logging"** to enable it
3. A green indicator appears on the tab when active

### Where Are Logs Stored?

AM logs are stored in your current working directory:
- **Active logs**: `./am/session-{tabID}-{date}.md`
- **Archived logs**: `./am_archive/` (automatically moved when sessions end)

### Using the Summary Command

The default command card "📖 Summarize Last Session" (Ctrl+Shift+5) is a special prompt designed to work with AM logs:

1. **Paste the command** into your AI assistant (like Claude)
2. The AI will **read the most recent AM log** from `./am/`
3. You get a **200-word summary** covering:
   - What you were working on
   - The last significant action
   - Any errors encountered
   - What to do next

### Tips

- Enable AM logging when working on complex tasks
- Logs are stored as Markdown files - you can read them directly!
- Old logs (7+ days) are automatically cleaned up to save space
- Disable AM logging when you don't need it (reduces disk writes)

### View LLM Conversation Snapshots (Dev Mode)

When using LLM tools like GitHub Copilot CLI, Forge Terminal automatically captures screen snapshots of your conversations:

1. **Enable Dev Mode** in Settings → Toggle "Dev Mode"
2. Look for the **"AM (3)"** indicator in the bottom-right status bar
3. **Click on the AM indicator** to open the Conversation Viewer
4. Navigate through captured snapshots:
   - **← →** Arrow keys to move between snapshots
   - **Esc** to close the viewer

Each snapshot preserves the terminal state at that moment, giving you a complete history of your LLM interactions. Conversations persist across server restarts!

### Performance Tuning

If you experience keyboard latency, you can adjust how often AM polls for updates:

```javascript
// In browser console (F12):
window.__forgeAMConfig?.setPollingInterval(60000)  // 60 seconds
```

**Common settings:**
- `10000` - Very frequent monitoring (may impact performance)
- `30000` - **Default** (balanced)
- `60000` - Reduced monitoring (best if typing feels slow)

---

## 🤖 Forge Assistant (Experimental)

> **Status:** Experimental feature, available in Dev Mode  
> **Enable:** Settings → Toggle "Dev Mode"

The Forge Assistant is an AI-powered chat panel that understands your terminal context and can suggest commands, answer questions, and execute operations with your confirmation.

### What It Does

- **Context-Aware Chat**: Understands your working directory, recent commands, and terminal output
- **Command Suggestions**: Proposes commands and explains what they do
- **Local LLM**: Uses Ollama for completely local, private inference (no cloud)
- **Model Selection**: Switch between different models (Llama, CodeLlama, Mistral, etc.)

### Getting Started

1. **Enable Dev Mode**:
   - Click ⚙️ Settings
   - Toggle **"Dev Mode"**
   - Restart or refresh the page

2. **Install Ollama**:
   - Download from [ollama.ai](https://ollama.ai)
   - Run `ollama serve` in a terminal
   - Pull a model: `ollama pull mistral`

3. **Open Assistant Panel**:
   - Click the **"Assistant"** tab in the sidebar
   - Select your model from the dropdown

### Using the Assistant

- **Ask Questions**: "How do I find large files?" → Assistant suggests `find . -size +100M`
- **Get Help**: "How do I create a git branch?" → Explains the command
- **Run Commands**: Click "Run" next to suggested commands (they execute in the active tab)

### Limitations (Current)

- Visual improvements coming soon
- JSON detection from Vision system not yet displayed
- Command execution confirmation required for safety
- Dev Mode feature; may change in future versions

---

## 👁️ Vision Detection (Experimental)

> **Status:** Experimental feature, available in Dev Mode  
> **Enable:** Settings → Toggle "Dev Mode" → Enable for specific tab

Vision Detection automatically recognizes structured patterns in terminal output and makes them available for enhanced interaction.

### What It Detects

**Currently Deployed:**
- **JSON Objects & Arrays**: Recognizes valid JSON structures in output

**Coming Soon:**
- File paths and clickable navigation
- URLs for quick access
- Error stack traces with line-number navigation
- Git status and branch information

### Current Behavior

When JSON is detected:
- Terminal detects and buffers the output
- Information is passed to the Assistant (when enabled)
- Visual formatting improvements coming in future versions

### Enabling Vision per Tab

1. **Right-click** on a tab
2. Select **"Vision"** to toggle detection for that tab
3. An eye icon (👁️) appears on the tab when enabled

### Limitations (Current)

- JSON detection works; visual improvements pending
- No clickable links or formatting yet
- Primarily supports Assistant integration
- Experimental; behavior may change

---

## 🔄 Updates & Versions

Forge Terminal can update itself!

### Automatic Update Checks

- Forge Terminal checks for updates when it starts
- It checks again every 30 minutes while running
- You'll see a notification toast if an update is available

### Update Notification

When an update is available, you'll see:
- A **purple badge** on the download icon in the sidebar
- A **toast notification** with options to "View Update" or "Later"

### Applying Updates

1. Click **"View Update"** or the download icon
2. See the release notes for the new version
3. Click **"Download & Install"**
4. Forge Terminal downloads the update and restarts automatically

### Version History

The Update Modal shows your last 10 versions, so you can see what's changed over time.

---

## 📁 Where Settings Are Saved

Forge Terminal saves everything in a folder called `.forge` in your home directory:

| File | What It Stores |
|------|---------------|
| `~/.forge/commands.json` | Your saved command cards |
| `~/.forge/config.json` | Shell settings and preferences |
| `~/.forge/sessions.json` | Tab state (for restoring tabs on restart) |
| `~/.forge/welcome_shown` | Tracks if you've seen the welcome screen |

**Note:** `~` means your home directory:
- **Windows**: `C:\Users\YourName\.forge\`
- **Mac/Linux**: `/home/yourname/.forge/`

---

## 🛠️ Technical Details

### Languages Used

Forge Terminal is built with two main technologies:

| Part | Language | Description |
|------|----------|-------------|
| **Backend** | **Go** | The server that manages terminal sessions and handles WebSocket communication |
| **Frontend** | **JavaScript (React)** | The user interface you see in your browser |

### Backend (Go)

The Go backend handles:

- **PTY (Pseudo-Terminal) Management**: Creates real terminal sessions using system APIs
  - On Unix: Uses `creack/pty` library
  - On Windows: Uses `ConPTY` (Windows Console Pseudo-Terminal API)
- **WebSocket Server**: Real-time communication between your browser and the terminal
- **HTTP API**: Serves the web interface and handles settings
- **Auto-Updates**: Downloads and applies updates from GitHub

Key packages used:
- `github.com/creack/pty` - Unix terminal handling
- `github.com/UserExistsError/conpty` - Windows ConPTY support
- `github.com/gorilla/websocket` - WebSocket communication

### Frontend (React/JavaScript)

The React frontend handles:

- **Terminal Display**: Using `xterm.js` library (same as VS Code's terminal)
- **UI Components**: Tabs, command cards, modals, themes
- **State Management**: React hooks for tabs, commands, settings
- **Drag and Drop**: Using `@dnd-kit` library for reordering cards and tabs

Key libraries used:
- `@xterm/xterm` - Terminal emulator
- `@xterm/addon-fit` - Automatic terminal resizing
- `@xterm/addon-search` - Find text in terminal
- `@dnd-kit/core` - Drag and drop functionality
- `lucide-react` - Icons
- `vite` - Build tool

### How They Connect

```
┌─────────────────────────────────────────┐
│           Your Web Browser              │
│  ┌─────────────────┬─────────────────┐  │
│  │    Terminal     │  Command Cards  │  │
│  │   (xterm.js)    │    Sidebar      │  │
│  └─────────────────┴─────────────────┘  │
└────────────────┬────────────────────────┘
                 │ 
                 │  WebSocket (real-time terminal I/O)
                 │  HTTP (settings, commands, updates)
                 │
┌────────────────┴────────────────────────┐
│           Forge Terminal (Go)           │
│  ┌─────────────────┬─────────────────┐  │
│  │   PTY Session   │   Commands &    │  │
│  │   Management    │   Settings API  │  │
│  └─────────────────┴─────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Embedded Frontend (go:embed)     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │  ~/.forge/ (your data)  │
    └─────────────────────────┘
```

### Ports Used

Forge Terminal tries these ports in order:
1. `8333` (default)
2. `8080`
3. `9000`
4. `3000`
5. `3333`

If all are busy, it picks a random available port.

---

## 🔧 Troubleshooting

### Windows: "Windows protected your PC" Warning

Since Forge Terminal isn't signed with a certificate, Windows SmartScreen may block it:

1. Click **"More info"**
2. Click **"Run anyway"**

Or: Right-click the file → Properties → Check "Unblock" → OK

### Windows: Terminal Not Starting

Make sure you're running **Windows 10 version 1809** (October 2018 Update) or later. Earlier versions don't support ConPTY.

### Browser Shows "Connection Error"

Your firewall might be blocking localhost connections. Make sure it allows connections to `127.0.0.1` on the ports listed above.

### Mac/Linux: "Permission Denied"

You need to make the file executable first:
```bash
chmod +x forge-darwin-arm64   # or forge-linux-amd64
```

### Terminal Shows "Disconnected"

This can happen if:
- The shell process exited (you typed `exit`)
- The server is shutting down
- There was a connection error

Just close the tab and open a new one, or restart Forge Terminal.

### WSL Not Available

If WSL isn't showing up on Windows:
1. Make sure WSL is installed: `wsl --install`
2. Make sure you have at least one Linux distribution installed
3. Try running `wsl --list` in PowerShell to see your distributions

### Commands Not Saving

Check that Forge Terminal has permission to write to your home directory's `.forge` folder.

### Themes Not Changing

Try refreshing the page (`Ctrl+R` or `Cmd+R`). Theme changes should apply immediately.

---

## 💡 Tips & Tricks

1. **Use per-tab themes** to color-code your terminals (e.g., green for dev, red for production)

2. **Create command cards for frequently typed commands** like `git status` or `npm run dev`

3. **Use paste-only mode** for long prompts that need customization each time

4. **Enable auto-respond** on tabs where you're running AI tools to speed up your workflow

5. **Double-click tab titles** to rename them for easy identification

6. **Use keyboard shortcuts** for everything - it's much faster than clicking!

7. **The search feature** (`Ctrl+F`) works on all terminal history, even stuff that scrolled off-screen

---

## 📞 Getting Help

- **Feedback**: Click the 💬 message icon in the sidebar to send feedback
- **Issues**: Report bugs on [GitHub Issues](https://github.com/mikejsmith1985/forge-terminal/issues)
- **Quit**: Click the power icon (⏻) in the sidebar, or just close the browser tab

---

*Made with 🔥 by Mike Smith*

*Version: 1.6.x | Built with Go and React*
