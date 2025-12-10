# Release Summary - v1.21.3

**Date:** December 10, 2025  
**Type:** Feature Release  
**Focus:** Conversation Persistence & Interactive Viewer

---

## 🎉 What's New

### 1. Conversation Persistence Across Restarts
Your LLM conversation history now survives server restarts! Previously captured snapshots were lost when the server restarted. Now they're automatically restored from disk.

**Technical Details:**
- Conversations are loaded from `~/.forge/am/` on startup
- Snapshot numbering continues where it left off
- Active conversation state is preserved
- Only incomplete (active) conversations are restored

### 2. Interactive Conversation Viewer
Click the AM conversation count indicator to view captured LLM conversation snapshots in an interactive modal.

**Features:**
- Navigate through snapshots with ← → arrow keys
- View timestamp for each snapshot
- See cleaned terminal content (ANSI codes stripped)
- Starts at most recent snapshot
- Close with Esc or click outside
- Shows conversation metadata (provider, turns, snapshot count)

**How to Use:**
1. Enable Dev Mode in Settings
2. Use an LLM tool (e.g., GitHub Copilot CLI)
3. Click the "AM (3)" indicator in status bar
4. Navigate through captured conversation history

---

## 🔧 Technical Implementation

### Backend Changes

**File:** `internal/am/llm_logger.go`
- Added `loadConversationsFromDisk()` - Scans and loads conversation JSON files
- Added `GetConversation(convID)` - Retrieves specific conversation by ID
- Modified `GetLLMLogger()` - Calls loader on initialization

**File:** `cmd/forge/main.go`
- Added route: `GET /api/am/llm/conversation/{tabID}/{convID}`
- Added handler: `handleAMLLMConversationDetail()`
- Returns full conversation with all snapshots and turns

### Frontend Changes

**New Files:**
- `frontend/src/components/ConversationViewer.jsx` - Interactive modal component
- `frontend/src/components/ConversationViewer.css` - Styling with smooth animations

**Modified:**
- `frontend/src/components/AMMonitor.jsx`
  - Made conversation count clickable
  - Opens viewer modal on click
  - Fetches and stores conversation list

---

## ✅ Testing Performed

1. **Persistence Test**
   - Captured 26 snapshots before restart
   - Restarted server
   - Verified all 26 snapshots restored
   - Continued capturing (#27, #28, #29...)

2. **API Test**
   ```bash
   curl /api/am/llm/conversation/tab-1-0qii6mlkf/conv-1765391952503184663
   # Returns: 29 snapshots, 4 turns, complete conversation data
   ```

3. **UI Test**
   - Clicked AM indicator
   - Navigated through snapshots
   - Verified timestamps and content display
   - Tested keyboard shortcuts
   - Confirmed modal close behavior

---

## 📊 Metrics

- **Files Changed:** 11
- **Lines Added:** 768
- **Lines Removed:** 464
- **New Components:** 2
- **New API Endpoints:** 1
- **New Methods:** 2

---

## 🐛 Fixes

This release fixes the conversation restoration gap from v1.21.2, where:
- Snapshots were being captured but lost on restart
- No way to view captured conversation data
- Orphaned conversation files on disk

---

## 📚 Documentation Updates

- Updated `docs/user/ft_user_guide.md` with Conversation Viewer section
- Added instructions for viewing LLM conversation history
- Documented keyboard shortcuts and usage
- Created session documentation in `docs/sessions/`

---

## 🔮 Future Enhancements

Potential improvements for future releases:
1. Conversation list view (show all conversations)
2. Export conversations (JSON/Markdown)
3. Search across snapshots
4. Snapshot diff view (show changes)
5. Conversation replay (animated playback)

---

## 🚀 Upgrade Instructions

### From v1.21.2
No breaking changes. Simply pull the latest binary:
```bash
git pull origin main
make build
```

Existing conversation files will be automatically discovered and loaded.

### For Users
1. Download v1.21.3 binary
2. Replace existing binary
3. Restart Forge Terminal
4. Enable Dev Mode to access Conversation Viewer
5. Click AM indicator to view conversations

---

## 📦 Binary Sizes

- **Linux:** ~25 MB
- **macOS:** ~25 MB  
- **Windows:** ~25 MB

---

## 🎯 What to Test

If you're trying out this release, please test:

1. ✅ Restart server while conversation is active
2. ✅ Verify conversation count persists
3. ✅ Click AM indicator to open viewer
4. ✅ Navigate with arrow keys
5. ✅ Close with Esc
6. ✅ Verify timestamp accuracy
7. ✅ Check snapshot content rendering

---

## 🙏 Credits

- **Investigation:** Identified persistence gap during v1.21.2 validation
- **Implementation:** Added restoration + viewer in single session
- **Testing:** Verified across restart scenarios
- **Documentation:** Updated user guide with new features

---

**Full Changelog:** https://github.com/mikejsmith1985/forge-terminal/compare/v1.21.2...v1.21.3  
**Download:** https://github.com/mikejsmith1985/forge-terminal/releases/tag/v1.21.3
