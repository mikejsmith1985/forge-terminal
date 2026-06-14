# Tasks: Tab Naming Rebuild

**Input**: Design documents from `specs/002-tab-naming-rebuild/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tab-label.md
**Tests**: INCLUDED — constitution Article V (three-layer TDD). Unit + a Cypress UX proof for the deep-nav scenario.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- Story labels on US1–US3 phases only.

---

## Phase 1: Setup

- [ ] T001 Confirm work is on `feature/tab-naming-rebuild` and record the `branch-created` gate
- [ ] T002 [P] Inventory the deletion surface from the plan (files/lines) as a checklist comment in `specs/002-tab-naming-rebuild/tasks.md` notes — no code yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one-and-only label producer. Blocks all stories.

- [X] T003 Write failing unit tests for `computeTabLabel(cwd)` (project-root via auto-detect; strips non-printables; fallback to folder/`Terminal`) in `frontend/src/utils/tabLabel.test.js`
- [X] T004 Write failing unit tests for `dedupeLabel(label, existing)` (no suffix first; ` #2`,` #3`; lowest free suffix reused) in `frontend/src/utils/tabLabel.test.js`
- [X] T005 Implement `computeTabLabel` + `dedupeLabel` in `frontend/src/utils/tabLabel.js` (pure, side-effect free). Fallback when not under a recognized projects root is the **immediate cwd folder name** per FR-007 (explicit unit case in T003). 9/9 tests green.
- [ ] T006 Simplify `extractProjectFolder` in `frontend/src/utils/projectFolder.js` to the auto-detect path only (remove the configured-`rootFolder` parameter/branch), keeping its tests green

**Checkpoint**: a single tested function produces every label.

---

## Phase 3: User Story 1 — Deep navigation never renames (Priority: P1) 🎯 MVP

**Goal**: Label set once at creation; terminal output can never change it.
**Independent test**: Quickstart Scenario A (cd 10+ levels, label unchanged).

- [ ] T007 [US1] Write failing unit test: `useTabManager` sets a new tab's `title` once via `computeTabLabel`+`dedupeLabel` and never recomputes it on cwd update, in `frontend/src/hooks/useTabManager.test.js`
- [ ] T008 [US1] Set the tab label at creation from `tabLabel.js` in `frontend/src/hooks/useTabManager.js`; remove the strategy-based title block and the naming options
- [ ] T009 [US1] Sever the rename path: in `frontend/src/App.jsx` `handleDirectoryChange`, update `currentDirectory` only — remove the `getTabTitle`→`updateTabTitle` call
- [ ] T010 [US1] In `frontend/src/components/ForgeTerminal.jsx`, keep the OSC 9;9 handler for cwd tracking but remove any tab-title mutation it triggers
- [ ] T011 [US1] Delete `retitleAllTabsFromCwd` from `frontend/src/hooks/useTabManager.js` and all its callers
- [ ] T012 [US1] Add/honor `isManuallyRenamed` so an automatic label never overrides a user rename (`useTabManager.js`, `internal/commands/sessions.go` TabState)
- [ ] T013 [US1] Write a Cypress UX test (`cypress-real-events`, launched via `run-dev-clean.ps1`) that opens a tab, navigates 10+ levels deep, and asserts the tab label is unchanged and control-character-free — reading the tab label, per Article X

**Checkpoint**: the months-old bug is structurally gone — MVP.

---

## Phase 4: User Story 2 — Duplicate projects get #N (Priority: P2)

**Goal**: Same-project tabs are distinguishable.
**Independent test**: Quickstart Scenario C.

- [ ] T014 [US2] Write failing test: opening two same-project tabs yields `name` and `name #2`; reopening after closing `#2` reuses `#2`, in `frontend/src/hooks/useTabManager.test.js`
- [ ] T015 [US2] Wire `dedupeLabel` against current open-tab labels into tab creation in `frontend/src/hooks/useTabManager.js`

**Checkpoint**: duplicates always disambiguated.

---

## Phase 5: User Story 3 — No configuration exists (Priority: P3)

**Goal**: Delete the strategy system and its persistence entirely.
**Independent test**: Quickstart Scenario D.

- [ ] T016 [US3] Delete `frontend/src/hooks/useTabNaming.js` and remove its import/usage in `frontend/src/App.jsx`
- [ ] T017 [US3] Remove the Tab Naming strategy section (the 6 radios, prefix/root inputs) from `frontend/src/components/TabControlsPanel.jsx`
- [ ] T017a [US3] Write a vitest asserting `TabControlsPanel` renders **zero** tab-naming strategy options (no "Project Root"/"Current Directory"/etc.) in `frontend/src/components/TabControlsPanel.test.jsx` — automates SC-004
- [ ] T018 [US3] Remove the startup naming-sync effect and `onNamingChange` plumbing from `frontend/src/App.jsx` and `TabControlsPanel.jsx`
- [ ] T019 [US3] Write failing Go test then remove `NamingStrategy`/`NamingPrefix`/`NamingRootFolder` from `TabDefaults` in `cmd/forge/handlers_tab_defaults.go` (+ `handlers_tab_defaults` test); keep theme fields
- [ ] T020 [US3] Remove the `forge:tabNamingStrategy|Prefix|RootFolder` localStorage reads/writes everywhere they remain

**Checkpoint**: zero tab-naming configuration anywhere.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T021 [P] Remove dead naming code from `frontend/src/utils/projectFolder.js` (the `getTabTitle` strategy switch, `isStaticNamingStrategy`, now-unused helpers) — or fold the survivors into `tabLabel.js`
- [ ] T022 [P] Update `CHANGELOG.md` `[Unreleased]` — tab naming rebuilt: stable project-root label, no config
- [ ] T023 Run Quickstart Scenarios A–F and capture evidence (esp. A deep-nav, B no-corruption)
- [ ] T024 `cd frontend && npx vitest run` + `npx vite build`; `go build ./cmd/forge/` + `go test ./...`; record `tests-written` and `tests-passed` gates

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 (foundational, blocks all) → US1 (MVP) → US2 → US3 → Polish.**
- US1 is the fix and the MVP. US2 depends on Phase 2's `dedupeLabel`. US3 (deletion) is independent of US1/US2 behavior but is cleanest last so removals don't disturb the new path mid-build.
- T012 touches both frontend and Go (sessions.go) — sequential.

## Parallel Opportunities

- T003/T004 [P] (same file — actually sequential; author together).
- Polish T021/T022 [P] (different files).
- US3 frontend (T016–T018, T020) and Go (T019) can proceed in parallel once US1 lands.

## Implementation Strategy

- **MVP = Phase 1 + 2 + 3 (US1)** — ship the stability fix first; that's the whole point.
- **Increment 2 = US2** (dedup), **Increment 3 = US3** (delete config), then Polish.
- Each phase is independently verifiable via its Quickstart scenario.

## Format Validation

All 25 tasks (T001–T024 + T017a) use `- [ ] T### [P?] [US#?] description + file path`. Story labels on US1–US3 only; setup/foundational/polish carry none.
