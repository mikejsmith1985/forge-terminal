# Forge Assistant v1 Implementation Plan

**Date:** 2025-12-08  
**Branch:** `forge-assistant`  
**Status:** Planning Phase  
**Toggle:** Behind Dev Mode

---

## 🎯 Vision

Build a local AI assistant integrated into Forge Terminal that can:
- Understand terminal context and provide intelligent suggestions
- Execute commands with user confirmation
- Learn from user workflows over time
- Work completely offline with local LLMs (Ollama)

---

## 📋 Phase 1: Review & Plan ✅

### Current Architecture (Post-Refactor)

We now have the perfect foundation for the assistant:

```
internal/assistant/
├── core.go              # Central AI features coordinator
├── service.go           # Interface for local/remote
├── local_service.go     # v1 implementation (in-process)
└── remote_service.go    # v2 stub (future)
```

**Key Infrastructure Available:**
- ✅ Vision system (pattern detection in terminal output)
- ✅ LLM command detection (knows when AI tools are used)
- ✅ AM system (artificial memory/logging)
- ✅ Service interface (ready for assistant features)
- ✅ Storage abstraction (organized data paths)

### What We're Building

**v1 Forge Assistant Features:**

1. **Context-Aware Chat** (Phase 2)
   - Chat panel integrated into terminal UI
   - Sees current directory, command history, terminal output
   - Can suggest commands based on context

2. **Command Execution** (Phase 3)
   - Assistant can propose commands
   - User reviews and confirms before execution
   - Commands execute in active terminal tab

3. **Local LLM Integration** (Phase 4)
   - Ollama integration for local inference
   - No cloud required, privacy-first
   - Configurable models (llama2, codellama, etc.)

4. **Learning Loop** (Phase 5)
   - Tracks successful command patterns
   - Learns user preferences over time
   - Suggests workflows based on history

---

## 🏗️ Architecture Design

### Extended Service Interface

```go
// internal/assistant/service.go - ADDITIONS
type Service interface {
    // Existing methods
    ProcessOutput(ctx context.Context, data []byte) (*vision.Match, error)
    DetectLLMCommand(ctx context.Context, commandLine string) (*llm.DetectedCommand, error)
    EnableVision(ctx context.Context) error
    DisableVision(ctx context.Context) error
    VisionEnabled(ctx context.Context) (bool, error)
    
    // NEW: Assistant methods
    Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
    ExecuteCommand(ctx context.Context, req *ExecuteCommandRequest) (*ExecuteCommandResponse, error)
    GetContext(ctx context.Context, tabID string) (*TerminalContext, error)
}
```

### New Types

```go
type ChatRequest struct {
    Message         string
    TabID           string
    IncludeContext  bool
}

type ChatResponse struct {
    Message          string
    SuggestedCommand *SuggestedCommand
    Reasoning        string
}

type SuggestedCommand struct {
    Command     string
    Description string
    Safe        bool
}

type TerminalContext struct {
    WorkingDirectory string
    RecentCommands   []string
    RecentOutput     string
    SessionID        string
}

type ExecuteCommandRequest struct {
    Command string
    TabID   string
}

type ExecuteCommandResponse struct {
    Success bool
    Output  string
    Error   string
}
```

---

## 📝 Implementation Phases

### Phase 2: Backend Implementation (Current)

**Files to Create:**
1. ✅ `docs/sessions/2025-12-08-forge-assistant/IMPLEMENTATION_PLAN.md`
2. `internal/assistant/ollama.go` - Ollama HTTP client
3. `internal/assistant/ollama_test.go` - Tests
4. `internal/assistant/types.go` - Shared types
5. `internal/assistant/context.go` - Context gathering

**Files to Modify:**
1. `internal/assistant/service.go` - Add Chat methods
2. `internal/assistant/local_service.go` - Implement methods
3. `internal/assistant/core.go` - Add Ollama client
4. `cmd/forge/main.go` - Add API endpoints

**API Endpoints:**
- `POST /api/assistant/chat` - Send message
- `POST /api/assistant/execute` - Execute command  
- `GET /api/assistant/context/:tabId` - Get context
- `GET /api/assistant/status` - Ollama status

**Tasks:**
- [ ] Create Ollama client
- [ ] Implement Chat method
- [ ] Add context gathering
- [ ] Add command execution
- [ ] Create API handlers
- [ ] Write tests (90%+ coverage)

### Phase 3: Frontend Implementation

**Files to Create:**
1. `frontend/src/components/AssistantPanel/AssistantPanel.tsx`
2. `frontend/src/components/AssistantPanel/ChatMessage.tsx`
3. `frontend/src/components/AssistantPanel/CommandPreview.tsx`
4. `frontend/src/contexts/AssistantContext.tsx`
5. `frontend/src/api/assistant.ts`

**Files to Modify:**
1. `frontend/src/components/Terminal.tsx` - Add toggle
2. `frontend/src/contexts/SettingsContext.tsx` - Add settings

### Phase 4: Playwright E2E Tests

**Test Scenarios:**
1. Assistant toggle in Dev Mode
2. Basic chat flow
3. Command suggestion & execution
4. Context awareness
5. Error handling

### Phase 5: Polish & Release

---

## 🎨 UX Design

```
┌──────────────────────────────┐  ┌─────────────────┐
│ Terminal                     │  │ 🤖 Assistant    │
│                              │  │                 │
│ $ npm run build              │  │ You: How do I   │
│ Building...                  │  │ run tests?      │
│                              │  │                 │
│                              │  │ 🤖: Run this:   │
│                              │  │ ┌─────────────┐ │
│                              │  │ │ npm test    │ │
│                              │  │ │ [Run] [No]  │ │
│                              │  │ └─────────────┘ │
└──────────────────────────────┘  └─────────────────┘
```

---

## ✅ Success Criteria

### Functional
- [ ] Chat works with Ollama
- [ ] Commands execute in terminal
- [ ] Context is accurate
- [ ] Behind Dev Mode toggle
- [ ] Error handling works

### Testing
- [ ] 90%+ backend coverage
- [ ] All Playwright tests pass
- [ ] Manual testing complete

### UX
- [ ] Panel is intuitive
- [ ] Loading states clear
- [ ] Errors are helpful

---

## 🔧 Configuration

```typescript
interface AssistantSettings {
  enabled: boolean;
  ollamaUrl: string;        // Default: http://localhost:11434
  model: string;            // Default: codellama:7b
  contextLines: number;     // Default: 10
  autoExecuteSafe: boolean; // Default: false
}
```

---

## 🚧 Limitations (v1)

**Included:**
- ✅ Local Ollama integration
- ✅ Context-aware chat
- ✅ Command execution
- ✅ Dev Mode only

**Not Included (future):**
- ❌ Multi-model support
- ❌ File code generation
- ❌ Workspace indexing
- ❌ Persistent memory

---

## 📚 Technical Notes

### Why Ollama?
- Offline-first, privacy-focused
- Free, unlimited use
- Simple HTTP API
- Fast local inference

### Safety
Commands classified as:
- **Safe:** ls, pwd, git status
- **Review:** rm, mv, git push
- **Dangerous:** rm -rf, sudo commands

---

## 🎯 Timeline

**Week 1:**
- Days 1-2: Backend
- Days 3-4: Frontend
- Day 5: Tests
- Day 6: Polish

---

**Status:** Plan complete, ready for Phase 2 implementation.

**Next:** Create Ollama client and extend Service interface.
