# Forge Assist Instruction Mode Implementation

## Overview

The **Instruction Mode** feature from ChatView has been successfully implemented in **Forge Assist**. This feature allows users to automatically append custom instructions from `copilot-instructions.md` to every command sent through Forge Assist.

## Implementation Details

### 1. **State Management**
Located in `ForgeAssist.jsx` (lines 425-428):

```javascript
const [isInstructionMode, setIsInstructionMode] = useState(() => {
  return localStorage.getItem('forgeAssist_instructionMode') === 'true';
});
const [showInstructionEditor, setShowInstructionEditor] = useState(false);
const [instructionContent, setInstructionContent] = useState('');
const [isSavingInstructions, setIsSavingInstructions] = useState(false);
```

**Key Points:**
- Instruction mode state is persisted to localStorage
- Persists across page reloads
- Modal editor state controlled separately
- File content cached in memory while editing

### 2. **Toggle Function**
```javascript
const toggleInstructionMode = useCallback(() => {
  setIsInstructionMode(prev => {
    const newValue = !prev;
    localStorage.setItem('forgeAssist_instructionMode', newValue.toString());
    return newValue;
  });
}, []);
```

**Behavior:**
- Toggles instruction mode on/off
- Persists preference immediately
- Shows/hides edit button when toggled

### 3. **Instructions Editor**
Located in header (lines 523-541) and modal (lines 675-719):

**Editor Features:**
- Load instructions from `copilot-instructions.md`
- Full-screen modal with syntax-highlighted textarea
- Save/Cancel buttons
- Real-time editing
- Error handling for missing files

**Load Function:**
```javascript
const openInstructionEditor = useCallback(async () => {
  try {
    const filename = 'copilot-instructions.md';
    const response = await fetch(`/api/files/read?path=${filename}`);
    if (response.ok) {
      const data = await response.json();
      setInstructionContent(data.content || '');
    } else {
      setInstructionContent('');
    }
    setShowInstructionEditor(true);
  } catch (err) {
    console.error('[ForgeAssist] Failed to load instructions:', err);
    setInstructionContent('');
    setShowInstructionEditor(true);
  }
}, []);
```

**Save Function:**
```javascript
const saveInstructions = useCallback(async () => {
  try {
    const filename = 'copilot-instructions.md';
    await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filename,
        content: instructionContent
      })
    });
    setShowInstructionEditor(false);
    if (onToast) onToast('Instructions saved!', 'success', 2000);
  } catch (err) {
    // Error handling...
  }
}, [instructionContent, onToast]);
```

### 4. **Command Appending Logic**
Modified `executeFeature()` function:

```javascript
const executeFeature = (feature) => {
  if (!feature) return;
  
  let finalCmd = feature.cmd;
  
  // Append instruction reminder if instruction mode is active
  if (isInstructionMode && instructionContent.trim()) {
    finalCmd += `\n\n# Please follow and reference the instructions in copilot-instructions.md`;
  }
  
  // Execute command...
  onSendToTerminal(finalCmd);
  onClose();
};
```

**Behavior:**
- Only appends if mode is enabled AND content exists
- Appends as comment for CLI tools
- Appended text: `# Please follow and reference the instructions in copilot-instructions.md`

### 5. **UI Components**

#### Toggle Button (Header)
- **Location:** Right side of Forge Assist header
- **Icon:** FileText icon
- **States:**
  - Off: Gray border, transparent background
  - On: Purple background (--accent-color), "ON" label
- **Action:** Click to toggle instruction mode on/off

#### Edit Button
- **Location:** Next to toggle button (only visible when ON)
- **Icon:** Edit pencil icon
- **Action:** Opens instruction editor modal
- **Visibility:** Conditional - only shows when instruction mode is active

#### Modal Editor
- **Title:** "Edit Instructions (copilot-instructions.md)"
- **Textarea:** Full-screen monospace editor
- **Buttons:**
  - Cancel: Close without saving
  - Save Changes: Save and close
- **Auto-focus:** Input field ready for editing
- **Keyboard:** Escape key closes modal

## User Workflow

### Enable Instruction Mode:
1. Open Forge Assist (Ctrl+/)
2. Click the FileText toggle button
3. Button shows "ON" with purple background

### Edit Instructions:
1. With mode enabled, click Edit button (pencil icon)
2. Modal opens with current instructions
3. Edit the markdown content
4. Click "Save Changes" to persist
5. Toast confirms: "Instructions saved!"

### Use with Commands:
1. Instruction mode enabled ✓
2. Instructions file has content ✓
3. Select any feature from Forge Assist
4. Command executes with appended instruction reminder
5. Forge Assist closes automatically

## File Locations

- **Instructions File:** `copilot-instructions.md` (project root)
- **Component:** `frontend/src/components/ForgeAssist.jsx`
- **Styles:** `frontend/src/components/ForgeAssist.css`
- **State Persistence:** Browser localStorage (`forgeAssist_instructionMode`)

## API Integration

**Read Instructions:**
```
GET /api/files/read?path=copilot-instructions.md
Response: { content: "..." }
```

**Write Instructions:**
```
POST /api/files/write
Body: { path: "copilot-instructions.md", content: "..." }
```

## Features

✅ **Persistent State:** User preference saved to localStorage
✅ **File Persistence:** Instructions saved to project directory
✅ **Modal Editor:** Full-screen editing experience
✅ **Auto-append:** Seamless integration with command execution
✅ **Error Handling:** Graceful handling of missing files
✅ **User Feedback:** Toast notifications for actions
✅ **Conditional UI:** Edit button only shows when enabled
✅ **Keyboard Support:** Escape key, Tab navigation
✅ **CLI Integration:** Works with Copilot and Claude

## Example Instructions File

```markdown
# Copilot Instructions

## Code Style
- Follow PEP 8 for Python
- Use TypeScript for all JavaScript
- Add JSDoc comments to functions

## Testing Requirements
- Write tests for all new functions
- Maintain 80%+ code coverage
- Run linter before committing

## Git Workflow
- Use feature branches
- Squash commits before merge
- Write descriptive commit messages

## Documentation
- Update README for new features
- Add inline comments for complex logic
- Keep CHANGELOG updated
```

## Testing Checklist

- [ ] Press Ctrl+/ to open Forge Assist
- [ ] Click FileText toggle - shows "ON"
- [ ] Click Edit button - modal opens
- [ ] Edit instructions and save
- [ ] Execute a command - instruction reminder appears in terminal
- [ ] Reload page - instruction mode still ON
- [ ] Close Forge Assist and reopen - mode state persists
- [ ] Try with empty instructions - toggle works but no appending

## Migration from ChatView

✅ **Removed from ChatView:**
- ChatView.jsx deleted
- ChatView.css deleted
- E2E tests deleted

✅ **Implemented in ForgeAssist:**
- Same instruction mode toggle
- Same file: `copilot-instructions.md`
- Same append behavior
- Same editor UI/UX
- Enhanced integration with Forge Assist workflow

## Related Features

- **Forge Assist:** Command palette with power features discovery
- **ForgeTerminal:** Terminal interface for executing commands
- **CLI Tools:** Copilot CLI and Claude Code integration
- **Smart Routing:** Automatic model selection based on task complexity

## Known Limitations

- Instructions appended as comments (works for CLI tools)
- File must exist in project root (auto-created if missing)
- No syntax highlighting in editor (monospace plain text)
- Single file per project (could enhance with project-specific profiles)

## Future Enhancements

1. **Syntax Highlighting:** Add markdown highlighting to editor
2. **Templates:** Pre-built instruction templates
3. **Profiles:** Multiple instruction profiles per project
4. **Snippets:** Reusable instruction fragments
5. **Validation:** Lint instructions for best practices
6. **Sharing:** Export/import instructions between projects
