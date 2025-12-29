# Forge Terminal v3.5.1 - Chat as Orchestration Layer

**Release Date:** December 29, 2025

## 🎯 Overview

v3.5.1 transforms the Chat UI into a **persistent orchestration layer** with SQLite-backed storage, full-text search, and real-time WebSocket sync. The old "AI Provider Configuration" modal has been removed in favor of integrated Intelligence & Budget settings.

## 🔄 Major Architecture Changes

### Chat = Source of Truth
- **SQLite Storage**: All messages persist to `~/.forge/chat/chat.db`
- **Full-Text Search**: FTS5 indexing for instant search across all history
- **24-Hour Context**: SLM can query last 24 hours for context injection
- **Real-Time Sync**: WebSocket keeps all views updated

### Model Capabilities Database
- **Copilot CLI**: 13 models with detailed capability scores
- **Claude CLI**: 3 models (opus, sonnet, haiku)
- **Smart Routing**: Considers complexity, budget, and model strengths
- **Visible Analysis**: Shows "Analyzing..." with complexity badge before responses

### Threading Foundation
- Messages support `replyTo` for future thread/agent targeting
- Worker tracking: each message knows which agent responded
- Foundation for multi-agent orchestration (v3.6.0)

## ✨ New Features

### SQLite Chat Store
- Persistent across sessions (never lose context)
- Automatic archiving of old messages
- Worker/agent registration and tracking
- Image upload storage

### Search Overlay
- Full-text search across all chat history
- Auto-scroll to results
- Keyboard navigation (↑↓ Enter Esc)
- Open with Search button in Chat header

### SLM Analysis Display
- "Analyzing complexity..." status before responses
- Complexity badge (1-10 scale, color coded)
- Model recommendation display
- Task type identification

### Worker Badges
- Each AI response shows which model was used
- Preparation for multi-agent view

## 📁 New Files

### Backend (Go)
- `internal/chat/store.go` - SQLite store with FTS5
- `internal/slm/models.go` - Model capability database (16 models)
- `cmd/forge/handlers_chat_store.go` - HTTP + WebSocket handlers

### Frontend (React)
- `frontend/src/hooks/useChatStore.js` - React hook for chat store
- `frontend/src/components/ChatSearchOverlay.jsx` - Search UI
- `frontend/src/components/ChatSearchOverlay.css` - Search styles

### Modified
- `ChatView.jsx` - SQLite integration, search, analysis display
- `ChatView.css` - Analysis badges, worker badges, search button
- `ChatSidebar.jsx` - Settings integration
- `SettingsModal.jsx` - initialTab prop
- `tourSteps.js` - Updated for v3.5.1
- `main.go` - Chat store initialization, new API routes

## 🔧 API Endpoints

```
GET  /api/chat/messages      - Get messages (limit, since params)
POST /api/chat/messages      - Add message
GET  /api/chat/search?q=     - Full-text search
GET  /api/chat/thread/{id}   - Get thread messages
GET  /api/chat/workers       - List workers
POST /api/chat/workers       - Register worker
GET  /api/chat/context       - Get context for SLM
POST /api/chat/images        - Upload image
GET  /api/chat/images/{name} - Serve image
WS   /api/chat/ws            - Real-time sync
```

## 🧠 Model Capabilities

### Copilot CLI Models
| Model | Reasoning | Coding | Speed | Cost |
|-------|-----------|--------|-------|------|
| claude-opus-4.5 | 10 | 10 | 3 | Premium |
| claude-sonnet-4.5 | 9 | 9 | 6 | High |
| gpt-5.1-codex-max | 10 | 10 | 4 | Premium |
| gpt-5.1-codex | 9 | 9 | 6 | High |
| claude-haiku-4.5 | 6 | 7 | 9 | Low |
| gpt-5-mini | 5 | 6 | 10 | Low |

### Claude CLI Models
| Model | Reasoning | Coding | Speed | Cost |
|-------|-----------|--------|-------|------|
| opus | 10 | 10 | 3 | Premium |
| sonnet | 9 | 9 | 6 | High |
| haiku | 6 | 7 | 9 | Low |

## 🧪 Testing

```powershell
# Start Forge
./forge.exe

# Test chat persistence
# 1. Send a message in Chat
# 2. Restart Forge
# 3. Messages should still be there

# Test search
# 1. Click Search icon in Chat header
# 2. Type a query
# 3. Results should appear and scroll on select

# Test SLM analysis
# 1. Send a complex coding question
# 2. Should see "Analyzing complexity..." 
# 3. Then complexity badge with model name
```

## 🚀 What's Next (v3.6.0)

1. **Terminal → Chat Sync**: Terminal output mirrors to Chat messages
2. **Multi-Agent**: Chat spawns multiple terminal workers
3. **Workflow Integration**: Execute workflows through Chat
4. **Thread UI**: Reply to messages to target specific agents
