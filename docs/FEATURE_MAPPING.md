# Dynamic Feature Mapping System

## Problem Solved

**Before:** Hardcoded `FEATURES.md` only documented forge-terminal. When browsing other repos, you got 193 useless release note files in the "Documentation" category.

**After:** Dynamic feature analyzer that scans ANY codebase and discovers features automatically.

---

## How It Works

### 1. Code Analysis (`/api/files/analyze?path=<dir>`)

The system scans a directory and extracts:

- **Exported functions/components** - What the code exposes
- **API endpoints** - HTTP routes defined
- **Imports/dependencies** - What it relies on  
- **Comments** - Documentation hints
- **File purpose** - Inferred from naming patterns

### 2. Feature Grouping

Files are automatically grouped into features based on:
- Directory structure (`internal/am/` → "AM" feature)
- Naming patterns (`health_monitor.go` → "Health Monitor")
- Export analysis (`DetectPrompt` → "Prompt Detection")

### 3. Capability Inference

Capabilities are derived from export names:
- `CreateSession` → "Create Session"
- `DeleteFile` → "Delete File"
- `GetStatus` → "Retrieve Status"
- `HandleAnalyze` → "Handle Analyze"

---

## API Response Structure

```json
{
  "rootPath": "/path/to/repo",
  "features": [
    {
      "name": "Health Monitor",
      "description": "Monitors AM system health and provides status indicators",
      "files": ["internal/am/health_monitor.go"],
      "capabilities": [
        "Get Tab Capture Status",
        "Detect Broken Captures"
      ],
      "apiEndpoints": ["/api/am/tab-status/:tabId"],
      "exports": ["GetTabCaptureStatus", "DetectBrokenCapture"],
      "category": "Artificial Memory"
    }
  ],
  "files": {
    "internal/am/health_monitor.go": {
      "path": "internal/am/health_monitor.go",
      "features": ["Health Monitor"],
      "exports": ["GetTabCaptureStatus"],
      "imports": ["internal/am"],
      "apiEndpoints": [],
      "description": "Monitors AM system health"
    }
  }
}
```

---

## Supported Languages

- **Go** - Functions, methods, routes
- **JavaScript/TypeScript** - Exports, React components, routes
- **Python** - Classes, functions (future)
- **Java** - Classes, methods (future)

---

## Frontend Integration (TODO)

### New Lens View: "Features"

Instead of showing files flat, show them grouped by discovered features:

```
📦 Artificial Memory (15 files, 45k tokens)
  ├─ LLM Logger
  │   ├─ llm_logger.go (8k tokens)
  │   └─ Capabilities: Capture conversations, Parse TUI, Save to JSON
  ├─ Health Monitor
  │   ├─ health_monitor.go (4k tokens)
  │   └─ Capabilities: Detect broken captures, Status indicators
  └─ Async Pipeline
      ├─ async_pipeline.go (6k tokens)
      └─ Capabilities: Buffer I/O, Flush to logger

📦 Terminal (8 files, 32k tokens)
  ├─ PTY Management
  │   ├─ pty.go (10k tokens)
  │   └─ Capabilities: Create PTY, Spawn shell, Stream I/O
  └─ WebSocket Handler
      ├─ handler.go (12k tokens)
      └─ Capabilities: Handle WebSocket, Terminal lifecycle
```

**Benefits:**
1. See what a codebase DOES, not just file names
2. Select entire features at once
3. Understand relationships between files
4. Works for ANY repo you open

---

## Example Usage

### Analyze forge-terminal AM system
```bash
curl "http://localhost:3000/api/files/analyze?path=internal/am"
```

### Analyze different repo
```bash
cd /path/to/other/repo
curl "http://localhost:3000/api/files/analyze?path=."
```

### Analyze specific feature area
```bash
curl "http://localhost:3000/api/files/analyze?path=src/components"
```

---

## Implementation Status

- [x] Backend: Feature analyzer engine
- [x] Backend: API endpoint `/api/files/analyze`
- [x] Language support: Go, JavaScript/TypeScript
- [ ] Frontend: Features view in Lens
- [ ] Frontend: Feature-based file selection
- [ ] Caching: Per-repo analysis caching
- [ ] Advanced: Dependency graph visualization

---

## Technical Details

### File: `internal/files/feature_analyzer.go`

**Core Functions:**
- `AnalyzeCodebase(path)` - Main entry point, walks directory
- `analyzeFile(path)` - Extracts exports, routes, comments from single file
- `groupIntoFeatures(files)` - Groups analyzed files into logical features
- `inferFeatureName(path)` - Guesses feature name from directory/exports
- `inferCapability(exportName)` - Derives capability from function name
- `categorizeFeature(path)` - Assigns category (Terminal, AM, etc.)

**Pattern Matching:**
- Go: `^func ([A-Z][a-zA-Z0-9_]*)\(` → Exported functions
- Go: `HandleFunc("([^"]+)"` → API routes
- JS: `export (function|const|class) ([a-zA-Z0-9_]+)` → Exports
- JS: `(app\.|router\.).*\(['"]([^'"]+)['"]` → Express/React routes

---

## Future Enhancements

### Smart Feature Detection
- Detect design patterns (MVC, Observer, Factory)
- Identify interfaces and implementations
- Map data flow between features

### Cross-Reference Analysis
- "This feature depends on: X, Y, Z"
- "This feature is used by: A, B, C"
- Circular dependency detection

### AI-Powered Descriptions
- Use local SLM to generate feature descriptions
- Summarize what a group of files does
- Extract intent from code, not just names

---

## Why This Matters

When working with unfamiliar codebases, you need to answer:
1. **"What does this repo do?"** → List of features
2. **"Where is X implemented?"** → Feature → Files
3. **"What can I use from this?"** → Capabilities/API endpoints

Lens File Picker with dynamic feature mapping answers all three questions **for any repo**, not just forge-terminal.
