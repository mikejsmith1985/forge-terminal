import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import './ChatSidebar.css';

const ChatSidebar = ({ isOpen, onClose, tabId, fontSize }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

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
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to get response');
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
      console.error('[ChatSidebar] Error:', err);
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

  if (!isOpen) return null;

  return (
    <div className="chat-sidebar">
      <div className="chat-header">
        <h3>Chat Assistant</h3>
        <button className="chat-close-btn" onClick={onClose} title="Close Chat">
          <X size={18} />
        </button>
      </div>

      <div className="chat-messages" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>🤖 Start a conversation. I can help with code, debugging, and more.</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-bubble">
              {msg.role === 'user' && <div className="chat-avatar">You</div>}
              {msg.role === 'assistant' && <div className="chat-avatar">🤖</div>}
              {msg.role === 'error' && <div className="chat-avatar">❌</div>}
              <div className="chat-content">
                {msg.role === 'assistant' ? (
                  <MarkdownContent content={msg.content} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</pre>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message chat-message-loading">
            <div className="chat-bubble">
              <div className="chat-avatar">🤖</div>
              <div className="chat-content">
                <Loader2 className="spinner" size={16} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message... (Shift+Enter for newline)"
          disabled={isLoading}
          rows={3}
        />
        <button
          className="chat-send-btn"
          onClick={handleSendMessage}
          disabled={isLoading || !inputValue.trim()}
          title="Send (Enter)"
        >
          {isLoading ? <Loader2 size={18} /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
};

const MarkdownContent = ({ content }) => {
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
          elements.push(
            <pre key={`code-${i}`} className="chat-code-block">
              {codeLanguage && <div className="chat-code-lang">{codeLanguage}</div>}
              <code>{codeBlockContent}</code>
            </pre>
          );
          inCodeBlock = false;
          codeBlockContent = '';
          codeLanguage = '';
        }
      } else if (inCodeBlock) {
        codeBlockContent += line + '\n';
      } else if (trimmed.startsWith('# ')) {
        elements.push(<h2 key={`h2-${i}`} className="chat-heading">{trimmed.slice(2)}</h2>);
      } else if (trimmed.startsWith('## ')) {
        elements.push(<h3 key={`h3-${i}`} className="chat-heading">{trimmed.slice(3)}</h3>);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(<li key={`li-${i}`} className="chat-list-item">{trimmed.slice(2)}</li>);
      } else if (trimmed) {
        elements.push(<p key={`p-${i}`} className="chat-paragraph">{line}</p>);
      }
    }

    if (inCodeBlock) {
      elements.push(
        <pre key="code-final" className="chat-code-block">
          {codeLanguage && <div className="chat-code-lang">{codeLanguage}</div>}
          <code>{codeBlockContent}</code>
        </pre>
      );
    }

    return elements;
  };

  return <div className="chat-markdown">{parseMarkdown(content)}</div>;
};

export default ChatSidebar;
