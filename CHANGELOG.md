# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enterprise workflow initialized with Forge Terminal Workflow Architect

### Changed

### Fixed

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
