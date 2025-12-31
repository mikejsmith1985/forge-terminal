# Forge Terminal v3.7.2 - Chat UX Enhancement

**Release Date:** December 31, 2025

## Overview
Enhanced Chat UX with message timestamps and improved message execution, making the chat interface a fully functional mirror of the terminal experience.

## Features & Improvements

### ✨ Message Timestamps
- **Display Time Context**: Every message now displays its creation time in `HH:MM:SS` format
- **Persistent Timestamps**: Timestamps are preserved through SQLite persistence and WebSocket synchronization
- **Visual Design**: Subtle, monospace font styling that doesn't distract from message content
- **All Message Types Supported**: User messages, assistant responses, external commands, and system prompts all show timestamps

### 🔧 Message Handling Improvements
- **No Duplication**: Enhanced message deduplication ensures each message appears exactly once
- **Proper Execution**: Send button correctly executes prompts through PTY bridge
- **Consistent Flow**: Messages flow seamlessly from chat input → SQLite → display

### 📊 Implementation Details
- Added `timestamp` field to message model
- Timestamps captured at message creation time (not insertion time)
- Timestamps preserved during:
  - Direct user input
  - PTY bridge responses
  - HTTP fallback mode
  - SQLite persistence
  - WebSocket sync

## Technical Changes

### Frontend (ChatView Component)
- Added `formatTimestamp()` helper function for consistent time formatting
- Updated all message creation paths to include timestamp
- Added `.chat-view-timestamp` CSS class for styling
- Timestamps displayed prominently in message bubbles

### Files Modified
- `frontend/src/components/ChatView.jsx` - Core timestamp logic
- `frontend/src/components/ChatView.css` - Timestamp styling
- `frontend/package.json` - Version bump to 3.7.2

## Quality Assurance
- ✅ Frontend builds successfully with no errors
- ✅ No bundle size increase (existing assets rebuilt)
- ✅ Backward compatible with existing message format
- ✅ WebSocket deduplication prevents duplicate messages
- ✅ SQLite persistence includes timestamp data

## User Impact
- Chat messages now show exact timing, improving context awareness
- Enhanced user experience with clear message flow visualization
- No breaking changes to existing functionality
- Improved debugging and conversation tracking

## Known Limitations
- Timestamps use local system time (not server time)
- Historical messages loaded from SQLite display stored timestamps

## Next Steps
- Monitor for any timestamp display edge cases
- Consider adding date separators for long conversations
- Explore timestamp filtering/search capabilities

---

**Commit Hash:** a0883be  
**Branch:** main  
**Status:** Production Ready
