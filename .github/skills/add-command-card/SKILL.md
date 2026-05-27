---
name: add-command-card
description: "Teaches agents how to build and register a Command Card in Forge Terminal. Activates on keywords: command card, launch POC, add shortcut, forge button, add card, create card, command shortcut, sidebar button."
---

# Add Command Card — Forge Terminal

This skill gives you everything you need to build a **Command Card** — the clickable
sidebar buttons in Forge Terminal that run commands, paste prompts, or launch tools
like a POC server with a single click.

---

## What Is a Command Card?

A Command Card is a persistent shortcut button stored in `~/.forge/terminal/commands.json`.
Each card appears in the Forge sidebar and can:

- **Run** a shell command directly in the active terminal
- **Paste** text/prompts into the terminal without executing (useful for AI prompts)
- **Auto-inject** a follow-up macro payload seconds after execution (Zero-Click mode)
- **Switch behaviour** per AI tool (Claude vs Copilot) using `toolVariants`

---

## The Data Schema

Every card is a JSON object. The full schema (from `internal/commands/storage.go`):

```json
{
  "id":          0,
  "description": "Card label shown in the sidebar (REQUIRED)",
  "command":     "Shell command or prompt text to send (REQUIRED)",
  "keyBinding":  "Ctrl+Shift+N — auto-assigned if omitted",
  "pasteOnly":   false,
  "favorite":    false,
  "icon":        "🚀",
  "delay":       0,
  "alwaysAppend": false,
  "macro_payload": "",
  "macro_delay":   1500,
  "toolVariants":        {},
  "descriptionVariants": {},
  "macroVariants":       {}
}
```

### Required vs Optional at a Glance

| Field | Required? | Notes |
|---|---|---|
| `description` | ✅ Yes | Visible card label |
| `command` | ✅ Yes | What gets sent to the terminal |
| `id` | Auto | Computed as `max(existing ids) + 1` |
| `keyBinding` | Auto | Up to 20 slots: `Ctrl+Shift+1` → `Ctrl+Shift+20` |
| `pasteOnly` | Optional | `true` = only a Paste button, no Run button |
| `favorite` | Optional | Adds a ★ badge for visual prominence |
| `icon` | Optional | Any emoji or Lucide icon name |
| `delay` | Optional | Milliseconds to wait before sending Enter |
| `alwaysAppend` | Optional | Appended to every AI prompt automatically |
| `macro_payload` | Optional | Text auto-injected into PTY after the command starts |
| `macro_delay` | Optional | Delay before macro injection (default 1500 ms; use ≥4500 ms for AI CLIs) |
| `toolVariants` | Optional | `{"claude": "...", "copilot": "..."}` — different commands per tool |
| `descriptionVariants` | Optional | Different card label per tool |
| `macroVariants` | Optional | Different macro text per tool |

---

## Step-by-Step: How to Add a Card Programmatically

The API is simple: **read** the current array, **append** your new card, **POST** it back.

### 1 — Read existing cards (to compute the next ID and avoid key-binding conflicts)

```powershell
# While Forge is running, hit the live API:
$existingCards = (Invoke-RestMethod -Uri "http://localhost:PORT/api/commands" -Method GET)

# Or read the file directly when Forge is not running:
$existingCards = Get-Content "$env:USERPROFILE\.forge\terminal\commands.json" | ConvertFrom-Json
```

### 2 — Compute the next ID

```powershell
$nextId = ($existingCards | Measure-Object -Property id -Maximum).Maximum + 1
```

### 3 — Build the new card object

```powershell
$newCard = @{
    id          = $nextId
    description = "🚀 Launch My POC"
    command     = "cd C:\path\to\my-poc && npm start"
    icon        = "🚀"
    pasteOnly   = $false
    favorite    = $true
}
```

### 4 — Append and POST

```powershell
$updatedCards = $existingCards + $newCard
$body = $updatedCards | ConvertTo-Json -Depth 10

Invoke-RestMethod `
    -Uri    "http://localhost:PORT/api/commands" `
    -Method POST `
    -Body   $body `
    -ContentType "application/json"
```

Forge saves the array to `~/.forge/terminal/commands.json` and the card appears
immediately in the sidebar — **no restart required**.

---

## Common Card Templates

### POC / Dev Server Launcher

```json
{
  "description": "🚀 Launch My POC",
  "command":     "cd C:\\path\\to\\poc && npm start",
  "icon":        "🚀",
  "favorite":    true,
  "pasteOnly":   false
}
```

### POC with Zero-Click Macro (auto-sends a follow-up command after startup)

```json
{
  "description":   "⚡ Start API + Open Browser",
  "command":       "cd C:\\path\\to\\poc && npm run dev",
  "macro_payload": "start http://localhost:3000\n",
  "macro_delay":   5000,
  "pasteOnly":     false
}
```
Use `macro_delay ≥ 4000 ms` when the process needs time to start before the macro fires.

### AI-Prompt Paste Card (no execution)

```json
{
  "description": "📋 Explain This Code",
  "command":     "Please explain the code I just showed you, step by step.",
  "pasteOnly":   true,
  "icon":        "📋"
}
```

### Tool-Variant Card (different command for Claude vs Copilot)

```json
{
  "description": "🤖 Fresh AI Session",
  "command":     "claude",
  "toolVariants": {
    "claude":  "claude",
    "copilot": "copilot --allow-all-tools"
  },
  "descriptionVariants": {
    "claude":  "🤖 Start Claude",
    "copilot": "🤖 Start Copilot"
  },
  "macro_payload": "/your-startup-prompt-here",
  "macro_delay":   4500
}
```

---

## Decision Tree: Which Fields Do I Need?

```
Is the card launching a program or running a command?
  └─ YES → set command = "your shell command", pasteOnly = false
        └─ Does it need a follow-up action after startup (e.g., open browser)?
              └─ YES → set macro_payload + macro_delay ≥ 4000

Is the card pasting a prompt into the AI CLI?
  └─ YES → set pasteOnly = true, command = "your prompt text"

Does the card behave differently for Claude vs Copilot?
  └─ YES → populate toolVariants (and optionally descriptionVariants / macroVariants)

Should it always be prepended to AI prompts?
  └─ YES → set alwaysAppend = true
```

---

## API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/commands` | `GET` | Return all cards as a JSON array |
| `/api/commands` | `POST` | Replace all cards with the posted JSON array |
| `/api/commands/card-history?cardId=N` | `GET` | Retrieve version history for card N |
| `/api/commands/card-history/restore` | `POST` | Roll back card N to a previous version |
| `/api/commands/restore-defaults` | `POST` | Wipe custom cards and restore built-in defaults |

**Storage file:** `~/.forge/terminal/commands.json`
**Version history:** `~/.forge/terminal/card-history/card-{id}.json` (max 5 versions per card)

---

## Agent Workflow: "Build a Command Card for My POC"

When a user says *"build me a command card to launch my POC"*, follow these steps:

1. **Discover the POC** — ask or infer: What directory? What start command? What port?
2. **Read existing cards** — GET `/api/commands` or read the JSON file directly.
3. **Compute next ID** — `max(existing ids) + 1`.
4. **Choose the right template** — simple launcher, Zero-Click, paste-only, or tool-variant.
5. **Construct the card JSON** — fill required fields; set `favorite: true` for POC launchers.
6. **POST the updated array** — back to `/api/commands`.
7. **Confirm** — tell the user the card name, its key binding, and how to trigger it.
8. **Optional** — offer to add a `macro_payload` to auto-open the browser after startup.

---

## Validation Checklist

Before considering the card "done":

- [ ] `description` is human-readable and includes a relevant emoji
- [ ] `command` is the exact shell command that works from a fresh terminal
- [ ] `id` does not collide with any existing card
- [ ] `keyBinding` slot is available (or left blank for auto-assignment)
- [ ] `macro_delay` is ≥ 4000 ms if `macro_payload` targets an AI CLI or slow server
- [ ] Card was successfully POSTed and confirmed present via a follow-up GET
