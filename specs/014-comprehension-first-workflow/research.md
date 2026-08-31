# Phase 0 Research — Comprehension-First Workflow

**Feature**: `specs/014-comprehension-first-workflow` | **Date**: 2026-08-31

Every decision below is against a seam that already exists in this repository. The
Framework-First gate (Article VII) is satisfied by reuse in four of five cases; the one genuinely
new unit carries its justification.

---

## R1 — The brief is a published artefact, not parsed prose

**Decision**: The agent publishes the brief through a Forge MCP tool. Forge never infers a brief
from terminal output.

**Rationale**: Forge owns the PTY and keeps a per-session scrollback ring buffer
(`internal/mcp/tools_terminal.go:253`, `GetSessionScrollback`), so it sees every byte from any CLI.
But an agent CLI is a full-screen program: what lands in that buffer is escape sequences and screen
redraws, not a transcript. Recovering "the assistant's answer" from it is heuristic, and a
heuristic that is sometimes wrong cannot be a gate — it would either block correct work or pass
bad work, and both destroy trust in the mechanism.

An artefact inverts the problem. Forge receives exactly what the agent meant to send, can render it
faithfully, and — critically — **can detect its absence**. Absence is what makes a gate possible.

**Alternatives considered**:

| Alternative | Why rejected |
|---|---|
| Parse the brief out of terminal scrollback | Fragile against TUI redraws; cannot be a gate |
| Require the developer to run a command to capture a brief | Puts the work on the person the feature exists to protect |
| Have the agent write a file the hook reads | Workable, but loses live rendering and duplicates the MCP transport already present |

---

## R2 — Enforcement is split, because the two halves are not equally enforceable

**Decision**: Prose format is **warned** about. The brief artefact and code naming are **gated**.

**Rationale**: This follows directly from R1. The existing ledger mechanism
(`internal/workflow/ticket.go`) already proves that gating an artefact works: `RequiredGates` lists
what a commit must have recorded, and the pre-commit hook calls `forge workflow preflight` and
refuses the commit on a non-zero status (`internal/workflow/hooks.go:116-131`). That same mechanism
extends to a brief with no new machinery.

Prose has no equivalent. Warning is the honest ceiling, and the specification says so rather than
implying a guarantee it cannot keep.

**Alternatives considered**: withholding or rewriting a non-compliant response was considered and
rejected for now — it requires reliable detection, which R1 establishes is not available. The
developer selected the warning level explicitly.

---

## R3 — Reuse the gate ledger rather than build a second one

**Decision**: Add one gate constant and one entry to `RequiredGates` in
`internal/workflow/ticket.go`.

**Rationale**: The extension point is a plain slice:

```go
var RequiredGates = []string{ GateBranchCreated, GateTestsWritten, GateTestsPassed }
```

Gate identifiers are already string constants "so callers cannot typo them", and unused constants
for future gates (`GatePlanRecorded`, `GateUXValidated`, `GateBuildPassed`) show the author
intended the set to grow. Adding `brief-published` is the change the design was built for.

**Alternatives considered**: a separate brief-tracking file was rejected — it would need its own
hook, its own bypass path, and its own audit trail, all of which the ticket already has.

---

## R4 — Reuse the WebSocket push and panel pattern

**Decision**: Push the brief to the frontend over the existing hub and render it in a panel, copying
the shape of the SDD gate card.

**Rationale**: `internal/terminal/mcp_bridge.go:119` exposes `BroadcastJSONToSession`, already used
to push `SDD_PHASE_GATE` to the frontend, where `frontend/src/hooks/useSddGate.js` receives it by
message type and drives a card. The brief is the same shape of problem — a server-originated event
that must appear in the UI and survive a reload — and that hook already solves the reload case by
restoring a pending card from disk.

**Alternatives considered**:

| Alternative | Why rejected now |
|---|---|
| Browser page per brief | Most screen room, but a context switch; the developer flagged this trade-off himself. Deliberately kept possible later by making the stored form renderer-independent (FR-026) |
| Render in the terminal | Cramped, and cannot achieve the billboard legibility the feature is for |

---

## R5 — Naming enforcement runs in the hook that already exists

**Decision**: Add a naming check to the pre-commit path, scoped to changed files, with the existing
`FORGE_BYPASS` escape hatch.

**Rationale**: Article IV already mandates the rules — no single-letter names outside `i`/`j`/`k`
and `w`/`r`, boolean prefixes, verb-first functions. The gap is mechanical enforcement, not policy.
The pre-commit hook already exists, already blocks, already has an audited bypass
(`FORGE_BYPASS=1` with a reason appended to `.forge/bypasses.log`), and already degrades gracefully
when the forge binary is absent (`hooks.go:109-113`).

**Justification for the one custom unit**: no linter in the current toolchain enforces domain
meaningfulness. `go vet` does not check naming style; oxlint covers the frontend but not this rule
set. A small checker is a documented gap, not a rebuild — and it deliberately stops at the
mechanical rules. A name can satisfy every rule and still be meaningless, which is why FR-019 sends
that judgement to the brief for a human rather than pretending a checker can make it.

**Alternatives considered**: a full custom linter was rejected as disproportionate; a pre-push
rather than pre-commit check was rejected because the feedback arrives too late to be useful.

---

## R6 — Provider portability

**Decision**: MCP is the transport, and no per-provider adaptation is planned.

**Rationale**: Verified 2026-08-31 against published documentation. Grok Build — the CLI the
developer is considering — reached general availability on 2026-05-25 with native Model Context
Protocol support: it discovers a standards-compliant local server and consumes what it exposes
without adapter code, and xAI's material states a server wired for Claude Code works unchanged.
Claude Code, Copilot CLI, Gemini CLI and Cursor already speak MCP. The artefact route therefore
holds across every CLI under consideration.

**Residual risk**: confirmed from documentation only, not exercised against a running Grok
installation — the developer explicitly deferred live validation. If it fails in practice, the
fallback is a developer-run capture command, which was designed away rather than ruled out.

---

## R7 — Making a hollow brief harder than a real one

**Decision**: The gate checks that a brief carries substance, not merely that one was published.

**Rationale**: A gate that is trivially satisfied is a formality, and this feature exists precisely
because a formality — the advisory format reminder — failed. The brief's required fields must be
ones that cannot be filled convincingly without having done the thinking: the decision that
mattered, the alternative rejected, and what could break. A brief asserting "no decision, routine
change" is legitimate (FR-010) and cheap, but it is a claim the developer can see and challenge,
which an empty field is not.

**Alternatives considered**: scoring brief quality automatically was rejected as unmeasurable and
gameable. Visibility to the reader is the check that actually works here.

---

## Summary of touch points

| Concern | Seam | New or reused |
|---|---|---|
| Publish brief | `internal/mcp/tools_*.go` `ToolHandler` | Reused interface, new tool |
| Require brief | `internal/workflow/ticket.go` `RequiredGates` | Reused, one entry added |
| Block commit | `internal/workflow/hooks.go` pre-commit | Reused unchanged |
| Show brief | `BroadcastJSONToSession` + panel/hook pattern | Reused pattern, new panel |
| Warn on prose | `GetSessionScrollback` | Reused, new heuristic detector |
| Check naming | pre-commit path | Reused hook, new checker (justified above) |
