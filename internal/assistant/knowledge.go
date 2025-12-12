// Package assistant provides knowledge base for Forge Terminal.
package assistant

import (
	"fmt"
	"strings"
)

// FeatureInfo represents a Forge Terminal feature.
type FeatureInfo struct {
	Name        string
	Description string
	Category    string
	Details     string // Additional details
	Example     string // Example usage
}

// KnowledgeBase contains comprehensive information about Forge Terminal.
type KnowledgeBase struct {
	Features    []FeatureInfo
	Version     string
	SystemPrompt string
}

// NewKnowledgeBase creates a new knowledge base for Forge Terminal.
func NewKnowledgeBase() *KnowledgeBase {
	kb := &KnowledgeBase{
		Version: "1.21.7",
	}
	kb.loadFeatures()
	kb.generateSystemPrompt()
	return kb
}

// loadFeatures populates the knowledge base with Forge Terminal features.
func (kb *KnowledgeBase) loadFeatures() {
	kb.Features = []FeatureInfo{
		// Core Terminal Features
		{
			Name:        "Full PTY Terminal",
			Description: "Real PTY support (xterm.js) for interactive apps",
			Category:    "Core Terminal",
			Details:     "Run vim, htop, node REPL, or any interactive CLI tool",
			Example:     "vim file.txt, htop, python3 -i",
		},
		{
			Name:        "Multi-Tab Support",
			Description: "Open up to 20 terminal tabs with drag-and-drop reordering",
			Category:    "Core Terminal",
			Details:     "Each tab runs independently, can have different themes",
			Example:     "Ctrl+T to create, Ctrl+W to close, Ctrl+1-9 to switch",
		},
		{
			Name:        "Session Persistence",
			Description: "Tabs, themes, and positions restored automatically on restart",
			Category:    "Core Terminal",
			Details:     "State saved in ~/.forge/sessions.json",
			Example:     "Close Forge with 3 tabs open - they'll return when you restart",
		},
		{
			Name:        "Terminal Search",
			Description: "Find text in terminal output with highlighting",
			Category:    "Core Terminal",
			Details:     "Search matches are highlighted, navigate with Enter/Shift+Enter",
			Example:     "Ctrl+F to search, Escape to close",
		},

		// Command Cards
		{
			Name:        "Command Cards",
			Description: "Save frequently used commands for quick access",
			Category:    "Command Cards",
			Details:     "Stored in ~/.forge/commands.json, includes emoji/icons and descriptions",
			Example:     "Create a 'npm run build' card, execute with one click",
		},
		{
			Name:        "Keyboard Shortcuts for Cards",
			Description: "Trigger commands with Ctrl+Shift+1-9 and Ctrl+Shift+A-Z",
			Category:    "Command Cards",
			Details:     "35+ total command shortcuts available, configurable per card",
			Example:     "Ctrl+Shift+1 for first command, Ctrl+Shift+A for 11th, Ctrl+Shift+Z for 36th",
		},
		{
			Name:        "Paste vs Execute Mode",
			Description: "Choose to paste commands for editing or execute immediately",
			Category:    "Command Cards",
			Details:     "Paste mode allows you to add context before pressing Enter",
			Example:     "Paste mode for complex commands needing parameters, Execute for simple ones",
		},
		{
			Name:        "Emoji & Icon Support",
			Description: "Choose from 40+ emoji or professional Lucide icons for cards",
			Category:    "Command Cards",
			Details:     "Visual identification helps find commands quickly",
			Example:     "🚀 for deploy, 🐛 for debug, 📝 for documentation",
		},
		{
			Name:        "Drag & Drop Reordering",
			Description: "Reorganize command cards by dragging",
			Category:    "Command Cards",
			Details:     "Order is persisted across restarts",
			Example:     "Drag 'npm test' card above 'npm build' to change priority",
		},
		{
			Name:        "Favorites",
			Description: "Mark important commands as favorites",
			Category:    "Command Cards",
			Details:     "Favorites appear at top of the list",
			Example:     "⭐ 'Deploy to Production' command",
		},

		// Theming & Customization
		{
			Name:        "10 Color Themes",
			Description: "Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost, plus high-contrast themes",
			Category:    "Theming",
			Details:     "Includes 4 accessibility-focused high-contrast themes for color-blind users",
			Example:     "Click palette icon to cycle through themes",
		},
		{
			Name:        "Per-Tab Light/Dark Mode",
			Description: "Each tab independently toggles between light and dark (20 visual combinations)",
			Category:    "Theming",
			Details:     "10 themes × 2 modes = 20 unique visual combinations",
			Example:     "Right-click tab → Light Mode or Dark Mode",
		},
		{
			Name:        "Font Size Controls",
			Description: "Adjust terminal (8-30px) and assistant chat (8-30px) independently",
			Category:    "Theming",
			Details:     "Settings persist across sessions",
			Example:     "Use +/- buttons or adjust font size slider",
		},
		{
			Name:        "Flexible Sidebar Layout",
			Description: "Position sidebar on left or right, resize from 200-800px",
			Category:    "Theming",
			Details:     "Width persists across sessions, drag edge to resize",
			Example:     "Click panel icon to toggle left/right, drag edge for width",
		},

		// Windows Features
		{
			Name:        "Windows Shell Selection",
			Description: "Switch between CMD, PowerShell, and WSL",
			Category:    "Windows Features",
			Details:     "Click shell indicator in toolbar or use Settings for detailed config",
			Example:     "Run 'ls' in WSL mode, 'dir' in CMD mode",
		},
		{
			Name:        "WSL Integration",
			Description: "Native WSL support with automatic distro detection",
			Category:    "Windows Features",
			Details:     "Automatic Windows-to-WSL path translation, UNC path handling",
			Example:     "Access Windows files from WSL terminal seamlessly",
		},

		// Quality of Life
		{
			Name:        "AM (Artificial Memory)",
			Description: "Per-tab session logging with TUI screen capture",
			Category:    "Quality of Life",
			Details:     "70% parsing accuracy with 100% raw snapshot fallback, stored in .forge/am/",
			Example:     "Right-click tab → AM Logging, then use 'Summarize' to review session",
		},
		{
			Name:        "Session Recovery",
			Description: "Restore interrupted AI conversations across tabs and sessions",
			Category:    "Quality of Life",
			Details:     "AM logs conversations by project name. When you return to a project, Forge detects recoverable sessions and offers to restore context with Copilot or Claude.",
			Example:     "If Copilot session was interrupted, use /restore or click the recovery notification to continue where you left off",
		},
		{
			Name:        "Auto-Respond",
			Description: "Auto-respond to CLI confirmation prompts",
			Category:    "Quality of Life",
			Details:     "Per-tab toggle, answers y/n prompts automatically",
			Example:     "npm install automatically answers 'Do you want to proceed?' with yes",
		},
		{
			Name:        "Auto-Updates",
			Description: "Automatic update checking with one-click installation",
			Category:    "Quality of Life",
			Details:     "Toast notification in bottom-right when update available",
			Example:     "Click 'Update Now' to download and apply new version",
		},
		{
			Name:        "Scroll to Bottom Button",
			Description: "Quick button to jump to latest terminal output",
			Category:    "Quality of Life",
			Details:     "Helpful when tracking long-running commands",
			Example:     "Click down arrow to jump to bottom of output",
		},
		{
			Name:        "Disconnect Reasons",
			Description: "Clear messages when terminal sessions end",
			Category:    "Quality of Life",
			Details:     "Shows exit code and reason for disconnection",
			Example:     "See 'Process exited with code 0' message",
		},
		{
			Name:        "Active Tab Indicator",
			Description: "Rotating 'bead of light' animation showing active tab",
			Category:    "Quality of Life",
			Details:     "Visual clarity for which tab is currently active",
			Example:     "See rotating indicator on active tab header",
		},

		// Experimental Features
		{
			Name:        "Forge Assistant",
			Description: "AI-powered chat panel with context awareness",
			Category:    "Experimental Features",
			Details:     "Requires local Ollama. Enable in Dev Mode. Can suggest commands based on terminal state",
			Example:     "Ask 'How do I find large files?' and get command suggestions",
		},
		{
			Name:        "Vision Detection",
			Description: "Real-time pattern detection in terminal output with image/camera support",
			Category:    "Experimental Features",
			Details:     "Experimental feature. Detects Git status, JSON blocks, file paths, compiler errors, stack traces. Supports image analysis and camera input for visual pattern recognition.",
			Example:     "See JSON automatically pretty-printed, git status displayed with quick actions, analyze images in terminal output",
		},
		{
			Name:        "Vision-AM Integration",
			Description: "All detected patterns persisted to AM logs",
			Category:    "Experimental Features",
			Details:     "Errors and warnings collected for post-session review",
			Example:     "Review all compiler errors from session in one place",
		},

		// Security Features
		{
			Name:        "File Access Modes",
			Description: "Toggle between restricted (project-scoped) and unrestricted (full filesystem)",
			Category:    "Security & File Access",
			Details:     "Default is project-scoped for safety",
			Example:     "File operations limited to project directory by default",
		},
		{
			Name:        "Security Prompts",
			Description: "Confirmation dialogs for sensitive file operations",
			Category:    "Security & File Access",
			Details:     "Prevents accidental data loss",
			Example:     "Get confirmation before deleting files",
		},
	}
}

// generateSystemPrompt creates a comprehensive system prompt.
func (kb *KnowledgeBase) generateSystemPrompt() {
	var prompt strings.Builder

	prompt.WriteString(`You are Forge Assistant, an intelligent helper for Forge Terminal v1.21.7.

# ABOUT FORGE TERMINAL

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands for quick access.

Key Facts:
- Single binary, no Docker or Node.js required
- Works on macOS, Linux, and Windows
- Web-based frontend (React) + Go backend
- Configuration stored in ~/.forge/
- Open source: github.com/mikejsmith1985/forge-terminal

# CORE FEATURES

`)

	// Organize features by category
	categories := make(map[string][]FeatureInfo)
	for _, f := range kb.Features {
		categories[f.Category] = append(categories[f.Category], f)
	}

	// Write features grouped by category
	for category, features := range categories {
		prompt.WriteString(fmt.Sprintf("## %s\n\n", category))
		for _, f := range features {
			prompt.WriteString(fmt.Sprintf("- **%s**: %s\n", f.Name, f.Description))
			if f.Details != "" {
				prompt.WriteString(fmt.Sprintf("  Details: %s\n", f.Details))
			}
			if f.Example != "" {
				prompt.WriteString(fmt.Sprintf("  Example: %s\n", f.Example))
			}
		}
		prompt.WriteString("\n")
	}

	prompt.WriteString(`# KEYBOARD SHORTCUTS (ESSENTIAL)

## Tab Management
- Ctrl+T: New tab
- Ctrl+W: Close tab
- Ctrl+1-9: Switch to tab
- Ctrl+Tab: Next tab
- Ctrl+Shift+Tab: Previous tab
- Shift+Tab: Previous tab
- Alt+Tab: Next tab (Alternative tab switching)

## Terminal
- Ctrl+F: Search in terminal
- Ctrl+End: Scroll to bottom

## Command Cards
- Ctrl+Shift+1-9: Execute card #1-9
- Ctrl+Shift+0: Execute card #10
- Ctrl+Shift+A-Z: Execute cards #11+

# COMMON WORKFLOWS

## Creating a Command Card
1. Click "+" in sidebar
2. Enter description and command
3. Choose emoji/icon
4. Assign keyboard shortcut (optional)
5. Save

## Enabling Session Logging (AM)
1. Right-click tab header
2. Select "AM Logging"
3. Logs save to .forge/am/
4. Use "Summarize Last Session" card to review

## Using Themes
1. Click palette icon (top-left)
2. Cycle through 10 themes
3. Right-click tab for light/dark mode
4. Per-tab selection persists

## Using Assistant (Experimental)
1. Enable Dev Mode in Settings
2. Ensure Ollama running: ollama serve
3. Click assistant icon in sidebar
4. Ask questions about terminal or Forge features
5. Accept/reject suggested commands

# API ENDPOINTS (For Context)

- GET /api/commands - Get all saved cards
- POST /api/commands - Save cards
- GET /api/assistant/status - Check Ollama
- POST /api/assistant/chat - Send to assistant
- POST /api/assistant/execute - Execute command
- POST /api/assistant/model - Change Ollama model
- WS /ws - WebSocket for terminal I/O

# CONFIGURATION

Storage: ~/.forge/
- commands.json: Saved command cards
- config.json: Shell settings
- sessions.json: Tab state & themes
- forge.log: Application logs
- am/: Session logs

Environment Variables:
- FORGE_OLLAMA_MODEL: Set default Ollama model
- ALLOWED_ORIGINS: CORS origins (self-hosted)

# DEPLOYMENT MODES

1. **LOCAL**: Browser + local backend (fastest, recommended)
2. **EMBEDDED**: Everything in one binary (simplest)
3. **CODESPACES**: Cloud testing (120 hrs/month free)
4. **SELF-HOSTED**: Server deployment (24/7)

# TROUBLESHOOTING

## Connection Issues
When troubleshooting connection problems:
- Check server logs at ~/.forge/forge.log
- Verify port is accessible (default: 8333)
- Look for connection timeout errors in browser console
- Ensure backend server is running
- Check firewall/antivirus not blocking connection

## Windows SmartScreen Warning
Right-click → Open or: xattr -d com.apple.quarantine ./forge-darwin-arm64

## macOS Gatekeeper
Right-click binary → Open

## Assistant Not Working
- Install Ollama: ollama.ai
- Run: ollama serve
- Reload Forge browser tab
- Check assistant status in Settings

## Port Already In Use
Forge tries: 8333, 8080, 9000, 3000, 3333 (in order)

## Commands Not Persisting
- Check ~/.forge/commands.json is writable
- Verify ~/.forge/ directory exists

## Session/Tab Issues
- Check ~/.forge/sessions.json is valid JSON
- Verify ~/.forge/ directory permissions
- Review logs for error messages

# FORGE ASSISTANT (AI-Powered Chat)

## Overview
The Forge Assistant is an experimental AI-powered chat panel that provides intelligent suggestions and assistance. It integrates context from your terminal to offer relevant command suggestions.

## Key Features
- Context-Aware: Understands terminal state and can suggest commands based on current activity
- Chat Interface: Ask questions about Forge features, terminal commands, and troubleshooting
- Command Suggestions: AI suggests relevant commands based on your questions
- Command Execution: Review and execute suggested commands directly
- Model Selection: Switch between different Ollama models

## How to Use
1. Enable Dev Mode in Settings
2. Ensure Ollama running (command: ollama serve)
3. Click assistant icon in sidebar to open chat
4. Ask questions about terminal or Forge features
5. Review AI-suggested commands before accepting
6. Execute commands or ask follow-up questions

## Requirements
- Ollama installed (ollama.ai)
- Local Ollama service running on port 11434
- Backend properly configured with Ollama endpoint
- Model available (default: mistral or llama2)

## Assistant Features
- Terminal context analysis
- Command history awareness
- File path suggestions
- Error diagnosis
- Workflow recommendations

# BEHAVIOR GUIDELINES

1. ONLY suggest features/commands that actually exist in Forge Terminal
2. Use specific version numbers (v1.21.7)
3. Explain feature limitations and constraints
4. Ask clarifying questions if uncertain
5. Link to documentation when relevant
6. If asked about unrelated tools, politely redirect to Forge features
7. Provide example commands when helpful

# YOUR ROLE

You are a helpful, accurate assistant for Forge Terminal users. Your primary goals:
- Help users understand Forge Terminal features
- Suggest relevant keyboard shortcuts
- Explain how to use features correctly
- Debug common issues
- Recommend configurations
- Answer questions about architecture and deployment

Be friendly, concise, and always accurate. If you don't know something, say so rather than guessing.

---
Version: 1.21.7 | Knowledge Base Generated for Forge Assistant
`)

	kb.SystemPrompt = prompt.String()
}

// GetSystemPrompt returns the comprehensive system prompt.
func (kb *KnowledgeBase) GetSystemPrompt() string {
	return kb.SystemPrompt
}

// GetFeature finds a feature by name.
func (kb *KnowledgeBase) GetFeature(name string) *FeatureInfo {
	for i := range kb.Features {
		if strings.EqualFold(kb.Features[i].Name, name) {
			return &kb.Features[i]
		}
	}
	return nil
}

// ListFeaturesByCategory returns all features in a category.
func (kb *KnowledgeBase) ListFeaturesByCategory(category string) []FeatureInfo {
	var result []FeatureInfo
	for _, f := range kb.Features {
		if strings.EqualFold(f.Category, category) {
			result = append(result, f)
		}
	}
	return result
}

// GetCategories returns all unique feature categories.
func (kb *KnowledgeBase) GetCategories() []string {
	seen := make(map[string]bool)
	var result []string
	for _, f := range kb.Features {
		if !seen[f.Category] {
			seen[f.Category] = true
			result = append(result, f.Category)
		}
	}
	return result
}
