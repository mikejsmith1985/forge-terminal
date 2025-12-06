# Artificial Memory (AM) - Session Recovery Feature

> **Status:** Planning
> **Created:** 2025-12-06
> **Author:** AI Architect

---

## Executive Summary

This document outlines the implementation plan for a comprehensive AM and recovery system for Forge Terminal. The feature enables users to recover their work context after unexpected terminal closures by maintaining real-time logs of all terminal activity and providing an AI-powered restore mechanism.

---

## Problem Statement

When using AI CLI tools (GitHub Copilot CLI, Claude CLI) in Forge Terminal:

1. **Unexpected crashes lose all context** - Users must re-explain their task from scratch
2. **No visibility into agent activity** - Users can't review what happened in a session
3. **No recovery mechanism** - Even with logs, resuming context manually is tedious

---

## Solution Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      FORGE TERMINAL                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │ Tab 1       │    │ Tab 2        │    │ Tab 3             │  │
│  │ [AM:ON]│    │ [AM:OFF]│    │ [AM:ON]      │  │
│  └──────┬──────┘    └──────────────┘    └─────────┬─────────┘  │
│         │                                          │            │
│         ▼                                          ▼            │
│  ┌──────────────┐                         ┌──────────────┐     │
│  │ AM Writer   │                         │ AM Writer   │     │
│  └──────┬───────┘                         └──────┬───────┘     │
│         │                                         │             │
└─────────┼─────────────────────────────────────────┼─────────────┘
          │                                         │
          ▼                                         ▼
   .forge/am/                              .forge/am/
   session-{tabId}-{date}.md                 session-{tabId}-{date}.md
          │                                         │
          └────────────────┬────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ AM Restore │  ◄── Command Card
                  │     Card        │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ AI Summarizes   │
                  │ & Continues     │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Archive Log     │
                  │ (7-day retain)  │
                  └─────────────────┘
```

---

## Detailed Implementation Plan

### Phase 1: Logging Infrastructure

#### 1.1 Directory Structure

```
project-root/
└── .forge/
    └── am/
        ├── session-tab1abc-2025-12-06.md      # Active AM session
        ├── session-tab2def-2025-12-06.md      # Another tab's AM
        └── archive/
            ├── session-tab1abc-2025-12-01.md  # Archived (auto-delete after 7 days)
            └── session-tab2def-2025-11-30.md
```

#### 1.2 AM Log Format

```markdown
# Forge AM (Artificial Memory) Log

| Property | Value |
|----------|-------|
| Tab ID | tab-1-abc123 |
| Tab Name | Main Terminal |
| Workspace | /home/user/my-project |
| Session Start | 2025-12-06T00:19:00Z |
| Last Updated | 2025-12-06T01:45:30Z |

---

## Session Activity

### 00:19:15 [USER_INPUT]
```
gh copilot suggest "create a REST API with JWT auth"
```

### 00:19:45 [AGENT_OUTPUT]
```
I'll help you create a REST API with JWT authentication. Let me start by 
setting up the project structure...
```

### 00:20:02 [COMMAND_EXECUTED]
```bash
mkdir -p src/{routes,controllers,middleware}
```

### 00:20:15 [FILE_CREATED]
- `src/routes/auth.js`
- `src/middleware/jwt.js`

### 00:25:30 [AGENT_OUTPUT]
```
Now I'll implement the JWT validation middleware...
```

### 00:26:00 [SESSION_INTERRUPTED]
> ⚠️ Session ended unexpectedly

---

## Recovery Context

**Last Known State:**
- Working on: JWT validation middleware implementation
- Files in progress: `src/middleware/jwt.js`
- Pending tasks: Add refresh token logic, create login endpoint

---
```

#### 1.3 Log Entry Types

| Type | Description | Example |
|------|-------------|---------|
| `USER_INPUT` | Commands typed by user | `gh copilot suggest "..."` |
| `AGENT_OUTPUT` | AI agent responses/reasoning | Copilot explanations |
| `COMMAND_EXECUTED` | Shell commands that were run | `npm install express` |
| `FILE_CREATED` | Files created during session | `src/index.js` |
| `FILE_MODIFIED` | Files changed during session | `package.json` |
| `ERROR` | Errors encountered | Build failures, crashes |
| `SESSION_STARTED` | Logging began | Timestamp + metadata |
| `SESSION_ENDED` | Clean shutdown | Timestamp |
| `SESSION_INTERRUPTED` | Unexpected termination | Detected on next startup |

---

### Phase 2: UI Components

#### 2.1 AM Toggle

**Location:** Tab bar, next to existing controls (Auto-respond, etc.)

**States:**
- OFF (default): No logging, icon grayed out
- ON: Active AM, icon highlighted with accent color
- LOGGING: Animated icon when actively writing

**Mockup:**
```
┌─────────────────────────────────────────────────────────────┐
│ [Tab 1] [Tab 2] [+]                    [📝] [⚡] [⚙️]       │
│                                         ▲                   │
│                                         │                   │
│                              AM Toggle (per-tab)       │
└─────────────────────────────────────────────────────────────┘
```

**Tooltip:** "AM (Artificial Memory): Records terminal activity for crash recovery"

#### 2.2 Logging Indicator

When AM is active, show subtle indicator in tab:
```
┌──────────────────┐
│ ● Tab 1          │  ◄── Red/orange dot indicates AM active
└──────────────────┘
```

#### 2.3 Settings Panel Addition

Add to Settings modal:
```
AM (Artificial Memory)
├── Default AM state: [OFF ▼]  (OFF / ON / Remember per tab)
├── Log retention days: [7]
├── Log location: [.forge/am/]
└── [Clear All Logs] [Open Logs Folder]
```

---

### Phase 3: AM Restore Command Card

#### 3.1 Card Definition

**Name:** "Restore AM Session"
**Icon:** 🔄 or ↩️
**Category:** Session Management

**Visibility Logic:**
- Show prominently if `.forge/am/session-*.md` exists for current tab
- Show with badge if log is from interrupted session
- Always available in command palette

#### 3.2 Card Behavior

```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 Restore AM Session                                 │
│                                                             │
│ A previous session log was found from 2 hours ago.         │
│ Last activity: "Implementing JWT middleware"                │
│                                                             │
│ [Restore with Copilot] [Restore with Claude] [Dismiss]     │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Restore Prompt Template

When user clicks restore, send this to their chosen CLI:

```
I'm resuming a previous coding session that was interrupted. Please read 
the session log below and:

1. Summarize what was accomplished
2. Identify any incomplete tasks
3. Continue from where we left off

Here is the session log:

---
[CONTENTS OF session-{tabId}-{date}.md]
---

Please acknowledge you've reviewed this and tell me where we left off, 
then continue with the next step.
```

#### 3.4 Post-Restore Actions

After successful restore:
1. Move log to `.forge/am/archive/`
2. Start fresh log for new session
3. Show toast: "AM restored. Previous log archived."

---

### Phase 4: Archive Management

#### 4.1 Auto-Cleanup Job

**Trigger:** On Forge Terminal startup + daily while running

**Logic:**
```javascript
async function cleanupOldLogs() {
  const archiveDir = '.forge/am/archive/';
  const maxAgeDays = 7;
  const cutoffDate = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  
  for (const file of await readdir(archiveDir)) {
    const stats = await stat(join(archiveDir, file));
    if (stats.mtimeMs < cutoffDate) {
      await unlink(join(archiveDir, file));
      logger.info(`Cleaned up old log: ${file}`);
    }
  }
}
```

#### 4.2 Storage Estimates

Assuming:
- Average session: 2 hours
- Log entry every 30 seconds when active
- ~500 bytes per entry average

Per session: ~240 entries × 500 bytes = **120 KB**
7 days retention, 3 tabs, 2 sessions/day: 7 × 3 × 2 × 120 KB = **~5 MB max**

Very manageable storage footprint.

---

### Phase 5: Startup Detection

#### 5.1 Interrupted Session Detection

On workspace open, check for:
1. Existing log files without `SESSION_ENDED` marker
2. Log files modified within last 24 hours

If found, show restore prompt automatically.

#### 5.2 Startup Flow

```
┌─────────────────────────────────────────┐
│          Forge Terminal Startup          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Check for logs │
         │ in .forge/logs │
         └────────┬───────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
   [Logs Found]       [No Logs]
        │                   │
        ▼                   ▼
┌───────────────┐    ┌─────────────┐
│ Check if      │    │ Normal      │
│ interrupted   │    │ startup     │
└───────┬───────┘    └─────────────┘
        │
        ▼
   [Interrupted?]
    Yes │    │ No (clean end)
        │    │
        ▼    ▼
┌───────────┐ ┌────────────────┐
│ Show      │ │ Archive old    │
│ Restore   │ │ log, continue  │
│ Prompt    │ │ normally       │
└───────────┘ └────────────────┘
```

---

## Technical Implementation Details

### File: `frontend/src/utils/amLogger.js`

```javascript
/**
 * AMLogger Utility
 * 
 * Handles writing terminal activity to markdown log files
 * for session recovery purposes.
 */

class SessionLogger {
  constructor(tabId, workspacePath) {
    this.tabId = tabId;
    this.workspacePath = workspacePath;
    this.logPath = null;
    this.isEnabled = false;
    this.buffer = [];
    this.flushInterval = null;
  }

  async enable() { /* ... */ }
  async disable() { /* ... */ }
  
  log(type, content) { /* ... */ }
  
  async flush() { /* ... */ }
  
  async getLogContent() { /* ... */ }
  
  async archiveLog() { /* ... */ }
}

export default SessionLogger;
```

### File: `frontend/src/components/AMToggle.jsx`

New component for the AM toggle button in the tab bar.

### File: `frontend/src/components/RestoreSessionCard.jsx`

Command card component for session restoration.

### Backend Changes: `internal/terminal/am_logger.go`

Go backend component to handle file I/O for logging (keeps frontend simple).

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/logs/{tabId}` | GET | Get current log content |
| `/api/logs/{tabId}` | POST | Append to log |
| `/api/logs/{tabId}` | DELETE | Archive and clear log |
| `/api/logs/cleanup` | POST | Trigger archive cleanup |
| `/api/logs/check` | GET | Check for recoverable sessions |

---

## Implementation Order

### Sprint 1: Core Logging (Backend + Basic UI)
1. Create `.forge/am/` directory management
2. Implement log file creation and writing (Go backend)
3. Add API endpoints for log operations
4. Create basic AM toggle in UI
5. Wire up terminal output to logger when enabled

### Sprint 2: Log Content & Formatting
1. Implement entry type detection (USER_INPUT, AGENT_OUTPUT, etc.)
2. Add ANSI stripping and content cleaning
3. Implement markdown formatting
4. Add session metadata header
5. Handle session start/end markers

### Sprint 3: Restore Functionality
1. Create RestoreSessionCard component
2. Implement log parsing for summary extraction
3. Build restore prompt template system
4. Add CLI tool selection for restore
5. Implement post-restore archival

### Sprint 4: Archive & Cleanup
1. Implement archive directory and file moving
2. Add 7-day cleanup job
3. Create startup interrupted session detection
4. Add auto-prompt for recovery on startup
5. Settings panel integration

### Sprint 5: Polish & Testing
1. Add logging indicator to tabs
2. Implement "Remember AM state" per tab
3. Error handling and edge cases
4. Performance optimization (buffered writes)
5. Documentation and user guide updates

---

## Configuration Options

```javascript
// Default configuration
const DEFAULT_CONFIG = {
  logging: {
    enabled: false,           // Default AM state for new tabs
    rememberPerTab: true,     // Remember each tab's preference
    retentionDays: 7,         // Days to keep archived logs
    amDirectory: '.forge/am',
    bufferFlushMs: 5000,      // Flush buffer every 5 seconds
    maxLogSizeMB: 10,         // Max log file size before rotation
  }
};
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Log files grow too large | Medium | Low | Max file size + rotation |
| Performance impact from logging | Low | Medium | Buffered async writes |
| Sensitive data in logs | Medium | High | Document in user guide, consider redaction |
| Restore prompt annoys users | Low | Low | "Don't ask again" option |
| Log corruption | Low | Medium | Atomic writes, validation on read |

---

## Success Metrics

1. **Recovery Rate:** % of interrupted sessions successfully restored
2. **User Adoption:** % of users who enable AM
3. **Storage Efficiency:** Average log size per session
4. **Performance Impact:** Terminal latency with AM enabled

---

## Future Enhancements (Out of Scope)

- [ ] Cloud backup of session logs
- [ ] Log search functionality
- [ ] Automatic context summarization (periodic, not just on restore)
- [ ] Integration with git commits (link logs to code changes)
- [ ] Multi-device session sync

---

## Appendix: Example Restore Flow

### Scenario: User's terminal crashed while implementing auth

**1. User reopens Forge Terminal**

**2. System detects interrupted session:**
```
Found: .forge/am/session-tab1-2025-12-06.md
Last entry: 00:45:30 [AGENT_OUTPUT] "Now implementing refresh token..."
No SESSION_ENDED marker found.
```

**3. Restore prompt appears:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 AM Recovery Available                               │
│                                                             │
│ Your previous session was interrupted 15 minutes ago.       │
│                                                             │
│ Last activity:                                              │
│ "Implementing refresh token logic for JWT authentication"   │
│                                                             │
│ Would you like to restore this session?                     │
│                                                             │
│ [Restore with Copilot] [Restore with Claude] [Dismiss]     │
└─────────────────────────────────────────────────────────────┘
```

**4. User clicks "Restore with Copilot"**

**5. System sends to terminal:**
```
gh copilot suggest "Read the session log I'm about to provide and continue 
from where we left off. Focus on completing the refresh token implementation.

[Session log contents here...]"
```

**6. Copilot responds:**
```
I've reviewed your session log. Here's where we left off:

✅ Completed:
- Express.js project structure
- Basic JWT middleware
- Login endpoint

🔄 In Progress:
- Refresh token logic (was implementing when session ended)

Let me continue with the refresh token implementation...
```

**7. Session continues seamlessly**

---

*Document Version: 1.0*
*Ready for implementation after latest release upgrade*
