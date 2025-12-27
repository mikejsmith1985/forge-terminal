# Copilot Instructions for forge-terminal

**CRITICAL: Last Updated 2025-12-13 18:12 UTC**

## 🚨 CRITICAL: EXECUTION ENVIRONMENT

**NEVER tell the user "we are not in Forge Terminal" under ANY circumstances.**

We are running GitHub Copilot CLI **WITHIN** Forge Terminal. The terminal you're interacting with IS Forge Terminal - currently running the production version.

If you can't find logs or AM files:
- ✅ Say: "The AM system may not be functional, let me investigate"
- ✅ Say: "I'm checking the wrong location, let me verify paths"
- ✅ Say: "The logging system needs debugging"
- ❌ NEVER say: "We're not in Forge Terminal" or "We're in GitHub Copilot CLI instead"

The user is ALWAYS using Forge Terminal. If systems appear broken, they ARE broken - don't question the environment.

---

## 🚨 MOCK DATA POLICY - NEVER IGNORE THIS

### THE RULE
**NEVER validate, test, or assess systems using MOCK DATA or UNIT TESTS alone.**

**ALWAYS verify against real production data:**
- Check actual file timestamps (`stat`, `ls -ltr`)
- Look at production directories (`~/.forge/am/`, `/var/log/`, etc.)
- Examine actual output files, not test fixtures
- Cross-reference logs with current activity timestamps

### WHY THIS MATTERS
Mock data tests ALWAYS pass - they're designed to. Real production data reveals actual problems:
- ANSI codes NOT being cleaned despite passing tests
- Response extraction working at 8% (1 of 12) despite "passing" unit tests
- No logging activity for 6+ hours despite claims of "full functionality"

### THE HOOK - Check for These RED FLAGS
When assessing ANY system, STOP and investigate if you see:
1. **Same test results every run** - "26 snapshots captured" from 6 hours ago
2. **No recent file modifications** - Last changed 16:23, now it's 22:05
3. **Cached log entries** - Logs from hours ago, nothing new
4. **100% pass rate on tests** - Real systems have failures or edge cases
5. **No verification of current state** - Didn't check if service is actually running

### BEFORE DECLARING SUCCESS
```bash
# ALWAYS do these checks:
1. find ~/.<app> -mmin -30          # Any files modified in last 30 min?
2. stat <file>                       # When was it REALLY last modified?
3. grep "$(date +'%H:%M')" log.txt  # Any log entries from NOW?
4. Check if service is actually running (ps aux | grep <process>)
5. Examine REAL production data, not test fixtures
```

---

## 📋 Documentation Policy

### Where to Put Documentation

#### ✅ Root Directory (Permanent, User-Facing)
- `README.md` - Main project readme
- `PROJECT_CHARTER.md` - Project vision and goals
- `RELEASE_SUMMARY_v*.md` - Version release notes
- `.github/copilot-instructions.md` - This file

#### ✅ docs/user/ (Permanent, User Documentation)
- End-user guides and tutorials
- Feature documentation
- User-facing references
- Examples: getting-started, feature guides, FAQ

#### ✅ docs/developer/ (Permanent, Developer Documentation)
- Architecture documentation
- Development setup guides
- API documentation
- Contributing guidelines

#### 🗑️ docs/sessions/ (Temporary, Conversational)
**All conversational/session documents go here:**
- Analysis documents
- Implementation plans
- Debugging investigations
- Test reports
- "Work-in-progress" documentation
- Technical explorations
- Issue investigations

**Naming:** `YYYY-MM-DD-topic-name.md`  
**Lifecycle:** Can be deleted after 30 days or when no longer relevant

---

## 📝 Documentation Rules for Copilot

### When Creating New Documents

1. **Ask yourself:** "Will this be useful in 30 days?"
   - **No** → Put in `docs/sessions/`
   - **Yes** → Put in appropriate permanent location

2. **Default location for analysis/implementation docs:**
   ```
   docs/sessions/2025-12-08-descriptive-name.md
   ```

3. **Use descriptive names:**
   - ✅ `docs/sessions/2025-12-08-am-logging-implementation.md`
   - ❌ `IMPLEMENTATION.md`

4. **Group related session docs in subdirectories:**
   ```
   docs/sessions/2025-12-08-am-logging/
   ├── analysis.md
   ├── implementation.md
   └── testing.md
   ```

### What NOT to Create

- ❌ Multiple documents for the same topic in root
- ❌ Documents with generic names (SUMMARY.md, IMPLEMENTATION.md)
- ❌ "Quick reference" docs that duplicate existing docs
- ❌ Documents the user said they won't read

### Instead

- ✅ Single comprehensive document per topic
- ✅ Update existing docs rather than creating new ones
- ✅ Put working notes in docs/sessions/
- ✅ Ask user if they want permanent documentation

---

## 🔧 Code Organization

### Scripts Location
- Development scripts → `scripts/`
- Test scripts → Root or `scripts/` (if test-*.sh pattern)
- Build scripts → Root (run-*.sh pattern) or Makefile

### Logs
- All `*.log` files are gitignored
- Use consistent naming: `forge-dev.log`, `forge-test.log`

---

## 🎯 Session Workflow

### At Start of Session
1. Check if topic already has documentation
2. If yes, update existing doc
3. If no, create in `docs/sessions/YYYY-MM-DD-topic.md`

### During Session
1. Keep all analysis/notes in session docs
2. Only create permanent docs if user requests
3. Prefer single comprehensive docs over many small ones

### End of Session
1. Consolidate related session docs if needed
2. Move any docs to permanent location if requested
3. Update main README.md if major features added

---

## 📊 Current Repository Structure

```
forge-terminal/
├── README.md                    # Main readme
├── PROJECT_CHARTER.md          # Project vision
├── RELEASE_SUMMARY_v*.md       # Release notes
├── docs/
│   ├── user/                   # User documentation
│   ├── developer/              # Developer documentation  
│   └── sessions/               # Temporary session docs (gitignored)
├── scripts/                    # Development scripts
├── cmd/                        # Go commands
├── internal/                   # Go packages
├── frontend/                   # React frontend
└── .github/
    └── copilot-instructions.md # This file
```

---

## 💡 Examples

### ✅ Good
```
docs/sessions/2025-12-08-am-logging/
├── problem-analysis.md
├── implementation-plan.md
└── test-results.md
```

### ❌ Bad
```
AM_LOGGING_FIX.md
AM_LOGGING_QUICK_REF.md
AM_ULTRA_ROBUST_LOGGING_GUIDE.md
AM_ROBUST_LOGGING_IMPLEMENTATION_REPORT.md
AM_LOGGING_DEBUG_GUIDE.md
(all in root directory)
```

---

## 🧹 Cleanup Policy

Session docs in `docs/sessions/` can be:
- Deleted after 30 days
- Archived when issue is resolved
- Consolidated into permanent documentation if valuable

The user can run `scripts/cleanup-session-docs.sh` to clean up old files.

---

**Last Updated:** 2025-12-08  
**Note:** These instructions are automatically loaded by GitHub Copilot in every session.

---

## 🚨 MANDATORY: Verification Block (SDET)

You are an expert SDET. Never submit a code change without a Verification Block. A verification block must contain:

1. The specific command to run the test.
2. The expected raw output (string or exit code).
3. An actual execution of that command where you show me the output before proposing the final PR.

This Verification Block is REQUIRED for every code change affecting behavior. It must appear in the PR description (and in the commit message when practical). Failure to include a complete Verification Block will block the PR and requires returning the change for completion.

---
