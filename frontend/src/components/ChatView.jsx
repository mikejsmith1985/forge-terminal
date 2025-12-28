/**
 * ChatView - Full-tab Chat Interface for v3.3.0 Chat-Native Mode
 * 
 * This is the primary view for new tabs. Users can toggle to terminal mode
 * via the header toggle button.
 * 
 * Messages are persisted per tabId to maintain state when switching tabs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, Terminal, Brain, Settings, Play } from 'lucide-react';
import './ChatView.css';

// In-memory store for chat messages per tab
// This persists messages when switching between chat/terminal modes
const chatMessagesStore = new Map();

const ChatView = ({ 
  tabId, 
  fontSize = 14, 
  onToggleTerminal,
  onOpenRouterConfig,
  onRunInTerminal,
}) => {
  // Initialize messages from store if available for this tab
  const [messages, setMessages] = useState(() => {
    return chatMessagesStore.get(tabId) || [];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const currentTabIdRef = useRef(tabId);

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
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, id: Date.now() }]);
    setIsLoading(true);
    setError(null);

    try {
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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let assistantMessageId = Date.now() + 1;
      let messageAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullResponse += chunk;

        if (!messageAdded) {
          setMessages(prev => [...prev, { role: 'assistant', content: fullResponse, id: assistantMessageId }]);
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
    } catch (err) {
      console.error('[ChatView] Error:', err);
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Error: ${err.message}`,
        id: Date.now() + 2
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, tabId]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-view">
      {/* Header with mode toggle and router config */}
      <div className="chat-view-header">
        <div className="chat-view-title">
          <Brain size={20} className="chat-view-icon" />
          <h2>AI Assistant</h2>
        </div>
        <div className="chat-view-actions">
          {onOpenRouterConfig && (
            <button 
              className="chat-view-btn router-config-btn"
              onClick={onOpenRouterConfig}
              title="Smart Router Configuration"
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

      {/* Messages area */}
      <div className="chat-view-messages" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="chat-view-empty">
            <div className="chat-view-empty-icon">🤖</div>
            <h3>Welcome to Forge Terminal</h3>
            <p>Ask me anything about code, debugging, or development.</p>
            <p className="chat-view-hint">
              I have access to your terminal context and can help with errors you're seeing.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-view-message chat-view-message-${msg.role}`}>
            <div className="chat-view-bubble">
              {msg.role === 'user' && <div className="chat-view-avatar user-avatar">You</div>}
              {msg.role === 'assistant' && <div className="chat-view-avatar assistant-avatar">🤖</div>}
              {msg.role === 'error' && <div className="chat-view-avatar error-avatar">❌</div>}
              <div className="chat-view-content">
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
        <textarea
          className="chat-view-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question... (Shift+Enter for newline)"
          disabled={isLoading}
          rows={3}
        />
        <button
          className="chat-view-send-btn"
          onClick={handleSendMessage}
          disabled={isLoading || !inputValue.trim()}
          title="Send (Enter)"
        >
          {isLoading ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
        </button>
      </div>
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
