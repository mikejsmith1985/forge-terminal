import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import CommandPreview from './CommandPreview';
import './AssistantPanel.css';

const AssistantPanel = ({ isOpen, onClose, currentTabId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState({ available: false, models: [] });
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/assistant/status');
      const data = await response.json();
      setOllamaStatus(data);
      if (!data.available) {
        setError('Ollama is not running. Please start Ollama to use the assistant.');
      }
    } catch (err) {
      console.error('Failed to check Ollama status:', err);
      setError('Failed to connect to assistant service');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !ollamaStatus.available) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to chat
    const newMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          tabId: currentTabId || 'default',
          includeContext: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Add assistant response
      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        suggestedCommand: data.suggestedCommand,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setError(`Failed to get response: ${err.message}`);
      // Add error message to chat
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: `Sorry, I encountered an error: ${err.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteCommand = async (command) => {
    try {
      const response = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          tabId: currentTabId || 'default',
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Command execution not yet implemented');
      }
    } catch (err) {
      console.error('Execute error:', err);
      setError(`Failed to execute command: ${err.message}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="assistant-panel">
      <div className="assistant-header">
        <div className="assistant-title">
          <span className="assistant-icon">🤖</span>
          <span>Forge Assistant</span>
        </div>
        <button className="assistant-close" onClick={onClose} aria-label="Close assistant">
          ×
        </button>
      </div>

      {error && (
        <div className="assistant-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          {error.includes('Ollama') && (
            <button className="error-action" onClick={checkOllamaStatus}>
              Retry
            </button>
          )}
        </div>
      )}

      {!ollamaStatus.available && (
        <div className="assistant-setup">
          <h3>🚀 Setup Required</h3>
          <p>To use the Forge Assistant, you need Ollama:</p>
          <ol>
            <li>Install: <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
            <li>Pull a model: <code>ollama pull codellama:7b</code></li>
            <li>Start Ollama: <code>ollama serve</code></li>
          </ol>
          <button className="setup-check-button" onClick={checkOllamaStatus}>
            Check Status
          </button>
        </div>
      )}

      {ollamaStatus.available && (
        <>
          <div className="assistant-status">
            <span className="status-indicator status-online"></span>
            <span className="status-text">
              Connected • {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="assistant-messages">
            {messages.length === 0 && (
              <div className="assistant-welcome">
                <p>👋 Hello! I'm your terminal assistant.</p>
                <p>Ask me anything about commands, terminal tasks, or what you're working on.</p>
                <div className="welcome-examples">
                  <p><strong>Try asking:</strong></p>
                  <ul>
                    <li>"How do I find large files?"</li>
                    <li>"Show me git commands for branches"</li>
                    <li>"How do I compress a directory?"</li>
                  </ul>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx}>
                <ChatMessage message={msg} />
                {msg.suggestedCommand && (
                  <CommandPreview
                    command={msg.suggestedCommand}
                    onExecute={handleExecuteCommand}
                  />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="assistant-loading">
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>Thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="assistant-input-form" onSubmit={handleSendMessage}>
            <textarea
              className="assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={2}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="assistant-send-button"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <span>↑</span>
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default AssistantPanel;
