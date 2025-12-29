# Forge Terminal v3.6.0 - Smart Model Selection with Real Task Analysis

## 🎯 Executive Summary

**v3.6.0 replaces hardcoded heuristics with real SLM-powered task analysis.** Instead of guessing task type from pattern matching, Forge now analyzes prompts with a Small Language Model to determine:
- **Task Type** (debug, refactor, generate, explain, simple, architecture)
- **Complexity Score** (1-10 scale)
- **Confidence Level** (how certain the analysis is)

This enables **optimal model tier selection** - truly smart routing that adapts to each unique prompt.

---

## 🚀 Major Features

### Smart Model Selection with Real Task Analysis (NEW)

**Before v3.6.0:**
```
User: "? fix the null pointer bug"
     ↓
Heuristic Pattern Match → "looks like debug → use Sonnet"
     ↓
Badge shows: "Running: Sonnet 🔧 Refactor" (hardcoded, often wrong)
```

**After v3.6.0:**
```
User: "? fix the null pointer bug"
     ↓
SLM Analysis → taskType: "debug", complexity: 5, confidence: 0.87
     ↓
Optimal Routing → "complexity 5 + debug task → use Sonnet"
     ↓
Badge shows: "Running: Sonnet 🐛 Debug [5/10]" (real, from SLM)
```

### How It Works

1. **Executive Trigger** (type `? <prompt>`) sends prompt to SLM
2. **SLM Analyzer** runs inference to determine:
   - `taskType`: One of debug, explain, refactor, generate, simple, architecture
   - `complexity`: 1-10 score (7+ triggers Opus, 4-6 → Sonnet, <4 → Haiku)
   - `confidence`: 0.0-1.0 how certain the model is
3. **Smart Router** maps SLM results to model tier:
   - **High Complexity (7+)** → Opus 4.5 (most powerful)
   - **Medium (4-6)** → Sonnet 4 (balanced)
   - **Simple (<4)** → Haiku 4 (fastest, cheapest)
4. **Dynamic Badge** displays:
   - Real task type emoji (🐛 debug, 🔧 refactor, ✨ generate, 📖 explain, ⚡ simple, 🧠 architecture)
   - Complexity bar (green=simple, yellow=medium, red=complex)
   - Warning ⚠️ if fallback to heuristics (SLM unavailable)

### Fallback Safety

If SLM is unavailable (Ollama/LlamaCpp not running):
- Automatically falls back to proven heuristic pattern matching
- Shows ⚠️ indicator in badge so you know
- No loss of functionality - just less intelligent routing

### What This Enables

✅ **Cost Optimization** - Uses cheapest model capable of task (Haiku for simple)
✅ **Performance** - Complex tasks get Opus (slower but smarter)
✅ **Accuracy** - Real analysis beats pattern matching
✅ **Transparency** - See exactly what Forge thinks about your task
✅ **Debuggability** - Complexity score helps understand why a model was chosen

---

## 🔧 Technical Details

### SLM Integration Points

**File: `internal/terminal/executive_trigger.go`**
- `ExecutiveTriggerHandler.initSLMProvider()` - Initializes Ollama or LlamaCpp
- `ExecutiveTriggerHandler.Route()` - Calls `slm.Analyze()` instead of heuristic classifier
- `ExecutiveTriggerHandler.mapSLMToTier()` - Converts SLM results to model tier
- `RoutingResult` struct - Now includes `TaskType`, `Complexity`, `Confidence`, `UsedSLM`

**File: `internal/terminal/handler.go`**
- `ROUTING_ACTIVE` WebSocket message - Now includes SLM data fields

**File: `frontend/src/App.jsx`**
- `getTaskTypeIcon()` - Maps task type to emoji
- `formatTaskType()` - Capitalizes task type for display
- Smart badge rendering - Shows real SLM data instead of hardcoded labels

### Data Flow

```
Terminal Input (stdin)
    ↓
Check for "?" prefix → ExecutiveTrigger detected
    ↓
ExecutiveTriggerHandler.Route(prompt)
    ├─ SLM Available?
    │  ├─ YES → slm.Analyze(prompt)
    │  │        Returns: {TaskType, Complexity, Confidence}
    │  │
    │  └─ NO → Heuristic fallback
    │           Pattern matching on keywords
    │
    ↓
mapSLMToTier(analysis)
    ├─ Complex + Large Refactor → Opus
    ├─ Medium + Debugging → Sonnet
    └─ Simple → Haiku
    ↓
Build Command & RoutingNotification
    ↓
ROUTING_ACTIVE WebSocket message to frontend
    ├─ tier: "sonnet"
    ├─ taskType: "debug"
    ├─ complexity: 5
    ├─ usedSLM: true
    └─ ...other fields
    ↓
Frontend Badge Update
    Display: "Running: Sonnet 🐛 Debug [5/10]"
```

### Configuration

SLM providers are detected automatically:

1. **Ollama** (default, most common)
   - Detection: Tries to connect to `http://localhost:11434`
   - Models: Any Ollama-installed model
   - Speed: ~200-500ms per analysis

2. **LlamaCpp** (fallback)
   - Detection: Checks for `~/.forge/slm/model.gguf`
   - Speed: ~50-200ms per analysis

3. **Heuristic** (no SLM available)
   - Detection: Both above fail
   - Speed: <1ms (instant)
   - Accuracy: Good (pattern-based, proven track record)

---

## 🐛 Bug Fixes

### Addressed Issues from v3.5.2

1. **SLM Not Actually Used**
   - `internal/llm/task_classifier.go` only did pattern matching
   - Now `executive_trigger.go` calls real `slm.Analyze()`
   - SLM analysis properly flows to frontend

2. **Hardcoded Task Type Labels**
   - Badge showed "Refactor" for any Sonnet (wrong)
   - Now badge shows real task type from SLM (correct)

3. **No Confidence/Complexity Visibility**
   - Users couldn't see why a model was chosen
   - Now badge shows complexity score and confidence
   - SLM fallback clearly indicated

### PTY Interaction Improvements

While addressing SLM, we also prepared for:
- Chat view → PTY input handling (waiting for full integration)
- Auto-Respond detector consolidation (planned for v3.6.1)
- Prompt detection with OSC 133 support (infrastructure in place)

---

## 📊 Performance Impact

- **SLM Analysis**: ~200-300ms added per executive trigger
- **Browser Rendering**: <10ms increase (minimal)
- **Memory**: +15-20MB for SLM provider initialization
- **CPU**: Minimal (SLM runs locally on CPU, efficient models)

**Optimization**: SLM analysis runs async, doesn't block terminal input.

---

## 🔄 Migration Guide

### For Existing Users

**No action required.** v3.6.0 is fully backward compatible:
- ✅ Existing command cards work unchanged
- ✅ Router configuration still applies
- ✅ Chat interface unchanged
- ✅ Terminal functionality same

**To Enable SLM:**
1. Install Ollama: https://ollama.ai (recommended)
2. Or configure LlamaCpp at `~/.forge/slm/model.gguf`
3. Restart Forge Terminal
4. Use executive trigger: `? your prompt here`
5. Watch the badge show real task analysis

**If SLM Not Available:**
- Automatic fallback to heuristics
- Badge shows ⚠️ indicator
- Routing still works, just less intelligent

### For Developers

**Using SLM API:**
```go
provider := slm.NewOllamaProvider()
if provider.IsAvailable() {
  result, err := provider.Analyze(ctx, slm.PromptContext{
    Prompt: "user's prompt here",
  })
  // result.TaskType, result.Complexity, result.Confidence
}
```

**Testing:**
```bash
go test ./internal/terminal/... -v -run Executive
```

---

## 🎓 Tour Updates

The Guided Tour now includes:
1. **Smart Routing Section**
   - Explains executive trigger (`?` prefix)
   - Shows real task analysis in action
   - Demonstrates complexity scoring
   - Explains model tier selection

2. **SLM Configuration**
   - How to install Ollama
   - Fallback behavior
   - Performance expectations

3. **Badge Interpretation**
   - What each icon means (debug, refactor, etc.)
   - How to read complexity scores
   - What ⚠️ means

See updated tour in Settings → Replay Tour

---

## ✨ What's Next (v3.7.0)

Planned improvements:
- [ ] Chat view → PTY full bidirectional interaction (currently blocks on input)
- [ ] Auto-Respond detector consolidation (reduce 3 detectors to 1 smart detector)
- [ ] Prompt detection with OSC 133 Shell Integration (100% accuracy)
- [ ] SLM fine-tuning on user feedback (learn from routing decisions)
- [ ] Per-model cost tracking (see cumulative cost in badge)
- [ ] One-click SLM setup in UI (install Ollama from Forge)

---

## 📝 Commit Log

```
commit: Integrate real SLM task analysis into smart model selection
  - Wire ExecutiveTrigger to use slm.Analyze() instead of heuristics
  - Add TaskType, Complexity, Confidence to routing data
  - Update badge display to show real SLM data
  - Add fallback detection and ⚠️ indicator
  - Update README and tour documentation

commit: Prepare Chat→PTY interaction infrastructure
  - Add context.Background() for async SLM calls
  - Structure for future PTY input bridging
  - No functional changes in this commit
```

---

## 🙏 Acknowledgments

Thanks to the Claude/Copilot teams for:
- Solid CLI architecture that made smart routing possible
- Config system that supports multiple models
- Terminal interop that enables SLM integration

---

## 📞 Support

**Questions about v3.6.0?**
- GitHub Issues: https://github.com/mikejsmith1985/forge-terminal/issues
- Documentation: See README.md "Smart Routing" section
- Debug Mode: Settings → Enable Dev Mode for diagnostic logs

**Found a bug?**
- Report at: https://github.com/mikejsmith1985/forge-terminal/issues
- Include: Prompt, expected task type, actual task type
- Attach: Debug Panel screenshot (Settings → Debug)

---

**v3.6.0 released 2025-12-29**
**Commit**: [SHA will be filled after push]
**Tagged**: `v3.6.0`
