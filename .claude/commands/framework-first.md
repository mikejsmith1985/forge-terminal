# Framework First — Use the Framework, Don't Rebuild It

This skill is the architecture-fidelity gate. It fires on every task that builds **infrastructure** and forces one question before you write a line: *does the framework already do this?* It exists because the most expensive mistakes are not bad code — they are correct code that should never have been written, because a framework the project already depends on shipped the capability natively.

## The principle

Before you build any new abstraction that smells like infrastructure, **identify the framework that governs this area and confirm it does not already provide the capability.** Build custom only against a *documented gap*.

This is not a style rule you check at the end. It is a planning gate you pass *before* designing the component — the failure mode is: design the custom thing → build it → test it green → only later discover the framework had it all along.

## When this skill must fire (the smell list)

Treat any of these as a STOP-and-check trigger. Frameworks almost always own these; reach for the framework before hand-rolling:

- **Persistence / checkpointing / snapshots** — saving and restoring state
- **State machines & workflow state** — step/stage/status orchestration
- **Retries / backoff / timeouts**
- **Human-in-the-loop pause & resume** — suspend, wait for input, continue
- **Routing / dispatch / conditional flow**
- **Serialization / deserialization**
- **Message / conversation history**
- **Tool / function calling loops**
- **Streaming**
- **Caching**
- **Dependency injection / config / plugin registries**
- **Pub-sub / eventing / queues**

If your task is "add a `<one of the above>`", you are in scope. So are plain "build a…", "create a…", "add a…" infrastructure tasks.

## The three-step gate

1. **Recon** — Name the governing framework(s) from the project's imports and dependencies. Search the framework's own docs/API for the capability you are about to build. Do this *before* sketching a custom design.
2. **Decide**
   - *Native capability exists* → use it. Do not wrap it in a custom layer "for flexibility."
   - *Partial fit* → extend or configure the framework's seam, don't replace it.
   - *Genuine gap* → write a one-line **drift justification** stating exactly what the framework lacks, then build the minimum custom piece.
3. **Record** — Leave the drift justification where the next agent will see it: a code comment at the custom component and/or a CHANGELOG note. This stops the decision from being re-litigated or silently copied.

## Read the project's capability ledger

Look for **`FRAMEWORK-CAPABILITIES.md`** (repo root first, then the code subdirectory that holds the framework code). It is the project-specific checklist: which frameworks are in use and which of their capabilities you must reach for instead of rebuilding. Treat it as authoritative for this project. If it does not exist for a project that clearly has a governing framework, that absence is itself worth flagging to the user.

## What this skill does NOT cover

Naming, comments, tests, and branching belong to `code-quality`, `testing-standards`, and `branching-strategy`. This skill is only the architecture-fidelity gate — it answers *"should this be custom code at all?"*, not *"is this code written well?"* Both checks apply; neither replaces the other.
