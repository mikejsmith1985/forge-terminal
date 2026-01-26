# File Path Link Feature

**Status:** ✅ Implemented (v3.14.11)

## Overview
File paths in terminal output are now automatically detected and made clickable. Double-clicking a file path opens it in the Monaco editor, just like double-clicking files in the LensViewer.

## User Experience
When AI agents (Copilot, Claude) share file paths in their responses, those paths become clickable links. This provides a seamless way to view/edit referenced files without manually navigating the file tree.

## Technical Implementation

### Architecture
```
Terminal Output → Link Provider → Pattern Detection → Link Registration → User Double-Click → handleFileOpen → Monaco Editor
```

### Key Components

**1. Link Provider** (`ForgeTerminal.jsx` lines ~956-1050)
- Registers with xterm.js via `term.registerLinkProvider()`
- Scans each terminal line for file path patterns
- Returns array of link objects with range and activate callback

**2. Pattern Detection**
Three regex patterns cover common file path formats:

```javascript
// Unix absolute paths: /home/user/file.js
const unixPattern = /(?:^|\s)([\/][^\s:]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;

// Windows absolute paths: C:\Users\file.py
const windowsPattern = /(?:^|\s)([A-Z]:\\[^\s:]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/gi;

// Relative paths: ./src/app.js, src/index.ts
const relativePattern = /(?:^|\s)((?:\.\.?\/)?[^\s:\/]+(?:\/[^\s:]+)*\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;
```

**3. Link Activation**
On double-click, the activate callback:
1. Extracts file path from the match
2. Creates file object: `{ path, name }`
3. Calls `onFileOpenRef.current(file)`

**4. Integration with App.jsx**
- `handleFileOpen` callback passed as prop
- Same function used by LensViewer
- Opens Monaco editor overlay with file content

### Files Modified
- `frontend/src/components/ForgeTerminal.jsx`
  - Added `onFileOpen` prop
  - Added `onFileOpenRef` for callback storage
  - Registered custom link provider after search addon
- `frontend/src/App.jsx`
  - Added `onFileOpen={handleFileOpen}` to ForgeTerminal component

## Supported Path Formats

| Format | Example | Supported |
|--------|---------|-----------|
| Unix Absolute | `/usr/local/bin/test.js` | ✅ |
| Windows Absolute | `C:\Users\file.py` | ✅ |
| Windows UNC | `\\server\share\file.js` | ❌ Not yet |
| Relative with ./ | `./src/app.js` | ✅ |
| Relative without ./ | `src/components/File.jsx` | ✅ |
| Parent directory | `../config/settings.json` | ✅ |
| With line numbers | `file.js:42` or `file.js:10:5` | ✅ (parsed but not used yet) |

## Edge Cases Handled
- **URLs filtered out**: Patterns skip `http://`, `https://`, etc.
- **NPM packages ignored**: Paths starting with `@` are skipped
- **Whitespace handling**: Links detected at line start or after space
- **False positive prevention**: Common non-file patterns filtered

## Testing

### Manual Test
1. Start dev server: `.\run-dev-clean.ps1 -Port 9999`
2. Open http://localhost:9999
3. In terminal, run:
   ```powershell
   echo "Windows: C:\ProjectsWin\forge-terminal\package.json"
   echo "Relative: ./src/App.jsx"
   echo "Unix: /usr/local/bin/example.js"
   ```
4. Verify paths are underlined/styled
5. Double-click a path
6. Verify Monaco editor opens with the file

### Test File
`test-file-link-demo.md` includes comprehensive testing instructions and multiple path format examples.

## Known Limitations
1. **Line numbers ignored**: Pattern captures `:10` syntax but doesn't scroll to line (future enhancement)
2. **Relative path resolution**: Uses path as-is; may fail if CWD not properly tracked
3. **No hover preview**: Unlike LensViewer, no file preview on hover (could add tooltip)
4. **No Ctrl+Click**: Only double-click activates; could add modifier key support

## Future Enhancements
- [ ] Scroll to line number when `:N` syntax detected
- [ ] Add hover tooltip showing file metadata
- [ ] Support Ctrl+Click as alternative to double-click
- [ ] Add right-click context menu (Open, Copy Path, Open in External)
- [ ] Better visual indication (underline color, icon, etc.)
- [ ] Support UNC paths (`\\server\share\file`)

## Dependencies
- `@xterm/xterm` - Terminal emulator with link provider API
- No additional packages required

## Performance Impact
**Minimal** - Link detection runs per-line as terminal updates. Regex patterns are efficient. No noticeable performance impact observed.

## Accessibility
- Links are keyboard-navigable via Tab (xterm.js handles this)
- Screen readers announce links (handled by xterm accessibility layer)
- No additional ARIA markup needed

## Browser Compatibility
Works in all browsers supporting xterm.js:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Electron (for desktop app)

## Related Features
- **LensViewer File Selection**: Uses same `handleFileOpen` callback
- **Monaco Editor**: Target for opened files
- **File Explorer**: Provides context menu "Open in Editor" (different code path)

## User Feedback Collected
*(To be updated after user testing)*
- Initial request: "Allow double-click file paths from AI output to open in editor"
- Inspiration: LensViewer double-click behavior

## Version History
- **v3.14.11**: Initial implementation
  - Basic path detection (Unix, Windows, relative)
  - Double-click to open in Monaco editor
  - Integrated with existing handleFileOpen flow
