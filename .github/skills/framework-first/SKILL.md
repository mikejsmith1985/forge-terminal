---
name: framework-first
description: "Architecture-fidelity gate — prevents rebuilding features the project's framework already provides. Activates on ANY task that builds infrastructure or an abstraction: new module, or any persistence/checkpointing, state machine, retry/backoff, human-in-the-loop pause/resume, routing/dispatch, serialization, message history, tool-calling, streaming, caching, DI/config, or pub-sub/queue work; and on 'add a', 'build a', 'create a' tasks."
---

# Framework First — Use the Framework, Don't Rebuild It

> This skill is the architecture-fidelity gate. It complements `workflow-enforcer` and
> `code-quality` (which govern *how* code is written) by answering a different question:
> **should this be custom code at all, or does the framework already ship it?**

The most expensive mistakes are not bad code — they are correct code that should never have been
written, because a framework the project already depends on provided the capability natively.

## The Principle

Before building any new abstraction that smells like **infrastructure**, identify the framework that
governs the area (from imports/dependencies) and confirm it does **not** already provide the
capability. Build custom only against a *documented gap*.

This is a planning gate you pass **before** designing the component — not a check at the end. The
failure mode is: design the custom thing → build it → test it green → only later discover the
framework had it all along.

## When This Skill Fires (Smell List)

Frameworks almost always own these. Any of them is a STOP-and-check trigger:

| Category | Examples |
|----------|----------|
| Persistence / checkpointing | saving and restoring state, snapshots |
| State machines / workflow state | step/stage/status orchestration |
| Retries / backoff / timeouts | resilience around calls |
| Human-in-the-loop pause & resume | suspend, await input, continue |
| Routing / dispatch | conditional control flow |
| Serialization | encode/decode state |
| Message / conversation history | accumulating turns |
| Tool / function calling | tool-dispatch loops |
| Streaming | incremental output |
| Caching | memoize / store-and-reuse |
| DI / config / registries | wiring and plugins |
| Pub-sub / eventing / queues | async message passing |

## The Three-Step Gate

1. **Recon** — Name the governing framework(s) from the project's deps. Search the framework's own
   docs/API for the capability **before** sketching a custom design.
2. **Decide** —
   - *Native exists* → use it (don't wrap it "for flexibility").
   - *Partial fit* → extend/configure the framework's seam.
   - *Genuine gap* → write a one-line **drift justification** of exactly what the framework lacks,
     then build the minimum custom piece.
3. **Record** — Leave the justification as a code comment at the custom component and/or a CHANGELOG
   note, so the decision is not re-litigated or silently copied.

## Read the Project Ledger

Look for **`FRAMEWORK-CAPABILITIES.md`** (repo root first, then the code subdirectory holding the
framework code). It is the project-specific checklist of in-use frameworks and the capabilities to
reach for instead of rebuilding. Treat it as authoritative. If a project clearly has a governing
framework but no ledger, flag that absence.

## Scope

Naming, comments, tests, and branching belong to `code-quality`, `testing-standards`, and
`branching-strategy`. This skill is purely the architecture-fidelity gate. Both checks apply;
neither replaces the other.
