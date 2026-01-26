# File Link Feature Demo

This file is used to test the double-click file link feature.

## Testing Instructions:
1. Open Forge Terminal in browser at http://localhost:9999
2. In terminal, run: `echo "Check this file: C:\ProjectsWin\forge-terminal\test-file-link-demo.md"`
3. Look for the file path to be underlined/styled as a link
4. Double-click on the file path
5. The Monaco editor should open with this file loaded

## Expected Behavior:
- File paths should be automatically detected and made clickable
- Supported formats:
  - Absolute Unix: `/home/user/file.js`
  - Absolute Windows: `C:\Users\file.py`
  - Relative: `./src/app.js`, `src/index.ts`

## Implementation:
- Uses xterm.js `registerLinkProvider()` API
- Custom regex patterns detect various path formats
- On activation (double-click), calls `onFileOpen` callback
- Wired to same `handleFileOpen` used by LensViewer

## Test Cases:
Try echoing these paths in terminal:
```
echo "Unix path: /usr/local/bin/test.js"
echo "Windows path: C:\ProjectsWin\forge-terminal\frontend\src\App.jsx"  
echo "Relative path: ./package.json"
echo "With line number: src/components/ForgeTerminal.jsx:531"
```

All should become clickable links that open in Monaco editor.
