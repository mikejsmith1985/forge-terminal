# Session Recovery Guide

Forge Terminal's Session Recovery lets you continue interrupted AI conversations across tabs, terminals, and even system restarts.

## How It Works

When you use AI tools like GitHub Copilot CLI or Claude in Forge Terminal:

1. **AM (Artificial Memory)** captures your conversation
2. Conversations are saved by **project name** (not tab ID)
3. If a session is interrupted, it's marked as "recoverable"
4. When you return to a project, Forge detects these sessions
5. You can restore the context and continue with any AI tool

## Enabling Session Logging

1. Right-click any terminal tab
2. Select **"AM Logging: On"**
3. The AM Monitor appears in the status bar (Dev Mode required)

## Recovery Methods

### 1. Automatic Detection

When you navigate to a project directory with recoverable sessions:

- A toast notification appears: "X recoverable sessions found"
- Click **"View"** to open the recovery overlay
- Browse, preview, and restore sessions

### 2. Command Card

Click the **"🔄 Restore Session"** command card in the sidebar to:

- View all recoverable sessions across all projects
- Filter by project/workspace
- Preview conversation context before restoring

### 3. Vision Overlay

The Session Recovery overlay shows:

- **Session list**: All incomplete conversations
- **Project name**: Derived from working directory
- **Provider icon**: 🤖 Copilot, 🧠 Claude, 🔧 Aider
- **Metadata**: Git branch, turn count, last activity time
- **Status**: "Interrupted" (crashed) or "Incomplete"

### 4. Forge Assistant

Ask the assistant:

- "What was I working on?"
- "Show me recoverable sessions"
- "Restore my last session"

## Using the Recovery Overlay

### Navigation

| Key | Action |
|-----|--------|
| ↑↓ | Navigate between sessions |
| Enter | Select focused item |
| 1-9 | Quick select by number |
| Esc | Close overlay |

### Actions

- **Preview**: See last exchange before committing
- **Copilot**: Restore with `gh copilot suggest "..."`
- **Claude**: Restore with `claude "..."`

### Preview Mode

Before restoring, you can preview:

- **Last user prompt**: What you asked
- **Last assistant response**: What the AI said (truncated)
- **Restore prompt**: The context that will be sent to the AI

## Cross-Tab Recovery

Sessions are identified by **project**, not tab:

```
Tab 1 (forge-terminal) → saves → forge-terminal-conv-2025-12-11-1234.json
                                   ↓
Tab 3 (any project)    ← can restore from Tab 1's session
```

This means:

- Open a new tab for any project
- Recovery still works - sessions are portable
- The AI gets your full conversation context

## File Storage

Sessions are stored in `~/.forge/am/`:

```
~/.forge/am/
├── forge-terminal-conv-2025-12-11-1234-abc12345.json
├── another-project-conv-2025-12-11-1456-def67890.json
└── adhoc-conv-2025-12-11-1678-ghi11223.json
```

Filename format: `{project}-conv-{timestamp}-{short-id}.json`

## Troubleshooting

### No Sessions Found

1. Ensure AM Logging was enabled before the conversation
2. Check if the session had actual content (not empty)
3. Verify `~/.forge/am/` directory exists and has files

### Session Shows but Won't Restore

1. The session may be too old (check file timestamp)
2. The restore context may be empty
3. Check terminal output for error messages

### Files Not Being Created

1. Enable Dev Mode (Settings → Dev Mode toggle)
2. Enable AM Logging (right-click tab → AM Logging: On)
3. Have an actual AI conversation (not just terminal commands)

## Best Practices

1. **Enable AM Logging** before starting important AI sessions
2. **Use project directories** - sessions are named by project
3. **Check the AM Monitor** in the status bar for logging status
4. **Preview before restoring** to verify correct session

## Privacy & Data

- Sessions are stored locally in `~/.forge/am/`
- No data is sent to external servers
- Files are plain JSON (human-readable)
- Old files can be deleted manually or via cleanup scripts
