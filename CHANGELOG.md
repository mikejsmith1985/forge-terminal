# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enterprise workflow initialized with Forge Terminal Workflow Architect
- 6 new Go tests for session detach/reattach lifecycle (`session_reconnect_test.go`)
- **MCP Workflow Enforcement Server** (`internal/mcp/`): JSON-RPC 2.0 MCP server exposing 4 workflow-gated tools (`workflow_get_state`, `workflow_create_ticket`, `workflow_advance_phase`, `workflow_check_permission`) and 2 resources (`workflow://state`, `workflow://phases`) that enforce a 4-phase ticket → planning → implementation → review workflow; served at `GET/POST /api/mcp`
- **Custom Copilot CLI Agent Profiles** (`.github/agents/`): 4 purpose-built agents — `workflow-guard` (task intake), `planner` (read-only analysis), `implementer` (source writes), `reviewer` (quality review + PR creation) — each pre-configured with the Forge MCP server and restricted to phase-appropriate tools
- **Path-Specific Workflow Instructions** (`.github/instructions/workflow-enforcement.instructions.md`): global `applyTo: "**"` instruction file that enforces workflow state checks, agent routing table, and code quality standards across all Copilot CLI sessions in this repository
- 17 unit tests covering MCP protocol handling, phase transitions, permission gating, and resource serialization

### Changed

### Fixed
- **Tab-switch flicker (root cause fix)**: replaced the `isFitReady` state + rAF + opacity hack with a single `useLayoutEffect` that calls `fit()` synchronously after React's DOM commit but **before** the browser paints — zero extra renders, zero opacity tricks, zero timing hacks
- **Session recovery NEVER working (critical race condition)**: the disconnect handler was deleting the hub and session from the maps _before_ `detachSession()` stored them, so reconnecting clients always got a brand-new empty hub. Hub and session now stay in the maps during the grace period; only the grace-expiry callback cleans them up. Reconnecting clients find the _existing_ hub with its populated ring buffer and open journal
- **Orphaned PTY reader goroutine on reconnect**: when a client reconnects to a live session (Priority 1 path), the old handler's reader goroutine was left dangling because `readerDone` was only closed in the reattach path. Now `detachedSessions` state is cleaned up in the watcher-join path too, closing `readerDone` and stopping the orphaned goroutine
- **Dead-PTY detach cleanup bug**: `detachSession()` was calling `h.hubs.Delete()` then `h.hubs.Load()` (which always missed), silently leaking the hub. Fixed to use `h.hubs.LoadAndDelete()` in a single atomic operation
- **Scrollback replay ordering**: moved `hub.replayTo()` before `hub.add()` so the client receives all historical output before broadcast can deliver new PTY data, preventing interleaved/out-of-order output on reconnect

### Removed

---

## [5.1.0] - 2026-04-04

### Fixed
- Terminal tab-switch flicker: the outer container now holds `opacity:0` from the moment a tab becomes active until xterm.js `fit()` completes, then fades in via a 60ms CSS transition — eliminates the outline artifacts that occurred when the stale-sized canvas was exposed during the 50ms re-fit window

### Added
- `AGENTS.md` at repo root: a circuit-breaker pattern that requires `skill: workflow-enforcer` as the first tool call on any code task; read automatically by Copilot CLI at session start with a per-response gate and skill invocation table

### Changed
- `workflow-enforcer` skill restructured into three phases — Phase 0 (co-skill cascade fires immediately when the skill loads), Phase 1 (active coding standards applied while writing), Phase 2 (pre-delivery checklist); transforms the skill from a post-delivery audit into a pre-flight gate
- `.github/copilot-instructions.md`: hard-stop pre-flight block prepended before all other content; section 8.8 changed from advisory SHOULD language to MUST with an ordered numbered invocation sequence
- `code-tutor-workflow` skill: post-change walkthrough changed from opt-in ("want a walkthrough?") to required — agent must explain all changes without being asked when this skill is loaded
