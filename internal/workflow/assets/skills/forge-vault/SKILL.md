---
name: forge-vault
description: "Teaches agents how to access credentials stored in Forge Vault. Activates when a task involves credentials, secrets, API keys, usernames, passwords, tokens, or environment variables. ALWAYS check the vault before asking the user for any credential."
---

# Forge Vault — Credential Access for Agents

> 🔐 **CRITICAL RULE: Never ask the user for a credential that may be in the vault.**
> Check the vault first. If the credential is there, use it. Only ask if it is genuinely absent.

---

## What Is Forge Vault?

Forge Vault is **Forge Terminal's built-in encrypted secret manager**. It is NOT:
- Atlassian Forge's `@forge/api` Storage module
- Atlassian `forge variables` CLI secrets
- A `.env` file
- 1Password, HashiCorp Vault, or any external system

It is a local AES-256-GCM encrypted store at `~/.forge/vault/vault.enc`, managed entirely
by the Forge Terminal server process. Secret **values are never returned by any API** —
they are only used server-side to build terminal environment overlays or short-lived
injection scripts.

---

## How Credentials Reach the Terminal

### Path 1 — Auto-Inject (the normal path, already done for you)

Every vault entry has a `shouldAutoInject` flag. When it is `true`, Forge injects those
environment variables into every new PTY session **before the shell starts** — silently,
as part of the process environment. No command is echoed. No script is run.

**This means: if a credential has auto-inject enabled, it is already available as an
environment variable in the current terminal session.**

Check whether a variable is already set before doing anything else:

```powershell
# PowerShell
$env:SERVICE_NOW_USERNAME    # returns the value if injected, empty string if not
$env:SERVICE_NOW_PASSWORD
```

```bash
# Bash / sh
echo "$SERVICE_NOW_USERNAME"
echo "$SERVICE_NOW_PASSWORD"
```

If the value is non-empty: use it directly. Done.

### Path 2 — List Available Entries (discover what the vault holds)

If you need to know what credentials are available, query the vault API.
Secret **values are never returned** — only names and env var names.

```
GET http://localhost:<forge-port>/api/vault/entries
```

Response shape (values intentionally absent):
```json
[
  {
    "id": "abc123",
    "secretName": "ServiceNow — Username",
    "envVarName": "SERVICE_NOW_USERNAME",
    "shouldAutoInject": true,
    "description": "ServiceNow dev instance"
  },
  {
    "id": "def456",
    "secretName": "ServiceNow — Password",
    "envVarName": "SERVICE_NOW_PASSWORD",
    "shouldAutoInject": true,
    "description": ""
  }
]
```

Use the `envVarName` field to know which shell variable to read.

### Path 3 — Manual Inject (for sessions where auto-inject was off)

If a credential has `shouldAutoInject: false` and you need it in the current session,
request an injection script from the vault API:

```
POST http://localhost:<forge-port>/api/vault/inject
Content-Type: application/json

{ "entryIds": ["abc123", "def456"] }
```

Response:
```json
{ "scriptPath": "C:\\Users\\...\\AppData\\Local\\Temp\\forge-vault-a1b2c3d4.ps1", "injectedCount": 2 }
```

Then source the script in the terminal. The script sets the env vars and **self-deletes**
within one second so the values never persist to disk:

```powershell
# PowerShell
. "C:\Users\...\AppData\Local\Temp\forge-vault-a1b2c3d4.ps1"
```

```bash
# Bash
. /tmp/forge-vault-a1b2c3d4.sh
```

---

## Decision Flow — What To Do When You Need a Credential

```
1. Do I need a credential (API key, username, password, token)?
   │
   ├─ YES → Is the env var already set in this shell session?
   │         │
   │         ├─ YES → Use $ENV_VAR_NAME directly. Done.
   │         │
   │         └─ NO  → Query GET /api/vault/entries
   │                   │
   │                   ├─ Entry found + shouldAutoInject: true
   │                   │   → Open a new terminal session (auto-inject fires on start)
   │                   │     OR use Path 3 (manual inject) for the current session
   │                   │
   │                   ├─ Entry found + shouldAutoInject: false
   │                   │   → Use Path 3 (manual inject)
   │                   │
   │                   └─ Entry NOT found
   │                       → NOW it is appropriate to ask the user
   │                         (and optionally offer to store it in the vault)
   │
   └─ NO  → Proceed normally
```

---

## What NOT To Do

❌ Do not ask the user for a username or password before checking the vault  
❌ Do not look for `.env` files — Forge Terminal does not use them for secrets  
❌ Do not run `forge variables list` — that is Atlassian Forge CLI, a different product  
❌ Do not attempt to read `~/.forge/vault/vault.enc` directly — it is encrypted binary  
❌ Do not print or log any credential value — the vault API never returns them and neither should you  

---

## Vault API Reference (Forge Terminal)

All endpoints are served by the local Forge Terminal server.
The default port is configured in `forge.toml` (usually `3000` or `4000`).

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/vault/status` | Check if vault is open, get entry/auto-inject counts |
| `GET`  | `/api/vault/entries` | List all entries (no values returned) |
| `POST` | `/api/vault/entries` | Add a new entry (requires `secretValue` in body — stored once, never returned) |
| `DELETE` | `/api/vault/entries?id=<id>` | Remove an entry permanently |
| `POST` | `/api/vault/auto-inject` | Toggle auto-inject for an entry |
| `POST` | `/api/vault/inject` | Generate a short-lived injection script for selected entries |

---

## Finding the Forge Port

```powershell
# Read from forge.toml in the project root
Select-String -Path "forge.toml" -Pattern "port"
```

Or check the running process arguments:
```powershell
Get-Process fterm | Select-Object -ExpandProperty CommandLine
```

---

## Credential Naming Convention

When credentials are stored as Username + Password pairs, Forge Terminal's UI names them:
- `{ServiceName} — Username` → env var `{SERVICE_NAME}_USERNAME`
- `{ServiceName} — Password` → env var `{SERVICE_NAME}_PASSWORD`

Examples:
- ServiceNow → `$SERVICE_NOW_USERNAME` / `$SERVICE_NOW_PASSWORD`
- GitHub Account → `$GITHUB_ACCOUNT_USERNAME` / `$GITHUB_ACCOUNT_PASSWORD`
- Jira → `$JIRA_USERNAME` / `$JIRA_PASSWORD`
