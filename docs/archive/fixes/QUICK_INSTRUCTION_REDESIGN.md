# Quick Instruction Feature - Redesign Specification

## ❌ What Doesn't Work (Abandoned Approach)

### The PTY Interception Problem
- **Attempted:** Intercept Enter key in xterm.js and append instruction before sending to PTY
- **Why it failed:** 
  - xterm.js sends keystrokes directly to PTY via WebSocket
  - PTY (ConPTY on Windows) is kernel-level - data already consumed
  - No `preventDefault()` mechanism exists in terminal emulation
  - Would require buffering every keystroke + reconstructing input line (extremely fragile)

### Technical Reality
```
User types → xterm.js → WebSocket → PTY → gh.exe stdin
                                    ↑
                          Already delivered by the time we could intercept
```

**Decision:** ABANDON PTY interception approach entirely.

---

## ✅ New Approach: Explicit Quick Instruction Input Bar

### Core Concept
Instead of trying to intercept terminal I/O, provide a **dedicated input UI** that:
1. User types their prompt in a floating bar
2. Quick Instruction is **visible and explicit** as an appended section
3. On Send, combine prompt + instruction and send to PTY as a complete command
4. Works exactly like Command Cards "Run" functionality

### Visual Design

```
┌─────────────────────────────────────────────────────────────┐
│  Terminal Display (xterm.js)                                │
│                                                              │
│  > gh copilot suggest                                       │
│  ? What would you like to do?                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                                    ┌───────────────────────┐
                                    │   🤖 Forge Assist     │ ← Floating Button
                                    └───────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 🔸 Quick Instruction (Ctrl+I to toggle)                    │ ← Floating Bar
│ ┌────────────────────────────────────────────────────────┐ │   (Appears above button)
│ │ How do I list all files recursively?                   │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ 📝 Appended Context: [Edit]                                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ This is a test prompt to verify the quick instruction  │ │
│ │ system is working correctly.                           │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│  [Cancel]                                      [Send ↵]    │
└─────────────────────────────────────────────────────────────┘
```

### User Workflow

#### Initial Setup
1. User opens Settings → "Quick Instructions"
2. Creates/edits quick instruction text
3. Toggles "Enable Quick Instruction" checkbox
4. Saves settings

#### Active Usage
1. **Quick Instruction enabled** → Floating bar appears above Forge Assist button
2. User clicks on floating bar OR presses **Ctrl+I** → Bar expands
3. User types their prompt in top textarea
4. Quick instruction preview shown in bottom section (editable)
5. User clicks **[Send]** or presses **Ctrl+Enter**
6. System combines: `{user_prompt}\n\n{quick_instruction}\n`
7. Sends complete text to active terminal's PTY (same as Command Card "Run")

#### Toggle Behavior
- **Ctrl+I** → Show/hide Quick Instruction bar
- **Escape** → Collapse/hide bar (keep enabled)
- Bar persists across tab switches (global state)

### Component Architecture

```
App.jsx
  ├─ ForgeAssist (existing floating button)
  └─ QuickInstructionBar (NEW)
       ├─ Position: Fixed, anchored above ForgeAssist button
       ├─ State: { isExpanded, userPrompt, quickInstruction }
       ├─ Props: { onSend, activeTab, quickInstructionConfig }
       └─ Send Handler: Uses same sendToTerminal() as CommandCards
```

### Settings Integration

**New Settings Panel: "Quick Instructions"**

```jsx
<SettingsModal>
  <Tab name="Quick Instructions" icon={Zap}>
    <QuickInstructionsPanel>
      <Toggle 
        label="Enable Quick Instruction Bar"
        checked={quickInstructionEnabled}
        onChange={...}
      />
      
      <Textarea
        label="Quick Instruction Template"
        value={quickInstructionText}
        onChange={...}
        placeholder="This is a test prompt to verify..."
        rows={6}
      />
      
      <Keyboard Shortcut>
        Ctrl+I: Toggle Quick Instruction Bar
        Ctrl+Enter: Send prompt with instruction
      </Keyboard Shortcut>
    </QuickInstructionsPanel>
  </Tab>
</SettingsModal>
```

### Implementation Files

#### New Files
1. **`frontend/src/components/QuickInstructionBar.jsx`**
   - Main component (~250 lines)
   - Floating bar UI with prompt + instruction textareas
   - Send button handler
   - Keyboard shortcuts (Ctrl+I, Ctrl+Enter, Escape)

2. **`frontend/src/components/QuickInstructionBar.css`**
   - Styling for floating bar
   - Animations (slide-up on expand)
   - Responsive positioning relative to Forge Assist button

3. **`frontend/src/components/QuickInstructionsPanel.jsx`**
   - Settings panel (~150 lines)
   - Enable/disable toggle
   - Template editor
   - Preview section

#### Modified Files
1. **`frontend/src/App.jsx`**
   - Import QuickInstructionBar
   - Add state: `quickInstructionEnabled`, `quickInstructionText`
   - Load/save config from `/api/settings`
   - Pass `sendToTerminal` function to QuickInstructionBar
   - Add Ctrl+I keyboard listener

2. **`frontend/src/components/SettingsModal.jsx`**
   - Add new "Quick Instructions" tab
   - Import QuickInstructionsPanel

3. **`cmd/forge/handlers.go`** (or new file)
   - Add `handleGetQuickInstruction()` GET endpoint
   - Add `handleSaveQuickInstruction()` POST endpoint
   - Store in `~/.forge/quick-instruction.json`

### Data Flow: Send Button Click

```javascript
// User clicks [Send] in QuickInstructionBar
QuickInstructionBar.handleSend() {
  const fullPrompt = `${userPrompt}\n\n${quickInstruction}\n`;
  
  // Same mechanism as Command Cards
  props.sendToTerminal(fullPrompt, props.activeTab.id);
  
  // Clear input, collapse bar
  setUserPrompt('');
  setIsExpanded(false);
}

// In App.jsx (same as existing Command Card logic)
sendToTerminal(text, tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.socket && tab.socket.readyState === WebSocket.OPEN) {
    tab.socket.send(text);
  }
}
```

### Backend API

#### GET /api/quick-instruction
```json
{
  "enabled": true,
  "template": "This is a test prompt to verify the quick instruction system is working correctly."
}
```

#### POST /api/quick-instruction
```json
{
  "enabled": true,
  "template": "New instruction text..."
}
```

Stored in: `~/.forge/quick-instruction.json`

### Advantages Over PTY Interception

✅ **Reliable** - No fragile terminal I/O manipulation
✅ **Explicit** - User sees exactly what will be sent
✅ **Editable** - Can modify quick instruction per-send
✅ **Predictable** - Works exactly like Command Cards
✅ **Maintainable** - Standard React form handling
✅ **Universal** - Works with ANY TUI app (gh, claude, aider, etc.)

### User Experience Improvements

1. **Transparency:** User sees the full prompt before sending
2. **Flexibility:** Can edit instruction on-the-fly per prompt
3. **Discoverability:** Visual floating bar makes feature obvious
4. **Consistency:** Uses same "send to terminal" mechanism as Command Cards
5. **Control:** User decides exactly when to use it (not automatic/hidden)

### Keyboard Shortcuts

- **Ctrl+I** - Toggle Quick Instruction Bar visibility
- **Ctrl+Enter** - Send prompt (when bar is focused)
- **Escape** - Collapse bar (keep enabled)
- **Tab** - Navigate between prompt and instruction textareas

### Future Enhancements (Post-MVP)

1. **Multiple Templates:** Dropdown to select from saved instructions
2. **Tab-Specific Instructions:** Different instructions per project/tab
3. **Command History:** Arrow keys to recall previous prompts
4. **AI Suggestions:** ForgeAssist analyzes prompt and suggests relevant context
5. **Paste Detection:** Offer to enhance pasted prompts with quick instruction

---

## Implementation Plan

### Phase 1: Backend API (30 min)
- [ ] Create `cmd/forge/handlers_quick_instruction.go`
- [ ] Add GET/POST endpoints
- [ ] Register routes in `main.go`
- [ ] Test with curl

### Phase 2: Settings Panel (45 min)
- [ ] Create `QuickInstructionsPanel.jsx`
- [ ] Add to SettingsModal as new tab
- [ ] Load/save from API
- [ ] Add enable toggle + template editor

### Phase 3: Floating Bar Component (90 min)
- [ ] Create `QuickInstructionBar.jsx` + CSS
- [ ] Position relative to Forge Assist button
- [ ] Implement expand/collapse animation
- [ ] Add prompt + instruction textareas
- [ ] Wire up Send button to `sendToTerminal()`

### Phase 4: App Integration (30 min)
- [ ] Import QuickInstructionBar in App.jsx
- [ ] Load config on mount
- [ ] Add Ctrl+I keyboard listener
- [ ] Pass sendToTerminal function
- [ ] Test with active terminal tab

### Phase 5: Testing (45 min)
- [ ] Test with `gh copilot suggest`
- [ ] Test with `claude` CLI
- [ ] Test enable/disable toggle
- [ ] Test edit template in Settings
- [ ] Test keyboard shortcuts
- [ ] Test across tab switches

**Total Estimated Time:** ~4 hours for complete implementation

---

## Success Criteria

✅ User can enable/disable Quick Instruction in Settings
✅ Floating bar appears when enabled
✅ User can type prompt and see instruction appended
✅ Send button delivers complete text to terminal
✅ Works with gh copilot, claude, and other TUI tools
✅ Ctrl+I toggles bar visibility
✅ No PTY interception complexity
✅ Reliable 100% of the time

---

## Migration from Old Approach

**Old:** Try to intercept Enter key in xterm.js (impossible)
**New:** Dedicated input bar that sends complete prompts (reliable)

**Breaking Change:** None - old approach never worked, this is the first working version

**User Communication:** 
> "Quick Instructions now uses a dedicated input bar instead of automatic appending. This ensures 100% reliability and gives you full control over when instructions are included."
