---
name: multi-agent
description: "Enforces multi-agent orchestration for quality. Activates on keywords: implement, build, create, refactor, architecture, design, complex."
---

# Multi-Agent Orchestration

## Quality Mode: BEST

### BEST Mode Rules

1. **ALWAYS use sub-agents** (autopilot_fleet) for tasks involving 3+ independent files
2. **Task Classification → Model Routing:**
   - Architecture/Design (complexity 8-10) → Opus-tier model
   - Feature implementation (complexity 5-7) → Sonnet-tier model
   - Bugfix (complexity 4-6) → Sonnet-tier model
   - Documentation (complexity 1-3) → Haiku-tier model
3. **Parallel exploration** — Use explore agents to investigate multiple code areas simultaneously
4. **Never sacrifice quality for speed** — If a task needs 5 turns to get right, take 5 turns
5. **Code review before delivery** — Always review your own output against the project's code quality standards
