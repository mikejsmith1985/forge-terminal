---
date: 2025-12-09
topic: documentation
status: active
related_issues: [#30]
---

# Decision Log

**Extracted from session document frontmatter**

This log captures key architectural and technical decisions made during development.
Each decision is linked to the session documentation where it was explored and discussed.

---

## How to Use

1. **Find a decision**: Search for keywords below (or use grep)
2. **Read context**: Click session link for full exploration
3. **Check status**: See if it's ACTIVE, MIGRATED, or ARCHIVED

---

## Key Decisions

### Assistant Model Detection (2025-12-08)
- **Decision**: Auto-detect Ollama model instead of hardcoding
- **Why**: Users complained they couldn't use preferred models without code changes
- **Session**: docs/sessions/2025-12-08-am-logging/
- **Status**: 🟢 IMPLEMENTED & DEPLOYED
- **Related Issue**: #22
- **Impact**: Users can now run `./forge` with any Ollama model automatically

### AM Logging Implementation (2025-12-08)
- **Decision**: Add "Artificial Memory" (AM) session logging
- **Why**: Developers needed context recovery on crashes
- **Session**: docs/sessions/2025-12-08-am-logging/
- **Status**: 🟢 IMPLEMENTED & DEPLOYED
- **Key Files**: 
  - Terminal state logging → `./am/` directory
  - Auto-recovery on restart
  - Workspace restoration support

### Model Selector UI (2025-12-08)
- **Decision**: Create interactive model selector in UI
- **Why**: Better UX for switching between Ollama models
- **Session**: docs/sessions/2025-12-08-model-selector-implementation.md
- **Status**: 🟢 IMPLEMENTED & DEPLOYED

---

## Search for Decisions

Use the find-decision script (coming in Phase 4):
```bash
./scripts/find-decision.sh "assistant"
./scripts/find-decision.sh "model"
```

Or search session index directly:
```bash
grep -r "decision" docs/sessions/INDEX.md
```

---

## Adding New Decisions

When creating a session doc, include in frontmatter:
```yaml
related_issues: [#22, #25]  # GitHub issues
related_commits: [abc123def]  # Git commits
future_scope: ["New idea"]   # Future enhancements
```

Then run to update indexes:
```bash
./scripts/generate-session-index.sh
```

---

**Last Updated**: 2025-12-09

