import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ThinkingBlock from './ThinkingBlock';
import ToolRequest from './ToolRequest';
import ModelTestModal from './ModelTestModal';
import TrainModelModal from './TrainModelModal';
import { useAssistantStream } from '../../hooks/useAssistantStream';
import { Send, X, Settings, RefreshCw, Check, AlertTriangle, Brain, TestTube } from 'lucide-react';
import './AssistantPanel.css';

const AssistantPanel = ({ isOpen, onClose, currentTabId, assistantFontSize, isFullScreen = false }) => {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
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

  // Fetch status on mount and when settings open
  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/assistant/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch assistant status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

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

  const handleSettingsClick = () => {
    if (!showSettings) {
      fetchStatus();
    }
    setShowSettings(!showSettings);
  };

  const handleModelSelect = async (modelName) => {
    try {
      await fetch('/api/assistant/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      fetchStatus(); // Refresh status
    } catch (err) {
      console.error('Failed to set model:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`assistant-panel ${isFullScreen ? 'full-screen' : ''}`} style={{ fontSize: `${assistantFontSize}px` }}>
      <div className="assistant-header">
        <div className="header-title">
          <h3>Forge Assistant</h3>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="header-actions">
          <button 
            className={`header-icon-btn ${showSettings ? 'active' : ''}`} 
            onClick={handleSettingsClick}
            title="Settings"
            aria-label="Open assistant settings"
            style={showSettings ? { background: 'var(--overlay)', color: 'var(--accent)' } : {}}
          >
            <Settings size={16} />
          </button>
          {!isFullScreen && (
            <button 
              className="header-icon-btn" 
              onClick={onClose} 
              title="Close"
              aria-label="Close assistant panel"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="assistant-settings-overlay" style={{
          position: 'absolute',
          top: '50px',
          right: '10px',
          width: '300px',
          background: 'var(--surface)',
          border: '1px solid var(--overlay)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 100,
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>Assistant Settings</h4>
            <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: 'var(--subtext)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>

          {loadingStatus ? (
            <div style={{ padding: '10px', textAlign: 'center', color: 'var(--subtext)' }}>Loading status...</div>
          ) : status ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--subtext)', marginBottom: '6px' }}>Current Model</label>
                <div className="model-selector-dropdown">
                  {status.models?.map(model => (
                    <div 
                      key={model.name} 
                      className={`model-option ${status.current_model === model.name ? 'selected' : ''}`}
                      onClick={() => handleModelSelect(model.name)}
                    >
                      <div className="model-name">{model.name}</div>
                      <div className="model-meta">
                        <span className="model-size">{model.size}</span>
                        {model.details?.family && <span>{model.details.family}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--overlay)', paddingTop: '12px', display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => {
                    setShowTestModal(true);
                    setShowSettings(false);
                  }}
                >
                  <TestTube size={14} /> Test
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => {
                    setShowTrainModal(true);
                    setShowSettings(false);
                  }}
                >
                  <Brain size={14} /> Train
                </button>
              </div>
            </>
          ) : (
            <div className="assistant-error">
              <AlertTriangle size={16} className="error-icon" />
              <span>Failed to load status</span>
              <button className="error-action" onClick={fetchStatus}>Retry</button>
            </div>
          )}
        </div>
      )}

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

      {/* Modals */}
      <ModelTestModal 
        isOpen={showTestModal} 
        onCancel={() => setShowTestModal(false)}
        modelName={status?.current_model || 'Current Model'}
        onConfirm={() => {
          // Trigger test run via API
          fetch('/api/assistant/run-tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: status?.current_model })
          });
          setShowTestModal(false);
        }}
      />

      <TrainModelModal
        isOpen={showTrainModal}
        onCancel={() => setShowTrainModal(false)}
        modelName={status?.current_model || 'Current Model'}
        onConfirm={() => {
          // Trigger training via API
          fetch('/api/assistant/train-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: status?.current_model })
          });
          setShowTrainModal(false);
        }}
      />
    </div>
  );
};

export default AssistantPanel;
