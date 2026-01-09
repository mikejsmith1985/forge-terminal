# Zero-Click Cards - Dev Environment Fix

## Issue
The command cards created in `command-cards/*.json` were just documentation files. The backend doesn't load from that directory - it loads from `~/.forge/commands.json`.

## Root Cause
The backend stores user commands in:
```
Windows: C:\Users\<username>\.forge\commands.json
Linux/Mac: ~/.forge/commands.json
```

The `command-cards/` directory in the repo is just for documentation/examples.

## Solution Applied

### 1. Extended Command Schema
Added two new fields to `internal/commands/storage.go`:
```go
type Command struct {
    // ... existing fields ...
    MacroPayload string `json:"macro_payload,omitempty"` // Zero-Click: Text to auto-inject
    MacroDelay   int    `json:"macro_delay,omitempty"`   // Zero-Click: Delay in ms (default 1500)
}
```

### 2. Added Cards to DefaultCommands
Added two new entries to the `DefaultCommands` array:

**Card 6: Copilot (Fresh)**
```go
{
    ID:           6,
    Description:  "🤖 Copilot (Fresh)",
    Command:      "copilot --allow-all-tools",
    Icon:         "emoji-robot",
    MacroPayload: "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# STRICTLY FOLLOW: @.github/copilot-instructions.md",
    MacroDelay:   1500,
}
```

**Card 7: Copilot (Resume)**
```go
{
    ID:           7,
    Description:  "🔄 Copilot (Resume)",
    Command:      "copilot --allow-all-tools --continue",
    Icon:         "emoji-repeat",
    MacroPayload: "# SYSTEM INJECTION: FORGE AWARENESS\n# You are running inside Forge Terminal.\n# PROTECT PID: fterm.exe / forge.exe\n# STRICTLY FOLLOW: @.github/copilot-instructions.md",
    MacroDelay:   1500,
}
```

### 3. Rebuilt Application
```bash
cd frontend && npm run build
go build -ldflags "-X main.devMode=true" -o forge-dev.exe ./cmd/forge
```

## How It Works Now

### First Launch (No commands.json)
1. User runs `.\forge-dev.exe` or `.\run-dev-clean.ps1`
2. Backend checks for `~/.forge/commands.json`
3. File doesn't exist → Backend creates it with `DefaultCommands`
4. New cards (ID 6 and 7) are now included in defaults
5. User sees all 7 cards in sidebar

### Existing Users
If `commands.json` already exists, the new cards won't appear automatically. Users need to:

**Option A: Delete and Regenerate**
```powershell
Remove-Item "$env:USERPROFILE\.forge\commands.json" -Force
# Restart Forge - defaults will regenerate with new cards
```

**Option B: Restore Defaults (UI)**
1. Click "+" button in sidebar
2. Click "Restore Defaults" (if available)
3. Confirm to reset all cards

**Option C: Manual Edit**
Open `~/.forge/commands.json` and manually add the two new card objects.

## Testing Steps

1. **Clean Start**
   ```powershell
   Remove-Item "$env:USERPROFILE\.forge\commands.json" -Force -ErrorAction SilentlyContinue
   .\run-dev-clean.ps1 -Port 9999
   ```

2. **Open Browser**
   Navigate to `http://localhost:9999`

3. **Verify Cards Exist**
   Sidebar should show:
   - 🤖 Run Claude Code
   - 📝 Design Command
   - ⚡ Execute Command
   - 🛑 F*** THIS!
   - 📖 Summarize Last Conversation
   - **🤖 Copilot (Fresh)** ← NEW
   - **🔄 Copilot (Resume)** ← NEW

4. **Test Zero-Click**
   - Click "🤖 Copilot (Fresh)"
   - Terminal should launch Copilot
   - Wait ~1.5 seconds
   - Context should auto-inject:
     ```
     # SYSTEM INJECTION: FORGE AWARENESS
     # You are running inside Forge Terminal.
     # PROTECT PID: fterm.exe / forge.exe
     # STRICTLY FOLLOW: @.github/copilot-instructions.md
     ```

## Files Changed

### Modified
- `internal/commands/storage.go` - Added macro fields + 2 new default cards

### Already Modified (Previous Changes)
- `frontend/src/App.jsx` - Macro execution logic
- `frontend/src/components/ForgeAssist.jsx` - God Mode removed
- `cmd/forge/main.go` - Deprecated route removed

### Documentation (Repo Only - Not Used by Backend)
- `command-cards/copilot-fresh.json` - Example card
- `command-cards/copilot-resume.json` - Example card

## Why This Approach?

### ✅ Pros
- New users get cards automatically
- No manual configuration needed
- Works with existing command management system
- Backwards compatible (old commands.json files still work)

### ⚠️ Cons
- Existing users need to reset their commands.json
- Card IDs 6 and 7 might conflict if users already have those IDs

### 🔮 Future Improvement
Implement a migration system that automatically adds new default cards to existing `commands.json` files without overwriting user customizations.

## Current Status
✅ **COMPLETE** - Cards are in defaults, builds are successful, ready for testing.
