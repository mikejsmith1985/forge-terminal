# Forge Terminal v3.7.0 Release Notes

## 🚀 New Features

### Forge Assist (Ctrl+/)
A new context-aware command palette that makes CLI tools easier to use:
- **Smart CLI Detection** - Automatically detects which CLI you're using (Copilot, Claude, Git, npm)
- **Slash Commands Reference** - Shows all available slash commands for the active CLI
- **Quick Launch Commands** - Pre-configured commands with copy and "Create Card" buttons
- **Context Variables** - For Copilot CLI, shows context variables like `#file`, `#selection`, `#function`
- **Keyboard Accessible** - Arrow keys to navigate, Enter to send, Esc to close

### Enhanced CLI Settings
Comprehensive configuration for GitHub Copilot CLI and Claude Code CLI:

**Copilot CLI:**
- Slash commands reference with copy-to-clipboard
- Context variables (`#file`, `#selection`, `#block`, etc.)
- Quick launch commands (Continue Session, Resume, Quick Question)
- Advanced settings: Streaming, Parallel Tool Execution, Screen Reader Mode
- Pre-allowed tools configuration
- MCP (Model Context Protocol) settings
- Custom instructions file locations

**Claude Code CLI:**
- Slash commands reference (`/help`, `/model`, `/compact`, `/cost`, etc.)
- Quick launch commands (Continue, Plan Mode, Full Auto)
- Output format selection (text, json, stream-json)
- Append to system prompt
- Allowed tools configuration
- Config file locations reference

### Improved Ollama Setup Guidance
- Clear step-by-step instructions in Settings → Intelligence
- Copy button for `ollama pull qwen2.5:0.5b` command
- Model recommendations with sizes and use cases:
  - **Recommended:** qwen2.5:0.5b (~400MB) - Fast and efficient
  - **Alternative:** qwen2.5:1.5b (~1GB) - More accurate
  - **Low RAM:** tinyllama (~600MB) - Works on older machines

### Updated Tour
- New tour steps explaining Ollama and SLM options
- Forge Assist introduction
- Improved Smart Routing explanation
- Tour version bump to trigger for existing users

## 🗑️ Removed

### Forge Vision
- Removed the experimental Vision overlay system
- Vision was rarely triggered and added complexity
- Pattern detection features may return in a future release with better UX

## 📝 Changes

- Removed visionEnabled from tab state and context menus
- Cleaned up Vision-related code from ForgeTerminal, App, Settings
- Removed vision folder and overlay components
- Updated tour to version 3.7.0

## 🔧 Technical

- Frontend build size reduced by ~5KB with Vision removal
- Simplified ForgeTerminal component props
- Removed unused Eye icon import from lucide-react
- Cleaned up localStorage for visionConfig

---

**Full Changelog:** Compare with v3.6.4

**Upgrade:** Just download the new binary - no migration needed.
