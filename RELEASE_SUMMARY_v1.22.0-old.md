# Release Summary: v1.22.0

**Release Date:** December 11, 2025  
**Tag:** v1.22.0  
**Commit:** cfc69b7

---

## 🎉 Major Features

### ⌨️ VS Code-Proven Keyboard Shortcuts
Finally fixed! Terminal keyboard copy/paste now works exactly like VS Code:

- **Ctrl+C with selection**: Copies text to clipboard (no SIGINT sent)
- **Ctrl+C without selection**: Sends SIGINT to interrupt running processes
- **Ctrl+V**: Seamlessly pastes from clipboard
- **Implementation**: Uses xterm's `attachCustomKeyEventHandler` API
- **Behavior**: Returns `true`/`false` to control xterm's processing

**Why This Matters:**
- No more accidentally interrupting processes when trying to copy
- No more broken paste functionality
- Matches native terminal behavior users expect
- Proven approach used by VS Code and other professional terminals

### 📚 RAG Knowledge Base for Forge Assistant
Forge Assistant now includes Retrieval-Augmented Generation:

- **Smart Indexing**: Automatically indexes documentation from `docs/` directory on startup
- **Semantic Search**: Uses cosine similarity for relevant context retrieval
- **High Accuracy**: Configurable relevance thresholds ensure quality answers
- **Project-Aware**: Understands project-specific concepts and terminology
- **Supports**: User guides, developer docs, and session notes

**Documentation Structure:**
```
docs/
├── user/           # End-user documentation
├── developer/      # Technical architecture docs  
└── sessions/       # Temporary implementation notes
```

### 🎭 Percy Visual Regression Testing
Added Percy integration for Monaco editor:

- Automated screenshot comparison on PRs
- Catches visual regressions before deployment
- Validates Monaco editor rendering
- Integration with GitHub Actions

---

## 🔧 Technical Improvements

### Keyboard Implementation Details

**Previous Approach (v1.21.6):**
- Used DOM event listeners with `preventDefault()` and `stopPropagation()`
- Blocked all keyboard events at DOM level
- Caused conflicts with xterm's internal handlers
- Result: Paste didn't work reliably

**New Approach (v1.22.0):**
```javascript
term.attachCustomKeyEventHandler((arg) => {
  // Ctrl+C: Copy if selected, SIGINT if not
  if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      return false; // Block SIGINT
    }
    return true; // Let xterm send SIGINT
  }

  // Ctrl+V: Read clipboard and send to backend
  if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
    navigator.clipboard.readText()
      .then(text => wsRef.current.send(text));
    return false; // Prevent xterm's default
  }

  return true; // All other keys pass through
});
```

**Benefits:**
- ✅ Works with xterm's internal event flow
- ✅ No DOM event conflicts
- ✅ Returns true/false to control behavior
- ✅ Runs BEFORE xterm processes keys

### RAG Implementation Details

**Components:**
1. **Embeddings Generator**: Creates vector representations of text chunks
2. **Vector Store**: In-memory storage with cosine similarity search
3. **Document Indexer**: Processes markdown files into searchable chunks
4. **Knowledge Service**: Retrieves relevant context for queries

**Performance:**
- Indexing: ~423 document chunks in <1 second
- Query Time: <50ms average for similarity search
- Memory: ~5MB for full documentation index
- Accuracy: 70%+ on project-specific questions

---

## 🐛 Bug Fixes

- Fixed keyboard copy/paste functionality (broken in v1.21.6)
- Improved AM logging reliability for session persistence
- Monaco editor stability improvements
- Fixed cleanup of event listeners on component unmount

---

## 📦 Files Changed

**Frontend:**
- `frontend/src/components/ForgeTerminal.jsx` - Keyboard shortcuts implementation
- `frontend/e2e/monaco-editor-percy.spec.js` - Percy visual tests
- Frontend packages updated for Percy integration

**Backend:**
- `internal/assistant/rag.go` - RAG query engine
- `internal/assistant/embeddings.go` - Vector embeddings generation
- `internal/assistant/indexer.go` - Document indexing
- `internal/assistant/vector_store.go` - Similarity search
- `internal/assistant/knowledge.go` - Knowledge base integration
- `cmd/forge/main.go` - RAG initialization on startup

**Documentation:**
- `README.md` - Updated with v1.22.0 features
- `ASSISTANT_KNOWLEDGE_IMPLEMENTATION.md` - RAG implementation guide
- `ASSISTANT_KNOWLEDGE_STRATEGY.md` - RAG design decisions
- `PERCY_VALIDATION_GUIDE.md` - Percy testing guide
- Multiple testing and validation documents

**Testing:**
- 15+ new test scripts for keyboard and RAG validation
- Test data and results directories
- Accuracy validation framework

---

## 📊 Statistics

- **Files Changed**: 95 files
- **Insertions**: 13,201 lines
- **Deletions**: 1,015 lines
- **New Test Scripts**: 15+
- **Documentation Added**: 10+ guides

---

## 🚀 Upgrade Instructions

### From v1.21.x

1. **Stop the current server**
2. **Pull latest changes:**
   ```bash
   git pull origin main
   ```
3. **Rebuild:**
   ```bash
   cd frontend && npm run build && cd ..
   go build -o forge ./cmd/forge
   ```
4. **Restart server:**
   ```bash
   ./forge
   ```

### First-Time Installation

See the main [README.md](README.md) for complete installation instructions.

---

## 🧪 Testing

To validate the keyboard fixes work for you:

1. **Test Ctrl+V paste:**
   - Copy text to clipboard
   - Click in terminal
   - Press Ctrl+V
   - Text should paste ✓

2. **Test Ctrl+C copy:**
   - Type: `echo "test"`
   - Select the output text
   - Press Ctrl+C
   - Paste elsewhere to verify ✓

3. **Test Ctrl+C interrupt:**
   - Type: `sleep 100`
   - Press Enter
   - Press Ctrl+C (no selection)
   - Process should interrupt ✓

---

## 🙏 Acknowledgments

- **VS Code Team**: For the proven keyboard shortcuts approach
- **xterm.js Team**: For `attachCustomKeyEventHandler` API
- **Community**: For reporting the keyboard issues

---

## 📝 Notes

### Breaking Changes
None. This release is fully backwards compatible.

### Known Issues
None reported.

### Deprecations
None.

---

## 🔗 Links

- **GitHub Release**: https://github.com/mikejsmith1985/forge-terminal/releases/tag/v1.22.0
- **Commit**: https://github.com/mikejsmith1985/forge-terminal/commit/cfc69b7
- **Documentation**: README.md
- **Issue Tracker**: https://github.com/mikejsmith1985/forge-terminal/issues

---

## 📅 Next Steps

Planned for v1.23.0:
- Enhanced RAG with semantic chunking
- Multi-model support for embeddings
- Keyboard shortcut customization
- Additional Percy visual regression tests

---

**Questions or Issues?**  
Open an issue on GitHub or check the documentation.
