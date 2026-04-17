---
name: forge-vault
description: "Provides access to the Forge Vault encrypted secret store. Activates on keywords: vault, secret, credential, key, token, env var, environment variable, inject, .env, API key, password."
---

# Forge Vault — Encrypted Secret Store

You are running inside Forge Terminal, which provides an encrypted vault for
secrets (API keys, tokens, passwords). The vault is accessible via a local HTTP
API — you do NOT need to decrypt files, read encrypted blobs, or install any
extra tooling.

## How It Works

| Concept | Detail |
|---------|--------|
| **Storage** | AES-256-GCM encrypted file at `~/.forge/vault/vault.enc` |
| **Access** | HTTP API at `http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/*` |
| **Auto-inject** | Entries marked "auto-inject" are set as `$env:` vars in every new terminal session automatically |
| **Manual inject** | The `/api/vault/inject` endpoint writes a self-deleting script that sets vars in the current shell |
| **Security** | Values are NEVER returned in list or status responses — only the reveal endpoint returns a single value |

---

## API Reference

All requests go to `http://localhost:$env:FORGE_INSTANCE_PORT`. The port is
always available as the `FORGE_INSTANCE_PORT` environment variable in every
Forge terminal session.

### Check vault status

```powershell
Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/status" -Method GET
```

Returns: `{ isOpen, entryCount, autoInjectCount, vaultPath }`

### List all entries (metadata only — no secret values)

```powershell
$entries = Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/entries" -Method GET
$entries | Format-Table secretName, envVarName, shouldAutoInject
```

Returns an array of:
```json
{
  "id": "uuid",
  "secretName": "Human Label",
  "envVarName": "ENV_VAR_NAME",
  "description": "...",
  "shouldAutoInject": true,
  "createdAt": "...",
  "lastUsedAt": "..."
}
```

### Reveal a single secret value

```powershell
$entryId = "<uuid-from-list>"
$result = Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/entries/value?id=$entryId" -Method GET
# $result.value contains the decrypted secret — handle with care
```

> ⚠️ **NEVER** echo, print, or log the returned value to the terminal.
> Use it programmatically (write to `.env` files, pass to APIs, etc.) and
> ensure it never appears in shell history or command output.

### Add a new entry

```powershell
$body = @{
    secretName       = "My API Key"
    envVarName       = "MY_API_KEY"
    secretValue      = "sk-live-..."
    description      = "Production API key for service X"
    shouldAutoInject = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/entries" `
    -Method POST -Body $body -ContentType "application/json"
```

### Delete an entry

```powershell
Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/entries?id=$entryId" -Method DELETE
```

### Inject secrets into the current shell session

```powershell
$body = @{ entryIds = @("uuid-1", "uuid-2") } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/inject" `
    -Method POST -Body $body -ContentType "application/json"
# $result.scriptPath is a self-deleting .ps1 that sets the env vars
# Source it to make the vars available:
. $result.scriptPath
```

### Toggle auto-inject for an entry

```powershell
$body = @{ id = "uuid"; shouldAutoInject = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:$env:FORGE_INSTANCE_PORT/api/vault/auto-inject" `
    -Method POST -Body $body -ContentType "application/json"
```

---

## Common Workflows

### Find a secret by name and write it to a .env file

```powershell
$port = $env:FORGE_INSTANCE_PORT
$entries = Invoke-RestMethod -Uri "http://localhost:$port/api/vault/entries" -Method GET

# Find the entry by env var name
$targetEntry = $entries | Where-Object { $_.envVarName -eq "STRIPE_SECRET_KEY" }

if ($targetEntry) {
    $revealed = Invoke-RestMethod -Uri "http://localhost:$port/api/vault/entries/value?id=$($targetEntry.id)" -Method GET
    # Write to .env.local — NEVER echo the value to terminal
    Add-Content -Path ".env.local" -Value "$($targetEntry.envVarName)=$($revealed.value)"
    Write-Host "Wrote $($targetEntry.envVarName) to .env.local"
} else {
    Write-Host "Entry not found in vault"
}
```

### Check if auto-inject vars are already available

Entries with `shouldAutoInject = true` are set as environment variables in
every new terminal session. Before calling the API, check if the variable is
already present:

```powershell
if ($env:STRIPE_SECRET_KEY) {
    Write-Host "STRIPE_SECRET_KEY is already available via auto-inject"
} else {
    Write-Host "Not auto-injected — use the vault API to retrieve it"
}
```

### Batch-write multiple vault entries to a .env file

```powershell
$port = $env:FORGE_INSTANCE_PORT
$entries = Invoke-RestMethod -Uri "http://localhost:$port/api/vault/entries" -Method GET

# Filter for the entries you need
$targetVarNames = @("STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "DATABASE_URL")
$matchingEntries = $entries | Where-Object { $targetVarNames -contains $_.envVarName }

$envFileContent = ""
foreach ($entry in $matchingEntries) {
    $revealed = Invoke-RestMethod -Uri "http://localhost:$port/api/vault/entries/value?id=$($entry.id)" -Method GET
    $envFileContent += "$($entry.envVarName)=$($revealed.value)`n"
}

Set-Content -Path ".env.local" -Value $envFileContent -NoNewline
Write-Host "Wrote $($matchingEntries.Count) secrets to .env.local"
```

---

## Security Rules (MANDATORY)

1. **NEVER** print, echo, Write-Host, or log secret values to the terminal
2. **NEVER** include secret values in commit messages, code comments, or PR descriptions
3. **NEVER** pass secret values as command-line arguments (visible in process list)
4. **ALWAYS** write secrets to files with restricted permissions, or use env injection
5. **ALWAYS** add `.env.local` and `.env*.local` to `.gitignore` before writing secrets
6. The vault API runs on localhost only — it is not network-accessible

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `FORGE_INSTANCE_PORT` is empty | You are not running inside a Forge terminal session |
| API returns 503 | Vault failed to open — check Forge server logs |
| API returns 405 | Wrong HTTP method or wrong endpoint path (see reference above) |
| Entry not found | Use `/api/vault/entries` to list all entries and verify the ID |
| Auto-inject var missing | Open a **new** terminal tab — auto-inject only applies to new sessions |
