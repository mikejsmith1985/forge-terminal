---
date: 1970-01-01
topic: MIGRATION-GUIDE
status: active
related_issues: []
related_commits: []
future_scope: []
---

# Session Document Migration Guide

**Purpose**: Help developers decide when to migrate session docs to permanent documentation before they're deleted.

**When to use**: Before deleting a session doc (30-day cleanup)

---

## Migration Checklist

Before deleting a session document, ask these questions:

### 1. Contains Architectural Decision?
```
❓ Does this document explain WHY we made a decision?
❓ Will future developers need to understand this decision?
❓ Is the rationale non-obvious?

➜ YES: Migrate to docs/developer/architecture/
   Create: docs/developer/architecture-TOPIC-DECISION.md
   Example: docs/developer/architecture-am-assistant-design.md
```

### 2. Contains Feature Documentation?
```
❓ Does this document explain HOW to use a feature?
❓ Is this useful for end users?
❓ Does it describe user-facing behavior?

➜ YES: Migrate to docs/user/
   Create: docs/user/FEATURE-NAME.md
   Example: docs/user/assistant-model-selection.md
```

### 3. Contains CLI/API Changes?
```
❓ Does this document change a CLI interface?
❓ Does this document change an API?
❓ Should developers know about this breaking change?

➜ YES: Link from CHANGELOG.md
   Add entry: "See SESSION_DOC_LINK for rationale"
   Example: See docs/sessions/2025-12-08-am-logging/ for implementation details
```

### 4. Contains Bug Investigation?
```
❓ Is this debugging a specific issue?
❓ Does it link to a GitHub issue?
❓ Could this help someone debug the same issue later?

➜ YES: Link from GitHub issue
   Add comment: "See SESSION_DOC for investigation details"
   Status: Keep in session, link from issue
```

### 5. Contains Future Ideas?
```
❓ Does this document suggest ideas for v2 or v3?
❓ Are there "we could" or "future" ideas?
❓ Should these be tracked for prioritization?

➜ YES: Extract to docs/FUTURE_SCOPE.md
   Add entry under appropriate category
   Mark doc as "review_for_migration" status
```

### 6. Session Analysis/Work Log?
```
❓ Is this purely session notes (no permanent value)?
❓ Are decisions already captured elsewhere?
❓ Is this task complete and documented?

➜ YES: Safe to delete
   Mark status as "deleted" in INDEX.md
   No further action needed
```

---

## Migration Process

### Step 1: Assess Document
Run the checklist above. Mark which category applies.

### Step 2: Determine Action
- Migrate → Copy to permanent location
- Extract → Pull out key ideas to FUTURE_SCOPE.md
- Link → Add reference from GitHub issue
- Delete → Mark as deleted, cleanup

### Step 3: Update Frontmatter
```yaml
---
date: 2025-12-08
topic: assistant-improvements
status: migrated  # ← Change from 'active' to 'migrated'
related_issues: [#22]
---
```

Add comment at top of doc:
```markdown
> ⚠️ MIGRATED to [docs/developer/architecture-assistant-model-selection.md](...)
> This session document is kept for historical reference.
```

### Step 4: Update INDEX.md
Regenerate index (automatic via `generate-session-index.sh`):
```bash
./scripts/generate-session-index.sh
```

---

## Examples

### Example 1: Architectural Decision → MIGRATED
**Original**: docs/sessions/2025-12-08-am-logging/implementation.md
**Decision**: Auto-detect Ollama model instead of hardcoding

**Actions**:
1. Create: `docs/developer/architecture-am-assistant-auto-detection.md`
2. Copy content: Key rationale, benchmarks, decision tradeoffs
3. Update status: `status: migrated`
4. Link in original: Add reference to new location

**Result**: Permanent architecture docs + recoverable session history

---

### Example 2: User Feature → MIGRATED
**Original**: docs/sessions/2025-12-08-model-selector/implementation.md
**Feature**: Interactive model selector UI

**Actions**:
1. Create: `docs/user/model-selector.md`
2. Copy content: How to use, options, screenshots
3. Update status: `status: migrated`
4. Link in original: Point to user docs

**Result**: Users can find feature docs + developers can trace history

---

### Example 3: Session Notes → DELETED
**Original**: docs/sessions/2025-12-08-brainstorm/ideas.md
**Content**: Brain dump of random ideas, mostly captured elsewhere

**Actions**:
1. Check ideas: Any unique ones? → Extract to FUTURE_SCOPE.md
2. Update status: `status: deleted`
3. Clean up: No recovery needed

**Result**: Clean sessions folder, important ideas preserved

---

## Pre-Cleanup Automation

The cleanup script will run this checklist automatically:

```bash
./scripts/cleanup-session-docs.sh
```

**Script behavior**:
1. Find docs older than 7 days
2. Ask: "Review this doc for migration?" (shows status)
3. Provide: Quick decision prompt
4. Log: All decisions in CLEANUP_AUDIT.log
5. Require: Manual approval before deletion

---

## Quick Reference

| Content Type | Action | Destination |
|---|---|---|
| Architectural decision | Migrate | docs/developer/architecture/ |
| Feature documentation | Migrate | docs/user/ |
| User guide | Migrate | docs/user/ |
| API change | Link | CHANGELOG.md |
| Bug investigation | Link | GitHub issue |
| Future ideas | Extract | docs/FUTURE_SCOPE.md |
| Session notes | Delete | (no action needed) |
| Test results | Delete | (archived in session) |

---

## Questions?

See `docs/sessions/DECISION_LOG.md` for examples of how past decisions were made.

**Last Updated**: 2025-12-09
