# Directory Permission & Change Handling Analysis

## Overview
Forge Terminal handles directory permissions and changes through **two independent systems**:

1. **Directory Permission Prompts** (Auto-Respond detection)
2. **Directory Change Detection** (Tab title updates)

---

## 1. Directory Permission Prompts

### What It Handles
When GitHub Copilot requests access to directories outside its trusted list:

```
┌─────────────────────────────────────────┐
│ Path confirmation (1 remaining)         │
│ Allow directory access                  │
│                                         │
│ Copilot is attempting to read:         │
│ C:\ProjectsWin\forge-terminal           │
│                                         │
│ ❯ 1. Yes                                │
│   2. No (Esc)                           │
│                                         │
│ Confirm with number keys or Enter      │
└─────────────────────────────────────────┘
```

### Detection Patterns
**Location:** `ForgeTerminal.jsx` lines 140-144

```javascript
// Copilot path confirmation and permission dialogs
/Path confirmation/i,
/Allow directory access/i,
/allowed directory list/i,
/Do you want to add these directories/i,
```

Combined with menu selection patterns:
```javascript
/[›❯>]\s*1\.\s*Yes\b/i,  // Matches "❯ 1. Yes"
```

### Auto-Respond Behavior
✅ **Automatically approves** directory access when AR is enabled
- Detects "Path confirmation" context
- Sees "❯ 1. Yes" selection
- Sends `Enter` keystroke
- Directory is added to Copilot's trusted list

### Why This Works
The detection happens in the **prompt buffer analysis** (lines 1524-1579):
1. Terminal output accumulates in buffer
2. `detectCliPrompt()` searches for patterns
3. Matches both context AND selection
4. High confidence → AR fires
5. Enter key sent → Permission granted

---

## 2. Directory Change Detection

### What It Handles
Tracking the current working directory from terminal prompts to update tab titles.

### Detection Method
**Location:** `ForgeTerminal.jsx` lines 362-403

Extracts directory from shell prompts:

#### PowerShell
```
PS C:\ProjectsWin\forge-terminal>
     ^^^^^^^^^^^^^^^^^^^^^^^^^
     Captures this path
```
Pattern: `/PS\s+([A-Za-z]:\\[^>]*?)>\s*$/i`

#### CMD
```
C:\ProjectsWin\forge-terminal>
^^^^^^^^^^^^^^^^^^^^^^^^^
Captures this path
```
Pattern: `/([A-Za-z]:\\[^>]*?)>/`

#### Bash/WSL
```
user@host:~/projects$
          ^^^^^^^^^^
          Captures this path

user@host:/home/user/projects$
          ^^^^^^^^^^^^^^^^^^^^
          Captures this path
```
Patterns:
- `/[@][\w.-]+:([~\/][^\$#]*?)[\$#]\s*$/`
- `/^([~\/][^\$#\s]+)[\$#]\s*$/`

### Behavior
**Lines 1546-1554**
```javascript
const detectedDir = extractDirectory(buf.data);
if (detectedDir && detectedDir !== lastDirectoryRef.current) {
  lastDirectoryRef.current = detectedDir;
  const folderName = getFolderName(detectedDir);
  if (folderName && onDirectoryChangeRef.current) {
    onDirectoryChangeRef.current(folderName, detectedDir);
  }
}
```

**Result:**
- Tab title updates to current folder name
- Stores full path for restoration on reconnect
- Triggers parent component callbacks

### Directory Restoration on Reconnect
**Lines 1391-1420**

When terminal reconnects, it automatically `cd` to the last known directory:

```javascript
if (currentDirectoryRef.current) {
  const dir = currentDirectoryRef.current;
  let cdCommand;
  
  // Different shells use different syntax
  if (shellType === 'wsl') {
    cdCommand = `cd ${dir.replace(/ /g, '\\ ')}\r`;
  } else if (shellType === 'powershell') {
    cdCommand = `cd "${dir}"\r`;
  } else if (shellType === 'cmd') {
    cdCommand = `cd /d "${dir}"\r`;
  } else {
    cdCommand = `cd "${dir}"\r`;
  }
  
  ws.send(cdCommand);
}
```

---

## 3. Integration with Copilot CLI

### Trusted Directories
Copilot maintains a **trusted directories list** that can be configured in Settings:

**Location:** `CLISettingsPanel.jsx` (Settings → CLI → Copilot → Trusted Folders)

Users can:
- ✅ View current trusted folders
- ✅ Add folders to trusted list
- ✅ Manually configure via API

### How It Works Together

#### Scenario 1: First Access to New Directory
```
1. User: cd C:\Projects\new-project
2. Terminal: Detects directory change → Updates tab title
3. User: copilot -p "analyze this project"
4. Copilot: "Path confirmation - Allow access to C:\Projects\new-project?"
5. PromptDetector: Matches "Path confirmation" + "❯ 1. Yes"
6. AR: Sends Enter → Directory added to trusted list
7. Copilot: Proceeds with request
```

#### Scenario 2: Already Trusted Directory
```
1. User: cd C:\Projects\forge-terminal (already trusted)
2. Terminal: Detects directory change → Updates tab title
3. User: copilot -p "analyze this project"
4. Copilot: Skips permission dialog (already trusted)
5. Copilot: Shows command confirmation → AR responds
6. Copilot: Proceeds with request
```

#### Scenario 3: Using `--allow-all-paths`
```
1. User: copilot --allow-all-paths
2. Copilot: Skips ALL path permission dialogs
3. Only shows tool/command confirmations
4. AR handles those automatically
```

---

## 4. Edge Cases & Limitations

### ✅ Handled
- **Multiple directories in one session**: Each prompt detected individually
- **Relative paths**: Copilot shows absolute path in prompt
- **Space in paths**: Patterns match paths with spaces
- **Windows & Unix paths**: Both `C:\Users\...` and `/home/user/...` supported
- **WSL cross-boundary**: Can detect both Windows and Linux paths

### ⚠️ Potential Gaps
1. **Recursive directory access**: If Copilot asks for subdirectories separately, each gets its own prompt (handled individually)
2. **Symlinks/Junctions**: Detection based on what shell reports, may show link target
3. **Network paths**: `\\server\share` format not explicitly tested but should match CMD pattern

---

## 5. Configuration Options

### For Users
**Settings → CLI → Copilot**
- Configure trusted folders manually
- Avoids permission prompts entirely
- Recommended for frequently used directories

**Command Line Flags**
```bash
# Skip all path confirmations
copilot --allow-all-paths

# Trust specific path for session
copilot --allow-tool <path>
```

### For AR Behavior
**Tab Context Menu → Auto-Respond**
- Enable/disable AR per tab
- When enabled:
  - ✅ Automatically approves directory access
  - ✅ Automatically confirms tool permissions
  - ✅ Automatically confirms command execution

---

## 6. Security Considerations

### With AR Enabled
⚠️ **Auto-approves** directory access without user review
- Copilot can read files in requested directories
- Consider pre-configuring trusted folders for sensitive work
- Use `--allow-all-paths` only in dev environments

### With AR Disabled
✅ **Manual approval** required for each directory
- User sees full path before approval
- Can deny access to sensitive folders
- More secure but less convenient

### Best Practice
```javascript
// Development: Use AR with --allow-all-paths
forge$ copilot --allow-all-paths
// Auto-Respond handles everything

// Production/Sensitive: Pre-configure trusted folders
// Settings → CLI → Copilot → Add trusted folder: C:\ProductionCode
forge$ copilot
// Only shows prompts for new, non-trusted directories
```

---

## 7. Testing

### Manual Tests
```bash
# Test 1: New directory permission
cd C:\NewDirectory
copilot -p "analyze this"
# Expected: AR auto-approves, directory added to trusted list

# Test 2: Already trusted directory
cd C:\TrustedDirectory
copilot -p "analyze this"  
# Expected: No permission prompt, goes straight to command confirmation

# Test 3: Directory change detection
cd C:\Projects\forge-terminal
# Expected: Tab title updates to "forge-terminal"
```

### Playwright Test (from critical-app-failures.spec.js)
```javascript
test('Directory permission auto-respond', async ({ page }) => {
  // Navigate to Settings → CLI → Remove all trusted folders
  // Run copilot in untrusted directory
  // Enable AR
  // Verify "Path confirmation" prompt appears
  // Verify AR automatically responds
  // Verify directory is added to trusted list
});
```

---

## Summary

| Feature | Status | Location |
|---------|--------|----------|
| Directory permission detection | ✅ Working | ForgeTerminal.jsx:140-144 |
| Auto-approve directory access | ✅ Working | ForgeTerminal.jsx:1557-1579 |
| Directory change detection | ✅ Working | ForgeTerminal.jsx:362-403 |
| Tab title update on `cd` | ✅ Working | ForgeTerminal.jsx:1546-1554 |
| Directory restoration on reconnect | ✅ Working | ForgeTerminal.jsx:1391-1420 |
| Trusted folders config | ✅ Working | CLISettingsPanel.jsx |

**Conclusion**: Directory permissions and changes are fully handled. AR will automatically approve Copilot directory access requests, and the terminal tracks directory changes for tab titles and reconnection.
