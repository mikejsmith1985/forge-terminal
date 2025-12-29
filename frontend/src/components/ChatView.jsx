/**
 * ChatView - Full-tab Chat Interface for v3.5.1 Enhanced UX Layer
 * 
 * This is an enhanced UX layer for CLI AI tools (copilot, claude).
 * - Analyzes prompts with Smart Routing before CLI execution
 * - Displays rich output (files, screenshots, command cards)
 * - Uses CLI authentication - no API key needed
 * - Persists to SQLite with full-text search
 * 
 * Messages are persisted to SQLite and synced in real-time via WebSocket.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, Terminal, Brain, Settings, Play, Search, Image as ImageIcon } from 'lucide-react';
import ChatSearchOverlay from './ChatSearchOverlay';
import './ChatView.css';

// In-memory store for chat messages per tab (fallback if SQLite unavailable)
const chatMessagesStore = new Map();

const ChatView = ({ 
  tabId, 
  fontSize = 14, 
  onToggleTerminal,
  onOpenSettings,
  onRunInTerminal,
}) => {
  // Initialize messages from store if available for this tab
  const [messages, setMessages] = useState(() => {
    return chatMessagesStore.get(tabId) || [];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(null); // SLM analysis display
  const [pendingImages, setPendingImages] = useState([]); // Images to attach
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({}); // For scrolling to search results
  const currentTabIdRef = useRef(tabId);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load messages from SQLite on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const response = await fetch('/api/chat/messages?limit=100');
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert SQLite format to local format
            const formatted = data.messages.map(m => ({
              id: m.id,
              role: m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : m.type,
              content: m.content,
              workerName: m.workerName,
              metadata: m.metadata,
            }));
            setMessages(formatted);
          }
        }
      } catch (err) {
        console.error('[ChatView] Failed to load messages:', err);
      }
    };
    loadMessages();
  }, []);

  // Connect WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.message) {
            const msg = data.message;
            const formatted = {
              id: msg.id,
              role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : msg.type,
              content: msg.content,
              workerName: msg.workerName,
              metadata: msg.metadata,
            };
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === formatted.id)) return prev;
              return [...prev, formatted];
            });
          }
        } catch (err) {
          console.error('[ChatView] WS parse error:', err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('[ChatView] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[ChatView] WebSocket connection failed:', err);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Persist messages to store when they change
  useEffect(() => {
    if (tabId) {
      chatMessagesStore.set(tabId, messages);
    }
  }, [messages, tabId]);

  // When tabId changes, load messages for that tab
  useEffect(() => {
    if (tabId !== currentTabIdRef.current) {
      currentTabIdRef.current = tabId;
      const storedMessages = chatMessagesStore.get(tabId) || [];
      setMessages(storedMessages);
    }
  }, [tabId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    const userMsgId = `msg-${Date.now()}`;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, id: userMsgId }]);
    setIsLoading(true);
    setError(null);

    try {
      // Persist user message to SQLite
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userMsgId,
          type: 'user',
          content: userMessage,
          workerId: tabId || 'default',
        })
      }).catch(err => console.warn('[ChatView] Failed to persist user message:', err));

      // Show SLM analysis status
      setAnalysisStatus({ status: 'analyzing', message: 'Analyzing complexity...' });
      
      // Get SLM analysis first
      let slmResult = null;
      try {
        const slmResponse = await fetch('/api/slm/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userMessage })
        });
        if (slmResponse.ok) {
          slmResult = await slmResponse.json();
          setAnalysisStatus({
            status: 'complete',
            complexity: slmResult.complexity,
            model: slmResult.recommendedModel || slmResult.model,
            taskType: slmResult.taskType,
          });
        }
      } catch (slmErr) {
        console.warn('[ChatView] SLM analysis failed:', slmErr);
        setAnalysisStatus(null);
      }

      // Now send to LLM
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          tabId: tabId || 'default'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to get response');
      }

      // Get routing info from headers
      const routedModel = response.headers.get('X-Forge-Routed-To');
      const budgetWarning = response.headers.get('X-Forge-Budget-Warning');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      const assistantMessageId = `msg-${Date.now() + 1}`;
      let messageAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullResponse += chunk;

        if (!messageAdded) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: fullResponse, 
            id: assistantMessageId,
            workerName: routedModel || 'AI',
            metadata: slmResult ? { complexity: slmResult.complexity } : null,
          }]);
          messageAdded = true;
        } else {
          setMessages(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(m => m.id === assistantMessageId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], content: fullResponse };
            }
            return updated;
          });
        }
      }

      // Persist assistant message to SQLite
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          type: 'assistant',
          content: fullResponse,
          workerId: tabId || 'default',
          workerName: routedModel || 'AI',
          metadata: slmResult ? { 
            complexity: slmResult.complexity,
            model: routedModel,
            taskType: slmResult.taskType,
          } : null,
        })
      }).catch(err => console.warn('[ChatView] Failed to persist assistant message:', err));

      // Clear analysis status after response
      setAnalysisStatus(null);

    } catch (err) {
      console.error('[ChatView] Error:', err);
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Error: ${err.message}`,
        id: `msg-${Date.now() + 2}`
      }]);
      setAnalysisStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, tabId]);

  // Scroll to a specific message (for search)
  const scrollToMessage = useCallback((messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 2000);
    }
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Image upload handlers
  const handleImageUpload = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/chat/images', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setPendingImages(prev => [...prev, {
          id: Date.now(),
          filename: data.filename,
          url: data.url,
          name: file.name,
        }]);
      }
    } catch (err) {
      console.error('[ChatView] Image upload failed:', err);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    });
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        break;
      }
    }
  }, [handleImageUpload]);

  const removeImage = useCallback((id) => {
    setPendingImages(prev => prev.filter(img => img.id !== id));
  }, []);

  return (
    <div 
      className={`chat-view ${isDragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header with mode toggle and router config */}
      <div className="chat-view-header">
        <div className="chat-view-title">
          <Brain size={20} className="chat-view-icon" />
          <h2>AI Assistant</h2>
        </div>
        <div className="chat-view-actions">
          <button 
            className="chat-view-btn search-btn"
            onClick={() => setIsSearchOpen(true)}
            title="Search Chat History (Ctrl+F)"
          >
            <Search size={18} />
          </button>
          {onOpenSettings && (
            <button 
              className="chat-view-btn settings-btn"
              onClick={onOpenSettings}
              title="Intelligence & Budget Settings"
            >
              <Settings size={18} />
            </button>
          )}
          {onToggleTerminal && (
            <button 
              className="chat-view-btn terminal-toggle-btn"
              onClick={onToggleTerminal}
              title="Switch to Terminal"
            >
              <Terminal size={18} />
              <span>Terminal</span>
            </button>
          )}
        </div>
      </div>

      {/* SLM Analysis Status */}
      {analysisStatus && (
        <div className={`chat-view-analysis ${analysisStatus.status}`}>
          {analysisStatus.status === 'analyzing' ? (
            <>
              <Loader2 className="spinner" size={14} />
              <span>{analysisStatus.message}</span>
            </>
          ) : (
            <>
              <span className="complexity-badge" data-level={analysisStatus.complexity > 7 ? 'high' : analysisStatus.complexity > 4 ? 'medium' : 'low'}>
                Complexity: {analysisStatus.complexity}/10
              </span>
              {analysisStatus.model && <span className="model-badge">{analysisStatus.model}</span>}
              {analysisStatus.taskType && <span className="task-badge">{analysisStatus.taskType}</span>}
            </>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="chat-view-messages" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="chat-view-empty">
            <div className="chat-view-empty-icon">🤖</div>
            <h3>Welcome to Forge Terminal</h3>
            <p>Ask me anything about code, debugging, or development.</p>
            <p className="chat-view-hint">
              I use your CLI tools (copilot/claude) with Smart Routing to optimize responses.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div 
            key={msg.id} 
            ref={el => messageRefs.current[msg.id] = el}
            className={`chat-view-message chat-view-message-${msg.role}`}
          >
            <div className="chat-view-bubble">
              {msg.role === 'user' && <div className="chat-view-avatar user-avatar">You</div>}
              {msg.role === 'assistant' && (
                <div className="chat-view-avatar assistant-avatar" title={msg.workerName}>
                  🤖
                </div>
              )}
              {msg.role === 'error' && <div className="chat-view-avatar error-avatar">❌</div>}
              <div className="chat-view-content">
                {msg.workerName && msg.role === 'assistant' && (
                  <div className="chat-view-worker-badge">{msg.workerName}</div>
                )}
                {msg.role === 'assistant' ? (
                  <MarkdownContent content={msg.content} onRunInTerminal={onRunInTerminal} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{msg.content}</pre>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-view-message chat-view-message-loading">
            <div className="chat-view-bubble">
              <div className="chat-view-avatar assistant-avatar">🤖</div>
              <div className="chat-view-content">
                <Loader2 className="spinner" size={20} />
                <span className="loading-text">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-view-input-area">
        {/* Pending images */}
        {pendingImages.length > 0 && (
          <div className="chat-view-pending-images">
            {pendingImages.map(img => (
              <div key={img.id} className="pending-image">
                <img src={img.url} alt={img.name} />
                <button 
                  className="remove-image-btn" 
                  onClick={() => removeImage(img.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="chat-view-input-row">
          <button 
            className="chat-view-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Image"
          >
            <ImageIcon size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImageUpload(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <textarea
            className="chat-view-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            placeholder="Ask a question... (Shift+Enter for newline, paste images)"
            disabled={isLoading}
            rows={3}
          />
          <button
            className="chat-view-send-btn"
            onClick={handleSendMessage}
            disabled={isLoading || (!inputValue.trim() && pendingImages.length === 0)}
            title="Send (Enter)"
          >
            {isLoading ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </div>

      {/* Search Overlay */}
      <ChatSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onScrollToMessage={scrollToMessage}
      />
    </div>
  );
};

/**
 * Markdown content renderer - parses basic markdown for display
 */
const MarkdownContent = ({ content, onRunInTerminal }) => {
  const parseMarkdown = (text) => {
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeBlockContent = '';
    let codeLanguage = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeBlockContent = '';
        } else {
          // Check if this is a runnable code block (bash, sh, powershell, cmd)
          const isRunnable = ['bash', 'sh', 'shell', 'powershell', 'ps1', 'cmd', 'zsh', ''].includes(codeLanguage.toLowerCase());
          const trimmedCode = codeBlockContent.trim();
          
          elements.push(
            <div key={`code-wrapper-${i}`} className="chat-view-code-wrapper">
              <pre className="chat-view-code-block">
                {codeLanguage && <div className="chat-view-code-lang">{codeLanguage}</div>}
                <code>{codeBlockContent}</code>
              </pre>
              {isRunnable && onRunInTerminal && trimmedCode && (
                <button 
                  className="chat-view-run-btn"
                  onClick={() => onRunInTerminal(trimmedCode)}
                  title="Run in Terminal (Ghost Driver)"
                >
                  <Play size={14} />
                  Run in Terminal
                </button>
              )}
            </div>
          );
          inCodeBlock = false;
          codeBlockContent = '';
          codeLanguage = '';
        }
      } else if (inCodeBlock) {
        codeBlockContent += line + '\n';
      } else if (trimmed.startsWith('# ')) {
        elements.push(<h2 key={`h2-${i}`} className="chat-view-heading">{trimmed.slice(2)}</h2>);
      } else if (trimmed.startsWith('## ')) {
        elements.push(<h3 key={`h3-${i}`} className="chat-view-heading">{trimmed.slice(3)}</h3>);
      } else if (trimmed.startsWith('### ')) {
        elements.push(<h4 key={`h4-${i}`} className="chat-view-heading">{trimmed.slice(4)}</h4>);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(<li key={`li-${i}`} className="chat-view-list-item">{trimmed.slice(2)}</li>);
      } else if (trimmed.match(/^\d+\.\s/)) {
        const match = trimmed.match(/^\d+\.\s(.*)$/);
        if (match) {
          elements.push(<li key={`oli-${i}`} className="chat-view-list-item ordered">{match[1]}</li>);
        }
      } else if (trimmed) {
        // Handle inline code
        const parts = line.split(/(`[^`]+`)/g);
        const rendered = parts.map((part, j) => {
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={j} className="chat-view-inline-code">{part.slice(1, -1)}</code>;
          }
          return part;
        });
        elements.push(<p key={`p-${i}`} className="chat-view-paragraph">{rendered}</p>);
      }
    }

    if (inCodeBlock) {
      const isRunnable = ['bash', 'sh', 'shell', 'powershell', 'ps1', 'cmd', 'zsh', ''].includes(codeLanguage.toLowerCase());
      const trimmedCode = codeBlockContent.trim();
      
      elements.push(
        <div key="code-wrapper-final" className="chat-view-code-wrapper">
          <pre className="chat-view-code-block">
            {codeLanguage && <div className="chat-view-code-lang">{codeLanguage}</div>}
            <code>{codeBlockContent}</code>
          </pre>
          {isRunnable && onRunInTerminal && trimmedCode && (
            <button 
              className="chat-view-run-btn"
              onClick={() => onRunInTerminal(trimmedCode)}
              title="Run in Terminal (Ghost Driver)"
            >
              <Play size={14} />
              Run in Terminal
            </button>
          )}
        </div>
      );
    }

    return elements;
  };

  return <div className="chat-view-markdown">{parseMarkdown(content)}</div>;
};

// Utility function to clean up chat messages for a tab (call when tab is closed)
export const cleanupChatMessages = (tabId) => {
  if (tabId && chatMessagesStore.has(tabId)) {
    chatMessagesStore.delete(tabId);
  }
};

export default ChatView;
