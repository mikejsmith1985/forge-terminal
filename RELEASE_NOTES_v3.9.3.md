# Release Notes - v3.9.3

**Release Date:** 2026-01-01  
**Type:** Major System Rewrite

## 🚨 Breaking Change: Native Session Recovery

The AM (Artificial Memory) system has been **completely rewritten** to use native AI CLI session recovery instead of custom PTY capture. This is a fundamental architectural change that improves reliability and prevents destructive operations.

---

## 🎯 What Changed

### Before (v3.9.2 and earlier)
- Custom PTY capture pipeline
- Manual ANSI parsing
- Complex session reconstruction  
- Prone to killing active sessions

### After (v3.9.3)
- Native session monitoring
- Leverages `copilot --resume` and `claude --resume`
- Real-time recoverability validation
- **Non-destructive** - no process killing

---

## ✨ New Features

### Native Session Monitor
- Automatically scans `~/.copilot/session-state/` and `~/.claude/projects/`
- Extracts metadata: turn counts, timestamps, first messages
- Validates file integrity and recoverability
- Works with **both** GitHub Copilot CLI and Claude CLI

### Recovery Manager
- Lists recoverable sessions via `/api/am/native/sessions`
- Generates resume commands via `/api/am/native/recover`
- Provider-agnostic interface (Copilot/Claude)
- Real-time validation of session files

### Health Monitoring Enhancement
- `/api/am/health` now reports native session stats
- Shows total sessions, recoverable count, most recent session
- Integrated with existing health dashboard

---

## 🔧 Technical Details

### New Files
- `internal/am/native_session.go` - Session scanner and validator
- `internal/am/recovery_native.go` - Recovery command generator

### Modified Files
- `internal/am/system.go` - Replaced AsyncPipeline with RecoveryManager
- `internal/am/health_monitor.go` - Added native session health reporting
- `internal/am/async_pipeline.go` - Updated for compatibility
- `cmd/forge/main.go` - New API endpoints

### API Endpoints
```
GET  /api/am/native/sessions?limit=20
POST /api/am/native/recover {sessionId, provider}
```

---

## 🧪 Testing Results

Successfully tested with:
- ✅ 10 Copilot sessions detected and parsed
- ✅ Metadata extraction (turns, timestamps, messages)
- ✅ Recovery command generation
- ✅ Recoverability validation
- ✅ Both Copilot and Claude CLI support confirmed

---

## 📝 Migration Notes

### For Users
- No action required - the change is transparent
- Your existing sessions are now **more reliable** to recover
- Use `copilot --resume` or `claude --resume` to recover sessions

### For Developers
- The `AsyncPipeline` is deprecated but remains for compatibility
- Use `system.GetRecoveryManager()` for session operations
- Native sessions are JSON Lines format (`.jsonl`)

---

## 🐛 Bug Fixes

- Fixed: Session kill commands that destroyed active work
- Fixed: Unreliable custom PTY capture
- Fixed: ANSI parsing artifacts in session data
- Fixed: Memory leaks in capture pipeline

---

## 🔮 Future Work

- Frontend UI for session list (planned for v3.9.4)
- "Resume Session" button in toolbar
- Session search and filtering
- Cross-provider session management

---

## 💡 Why This Matters

This rewrite eliminates the **#1 complaint** with AM: accidentally killing your active Copilot session. By leveraging the native `--resume` functionality built into both Copilot CLI and Claude CLI, we get:

1. **Reliability** - Battle-tested by GitHub and Anthropic
2. **Safety** - No process manipulation required  
3. **Simplicity** - Less code to maintain
4. **Compatibility** - Works with future CLI updates

---

## 📦 Installation

```bash
# Download the latest binary for your platform
# Windows
forge-windows-amd64.exe

# macOS
forge-darwin-arm64  # Apple Silicon
forge-darwin-amd64  # Intel

# Linux
forge-linux-amd64
forge-linux-arm64
```

---

## 🙏 Acknowledgments

Special thanks to the user who reported the session kill issue - this release is a direct response to that feedback!

---

**Full Changelog:** v3.9.2...v3.9.3
