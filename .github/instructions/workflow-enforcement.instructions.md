---
applyTo: "**"
---

# Forge Terminal — Workflow Enforcement Instructions

These instructions apply to **all agents and all files** in this repository.

## Non-Negotiable: Workflow State Check

**Before performing any of the following actions, you MUST call `workflow_get_state` via the `forge-workflow` MCP server:**

| Action | Minimum Required Phase |
|--------|----------------------|
| Writing or editing source files (`.go`, `.jsx`, `.js`, `.ts`) | `implementation` |
| Running `git commit` | `implementation` or `review` |
| Creating a pull request | `review` |
| Writing plan or documentation files | `planning` or higher |
| Reading files | any phase (always permitted) |

If the workflow state check returns "no active ticket" — **stop**. Direct the user to run the `workflow-guard` agent first:
> No active workflow ticket found. Please create a ticket before proceeding.
> Run: `/agent workflow-guard`

## Agent Routing

Use the correct agent for each workflow phase:

| Phase | Agent | Invocation |
|-------|-------|------------|
| Starting a new task | `workflow-guard` | `/agent workflow-guard` |
| Planning the approach | `planner` | `/agent planner` |
| Writing code | `implementer` | `/agent implementer` |
| Code review + PR | `reviewer` | `/agent reviewer` |

## Forge Terminal MCP Server

The workflow enforcement MCP server runs alongside Forge Terminal:
- **URL**: `http://localhost:3005/api/mcp`
- **Tools**: `workflow_get_state`, `workflow_create_ticket`, `workflow_advance_phase`, `workflow_check_permission`
- **Resources**: `workflow://state`, `workflow://phases`

If the MCP server is unreachable (Forge Terminal not running), inform the user:
> The Forge workflow enforcement server is not running. Start Forge Terminal and try again.

## Code Quality Standards (All Phases)

Even in the planning phase, when describing future code:
- Follow existing naming conventions in the codebase
- Every new source file must have a corresponding test file
- No TODO comments — incomplete work belongs in a new ticket
- No magic numbers — use named constants

## Branch Naming Convention

Branch names must follow: `type/kebab-case-description`
- `feature/add-user-auth`
- `fix/login-crash-null-pointer`
- `refactor/extract-payment-service`
- `chore/update-dependencies`
