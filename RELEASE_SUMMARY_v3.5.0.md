# Forge Terminal v3.5.0 - Smart Routing

**Release Date:** December 29, 2025

## 🎯 Overview

v3.5.0 introduces the **Smart Routing Engine** - an intelligent system that analyzes your prompts, predicts model performance, and learns from your usage patterns to optimize model selection over time.

## 🔄 Workflow

**This version uses the TERMINAL interface, not chat.**

1. Open Forge Terminal
2. Run `copilot` or `claude` in a terminal tab
3. Use the AI tool normally - Forge tracks everything automatically
4. Smart Routing analyzes your prompts and predicts complexity
5. Over time, the system learns which models work best for your patterns

## ✨ New Features

### Smart Routing Engine (SLM)
- **Heuristic Analysis**: Analyzes prompts for complexity (1-10 scale)
- **Task Detection**: Identifies task types (debug, refactor, explain, generate)
- **Iteration Prediction**: Predicts how many iterations each model needs
- **Provider Support**: Heuristic (always), Ollama (if installed), Embedded (future)

### Learning System
- **Feedback Collection**: Tracks predictions vs actual outcomes
- **User Patterns**: Learns from your specific usage
- **JSONL Storage**: Persistent learning at `~/.forge/learning/feedback.jsonl`

### Settings UI (Dev Mode)
- **Intelligence Panel**: Shows SLM engine status
- **Learning Progress**: Displays feedback samples and accuracy
- **Ollama Detection**: Shows if local Ollama is available
- **Clear Data**: Option to reset learning data

### Updated Tour
- Reflects terminal-first workflow
- Explains Smart Routing automatic features
- Points to Settings for budget configuration

## 📁 Files Changed

### New Files
- `internal/slm/engine.go` - SLM engine with provider abstraction
- `internal/slm/heuristic.go` - Rule-based prompt analysis
- `internal/slm/ollama.go` - Ollama integration for local AI
- `internal/slm/embedded.go` - Embedded model support (placeholder)
- `internal/slm/feedback.go` - JSONL feedback storage
- `internal/slm/slm_test.go` - Comprehensive tests
- `internal/am/slm_feedback.go` - AM integration for feedback

### Modified Files
- `internal/am/llm_logger.go` - SLM tracking in conversations
- `frontend/src/components/SettingsModal.jsx` - Intelligence panel
- `frontend/src/config/tourSteps.js` - Updated tour
- `cmd/forge/main.go` - SLM initialization

## 🔧 Configuration

### Budget Settings
Open Settings → Intelligence tab to configure:
- Monthly budget (credits or dollars)
- Budget unit selection
- Renewal day

### Developer Mode
Enable Developer Mode in Settings to see:
- Smart Routing Engine status
- Active provider (heuristic/ollama)
- Learning progress stats
- Ollama availability

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/slm/status` | GET | SLM engine status |
| `/api/slm/analyze` | POST | Analyze a prompt |
| `/api/slm/learning` | GET | Learning statistics |
| `/api/slm/learning/clear` | DELETE | Clear learning data |
| `/api/ollama/status` | GET | Ollama availability |

## 🧪 Testing

```powershell
# Check SLM status
Invoke-RestMethod http://localhost:8333/api/slm/status

# Test analysis
$body = @{ prompt = "Debug this race condition" } | ConvertTo-Json
Invoke-RestMethod http://localhost:8333/api/slm/analyze -Method POST -Body $body -ContentType "application/json"

# After using copilot, check feedback
Get-Content $env:USERPROFILE\.forge\learning\feedback.jsonl
```

## 📈 What Gets Tracked

During a conversation:
1. **Initial prompt** → SLM analyzes complexity
2. **Predicted iterations** → Per model (haiku: 3, sonnet: 2, etc.)
3. **Actual model used** → Detected from CLI output
4. **User iterations** → Each turn you take
5. **Outcome** → Success/partial/failed (on conversation end)

## 🔮 Future Enhancements

- **LoRA Fine-tuning**: Train adapter on your feedback
- **Embedded llama.cpp**: Offline SLM without Ollama
- **Active Model Control**: Auto-select model in Copilot menu
- **Chat Interface**: Production-ready chat (currently Dev Mode only)

## 📝 Commits

```
fcded69 feat: Update tour for v3.5.0 terminal-first workflow
a0c0d67 fix: Wire SLM tracking into TUI conversations
2321312 feat: v3.5.0 Phase 4 - Production Integration
21eb892 feat: v3.5.0 Phase 3 - Settings UI for Smart Routing
3216dca feat: v3.5.0 Phase 2 - SLM Feedback Collection
da73b68 feat: v3.5.0 Phase 1 - Smart Routing with Embedded SLM
4e6492c fix: v3.4.1 - Auto Respond WebSocket sync & Ledger initialization
```

## ⚠️ Known Limitations

1. **Chat interface** is experimental - use terminal for production
2. **Embedded SLM** requires manual model download (optional)
3. **Learning** starts from zero - needs usage to build patterns
4. **Model detection** depends on CLI output format
