# Feature Specification: Suppress Spurious Pop-up Terminal Windows

**Feature Branch**: `013-suppress-popup-windows`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "When I click the approve buttons (and possibly in other scenarios) Forge Terminal opens the terminal windows seen in the screen capture. Please correct this."

## Clarifications

### Session 2026-06-24

- Q: When a spurious window pops up, which origins must this fix cover — Forge Terminal's own command-execution paths, the AI agent's own child processes, or both? → A: Both — suppress windows from Forge's own exec paths AND ensure the AI agent's subprocess tree is launched in a no-window environment so its child commands cannot pop a console either.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Approving an action never pops up an external window (Priority: P1)

A developer is working inside a Forge Terminal session with an AI agent (e.g. Claude Code) running. The agent requests permission to run a command or take an action, and the developer clicks an **Approve** button. The action runs **inside the existing in-app terminal**. No separate operating-system terminal, console, or browser window appears on the desktop, steals focus, or flashes on screen.

**Why this priority**: This is the reported defect. Every spurious window steals focus, clutters the desktop, interrupts the developer's flow, and erodes trust that Forge Terminal keeps work contained in one place. It happens on a routine, high-frequency interaction (approving agent actions), so it degrades the core experience.

**Independent Test**: Trigger an approval flow that causes a command to execute, click **Approve**, and observe the desktop. The action completes and its output appears in the in-app terminal, while the count of visible OS windows does not increase and focus stays on Forge Terminal.

**Acceptance Scenarios**:

1. **Given** an agent action is pending approval inside a Forge Terminal session, **When** the user clicks **Approve**, **Then** the resulting command runs inside the existing in-app terminal and no new OS-level terminal/console/browser window appears.
2. **Given** the approved action runs a process that would normally allocate a console on the host OS, **When** the process starts, **Then** no console window flashes on screen even momentarily.
3. **Given** the user clicks **Approve** several times in quick succession, **When** each approval is processed, **Then** the number of visible OS windows is unchanged after the actions complete.

---

### User Story 2 - No scenario silently spawns a visible OS window (Priority: P2)

Beyond approval buttons, the developer performs other routine actions that cause Forge Terminal to run something — executing a command card / launch card, opening an external link, triggering a workflow or release step, agent tool execution, and app self-restart/update. In none of these does an unexpected OS terminal/console window pop up.

**Why this priority**: The user explicitly flagged that the problem may occur "in other scenarios," not just approvals. Closing the whole class of defect (rather than only the one observed trigger) prevents the same symptom resurfacing through a different code path. It is P2 because the approval path is the confirmed, most-frequent offender.

**Independent Test**: Exercise each command-executing surface (command card, external link, workflow/release action, agent-driven command) and confirm in each case that output is contained in-app with no new visible OS window.

**Acceptance Scenarios**:

1. **Given** the user executes a command card, **When** it runs, **Then** its command is sent to the existing in-app terminal session and no separate OS window appears.
2. **Given** the user opens an external link from within Forge Terminal, **When** the default browser is invoked, **Then** no transient console window flashes during the handoff.
3. **Given** a background or workflow action runs a host command, **When** it executes, **Then** it runs hidden with no visible console window.
4. **Given** an AI agent running inside a Forge Terminal session executes one of its own tool commands (e.g. a shell/Bash command) after the user approves it, **When** that command spawns child processes, **Then** those processes inherit a no-window environment and no console window appears on the desktop.

---

### Edge Cases

- **Momentary flash**: A console window that appears and disappears in a fraction of a second still counts as a failure — the requirement is *no visible window at all*, not *a window that closes quickly*.
- **Focus theft**: Even if a spurious window were acceptable in some flow, it must never take keyboard focus away from Forge Terminal; the stricter rule (no window) covers this.
- **Rapid repeated approvals**: Multiple approvals processed concurrently must not each leak a window.
- **Process that genuinely needs a TTY/console**: The action still runs (its output reaches the in-app terminal); suppression must not break the command, only hide the extra OS window.
- **Non-Windows hosts**: The suppression behavior must be correct on the primary Windows desktop and must not regress or error on other supported platforms.
- **Intentional external surfaces**: Opening the system default browser for a link is allowed as an outcome; what is forbidden is the *extra console/terminal window* that accompanies it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Clicking an **Approve** button in Forge Terminal MUST NOT cause any new operating-system terminal, console, or shell window to appear.
- **FR-002**: Any command resulting from an approved action MUST execute inside the existing in-app terminal session and route its output there, not into a separate window.
- **FR-003**: All scenarios in which Forge Terminal runs a host process on the user's behalf (approvals, command/launch cards, external-link handoff, workflow/release steps, agent-driven commands, app self-restart/update) MUST run that process without producing a visible OS window.
- **FR-003a**: The AI agent process that Forge Terminal launches inside a session MUST be started in a no-window environment such that the agent's own child processes (its shell/tool commands) cannot allocate a visible OS console window when the user approves them. Suppression covers BOTH Forge Terminal's own command-execution paths AND the agent's spawned subprocess tree.
- **FR-004**: Process suppression MUST prevent even a momentary "flash" of a console window, not merely close it quickly afterward.
- **FR-005**: Suppressing the window MUST NOT alter the behavior or output of the underlying command — the action still runs to completion and its results remain visible in-app.
- **FR-006**: Forge Terminal MUST keep keyboard focus on its own window throughout an approval or command-execution flow.
- **FR-007**: The fix MUST cover the confirmed approval trigger and audit the broader class of command-execution paths — including both Forge Terminal's own exec calls and the launched agent's subprocess tree — so the same symptom cannot recur through an unguarded path.
- **FR-008**: The corrected behavior MUST hold on the primary Windows desktop environment and MUST NOT cause errors or regressions on other supported platforms.

### Key Entities

*(Not applicable — this feature changes runtime windowing/process behavior and introduces no new persisted data.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of approval-button clicks, no new OS-level terminal/console/browser window appears on the desktop.
- **SC-002**: Across every identified command-execution surface, zero spurious OS windows are observed during normal use.
- **SC-003**: Forge Terminal retains keyboard focus through 100% of approval and command-execution flows (no focus loss to a spawned window).
- **SC-004**: Every approved or triggered command still completes successfully and its output is visible in the in-app terminal (no loss of functionality from the suppression).
- **SC-005**: After the fix, the user can complete a full agent session of repeated approvals with zero desktop windows opened by Forge Terminal beyond the app itself.

## Assumptions

- **"The terminal windows seen in the screen capture"** refers to external operating-system console/terminal/browser windows appearing on the desktop (as opposed to new in-app tabs or sessions). The screenshot shows additional desktop windows along the top of the screen.
- The primary environment is the Windows 11 desktop build of Forge Terminal, where host processes can allocate a console window if not explicitly suppressed.
- The intended, correct behavior is that agent and UI-triggered commands run through the existing in-app terminal session (the established ConPTY path) rather than shelling out into a separate visible window.
- The fix is scoped to **both** origins of a spurious window (clarified 2026-06-24): Forge Terminal's own command-execution code paths, and the AI agent subprocess tree that Forge launches inside a session. Windows opened by software entirely outside Forge Terminal's control (e.g. an app the user launches independently) are out of scope.
- Opening the user's default web browser for an external link is acceptable as a deliberate outcome; only the accompanying spurious console/terminal window is in scope to remove.
- No new persisted data, settings, or external integrations are required; this is a correction to existing runtime process/window behavior.
