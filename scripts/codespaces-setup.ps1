#Requires -Version 5.1
<#
.SYNOPSIS
    Forge Terminal — Codespaces IDE Setup Wizard

.DESCRIPTION
    Interactive wizard that configures GitHub Codespaces so you can run
    Forge Terminal as your IDE from any browser on any machine.
    
    What it does:
      1. Checks prerequisites
      2. Generates a permanent FORGE_TOKEN and stores it as a repo Codespaces secret
      3. Verifies the devcontainer configuration
      4. Opens your browser to create/manage your Codespace
      5. Optionally enables Codespaces prebuilds for faster startup

.EXAMPLE
    .\scripts\codespaces-setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT  = Split-Path $PSScriptRoot -Parent
$REPO  = "mikejsmith1985/forge-terminal"
$PORT  = 3005

# ── Colours ──────────────────────────────────────────────────────────────────
function Write-Header {
    param($msg)
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════════" -ForegroundColor DarkCyan
    Write-Host "    $msg" -ForegroundColor Cyan
    Write-Host "  ══════════════════════════════════════════════" -ForegroundColor DarkCyan
}
function Write-Step   { param($n, $msg) Write-Host "  [$n] $msg" -ForegroundColor White }
function Write-OK     { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Info   { param($msg) Write-Host "     $msg" -ForegroundColor DarkGray }
function Write-Action { param($msg) Write-Host "  👉 $msg" -ForegroundColor Magenta }
function Write-Fail   { param($msg) Write-Host "  ❌ $msg" -ForegroundColor Red }
function Pause-ForKey {
    param($prompt = "Press Enter to continue...")
    Write-Host ""
    Write-Host "  $prompt" -ForegroundColor DarkYellow -NoNewline
    $null = Read-Host
}
function Open-Browser { param($url) Start-Process $url }

function Write-CopyBox {
    param($label, $value)
    Write-Host ""
    Write-Host "  ┌─ $label " -ForegroundColor DarkYellow
    Write-Host "  │  $value" -ForegroundColor Yellow
    Write-Host "  └─ (copy the line above)" -ForegroundColor DarkGray
    Write-Host ""
}

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║   Forge Terminal — Codespaces Setup Wizard   ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "  This wizard sets up Forge Terminal as your browser-based IDE" -ForegroundColor Gray
Write-Host "  running in GitHub Codespaces. You can then use it from any" -ForegroundColor Gray
Write-Host "  machine (work laptop, tablet, etc.) with just a browser." -ForegroundColor Gray
Write-Host ""
Write-Host "  Steps:" -ForegroundColor DarkGray
Write-Host "    1 · Check prerequisites" -ForegroundColor DarkGray
Write-Host "    2 · Generate + store permanent auth token" -ForegroundColor DarkGray
Write-Host "    3 · Verify devcontainer config" -ForegroundColor DarkGray
Write-Host "    4 · Create / open your Codespace" -ForegroundColor DarkGray
Write-Host "    5 · (Optional) Enable prebuilds for faster startup" -ForegroundColor DarkGray
Write-Host ""
Pause-ForKey "Press Enter to start..."

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 1 · Prerequisites"

# gh CLI
Write-Step "1/3" "Checking gh CLI..."
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Fail "gh CLI not found in PATH"
    Write-Action "Install it from: https://cli.github.com"
    Open-Browser "https://cli.github.com"
    exit 1
}
Write-OK "gh CLI found: $(gh --version | Select-Object -First 1)"

# Authentication
Write-Step "2/3" "Checking GitHub authentication..."
Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
$ghUser = gh api user --jq '.login' 2>$null
if (-not $ghUser) {
    Write-Warn "Not authenticated. Launching: gh auth login"
    gh auth login
    $ghUser = gh api user --jq '.login' 2>$null
    if (-not $ghUser) {
        Write-Fail "Authentication failed. Run: gh auth login"
        exit 1
    }
}
Write-OK "Authenticated as: $ghUser"

# Repo access
Write-Step "3/3" "Verifying repository access..."
$repoCheck = gh api "repos/$REPO" --jq '.full_name' 2>$null
if (-not $repoCheck) {
    Write-Fail "Cannot access repo: $REPO"
    Write-Info "Make sure you're authenticated with the right account."
    exit 1
}
Write-OK "Repository: $repoCheck"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 2 · Permanent Auth Token (FORGE_TOKEN)"

Write-Host ""
Write-Host "  Without a permanent token, a new random token is generated" -ForegroundColor Gray
Write-Host "  every time your Codespace restarts. Your bookmark URL changes." -ForegroundColor Gray
Write-Host "  Setting FORGE_TOKEN as a Codespaces secret fixes this." -ForegroundColor Gray
Write-Host ""

# Check if FORGE_TOKEN secret already exists
Write-Step "1/2" "Checking for existing FORGE_TOKEN secret..."
$existingSecrets = gh secret list --app codespaces --repo $REPO --json name 2>$null | ConvertFrom-Json
$tokenExists = $existingSecrets | Where-Object { $_.name -eq "FORGE_TOKEN" }

if ($tokenExists) {
    Write-OK "FORGE_TOKEN secret already exists on this repo."
    Write-Host ""
    $choice = Read-Host "  Regenerate it with a new value? (y/N)"
    if ($choice -notmatch '^[Yy]$') {
        Write-OK "Keeping existing token."
        $tokenSet = $true
        $generatedToken = "(existing — value not shown)"
    } else {
        $tokenSet = $false
    }
} else {
    $tokenSet = $false
}

if (-not $tokenSet) {
    Write-Step "2/2" "Generating secure random token..."
    
    # Generate a 32-char alphanumeric token
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $tokenBytes = New-Object byte[] 48
    $rng.GetBytes($tokenBytes)
    $generatedToken = -join ($tokenBytes | ForEach-Object { $chars[$_ % $chars.Length] }) | Select-Object -First 1
    # Use a cleaner approach
    $sb = [System.Text.StringBuilder]::new()
    foreach ($b in $tokenBytes) { $null = $sb.Append($chars[$b % $chars.Length]) }
    $generatedToken = $sb.ToString().Substring(0, 40)
    
    Write-OK "Token generated."
    Write-Host ""
    Write-CopyBox "Your FORGE_TOKEN (save this somewhere safe)" $generatedToken
    
    Write-Step "2/2" "Storing FORGE_TOKEN as a Codespaces secret..."
    $generatedToken | gh secret set FORGE_TOKEN --app codespaces --repo $REPO
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to set secret. You may not have admin access to this repo."
        Write-Action "Set it manually at: https://github.com/$REPO/settings/secrets/codespaces"
        Open-Browser "https://github.com/$REPO/settings/secrets/codespaces"
        Pause-ForKey "Press Enter after setting the secret manually..."
    } else {
        Write-OK "FORGE_TOKEN secret stored on repo: $REPO"
        Write-Info "Your Codespace URL will always end with: ?token=$generatedToken"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 3 · Verify devcontainer Configuration"

Write-Step "1/1" "Checking .devcontainer/devcontainer.json..."
$devcontainerPath = Join-Path $ROOT ".devcontainer\devcontainer.json"

if (-not (Test-Path $devcontainerPath)) {
    Write-Fail ".devcontainer/devcontainer.json not found at: $devcontainerPath"
    exit 1
}

$dc = Get-Content $devcontainerPath -Raw | ConvertFrom-Json

$checks = @(
    @{ label = "Port $PORT forwarded"; ok = ($dc.forwardPorts -contains $PORT) },
    @{ label = "FORGE_HOST set to 0.0.0.0"; ok = ($dc.remoteEnv.FORGE_HOST -eq "0.0.0.0") },
    @{ label = "postCreateCommand builds fterm"; ok = ($dc.postCreateCommand -match "go build") },
    @{ label = "postStartCommand starts fterm"; ok = ($dc.postStartCommand -match "fterm") },
    @{ label = "FORGE_TOKEN secret declared"; ok = ($null -ne $dc.secrets.FORGE_TOKEN) },
    @{ label = "npm build in postCreateCommand"; ok = ($dc.postCreateCommand -match "npm run build") }
)

$allOK = $true
foreach ($c in $checks) {
    if ($c.ok) { Write-OK $c.label }
    else { Write-Warn "Missing: $($c.label)"; $allOK = $false }
}

if (-not $allOK) {
    Write-Host ""
    Write-Warn "Some checks failed. The devcontainer may not start correctly."
    Write-Info "Run: code .devcontainer/devcontainer.json to review."
} else {
    Write-Host ""
    Write-OK "devcontainer.json looks perfect!"
}

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 4 · Create / Open Your Codespace"

Write-Host ""
Write-Host "  Your Codespace will:" -ForegroundColor Gray
Write-Host "    • Install npm dependencies + build the frontend (~2 min first time)" -ForegroundColor Gray
Write-Host "    • Compile the Go binary (fterm)" -ForegroundColor Gray
Write-Host "    • Auto-start Forge Terminal on port $PORT" -ForegroundColor Gray
Write-Host "    • Print your access URL including your permanent token" -ForegroundColor Gray
Write-Host ""

# Check for existing codespaces
Write-Step "1/2" "Checking for existing Codespaces on this repo..."
$existingCS = gh codespace list --repo $REPO --json name,state,displayName 2>$null | ConvertFrom-Json

if ($existingCS -and $existingCS.Count -gt 0) {
    Write-Host ""
    Write-Host "  Found existing Codespace(s):" -ForegroundColor White
    foreach ($cs in $existingCS) {
        $stateColor = if ($cs.state -eq "Available") { "Green" } else { "Yellow" }
        $csLabel = if ($cs.displayName) { $cs.displayName } else { $cs.name }
        Write-Host "    • $csLabel  [$($cs.state)]" -ForegroundColor $stateColor
    }
    Write-Host ""
    
    $choice = Read-Host "  Open existing Codespace in browser? (Y/n)"
    if ($choice -notmatch '^[Nn]$') {
        $target = $existingCS[0]
        Write-Step "2/2" "Opening Codespace '$($target.name)'..."
        $csURL = "https://github.com/codespaces/$($target.name)"
        Open-Browser $csURL
        Write-OK "Browser opened to: $csURL"
    } else {
        Write-Step "2/2" "Opening 'Create new Codespace' page..."
        Open-Browser "https://github.com/codespaces/new?repo=$REPO"
        Write-OK "Browser opened — create a new Codespace on main branch."
    }
} else {
    Write-Step "2/2" "No existing Codespaces found. Opening creation page..."
    $createURL = "https://github.com/codespaces/new?repo=$REPO&ref=main"
    Open-Browser $createURL
    Write-OK "Browser opened: $createURL"
    Write-Host ""
    Write-Host "  In the browser:" -ForegroundColor Gray
    Write-Host "    1. Leave all defaults (machine type: 2-core is fine)" -ForegroundColor Gray
    Write-Host "    2. Click 'Create codespace'" -ForegroundColor Gray
    Write-Host "    3. Wait ~3–5 minutes for the build to complete" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Once Forge Terminal starts, look in the terminal" -ForegroundColor Gray
Write-Host "  panel for a line like:" -ForegroundColor Gray
Write-Host ""
Write-Host "    🌐 External Codespace URL: https://xxx-$PORT.app.github.dev?token=…" -ForegroundColor Cyan
Write-Host ""
Write-Host "  That URL opens Forge Terminal in any browser." -ForegroundColor Gray
if ($generatedToken -and $generatedToken -ne "(existing — value not shown)") {
    Write-Host "  Your token: $generatedToken" -ForegroundColor Yellow
    Write-Host "  Bookmark:   https://<codespace-name>-$PORT.app.github.dev?token=$generatedToken" -ForegroundColor DarkYellow
}
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Step 5 · (Optional) Enable Prebuilds"

Write-Host ""
Write-Host "  Prebuilds run postCreateCommand nightly so your Codespace" -ForegroundColor Gray
Write-Host "  starts in ~30 seconds instead of ~5 minutes." -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "  Enable prebuilds now? (Y/n)"
if ($choice -notmatch '^[Nn]$') {
    $prebuildURL = "https://github.com/$REPO/settings/codespaces"
    Open-Browser $prebuildURL
    Write-Host ""
    Write-Host "  In the browser (Codespaces Settings page):" -ForegroundColor Gray
    Write-Host "    1. Scroll to 'Codespaces prebuild configuration'" -ForegroundColor Gray
    Write-Host "    2. Click 'Set up prebuild'" -ForegroundColor Gray
    Write-Host "    3. Branch: main" -ForegroundColor Gray
    Write-Host "    4. Trigger: 'On every push' (recommended)" -ForegroundColor Gray
    Write-Host "    5. Region: pick the one closest to you" -ForegroundColor Gray
    Write-Host "    6. Click 'Create'" -ForegroundColor Gray
    Write-Host ""
    Write-OK "Browser opened: $prebuildURL"
} else {
    Write-Info "Skipped. You can enable prebuilds later at:"
    Write-Info "https://github.com/$REPO/settings/codespaces"
}

# ═══════════════════════════════════════════════════════════════════════════════
Write-Header "Setup Complete 🎉"

Write-Host ""
Write-Host "  Summary of what was configured:" -ForegroundColor White
Write-Host ""
Write-OK "FORGE_TOKEN secret → stored as Codespaces repo secret"
Write-OK "devcontainer.json → verified (port $PORT, auth, build steps)"
Write-OK "Codespace → browser opened"
Write-Host ""
Write-Host "  To access Forge Terminal from any machine:" -ForegroundColor White
Write-Host "    1. Go to: https://github.com/$REPO/codespaces" -ForegroundColor Cyan
Write-Host "    2. Click your Codespace name to resume it" -ForegroundColor Gray
Write-Host "    3. Copy the URL from the terminal (🌐 External Codespace URL)" -ForegroundColor Gray
Write-Host "    4. Open that URL in any browser" -ForegroundColor Gray
Write-Host ""
Write-Host "  ⚡ Pro tip: Bookmark the URL with your token — it never changes!" -ForegroundColor DarkYellow
Write-Host ""
