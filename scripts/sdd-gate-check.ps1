# sdd-gate-check.ps1 — PreToolUse hook for the SDD HITL gate system.
#
# Claude Code calls this script before every Skill tool invocation. For speckit-*
# skills it does two things, scoped to THIS terminal session via FORGE_SESSION_ID:
#   1. Enforcement — queries the session-scoped gate-check endpoint; if this session
#      has an open gate (StatusAwaitingDecision), it blocks the agent (exit 1).
#   2. Authoritative signal — when the skill maps to a pipeline phase and no gate is
#      open, it POSTs phase-event{started} so the dashboard shows the phase running
#      immediately, without waiting for the file watcher (specs/010, FR-001/FR-001b).
#
# Per-session scoping (specs/010, FR-005) means a gate open in another tab never
# blocks this one. An unbound session (no FORGE_SESSION_ID) is SDD-inactive and is
# never blocked (FR-011a graceful degrade).
#
# Exit codes:  0 = allow   1 = block (output is shown to the developer)
#
# specs/008-sdd-real-enforcement FR-001..003; specs/010-sdd-authoritative-state FR-001/005/011a

param()

$apiBase = 'http://localhost:3005'

# Read the tool-use request Claude Code passes on stdin.
$rawInput = [System.Console]::In.ReadToEnd()

$toolUse = $null
try {
    $toolUse = $rawInput | ConvertFrom-Json -ErrorAction Stop
} catch {
    # Cannot parse input — allow rather than blocking valid non-SDD work.
    exit 0
}

$skillName = $toolUse.tool_input.skill
if (-not $skillName -or -not $skillName.StartsWith('speckit-')) {
    exit 0  # Not a speckit skill; no gate enforcement needed.
}

# Per-tab identity. Absent => this session has no SDD pipeline bound (injection failed
# or SDD not in use); degrade gracefully by allowing the call (FR-011a).
$sessionId = $env:FORGE_SESSION_ID
if (-not $sessionId) {
    exit 0
}

# --- Enforcement: is THIS session's gate open? (session-scoped, FR-005) ------------
$gateCheckUrl = "$apiBase/api/sdd/gate-check?sessionId=$([uri]::EscapeDataString($sessionId))"
try {
    $response = Invoke-RestMethod -Uri $gateCheckUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
} catch {
    # Forge Terminal is unreachable — fail safe by blocking (distinct from the unbound
    # case above: here the backend is down, not the identity missing).
    Write-Output "SDD gate check: could not reach Forge Terminal at $apiBase. Ensure Forge Terminal is running before invoking /$skillName."
    exit 1
}

if ($response.isGateOpen) {
    $phase = $response.phase
    Write-Output "SDD gate is open for the '$phase' phase. Open the Forge Terminal dashboard, review the report, and click Approve, Reject, or Clarify before running /$skillName."
    exit 1
}

# --- Authoritative signal: this pipeline phase is now starting (FR-001/FR-001b) ----
# Map the speckit skill to its pipeline phase. Non-pipeline speckit skills (e.g.
# constitution, checklist) are gate-checked above but emit no phase-event.
$phaseForSkill = @{
    'speckit-specify'   = 'specify'
    'speckit-clarify'   = 'clarify'
    'speckit-plan'      = 'plan'
    'speckit-tasks'     = 'tasks'
    'speckit-analyze'   = 'validate'
    'speckit-implement' = 'implement'
}
$phaseName = $phaseForSkill[$skillName]
if ($phaseName) {
    $startedBody = @{ sessionId = $sessionId; phase = $phaseName; event = 'started' } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Uri "$apiBase/api/sdd/phase-event" -Method Post `
            -Body $startedBody -ContentType 'application/json' -TimeoutSec 3 -ErrorAction Stop | Out-Null
    } catch {
        # Best-effort: the started signal is advisory (disk reconciliation is the fallback).
        # A failure here must never block the developer's phase from running.
    }
}

exit 0
