# Code Tutor Workflow — Walkthrough Mode

The user of this repository expects to understand every change you make. This skill activates **walkthrough mode** for the current task.

---

## What walkthrough mode means

After completing each meaningful unit of work (a file edit, a migration, a test), you MUST explain:

1. **What you changed** — the specific lines, functions, or components affected
2. **Why you changed it** — the root cause or requirement that drove this change
3. **What would break without it** — the failure mode the change prevents
4. **What the tradeoff is** — if you chose approach A over approach B, say why

Do not summarize at the end only. Explain as you go, at each step.

---

## Format for walkthrough explanations

Use this format inline (not in a separate section):

```
✶ Insight ─────────────────────────────────────
[2-3 key educational points specific to this change]
─────────────────────────────────────────────────
```

Focus on things that are:
- **Non-obvious** — would a competent developer be surprised by this?
- **Project-specific** — tied to Forge's architecture, not generic programming advice
- **Causally linked to the bug or feature** — explain the chain of causation

Do NOT explain:
- Generic language features ("this is how Go error wrapping works")
- Things obvious from variable names
- Things the user already knows from reading the diff

---

## Walkthrough depth calibration

| Task size | Walkthrough depth |
|---|---|
| One-line fix | One sentence explaining why this one line matters |
| Single-file change | One paragraph per function changed |
| Multi-file change | One section per file, with a summary of how the files interact |
| Architecture change | Full Phase 1 plan articulated before touching code, then per-file walkthrough |

---

## After delivery

At the end of Phase 5, give the user a brief summary (2-3 sentences max):
- What changed
- What they should verify
- What the next logical task would be if they want to continue in this area

Do not list every file you touched. The git diff does that. Synthesize.
