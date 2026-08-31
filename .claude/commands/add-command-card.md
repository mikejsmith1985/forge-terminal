# Add Command Card — Forge Terminal Card Creation Skill

This skill activates when you need to create, register, or scaffold a new Forge Terminal command card — whether as a hardcoded default, a JSON card file, or a programmatic addition via the API. Read every section before touching any file.

---

## What a Command Card Is

A command card is a persistent, user-customizable shortcut tile rendered in the Forge Terminal sidebar. Each card maps to a `Command` struct in Go and is stored in `~/.forge/commands.json`. Cards can execute shell commands, inject macro text into the terminal, trigger LLM workflows, or act as stateful toggles (Start/Stop pairs).

---

## The Command Struct (Source of Truth)

Defined in `internal/commands/storage.go`:

```go
type Command struct {
    ID                  int               // Unique card ID — must not collide with existing defaults (1–8)
    Description         string            // Card label shown in the sidebar
    Command             string            // Shell command executed on Run/Paste
    KeyBinding          string            // Optional hotkey e.g. "Ctrl+Shift+5"
    PasteOnly           bool              // If true, only a Paste button is shown (no Run)
    Favorite            bool              // Pins the card to the top of the list
    TriggerAM           bool              // Enables Artificial Memory logging for this card
    LLMProvider         string            // "copilot" | "claude" | "aider" | ""
    LLMType             string            // "chat" | "suggest" | "explain" | "code" | ""
    Icon                string            // Emoji or Lucide icon name e.g. "🚀" or "terminal"
    Delay               int               // Milliseconds to wait before sending the command
    AlwaysAppend        bool              // If true, auto-appends card text to every terminal prompt
    MacroPayload        string            // Text injected into terminal after command (Zero-Click)
    MacroDelay          int               // MS before macro injection fires (default: 4500)
    ToolVariants        map[string]string // Per-CLI-tool command overrides: {"claude": "...", "copilot": "..."}
    DescriptionVariants map[string]string // Per-CLI-tool label overrides
    MacroVariants       map[string]string // Per-CLI-tool macro overrides
    CardType            string            // "" for normal | "toggle" for Start/Stop pair
    Toggle              *ToggleConfig     // Only set when CardType == "toggle"
}

type ToggleConfig struct {
    OnLabel         string // Start button label (default: "Start")
    OffLabel        string // Stop button label (default: "Stop")
    OffCommand      string // Teardown command — REQUIRED for toggle cards
    OffMacroPayload string // Macro text injected during stop action
    OffMacroDelay   int    // MS delay before stop macro fires
    OffDelay        int    // MS delay before Enter is sent on stop command
}
```

---

## Approach 1 — Add a Default Card (Hardcoded)

Use this when the card should ship with Forge Terminal for all users.

**File to edit:** `internal/commands/storage.go` — the `DefaultCommands` slice (IDs 1–8 are reserved).

Rules:
- Assign an ID greater than 8 (check the existing slice for the current highest ID)
- Every default card MUST have a non-empty `Description`, `Command`, and `Icon`
- If the card varies by CLI tool, populate `ToolVariants` — do not hardcode a single tool's syntax in `Command`
- Run `go build ./cmd/forge/` after adding the card to verify compilation

```go
// Example default card entry
{
    ID:          9,
    Description: "Run Dev Server",
    Command:     "npx vite dev",
    Icon:        "⚡",
    KeyBinding:  "Ctrl+Shift+9",
    ToolVariants: map[string]string{
        "claude":  "npx vite dev --mode claude",
        "copilot": "npx vite dev --mode copilot",
    },
},
```

---

## Approach 2 — Add a Card via JSON File

Use this for distributable card packages (e.g., `command-cards/` directory).

**Format** (matches the `Command` struct field names in camelCase JSON):

```json
{
  "id": 101,
  "description": "Deploy to Staging",
  "command": ".\\ scripts\\deploy.ps1 -Env staging",
  "icon": "🚀",
  "keyBinding": "Ctrl+Shift+6",
  "macroPayload": "Deployment started. Monitor at http://localhost:9999",
  "macroDelay": 4500,
  "toolVariants": {
    "claude": ".\\scripts\\deploy.ps1 -Env staging -Provider claude",
    "copilot": ".\\scripts\\deploy.ps1 -Env staging -Provider copilot"
  }
}
```

Save to `command-cards/<descriptive-name>.json`. The file can be imported via the Forge UI or loaded by calling `POST /api/commands`.

---

## Approach 3 — Add a Toggle Card

Toggle cards render a Start button (runs `Command`) and a Stop button (runs `Toggle.OffCommand`).

```go
{
    ID:          10,
    Description: "Docker Compose",
    Command:     "docker compose up -d",
    Icon:        "🐳",
    CardType:    "toggle",
    Toggle: &ToggleConfig{
        OnLabel:    "Start",
        OffLabel:   "Stop",
        OffCommand: "docker compose down",
    },
},
```

**Rules for toggle cards:**
- `Toggle.OffCommand` is REQUIRED — a toggle card without a teardown command is broken
- The top-level `Command` field is the "on" (start) command
- `MacroPayload` fires after the start action; `Toggle.OffMacroPayload` fires after stop

---

## Approach 4 — Add a Card via the HTTP API

For programmatic creation (scripts, tests, integrations):

```powershell
# Load current cards, append new card, save
$cards = (Invoke-WebRequest http://localhost:9999/api/commands).Content | ConvertFrom-Json
$newCard = @{
    id          = 201
    description = "My New Card"
    command     = "echo hello"
    icon        = "👋"
}
$cards += $newCard
$body = $cards | ConvertTo-Json -Depth 10
Invoke-WebRequest http://localhost:9999/api/commands -Method POST -Body $body -ContentType "application/json"
```

---

## Verification Checklist

Before delivering a new command card, verify all of these:

1. ✅ Card ID does not collide with any existing card in `DefaultCommands` or `~/.forge/commands.json`
2. ✅ `Description` and `Command` are non-empty strings
3. ✅ Toggle cards have `Toggle.OffCommand` set
4. ✅ `go build ./cmd/forge/` passes with no errors
5. ✅ `cd frontend && npx vite build` passes with no errors
6. ✅ Card appears in sidebar after launching via `.\run-dev-clean.ps1 -Port 9999`
7. ✅ Run and Paste buttons behave as expected in the live UI
8. ✅ CHANGELOG.md updated under `[Unreleased]` if this is a default card change

---

## Key Files Reference

| Purpose | Path |
|---|---|
| Command struct + defaults | `internal/commands/storage.go` |
| Migration logic | `internal/commands/migration.go` |
| HTTP handlers (load/save) | `cmd/forge/main.go` — `handleCommands`, `handleRestoreDefaultCommands` |
| Card list UI | `frontend/src/components/CommandCards.jsx` |
| Individual card component | `frontend/src/components/SortableCommandCard.jsx` |
| Create/edit form | `frontend/src/components/CommandModal.jsx` |
| Toggle footer | `frontend/src/components/ToggleCardFooter.jsx` |
| Packaged card examples | `command-cards/*.json` |

---

## Standards That Apply

All code written for command cards is subject to:
- `code-quality` — naming conventions, comment standards, no magic numbers
- Testing (constitution Article V) — write the test before the implementation
- `branching-strategy` — you are on a feature branch before the first file edit

Do not deliver a new default card without a unit test that asserts the card's ID, Description, and Command fields are populated correctly.
