# Implementation Plan: Tab Naming Rebuild

**Branch**: `feature/tab-naming-rebuild` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-tab-naming-rebuild/spec.md`

## Summary

Delete the 6-strategy tab-naming system and the live-rename path, replacing them with one
fixed rule: a tab's label is the **project-root folder name**, computed **once at tab creation**,
deduplicated with ` #N`, and **never** touched by terminal output again. The bug recurs today
because every layer (the `useTabNaming` hook, `getTabTitle` strategy switch, the OSC 9;9 →
`handleDirectoryChange` → `updateTabTitle` chain, `retitleAllTabsFromCwd`, and the
`tab-defaults.json` naming fields) can recompute the title. The rebuild removes all of those
recompute paths so there is structurally nothing left that can rename a tab after creation.

## Technical Context

**Language/Version**: React (frontend hooks/components), Go (backend handlers + session storage)

**Primary Dependencies**: xterm.js (OSC handlers), existing `useTabManager` tab state, `extractProjectFolder` (auto-detect), `/api/tab-defaults` + `sessions.json` storage

**Storage**: `tab-defaults.json` (naming fields removed), `sessions.json` (keeps `title` + `currentDirectory`), localStorage (naming keys removed)

**Testing**: vitest (naming module: fixed-at-creation + `#N` dedup, 100% mocked); Go test (tab-defaults struct no longer carries naming fields); Cypress + `cypress-real-events` via `run-dev-clean.ps1` for the UX proof (open tab, navigate deep, label unchanged) — per Article V three-layer + Article X (read `window.term.buffer`, assert the tab label, not the DOM title).

**Target Platform**: Windows 11 primary (ConPTY); cross-platform

**Project Type**: Desktop app — Go backend + React frontend

**Performance Goals**: Label computed once at creation; zero per-`cd` work (removes the OSC-driven recompute entirely)

**Constraints**: No user configuration; no terminal-output influence on the label; no control characters ever in a label

**Scale/Scope**: A handful of frontend files + one Go struct; net **deletion** of ~1000+ lines of strategy/recompute code

**NEEDS CLARIFICATION**: none. The one open question — "how does the new logic find the projects root without configuration?" — is resolved in research R1 (reuse `extractProjectFolder`'s auto-detection of known root-folder names; drop the configured `rootFolder` param).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Real rebuild, not another patch | ✅ Matches the explicit ask; removes the failure mode by construction |
| III — Branching | Feature branch | ✅ `feature/tab-naming-rebuild` |
| IV — Code Quality | Naming/comments/≤40-line funcs | ✅ Enforced during implement |
| V — Testing (three-layer) | unit + UX (Cypress real-events) | ✅ Planned; UX test is the load-bearing proof for "stable on deep nav" |
| VI — Documentation | CHANGELOG; no aux docs | ✅ Planned |
| VII — Framework-First | Don't rebuild framework capability | ✅ **PASS** — this *removes* custom complexity and leans on xterm/React/existing tab state; no new abstraction |
| X — Verification & Proof | Evidence via xterm buffer, not DOM | ✅ quickstart reads the tab label after deep navigation |
| XI — Output restraint | One dashboard, no narration | ✅ N/A |

**Gate passes.** Article VII is satisfied trivially — the rebuild deletes a bespoke system rather than building one.

## Project Structure

### Documentation (this feature)

```text
specs/002-tab-naming-rebuild/
├── plan.md
├── research.md          # Phase 0: projects-root resolution w/o config; OSC decoupling
├── data-model.md        # Phase 1: Tab label, label registry, what's removed
├── quickstart.md        # Phase 1: deep-nav stability + dedup + no-config UX proofs
├── contracts/
│   └── tab-label.md     # the one fixed naming rule + decoupling contract
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── hooks/
│   ├── useTabNaming.js          # DELETE (entire strategy hook)
│   └── useTabManager.js         # EDIT: label set once at creation; remove retitleAllTabsFromCwd + naming options
├── utils/
│   ├── projectFolder.js         # SIMPLIFY: keep auto-detect extractProjectFolder; remove getTabTitle strategy switch + static-strategy helpers
│   └── tabLabel.js              # NEW (candidate): computeTabLabel(cwd) + dedupeLabel(label, existing)
├── components/
│   ├── TabControlsPanel.jsx     # EDIT: remove the entire Tab Naming strategy section
│   ├── ForgeTerminal.jsx        # EDIT: OSC 9;9 still tracks cwd (git/release need it) but NO LONGER renames the tab
│   └── Tab.jsx / TabBar.jsx     # KEEP manual rename; ensure auto-rename can't override a user/auto label
└── App.jsx                      # EDIT: drop useTabNaming + naming sync effect; handleDirectoryChange updates cwd only, never title

cmd/forge/
└── handlers_tab_defaults.go     # EDIT: remove NamingStrategy/NamingPrefix/NamingRootFolder fields (keep theme defaults)
internal/commands/
└── sessions.go                  # KEEP: TabState.Title (now write-once) + CurrentDirectory
```

**Structure Decision**: Single project, mostly **deletion**. A small new `tabLabel.js` isolates the two pure functions (`computeTabLabel`, `dedupeLabel`) so they're trivially unit-testable and there is exactly one place a label is ever produced. The OSC handler is kept *only* for cwd tracking (other features depend on it) but its title-mutation wiring is severed — this decoupling is the crux of the fix.

## Complexity Tracking

> No violations. The feature reduces complexity (deletes the strategy matrix + recompute paths). The only "new" code is two small pure functions; everything else is removal or simplification.
