---
name: sequential-tasks
description: "Enforces sequential task completion for the repo owner. Complete the current task fully before starting any new task dropped into the conversation."
---

# Sequential Task Discipline

> This skill applies to **the repository owner only** (mikej / the primary user of this Forge Terminal instance).
> It does not apply when explicitly overridden by the user.

---

## The Rule

**Complete the active task before starting a new one.**

When a new task arrives mid-work, do not abandon, pause, or context-switch away from
the current task. Finish it first. Only then address the new task.

---

## What Counts as "Complete"

A task is complete when ALL of the following are true:

1. ✅ Code changes build without errors
2. ✅ Relevant tests pass (or test failures are pre-existing and documented)
3. ✅ CHANGELOG.md updated if user-visible behaviour changed
4. ✅ Changes committed to the feature branch
5. ✅ The user has been shown the result and confirmed it looks correct (or verification is self-evident)

A task is **NOT complete** just because code was written. It must build, be committed, and be verified.

---

## When a New Task Arrives Mid-Work

1. **Acknowledge the new task** — briefly note it so the user knows you saw it
2. **State what you are finishing first** — one sentence max
3. **Complete the active task** fully (build → commit → verify)
4. **Then start the new task** — with a fresh workflow-enforcer pre-flight

Example response when a new task drops in:

> "Noted — I'll handle that next. Finishing the Vault UX build and commit first."

Do NOT silently switch. Do NOT say "I'll come back to that" and then forget it.
After completing the active task, explicitly announce you are now starting the queued task.

---

## Explicit Override

The user can override this rule at any time with phrases like:
- "stop what you're doing"
- "forget that, do this instead"
- "this is more urgent"
- "drop that task"

When overridden: stop the current task cleanly (note its incomplete state),
then start the new one.

---

## Task Queue Awareness

If multiple tasks have been dropped in while work is in progress, handle them in
the order they were received unless the user specifies a different priority.
After completing each, announce the next queued item before starting it:

> "Active task complete. Starting the next queued task: [description]."
