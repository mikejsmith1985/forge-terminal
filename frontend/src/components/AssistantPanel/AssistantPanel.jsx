import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ThinkingBlock from './ThinkingBlock';
import ToolRequest from './ToolRequest';
import ModelTestModal from './ModelTestModal';
import TrainModelModal from './TrainModelModal';
import { useAssistantStream } from '../../hooks/useAssistantStream';
import { Send, X, Settings, RefreshCw, Check, AlertTriangle, Brain, TestTube, MessageSquare } from 'lucide-react';
import './AssistantPanel.css';

const AssistantPanel = ({ isOpen, onClose, currentTabId, assistantFontSize, isFullScreen = false, onFeedbackClick }) => {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testProgress, setTestProgress] = useState(null);
  const [trainProgress, setTrainProgress] = useState(null);
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
      // Optimistic update
      setStatus(prev => ({ ...prev, current_model: modelName }));
      
      await fetch('/api/assistant/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      // No need to fetchStatus() immediately if we trust the optimistic update, 
      // but good to verify eventually.
      setTimeout(fetchStatus, 500); 
    } catch (err) {
      console.error('Failed to set model:', err);
      fetchStatus(); // Revert on error
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

          {/* Feedback Button - Only in Sidebar Mode */}
          {!isFullScreen && onFeedbackClick && (
            <div style={{ padding: '12px', borderBottom: '1px solid var(--overlay)' }}>
              <button
                onClick={onFeedbackClick}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(249, 115, 22, 0.1)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  borderRadius: '6px',
                  color: '#fb923c',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)';
                }}
              >
                <MessageSquare size={16} />
                Send Feedback
              </button>
            </div>
          )}

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
                <div style={{ flex: 1 }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => {
                      setShowTestModal(true);
                      setShowSettings(false);
                    }}
                    title="Run automated tests against the current model to verify capabilities"
                  >
                    <TestTube size={14} /> Test
                  </button>
                  <small style={{ display: 'block', fontSize: '10px', color: 'var(--subtext)', marginTop: '4px', textAlign: 'center' }}>
                    Verify model capabilities
                  </small>
                </div>
                <div style={{ flex: 1 }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => {
                      setShowTrainModal(true);
                      setShowSettings(false);
                    }}
                    title="Train the model on Forge documentation and codebase"
                  >
                    <Brain size={14} /> Train
                  </button>
                  <small style={{ display: 'block', fontSize: '10px', color: 'var(--subtext)', marginTop: '4px', textAlign: 'center' }}>
                    Learn from codebase
                  </small>
                </div>
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
        {/* Test/Train Progress Display */}
        {testProgress && (
          <div style={{
            padding: '12px',
            margin: '8px 0',
            borderRadius: '6px',
            border: '1px solid',
            fontSize: '12px',
            ...(testProgress.status === 'running' && {
              background: '#1a3a5c',
              borderColor: '#0066ff',
              color: '#00ccff'
            }),
            ...(testProgress.status === 'completed' && {
              background: '#1a2e1a',
              borderColor: '#22c55e',
              color: '#86efac'
            }),
            ...(testProgress.status === 'error' && {
              background: '#422006',
              borderColor: '#f97316',
              color: '#fed7aa'
            })
          }}>
            {testProgress.status === 'running' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                  <strong>Running tests for {testProgress.model}...</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Tests may take 2-5 minutes. Check server logs for detailed output.</div>
              </>
            )}
            {testProgress.status === 'completed' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span>✓</span>
                  <strong>{testProgress.message}</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Results saved to test-results/ directory</div>
              </>
            )}
            {testProgress.status === 'error' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span>✕</span>
                  <strong>Test failed</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.9 }}>{testProgress.error}</div>
              </>
            )}
          </div>
        )}

        {trainProgress && (
          <div style={{
            padding: '12px',
            margin: '8px 0',
            borderRadius: '6px',
            border: '1px solid',
            fontSize: '12px',
            ...(trainProgress.status === 'running' && {
              background: '#3a1a5c',
              borderColor: '#a855f7',
              color: '#e9d5ff'
            }),
            ...(trainProgress.status === 'completed' && {
              background: '#1a2e1a',
              borderColor: '#22c55e',
              color: '#86efac'
            }),
            ...(trainProgress.status === 'error' && {
              background: '#422006',
              borderColor: '#f97316',
              color: '#fed7aa'
            })
          }}>
            {trainProgress.status === 'running' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🧠</span>
                  <strong>Training {trainProgress.model}...</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Processing documentation and codebase. This may take several minutes.</div>
              </>
            )}
            {trainProgress.status === 'completed' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span>✓</span>
                  <strong>{trainProgress.message}</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Model has been trained on Forge codebase</div>
              </>
            )}
            {trainProgress.status === 'error' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span>✕</span>
                  <strong>Training failed</strong>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.9 }}>{trainProgress.error}</div>
              </>
            )}
          </div>
        )}

        {messages.length === 0 && !isThinking && !testProgress && !trainProgress && (
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
        isLoading={testProgress !== null}
        onConfirm={() => {
          const modelName = status?.current_model;
          setTestProgress({ status: 'running', model: modelName });
          setShowTestModal(false);
          
          fetch('/api/assistant/run-tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName })
          })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then(data => {
              setTestProgress({ status: 'completed', model: modelName, message: 'Tests completed successfully' });
              setTimeout(() => setTestProgress(null), 5000);
            })
            .catch(err => {
              setTestProgress({ status: 'error', model: modelName, error: err.message });
              setTimeout(() => setTestProgress(null), 5000);
            });
        }}
      />

      <TrainModelModal
        isOpen={showTrainModal}
        onCancel={() => setShowTrainModal(false)}
        modelName={status?.current_model || 'Current Model'}
        onConfirm={() => {
          const modelName = status?.current_model;
          setTrainProgress({ status: 'running', model: modelName });
          setShowTrainModal(false);
          
          fetch('/api/assistant/train-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName })
          })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then(data => {
              setTrainProgress({ status: 'completed', model: modelName, message: 'Training completed successfully' });
              setTimeout(() => setTrainProgress(null), 5000);
            })
            .catch(err => {
              setTrainProgress({ status: 'error', model: modelName, error: err.message });
              setTimeout(() => setTrainProgress(null), 5000);
            });
        }}
      />
    </div>
  );
};

export default AssistantPanel;
