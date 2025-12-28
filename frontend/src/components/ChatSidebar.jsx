import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, Settings, FileCode, Zap } from 'lucide-react';
import './ChatSidebar.css';

const ChatSidebar = ({ isOpen, onClose, tabId, fontSize, onOpenRouterConfig }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // @ mention state (v3.3.6 Deep Context)
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [fileList, setFileList] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filesLoading, setFilesLoading] = useState(false);
  const popoverRef = useRef(null);

  // Router config state for dynamic badge
  const [activeModel, setActiveModel] = useState(null);
  const [lastRoutedModel, setLastRoutedModel] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch router config for default model display
  useEffect(() => {
    if (isOpen) {
      fetchRouterConfig();
      if (fileList.length === 0) {
        fetchFileList();
      }
    }
  }, [isOpen]);

  const fetchRouterConfig = async () => {
    try {
      const response = await fetch('/api/llm/router-config');
      if (response.ok) {
        const data = await response.json();
        if (data.tiers && data.active_tier) {
          const activeTier = data.tiers[data.active_tier];
          if (activeTier) {
            setActiveModel(activeTier.model);
          }
        }
      }
    } catch (err) {
      console.error('[ChatSidebar] Failed to fetch router config:', err);
    }
  };

  const fetchFileList = async () => {
    setFilesLoading(true);
    try {
      const response = await fetch('/api/files/flat');
      if (response.ok) {
        const files = await response.json();
        setFileList(files || []);
      }
    } catch (err) {
      console.error('[ChatSidebar] Failed to fetch file list:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  // Filter files based on mention query
  useEffect(() => {
    if (mentionActive && mentionQuery) {
      const query = mentionQuery.toLowerCase();
      const filtered = fileList
        .filter(file => file.toLowerCase().includes(query))
        .slice(0, 10);
      setFilteredFiles(filtered);
      setSelectedIndex(0);
    } else if (mentionActive) {
      setFilteredFiles(fileList.slice(0, 10));
      setSelectedIndex(0);
    } else {
      setFilteredFiles([]);
    }
  }, [mentionActive, mentionQuery, fileList]);

  // Handle input change with @ detection
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(value);

    // Detect @ mention (look for @ not inside [...])
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Only activate if there's no space after @ and not inside brackets
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('[') && !textAfterAt.includes(']')) {
        setMentionActive(true);
        setMentionQuery(textAfterAt);
        setMentionPosition(lastAtIndex);
        return;
      }
    }

    setMentionActive(false);
    setMentionQuery('');
  };

  // Insert selected file mention with [@file] token format
  const insertMention = (file) => {
    const beforeMention = inputValue.substring(0, mentionPosition);
    const afterMention = inputValue.substring(mentionPosition + mentionQuery.length + 1);
    // Use [@filepath] token format
    const newValue = `${beforeMention}[@${file}] ${afterMention}`;
    setInputValue(newValue);
    setMentionActive(false);
    setMentionQuery('');
    inputRef.current?.focus();
  };

  // Handle keyboard navigation in popover
  const handleKeyDown = (e) => {
    if (mentionActive && filteredFiles.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Tab':
        case 'Enter':
          if (mentionActive) {
            e.preventDefault();
            insertMention(filteredFiles[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setMentionActive(false);
          break;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Parse [@filepath] tokens from message and extract file paths
  const parseContextFiles = (message) => {
    const regex = /\[@([^\]]+)\]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(message)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();

    // Parse [@file] tokens for context files
    const contextFiles = parseContextFiles(userMessage);

    setInputValue('');
    setMentionActive(false);
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      id: Date.now(),
      contextFiles: contextFiles.length > 0 ? contextFiles : undefined
    }]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          tabId: tabId || 'default',
          contextFiles: contextFiles
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      // Get the routed model from response header
      const routedModel = response.headers.get('X-Forge-Routed-To') || activeModel || 'Unknown';
      setLastRoutedModel(routedModel);

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
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: fullResponse,
            id: assistantMessageId,
            model: routedModel
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
  }, [inputValue, isLoading, tabId, activeModel]);

  // Get display model - prioritize last routed, then active config
  const displayModel = lastRoutedModel || activeModel || 'gpt-4o-mini';

  if (!isOpen) return null;

  return (
    <div className="chat-sidebar">
      <div className="chat-header">
        <h3>Chat Assistant</h3>
        <div className="chat-header-actions">
          {/* Dynamic model badge */}
          <div className="active-model-badge" title={`Active: ${displayModel}`}>
            <Zap size={12} />
            <span>{displayModel}</span>
          </div>
          <button
            className="router-config-btn"
            onClick={onOpenRouterConfig}
            title="Configure AI Router"
          >
            <Settings size={16} />
          </button>
          <button className="chat-close-btn" onClick={onClose} title="Close Chat">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="chat-messages" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Start a conversation. I can help with code, debugging, and more.</p>
            <p className="chat-hint">Tip: Use <span className="mention-hint">[@filename]</span> to include file contents in your message!</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-bubble">
              {msg.role === 'user' && <div className="chat-avatar">You</div>}
              {msg.role === 'assistant' && (
                <div className="chat-avatar-container">
                  <div className="chat-avatar">AI</div>
                  {msg.model && (
                    <div className="chat-model-badge" title={`Routed to ${msg.model}`}>
                      {msg.model}
                    </div>
                  )}
                </div>
              )}
              {msg.role === 'error' && <div className="chat-avatar">!</div>}
              <div className="chat-content">
                {msg.contextFiles && msg.contextFiles.length > 0 && (
                  <div className="chat-context-files">
                    <FileCode size={12} />
                    <span>{msg.contextFiles.length} file{msg.contextFiles.length > 1 ? 's' : ''} attached</span>
                  </div>
                )}
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
              <div className="chat-avatar">AI</div>
              <div className="chat-content">
                <Loader2 className="spinner" size={16} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {/* @ Mention Autocomplete Popover */}
        {mentionActive && filteredFiles.length > 0 && (
          <div className="mention-popover" ref={popoverRef}>
            <div className="mention-header">
              <FileCode size={14} />
              <span>Files</span>
              {filesLoading && <Loader2 size={12} className="spinner" />}
            </div>
            <div className="mention-list">
              {filteredFiles.map((file, idx) => (
                <div
                  key={file}
                  className={`mention-item ${idx === selectedIndex ? 'selected' : ''}`}
                  onClick={() => insertMention(file)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <FileCode size={14} />
                  <span className="mention-file-path">{file}</span>
                </div>
              ))}
            </div>
            <div className="mention-hint-bar">
              <kbd>Tab</kbd> or <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to dismiss
            </div>
          </div>
        )}

        <textarea
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... Use [@file.ext] for context"
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
