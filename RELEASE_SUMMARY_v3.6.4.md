# v3.6.4 Release Summary

## 🐛 Three Critical Bug Fixes

### 1. Tour Button Overflow ✅
**Problem:** "Next" button extended outside card boundary  
**Fix:** Added width constraints and flex-shrink rules to tour tooltip  
**Impact:** Tour UI now properly contained at all screen sizes

### 2. Command Cards → Chat Not Working ❌ → ✅
**Problem:** Command cards executed in chat mode went to terminal, never appeared in chat  
**Fix:** Added `chatCommandInitHandler` to initialize ChatView state for external commands  
**Impact:** Command cards now work seamlessly in chat mode with streaming responses

### 3. Misleading "Install Ollama" Message
**Problem:** Settings suggested installing Ollama even when embedded SLM was working  
**Fix:** Only show install message when both Ollama AND llama-cpp unavailable  
**Impact:** Clearer messaging for users with working smart routing

## 📦 Changed Files
- `TourOverlay.css` - Button layout fix
- `ForgeTerminal.jsx` - Chat init handler
- `ChatView.jsx` - External command support  
- `SettingsModal.jsx` - Smart routing UI logic

## 🔄 Upgrade
Replace `forge.exe` with new version. No config changes needed.
