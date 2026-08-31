# Contract — the brief commit gate

**Feature**: `specs/014-comprehension-first-workflow`

What the pre-commit path requires, and what it refuses. This contract is short on purpose: it adds
one entry to an existing mechanism rather than introducing a second one (research R3).

---

## The rule

A commit that changes code is permitted only when the ticket records **every** gate in
`RequiredGates`. This feature adds one:

| Gate | Meaning |
|---|---|
| `branch-created` | existing |
| `tests-written` | existing |
| `tests-passed` | existing |
| **`brief-published`** | **new — a valid change brief was published for this task** |

---

## Behaviour

| Situation | Outcome |
|---|---|
| Brief published, all other gates recorded | Commit proceeds |
| No brief published | **Commit refused**, naming the missing gate |
| Brief rejected as invalid at publish time | No gate recorded, so the commit is refused |
| `FORGE_BYPASS=1` with a reason | Commit proceeds; the override is appended to `.forge/bypasses.log` |
| Forge binary not found | Hook warns and exits zero, as it does today — enforcement degrades rather than blocking work on a broken install |

---

## Scope

The gate applies to changes to code. It does not apply to:

- documentation-only commits
- the spec pipeline's own artefacts under `specs/`
- generated or vendored files

A commit touching only those does not require a brief, because there is no change for the developer
to understand.

---

## Why this is enforceable when the response format is not

The gate tests for the **presence of an artefact**, which is a fact. It does not judge prose, which
would require recovering the agent's answer from a buffer holding screen redraws — a heuristic, and
a heuristic cannot be a gate without either blocking correct work or passing bad work.

This asymmetry is deliberate and is recorded in the spec under "The Enforceability Constraint" so
it is not mistaken for an inconsistency during implementation.

---

## Proof obligations

This contract is satisfied only when demonstrated against a **real git repository and the real
generated hook** — not a mock:

1. A commit with no brief is refused, and the message names `brief-published`.
2. A commit with a valid brief is allowed.
3. `FORGE_BYPASS` still overrides, and still writes the reason to the audit log.
4. A documentation-only commit is allowed with no brief.
