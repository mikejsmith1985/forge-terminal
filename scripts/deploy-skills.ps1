# deploy-skills.ps1 — Distributes Forge Terminal skills to target repos, per-repo and tool-agnostic.
#
# Single source of truth: forge-terminal/.github/skills/<name>/SKILL.md. For each target repo this
# script copies the canonical skill files in, then DERIVES every tool's view of them FROM that same
# per-repo .github/skills/ copy — so a repo's .github/skills/ is the one canonical source for all
# CLI tools working in that repo:
#   1. .github/skills/<name>/SKILL.md   — canonical (Copilot/Forge + any tool reading the dir)
#   2. .claude/commands/<name>.md       — Claude Code reads these as project skills
#   3. .github/copilot-instructions.md  — the FORGE-SKILLS marked section (GitHub Copilot)
#
# Machine-wide skills: the project-AGNOSTIC subset ($globalSkills) is ALSO hoisted into the user-level
# ~/.claude/skills directory, so every Claude Code project on this machine inherits the core workflow
# skills WITHOUT per-repo replication (Claude Code natively resolves user-level skills). Forge-specific
# skills — e.g. forge-vault and add-command-card, which assume Forge Terminal's own systems — are
# deliberately NOT hoisted; they stay per-repo so they never override unrelated projects. Use -GlobalOnly
# to refresh just the user-level set without touching any repo.
#
# Usage:
#   .\scripts\deploy-skills.ps1                  # deploy to all sibling git repos
#   .\scripts\deploy-skills.ps1 -Target C:\Path  # deploy to a specific project
#   .\scripts\deploy-skills.ps1 -DryRun          # preview without writing files
#
# Safe to re-run — it overwrites the generated views with the latest canonical skill content.

param(
    [string]$Target = "",
    [switch]$DryRun,
    [switch]$GlobalOnly
)

$ErrorActionPreference = "Stop"

$forgeTerminalRoot = Split-Path $PSScriptRoot -Parent
$skillsSource      = Join-Path $forgeTerminalRoot ".github\skills"
$projectsRoot      = Split-Path $forgeTerminalRoot -Parent

# The curated, general-purpose skills exposed to agents in EVERY repo (as Claude commands and in the
# Copilot instructions). Names are .github/skills/ directory names — the canonical source. Forge-only
# skills (e.g. forced-greeting, effectiveness-tracking) are still copied as .github/skills files but
# are not surfaced as per-repo commands. Order controls the Copilot embedding sequence.
$curatedSkills = @(
    'workflow-enforcer',
    'code-quality',
    'framework-first',
    'branching-strategy',
    'add-command-card',
    'forge-vault'
)

$markerStart = '<!-- FORGE-SKILLS-START -->'
$markerEnd   = '<!-- FORGE-SKILLS-END -->'

# The subset of curated skills that are project-AGNOSTIC and safe to install machine-wide in
# ~/.claude/skills (Claude Code user-level skills, inherited by every project without replication).
# workflow-enforcer self-detects project mode (SDD via .specify/memory/constitution.md), so it
# degrades gracefully in any repo.
$globalSkills = @(
    'workflow-enforcer',
    'code-quality',
    'framework-first',
    'branching-strategy'
)

# Write-GlobalUserSkills copies the project-agnostic skills into the user-level ~/.claude/skills
# directory. This is what makes the core workflow skills appear in EVERY Claude Code project on the
# machine with no per-repo copy — Claude Code natively resolves user-level skills, so we defer to that
# mechanism instead of replicating files into each repo.
function Write-GlobalUserSkills {
    $globalSkillsDir = Join-Path $HOME ".claude\skills"
    Write-Host "  --> ~/.claude/skills (machine-wide)" -ForegroundColor White
    $hoistedCount = 0
    foreach ($skillName in $globalSkills) {
        $sourceFile = Join-Path $skillsSource "$skillName\SKILL.md"
        if (-not (Test-Path $sourceFile)) {
            Write-Host "      [--] $skillName missing from .github/skills - skipped" -ForegroundColor DarkGray
            continue
        }
        $destDir  = Join-Path $globalSkillsDir $skillName
        $destFile = Join-Path $destDir "SKILL.md"
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            Copy-Item -Path $sourceFile -Destination $destFile -Force
        }
        $hoistedCount++
    }
    Write-Host "      [OK] $hoistedCount generic skill(s) hoisted to user level" -ForegroundColor Green
}

Write-Host ""
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host "|   Forge Terminal - Deploy Skills (per-repo)    |" -ForegroundColor Cyan
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY RUN] No files will be written." -ForegroundColor Yellow
    Write-Host ""
}

# -GlobalOnly refreshes the machine-wide user-level skills and skips the per-repo deploy entirely.
# Use it after editing a skill master when you only need ~/.claude/skills brought up to date.
if ($GlobalOnly) {
    Write-GlobalUserSkills
    Write-Host ""
    Write-Host "  Global skill hoist complete$(if ($DryRun) { ' [DRY RUN]' })." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ── Collect target repos ───────────────────────────────────────────────────────
$targetRepos = @()
if ($Target -ne "") {
    if (-not (Test-Path $Target)) {
        Write-Host "  [ERROR] Target path not found: $Target" -ForegroundColor Red
        exit 1
    }
    $targetRepos = @($Target)
} else {
    # All sibling git repos, excluding forge-terminal itself
    $targetRepos = Get-ChildItem $projectsRoot -Directory |
        Where-Object {
            $_.FullName -ne $forgeTerminalRoot -and
            (Test-Path (Join-Path $_.FullName ".git"))
        } |
        Select-Object -ExpandProperty FullName
}

if ($targetRepos.Count -eq 0) {
    Write-Host "  No target repos found." -ForegroundColor Yellow
    exit 0
}

Write-Host "  Source : $skillsSource"
Write-Host "  Targets: $($targetRepos.Count) repo(s)"
Write-Host ""

# ── Helpers ────────────────────────────────────────────────────────────────────

# Reads a deployed skill's canonical content for a repo, or $null if the skill is absent there.
function Get-RepoSkillContent {
    param([string]$RepoPath, [string]$SkillName)
    $skillFile = Join-Path $RepoPath ".github\skills\$SkillName\SKILL.md"
    if (-not (Test-Path $skillFile)) { return $null }
    return (Get-Content $skillFile -Raw -Encoding UTF8).TrimEnd()
}

# Builds the FORGE-SKILLS block embedded into a repo's copilot-instructions.md from curated skills.
function Build-CopilotSkillBlock {
    param([string]$RepoPath)
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add($markerStart)
    $lines.Add('')
    $lines.Add('# Forge Workflow Skills - Canonical Content')
    $lines.Add('>')
    $lines.Add('> AUTO-GENERATED by scripts/deploy-skills.ps1 from this repo''s .github/skills/.')
    $lines.Add('> Do NOT edit manually. Re-run deploy-skills.ps1 after changing a skill.')
    $lines.Add('')
    foreach ($skillName in $curatedSkills) {
        $content = Get-RepoSkillContent -RepoPath $RepoPath -SkillName $skillName
        if ($null -eq $content) { continue }
        $lines.Add('---')
        $lines.Add('')
        $lines.Add("## SKILL: $skillName")
        $lines.Add('')
        $lines.Add($content)
        $lines.Add('')
    }
    $lines.Add('---')
    $lines.Add('')
    $lines.Add($markerEnd)
    return ($lines -join "`n")
}

# ── Deploy loop ────────────────────────────────────────────────────────────────

$successCount = 0
$skillDirs    = Get-ChildItem $skillsSource -Directory | Select-Object -ExpandProperty FullName

foreach ($repoPath in $targetRepos) {
    $repoName      = Split-Path $repoPath -Leaf
    $destSkillsDir = Join-Path $repoPath ".github\skills"

    Write-Host "  --> $repoName" -ForegroundColor White

    # Step 1: copy every canonical skill file into the repo's .github/skills/ (the source of truth).
    foreach ($skillDir in $skillDirs) {
        $skillName = Split-Path $skillDir -Leaf
        $skillFile = Join-Path $skillDir "SKILL.md"
        if (-not (Test-Path $skillFile)) { continue }
        $destDir  = Join-Path $destSkillsDir $skillName
        $destFile = Join-Path $destDir "SKILL.md"
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            Copy-Item -Path $skillFile -Destination $destFile -Force
        }
    }
    Write-Host "      [OK] .github/skills/ ($($skillDirs.Count) skills)" -ForegroundColor Green

    # Step 2: derive the repo's Claude commands from its now-canonical .github/skills/ copies.
    $claudeCommandsDir = Join-Path $repoPath ".claude\commands"
    $claudeWritten     = 0
    foreach ($skillName in $curatedSkills) {
        $content = Get-RepoSkillContent -RepoPath $repoPath -SkillName $skillName
        if ($null -eq $content) { continue }
        $destFile = Join-Path $claudeCommandsDir "$skillName.md"
        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $claudeCommandsDir -Force | Out-Null
            Set-Content -Path $destFile -Value $content -Encoding UTF8 -NoNewline
        }
        $claudeWritten++
    }
    Write-Host "      [OK] .claude/commands/ ($claudeWritten skills)" -ForegroundColor Green

    # Step 3: refresh the FORGE-SKILLS section of the repo's copilot-instructions.md, if present.
    $copilotInstructions = Join-Path $repoPath ".github\copilot-instructions.md"
    if (Test-Path $copilotInstructions) {
        $skillBlock = Build-CopilotSkillBlock -RepoPath $repoPath
        $existing   = Get-Content $copilotInstructions -Raw -Encoding UTF8
        if ($existing -match [regex]::Escape($markerStart)) {
            $pattern = [regex]::Escape($markerStart) + '[\s\S]*?' + [regex]::Escape($markerEnd)
            $updated = [regex]::Replace($existing, $pattern, $skillBlock)
        } else {
            $separator = if ($existing.TrimEnd().Length -gt 0) { "`n`n" } else { '' }
            $updated   = $existing.TrimEnd() + $separator + $skillBlock + "`n"
        }
        if (-not $DryRun) {
            Set-Content -Path $copilotInstructions -Value $updated -Encoding UTF8 -NoNewline
        }
        Write-Host "      [OK] .github/copilot-instructions.md (Copilot section)" -ForegroundColor Green
    } else {
        Write-Host "      [--] no copilot-instructions.md (skipped Copilot embed)" -ForegroundColor DarkGray
    }

    $successCount++
    Write-Host ""
}

# Keep the machine-wide user-level skills in sync on every full deploy, not just on -GlobalOnly.
Write-GlobalUserSkills
Write-Host ""

Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host "  Skills deployed to $successCount repo(s)$(if ($DryRun) { ' [DRY RUN]' })" -ForegroundColor Green
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host ""
