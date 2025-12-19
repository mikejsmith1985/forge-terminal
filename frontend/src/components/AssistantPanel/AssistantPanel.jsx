import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ThinkingBlock from './ThinkingBlock';
import ToolRequest from './ToolRequest';
import { useAssistantStream } from '../../hooks/useAssistantStream';
import { Send, X, Settings, RefreshCw } from 'lucide-react';
import './AssistantPanel.css';

const AssistantPanel = ({ isOpen, onClose, currentTabId, assistantFontSize }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  
  // Use the new hook for streaming events
  const { 
    messages, 
    isThinking, 
    thinkingContent, 
    isConnected, 
    sendMessage 
  } = useAssistantStream(currentTabId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingContent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    sendMessage(input);
    setInput('');
  };

  const handleToolApprove = (tool, params) => {
    // In a real implementation, this would send an approval message back via WebSocket
    console.log('Approved tool:', tool, params);
  };

  const handleToolDeny = (tool) => {
    // In a real implementation, this would send a denial message back via WebSocket
    console.log('Denied tool:', tool);
  };

  if (!isOpen) return null;

  return (
    <div className="assistant-panel" style={{ fontSize: `${assistantFontSize}px` }}>
      <div className="assistant-header">
        <div className="header-title">
          <h3>Forge Assistant</h3>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="header-actions">
          <button className="icon-button" title="Settings">
            <Settings size={16} />
          </button>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 && !isThinking && (
          <div className="empty-state">
            <p>How can I help you with your terminal tasks today?</p>
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.role === 'tool_request') {
            return (
              <ToolRequest 
                key={index}
                tool={msg.tool}
                params={msg.params}
                onApprove={() => handleToolApprove(msg.tool, msg.params)}
                onDeny={() => handleToolDeny(msg.tool)}
              />
            );
          }
          
          return (
            <ChatMessage 
              key={index} 
              message={msg} 
              isUser={msg.role === 'user'} 
            />
          );
        })}

        {isThinking && (
          <ThinkingBlock content={thinkingContent} />
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Forge..."
          disabled={!isConnected}
        />
        <button type="submit" disabled={!input.trim() || !isConnected}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};

export default AssistantPanel;
