# sdd-gate-check.ps1 — PreToolUse enforcement hook for the SDD HITL gate system.
#
# Claude Code calls this script before every Skill tool invocation. If the skill
# name begins with "speckit-", the script queries the Forge Terminal gate-check
# endpoint. When any pipeline has an open gate (StatusAwaitingDecision), this
# script exits 1 — which blocks the agent and shows the output as an error message.
#
# Exit codes:  0 = allow   1 = block (output is shown to the developer)
#
# specs/008-sdd-real-enforcement FR-001, FR-002, FR-003

param()

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

# The gate-check endpoint is the authoritative source of whether any active pipeline
# is awaiting a developer decision. It is localhost-only so no authentication is needed.
$gateCheckUrl = 'http://localhost:3005/api/sdd/gate-check'

try {
    $response = Invoke-RestMethod -Uri $gateCheckUrl -Method Get `
        -TimeoutSec 3 -ErrorAction Stop
} catch {
    # Forge Terminal is unreachable — fail safe by blocking.
    Write-Output "SDD gate check: could not reach Forge Terminal at $gateCheckUrl. Ensure Forge Terminal is running before invoking /$skillName."
    exit 1
}

if ($response.isGateOpen) {
    $phase = $response.phase
    Write-Output "SDD gate is open for the '$phase' phase. Open the Forge Terminal dashboard, review the output, and click Approve, Reject, or Clarify before running /$skillName."
    exit 1
}

exit 0
