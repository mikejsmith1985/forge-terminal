# Release Notes - v3.6.4

**Release Date:** December 30, 2024

## 🐛 Bug Fixes

### Tour Overlay Button Overflow
**Fixed:** The "Next" button in the guided tour was extending outside the card boundary on the right side.

**Changes:**
- Added explicit width (380px) and `box-sizing: border-box` to `.tour-tooltip`
- Added `overflow: hidden` to prevent content overflow
- Added `flex-shrink: 0` to `.tour-tooltip-actions` (buttons stay fixed size)
- Added `flex-shrink: 1` to `.tour-tooltip-progress` (dots can shrink if needed)
- Added `width: 100%` and `box-sizing: border-box` to `.tour-tooltip-footer`

**Impact:** Tour buttons now properly stay within the card boundaries at all screen sizes.

---

### Command Card Chat Integration
**Fixed:** Command cards executed in chat mode were sending to terminal but not appearing in the chat view with responses.

**Root Cause:** When command cards called `sendChatCommand()`, the ChatView state was never initialized (no user message, no assistant placeholder, `isLoading=false`), causing the chat output handler to ignore all incoming PTY output.

**Changes:**
- Added `chatCommandInitHandlerRef` in `ForgeTerminal.jsx`
- Modified `sendChatCommand()` to call init handler before sending to WebSocket
- Added `registerChatCommandInitHandler` / `unregisterChatCommandInitHandler` methods
- Added `handleExternalCommand()` in `ChatView.jsx` that:
  - Creates user message with the command
  - Creates placeholder assistant message
  - Sets `isLoading=true` and tracks assistant message ID
  - Persists user message to SQLite
- Registered handler in ChatView's useEffect

**Impact:** Command cards now properly display in chat mode with:
- User message showing the executed command
- Streaming assistant response in real-time
- Proper state management (loading indicators, message persistence)

**Before:** Terminal ✅ | Chat ❌  
**After:** Terminal ✅ | Chat ✅

---

### Smart Routing Ollama Message
**Fixed:** Settings showed "Install for better analysis" message even when embedded SLM (llama-cpp) was working.

**Changes:**
- Updated condition in `SettingsModal.jsx` (dev mode Ollama status section)
- Now only shows "Install for better analysis" when:
  - Ollama is not available, AND
  - Embedded SLM is also not the active provider (`slmStatus?.active_provider !== 'llama-cpp'`)

**Impact:** Users with working embedded SLM no longer see misleading messages about installing Ollama.

---

## 📦 Files Changed

- `frontend/src/components/TourOverlay.css` - Tour button overflow fix
- `frontend/src/components/ForgeTerminal.jsx` - Chat command init handler
- `frontend/src/components/ChatView.jsx` - External command state initialization
- `frontend/src/components/SettingsModal.jsx` - Smart routing UI logic
- `cmd/forge/web/assets/*` - Built frontend assets

---

## 🧪 Testing Recommendations

1. **Tour Overlay:**
   - Start guided tour from welcome modal
   - Verify all "Next" buttons stay within card boundaries
   - Test on different screen sizes

2. **Command Card Chat:**
   - Switch to chat view mode
   - Execute a command card
   - Verify command appears as user message
   - Verify response streams into chat as assistant message
   - Check that message persists to SQLite

3. **Smart Routing UI:**
   - Open Settings → Intelligence (dev mode)
   - With embedded SLM active, verify no "Install for better analysis" message
   - With neither Ollama nor llama-cpp, verify message does appear

---

## 🔄 Upgrade Instructions

1. Stop Forge Terminal
2. Replace `forge.exe` with new version
3. Start Forge Terminal
4. Frontend assets are bundled - no additional steps needed

---

## 📝 Notes

- This is a bug fix release with no breaking changes
- All three fixes address UX issues identified in production use
- Command card chat integration was a critical fix for chat mode workflow
