# Problems Solved: AI/Agentic Coding with Forge Terminal

Forge Terminal was built to address fundamental challenges in AI-assisted development — problems that emerge when LLMs become the primary tool for code generation, architecture decisions, and project workflows. This document catalogs the problems we identified and how Forge Terminal solves them.

---

## 1. **Process Anarchy: The "Code-First" Anti-Pattern**

### The Problem
When an AI agent encounters a task, the fastest path to delivery is often: "read context → write code → hope it works." This creates:
- **Missing planning phase** — complex changes are implemented without articulating the approach first
- **Unmeasured scope drift** — the task boundary shifts mid-execution with no record of why
- **No test coverage** — code is written, then tests (if at all) are added as an afterthought
- **Skipped safety checks** — branch creation, linting, dependency verification all happen *after* the implementation

### The Solution: Forge Workflow Enforcement
**AGENTS.md** and **workflow-enforcer** establish a mandatory 5-Phase pipeline:

1. **Phase 0** — Pre-flight: Branch creation, skill loading, project detection
2. **Phase 1** — Deep understanding & planning (dashboard, architecture, pseudo-code)
3. **Phase 2** — Zero-compromise audit (safety checks, test strategy, no shortcuts)
4. **Phase 3** — TDD execution (write test first, then code to pass it)
5. **Phase 4** — Deterministic verification (visual proof, integration tests, not just "builds")
6. **Phase 5** — Delivery (CHANGELOG, commit, PR, release)

**Proof mechanism**: Pre-commit hook reads `.forge/workflow-ticket.json` ledger and BLOCKS commits that lack required gates: `branch-created`, `tests-written`, `tests-passed`.

---

## 2. **Quality Decay: "It Compiles" ≠ "It Works"**

### The Problem
AI-generated code often exhibits:
- **Variable name rot** — single letters, abbreviations, cryptic naming (e.g., `x`, `tmp`, `val`)
- **Silent complexity** — deeply nested conditionals, 200-line functions, no explanatory comments
- **Missing export docs** — public functions ship without doc comments or usage examples
- **Inconsistent patterns** — helper functions, error handling, and struct organization drift across files

### The Solution: Code Quality Enforcement
**code-quality** skill establishes mandatory standards:

- **Naming conventions**
  - No single-letter variables (except `i`/`j`/`k` in loops, `w`/`r` in HTTP handlers)
  - All booleans prefixed: `is*`, `has*`, `can*`, `should*`, `was*`
  - Functions are verb-first: `createSession()`, `validateToken()`
  - Variable names readable by a non-developer without context
  
- **Comment discipline**
  - Top-level comment on every file explaining its purpose
  - Doc comments on every exported/public function
  - "Why" comments on complex logic, not "what" comments on obvious code
  - Comments written for technical project managers, not compilers

- **Structure standards**
  - Functions under 40 lines (extract helpers for complex logic)
  - Guard clauses instead of deep nesting (max 3 levels)
  - No magic numbers or strings (named constants with comments)
  - Logical grouping with section comments

---

## 3. **Test Avoidance: Blurring Unit, Integration, and E2E**

### The Problem
AI agents frequently:
- **Mock everything** — creating tests that verify mocks, not behavior
- **Skip integration tests** — avoiding real databases or infrastructure
- **Test the UI by reading the DOM** — brittle tests that break on refactoring
- **Run no tests at all** — claiming "the API returns 200" as sufficient proof
- **Mix test types** — a single test that mocks some deps while hitting others

### The Solution: Scorched Earth Testing Protocol
**testing-standards** enforces strict isolation:

**A. Unit Testing** (The "Logic Auditor")
- Scope: Individual Go functions, React components, AST modifiers
- Rule: STRICT MOCKING — if it touches DB, network, or filesystem, it MUST be mocked
- Speed: Tests complete in <10ms
- Tooling: Go `testing` package (with mocks), Jest/Vitest

**B. Integration Testing** (The "System Integrator")
- Scope: API handlers, database repositories, data persistence
- Rule: REAL DATABASE ONLY — never mock the driver. Use testcontainers-go for ephemeral Docker instances
- Lifecycle: Start container → migrate schema → test → teardown
- No stubs, no mocks of the database layer

**C. UX Testing** (The "Actual User")
- Scope: Full end-to-end user journeys
- Rule: NO BINARY BUILDS — launch via `run-dev-clean.ps1 -Port 9999` (real backend + testcontainer DB)
- Input fidelity: Use `cy.realPress()` for real keyboard events, not synthetic `.trigger()`
- Tooling: Cypress targeting live localhost

---

## 4. **Process Bleeding: AI as a Subagent**

### The Problem
When multiple AI agents or sessions work on a codebase:
- **Orphaned branches** — feature branches left behind with no PR or merge record
- **Duplicate effort** — two agents solve the same problem independently
- **Conflicting styles** — each agent applies different naming, formatting, or patterns
- **No audit trail** — "who changed this?" becomes unanswerable
- **Skill drift** — not every session/agent has access to the same workflow capabilities

### The Solution: Centralized Workflow + Propagation
**multi-agent** skill enables parallel execution with:
- Unique feature branches per task, named with description (not `feature/1`)
- Commits tagged with `Co-authored-by: Copilot <...>` for audit
- All agents read `.github/skills/` and `.github/copilot-instructions.md` before starting
- Pre-commit hook enforces compliance — agents can't bypass gates
- Workflow dashboard (`refactor_plan.html`) provides single pane of glass for status

**Skill propagation**: `.github/scaffold/` templates ensure every new project receives:
- All 20 Forge MCP tool skills (workflow-enforcer, forge-vault, adaptive-build-environments, etc.)
- AGENTS.md project detection file
- Command card templates
- Pre-commit hook

---

## 5. **Token Economy: Long-Task Context Collapse**

### The Problem
AI models have finite context windows. Extended development sessions hit walls:
- **Earlier instructions deprioritized** — workflow rules and safety checks fade as context fills
- **No task state persistence** — long sessions lose track of partial progress, failing tests, architectural decisions
- **Constant re-explanation** — agents re-ask "what was the plan?" because plan.md is above context cutoff
- **Hallucination on decision rationale** — agent invents reasons for architectural choices made 50 turns ago

### The Solution: Explicit State Ledger + Checkpoints
**session-state/plan.md** provides:
- Per-session todo list (SQL-backed with `todos` table)
- Structured checkpoints (saved every 50-100 turns) with:
  - Architectural decisions made to date
  - Files modified and why
  - Technical constraints discovered
  - Blocked items and their causes
  - Next steps (resumption entry point)

**forge-vault-workflow_gate_record()** creates an immutable ledger in `.forge/workflow-ticket.json`:
- Timestamped record of which gates were passed (branch-created, tests-written, tests-passed)
- Evidence string proving each gate was satisfied
- Pre-commit hook reads this ledger; agents cannot proceed without it

**Result**: A 1000-turn session can be checkpointed, resumed later, with full context available without re-reading files.

---

## 6. **Execution Trust: "I Ran It" Doesn't Mean "It Works"**

### The Problem
AI agents claim:
- "The build succeeded" — but only checked console output, didn't parse exit codes
- "I tested it" — but the test framework silently failed
- "The API is working" — but never actually made a request to verify
- "I verified no regressions" — but didn't run the existing test suite

### The Solution: Deterministic Verification Protocol
**Phase 4** (Deterministic Verification) requires visual proof:

1. **Automated Visual Capture** — Use Puppeteer/Cypress to capture actual UI state
2. **Programmatic Highlighting** — Draw red/neon borders around changed elements in screenshots
3. **Base64 Embedding** — Convert screenshots to Base64 and embed directly in `validation.html`
4. **Auto-Launch** — Open dashboard immediately so user sees proof without extra clicks
5. **Terminal State Validation** — Verify via `window.term.buffer.active` (xterm.js model), NOT DOM inspection

**Result**: No more "trust me, it works" claims. Users see actual proof before signing off on the task.

---

## 7. **Process Bleeding: No Safe Cleanup**

### The Problem
Forge Terminal runs on Windows inside `fterm.exe` process:
- AI agents might try `Get-Process -Name "forge*" | Stop-Process` to kill old processes
- This is a **wildcard kill** — it terminates the agent's own session mid-execution
- Context is lost, task is abandoned, user sees a crash

### The Solution: Explicit PID-Only Termination
**Mandatory rule**: Use `Stop-Process -Id <specific-PID>` with an explicit PID only.
- Never use `Get-Process -Name ...` with wildcards
- Never use `taskkill /IM forge*`
- Always identify the target process by its specific PID first

**Enforcement**: This rule is embedded in workflow-enforcer SKILL.md and pre-commit hooks can flag violations in code that spawns subprocesses.

---

## 8. **Skills as Code: Drift Between Sessions**

### The Problem
Copilot CLI sessions don't automatically inherit MCP tool skills:
- Session 1 has `workflow-enforcer`, `code-quality`, and `forge-vault`
- Session 2 (in a child project) starts fresh with no skills
- Agent has to ask "what are your capabilities?" and works without the full toolkit
- Skills drift over time: new MCP tools are added to forge-terminal but child projects don't get them

### The Solution: Scaffold-Based Skill Propagation
**internal/workflow/scaffold.go** generates 20 skills in every new project:

```
.github/skills/
├── workflow-enforcer/SKILL.md         ← Mandatory circuit breaker
├── code-quality/SKILL.md              ← Naming, comments, structure
├── branching-strategy/SKILL.md        ← GitHub Flow enforcement
├── forge-vault/SKILL.md               ← MCP tool access (file, env, terminal)
├── adaptive-build-environments/SKILL.md ← WSL/Docker cross-platform builds
├── forge-workflow/SKILL.md            ← 5-Phase pipeline details
├── sequential-tasks/SKILL.md          ← Per-user sequential task enforcement
├── forge-release-process/SKILL.md     ← Local release pipeline (not GH Actions)
├── multi-agent/SKILL.md               ← Parallel agent orchestration
├── testing-standards/SKILL.md         ← Unit/Integration/UX test tiers
├── pr-workflow/SKILL.md               ← PR review standards
├── documentation/SKILL.md             ← Docs discipline (CHANGELOG-first)
├── github-issue-images/SKILL.md       ← Fetch screenshots from GitHub
├── customize-cloud-agent/SKILL.md     ← Copilot cloud agent config
├── task-classification/SKILL.md       ← Route tasks by complexity
├── effectiveness-tracking/SKILL.md    ← Success metrics logging
├── playwright-testing/SKILL.md        ← E2E test framework
├── multi-file-refactor/SKILL.md       ← 5+ file refactoring strategy
└── forced-greeting/SKILL.md           ← Test skill loading
```

**Embedded at compile time**: Skills are baked into the binary via `//go:embed` so new instances always ship with the full set. No orphaned projects.

---

## 9. **Context Swallowing: The "Wall of Text" Problem**

### The Problem
AI agents receive:
- 50KB log file from a build failure
- 200 lines of stack trace
- 20 files to review
- All in one go

Result: Agent gets overwhelmed, picks a random hypothesis, and proceeds with low confidence.

### The Solution: Structured Task Decomposition
**task-classification** skill routes complex work to specialized sub-agents:

- **explore** agent — parallelizes independent research across many files
- **code-review** agent — analyzes diffs with high signal-to-noise (bugs only, not style)
- **task** agent — runs verbose commands, returns only "success" or full error trace
- **general-purpose** agent — full reasoning for complex multi-step work
- **research** agent — verifies claims and searches GitHub

Each agent is:
- **Stateless** — prompt must be complete and self-contained
- **Parallel-safe** — multiple agents can work independently
- **Signal-optimized** — returns only actionable output

---

## 10. **Release Theater: "I Tagged It"**

### The Problem
Agents claim they've "released" code by:
- Tagging a commit with `git tag v1.0.0`
- Assuming GitHub Actions will automatically create the release
- But the workflow is disabled, or has permissions issues, or requires approval

User checks GitHub releases page and finds nothing.

### The Solution: Forge Local Release Pipeline
**forge-release-process** skill enforces deterministic, CLI-based releases:

1. **Never GitHub Actions** — Release via `gh cli` directly, not workflows
2. **Local-only pipeline** — `.\scripts\local-release.ps1 [patch|minor|major|X.Y.Z]`
3. **Authenticated and synchronous** — `gh auth login`, then `gh release create`
4. **Verify before claiming** — Release object exists on GitHub, assets are uploaded

**No waiting for CI runners.** Release happens immediately, under agent control.

---

## 11. **Skeleton Crews: Critical Feedback Ignored**

### The Problem
When an agent finishes a task:
- It says "Done! PR ready at #42"
- User opens PR and sees the tests don't run on CI
- Or the build fails with a linker error
- Or the code review bot flagged 10 issues
- But the agent shipped anyway

### The Solution: Pre-Delivery Checklist (Hard Gate)
**workflow-enforcer Phase 2** requires:

```
[ ] On feature branch (not main/master)
[ ] Tests written or updated
[ ] Commit message follows format: type(scope): description
[ ] CHANGELOG.md updated (if behavior changed)
[ ] Build command succeeds
[ ] Test suite passes
[ ] Code review passed (if enabled)
[ ] Workflow preflight check passes
```

**Pre-commit hook blocks** any commit missing required gates. Agent can't bypass.

---

## 12. **Hallucinated Architecture: "This Design Is Optimal"**

### The Problem
Agents often:
- Propose a database schema without checking if it conflicts with existing schemas
- Suggest a refactor that breaks 5 other modules
- Design a state machine that doesn't match the actual UI flow
- Never ask "have we tried this before?"

### The Solution: Session Store + Historical Context
**session_store** database contains:
- All prior sessions: files changed, branches created, PRs made
- FTS5 full-text search across checkpoint summaries and conversation history
- Query: "How did we handle authentication last time?" → retrieves 5 prior sessions with relevant approaches

**Agents can query**:
```sql
SELECT s.id, s.summary, sf.file_path 
FROM session_files sf 
JOIN sessions s ON sf.session_id = s.id 
WHERE sf.file_path LIKE '%auth%'
  AND s.repository = 'owner/repo'
ORDER BY s.created_at DESC;
```

Result: "We tried this 3 months ago and discovered X. Here's the PR that documents it."

---

## 13. **Cargo Cult: "Always Use This Pattern"**

### The Problem
Different AI sessions apply different patterns:
- Session 1 uses error wrapping: `fmt.Errorf("context: %w", err)`
- Session 2 uses `if err != nil { panic(err) }`
- Session 3 uses custom `ErrKind` wrapper
- Codebase becomes unmaintainable

### The Solution: Explicit Convention Enforcement via Memory
**store_memory** and **vote_memory** tools let the user document repository-wide conventions:

```
store_memory({
  scope: "repository",
  subject: "error handling",
  fact: "Use ErrKind wrapper for every public API error",
  citations: "pkg/api/errors.go:12-45, internal/handlers/routes.go:89",
  reason: "Ensures type-safe error handling across all API boundaries..."
})
```

**All future agents** read these stored conventions at session start. Conventions become *active context*, not buried in files.

---

## 14. **The Blind Handoff: Intermediate Outputs Lost**

### The Problem
Complex multi-phase tasks produce intermediate outputs that are critical for later phases:
- Phase 1 generates architectural diagrams (Mermaid)
- Phase 2 needs to reference those diagrams
- But diagrams are only in agent memory, not persisted
- Phase 3 (next session) has no diagrams, repeats the design

### The Solution: Session Artifacts
**session-state/files/** directory persists:
- Mermaid architecture diagrams
- Spreadsheets with test case matrices
- JSON task breakdowns
- Any intermediate artifacts that don't belong in the repo

These are carried forward across checkpoints and can be referenced by later phases or resumed sessions.

---

## 15. **Zombie Processes: Hanging Servers & Stale State**

### The Problem
When agents start servers for testing:
- `npm run dev` launches a dev server
- Test finishes
- Agent doesn't stop the server (or can't)
- Next session can't bind to port 3000
- User manually kills processes

### The Solution: Explicit Lifecycle Management
**forge-vault-terminal_sessions** provides:
- List all active PTY sessions
- Read/write to specific sessions
- Explicit shutdown lifecycle

Agents now:
1. Start server in a new PTY: `terminal_sessions → terminal_execute(...)`
2. Verify it's responsive (e.g., curl `http://localhost:3000`)
3. Run tests against live server
4. Explicitly close the PTY session
5. Verify it's stopped

No zombie servers.

---

## 16. **Cross-Platform Nightmares: "Works on My Machine"**

### The Problem
Windows developers hit Node path length limits, OpenNext compilation fails, Turbopack breaks on long paths.

Agent says "it builds fine" but only tested on macOS. Windows user gets:

```
error ENOENT: no such file or directory, scandir 'C:\...\node_modules\.vercel\output\_functions\node_modules\some-dep...'
```

### The Solution: Adaptive Build Environments
**adaptive-build-environments** (forge-vault skill):

```
environment_detect()      # Checks for WSL2, Docker availability
environment_run(
  command: "npm run build",
  environment: "auto"      # Auto-picks Linux if available
)
```

Windows builds transparently route to WSL2 or Docker. No path length issues. Agent verifies build succeeds in the target environment.

---

## 17. **The Scope Creep Spiral: "Just One More Thing"**

### The Problem
Tasks expand mid-execution:
- User: "Add authentication"
- Agent finishes auth, then decides to "also refactor the session store"
- User: "That wasn't part of the task"
- Agent: "But it improves performance..."

Boundaries blur, scope explodes, original task never ships.

### The Solution: Sequential Task Enforcement (sequential-tasks skill)
For users with sequential-task enforcement enabled:

```
sequential-tasks: ENABLED
```

Agent must:
1. Complete the current task fully before starting a new one
2. If new work appears, ask user for approval
3. Document scope boundaries at start (plan.md)
4. Verify plan against actual changes before committing

---

## 18. **Invisible Failures: Silent Null Pointer Dereferences**

### The Problem
Tests pass, build succeeds, but:
- A nil pointer is dereferenced in production
- A race condition is silently ignored in tests
- A timeout is never validated in integration tests

### The Solution: Linting + Type Checking as Active Enforcement
Before delivery, agents must run:
- **Go**: `go vet ./...`, `golangci-lint run`
- **TypeScript**: `npx tsc --noEmit`
- **Frontend**: `npx eslint . --ext .ts,.tsx`

Results are checked, not just printed. Build blocks if linting fails.

---

## 19. **The Documentation Debt: Orphaned READMEs**

### The Problem
Code changes without docs:
- New API endpoint added, no comment on the handler
- Config option added, not documented in README
- Schema migration created, no guide for other developers

Documentation is stale, confusing, or missing.

### The Solution: Documentation as a First-Class Gate
**documentation** skill enforces:
1. **CHANGELOG-first** — Every user-visible change documented in CHANGELOG.md before code ships
2. **README updates** — Changes to public APIs trigger README review
3. **Inline doc comments** — Exported functions required to have doc comments
4. **Migration guides** — Schema changes require documented steps

Documentation is not an afterthought.

---

## 20. **The Tyranny of Flexibility: Too Many Options**

### The Problem
Agents are asked:
- "Implement authentication"
- Options: JWT, OAuth, session-based, SAML, WebAuthn

Without guidance, agent:
- Picks one semi-arbitrarily
- Implements it 70% of the way
- Leaves it half-integrated

### The Solution: Decision Checkpoints + Explicit Guidance
Before implementation, agents ask users for clarity:

```
ask_user({
  question: "What authentication strategy should I implement?",
  choices: [
    "JWT (Recommended)",
    "Session-based (with Redis)",
    "OAuth2 (GitHub)"
  ]
})
```

User chooses → Decision is recorded in `session_store` → Implementation is guided by that choice.

---

## Summary: The Five Core Problems

| Layer | Problem | Solution |
|-------|---------|----------|
| **Process** | Code-first, no planning | Workflow Enforcer (5-Phase pipeline) |
| **Quality** | Unmaintainable naming/structure | Code Quality enforcement + Memory conventions |
| **Testing** | No test discipline | Scorched Earth testing protocol (Unit/Integration/UX) |
| **Trust** | "I ran it" ≠ "it works" | Deterministic Verification (visual proof) |
| **State** | Context collapse on long tasks | Session state ledger + checkpoints |

Forge Terminal makes AI-assisted development **deterministic, auditable, and reproducible** — transforming agentic coding from a "move fast and fix bugs" approach into a rigorous, enterprise-grade workflow.

---

**Related reading:**
- `.github/copilot-instructions.md` — System instructions and execution phases
- `AGENTS.md` — Project-specific rules and skill cascade
- `FORGE_WORKFLOW_REPLICATION_GUIDE.md` — Extending Forge to other projects
- `.github/skills/*/SKILL.md` — Individual skill documentation
