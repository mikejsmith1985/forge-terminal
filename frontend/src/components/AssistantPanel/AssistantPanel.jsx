import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import CommandPreview from './CommandPreview';
import ModelTestModal from './ModelTestModal';
import ModelTestStatus from './ModelTestStatus';
import TrainModelModal from './TrainModelModal';
import TrainModelStatus from './TrainModelStatus';
import './AssistantPanel.css';

const AssistantPanel = ({ isOpen, onClose, currentTabId, assistantFontSize }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState({ available: false, models: [], currentModel: '' });
  const [selectedModel, setSelectedModel] = useState('');
  const [isChangingModel, setIsChangingModel] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Model test state
  const [showTestModal, setShowTestModal] = useState(false);
  const [pendingModel, setPendingModel] = useState(null);
  const [testInProgress, setTestInProgress] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [testMessage, setTestMessage] = useState('Running baseline tests...');
  const [testCanChat, setTestCanChat] = useState(true);

  // Model training state
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [trainingInProgress, setTrainingInProgress] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingMessage, setTrainingMessage] = useState('Starting training...');
  const [trainingModel, setTrainingModel] = useState(null);

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
      
      // Set selected model from status or localStorage
      const savedModel = localStorage.getItem('forge-assistant-model');
      if (data.currentModel) {
        setSelectedModel(data.currentModel);
      } else if (savedModel) {
        setSelectedModel(savedModel);
      }
      
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

  const handleModelChange = async (newModel) => {
    if (newModel === selectedModel || !newModel) return;
    
    setIsChangingModel(true);
    setError(null);
    setPendingModel(newModel);
    
    try {
      const response = await fetch('/api/assistant/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSelectedModel(newModel);
        localStorage.setItem('forge-assistant-model', newModel);
        setShowModelSelector(false);
        
        // Add system message to chat
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Switched to ${getModelDisplayName(newModel)}`,
          timestamp: new Date().toISOString(),
        }]);
        
        // Show test modal
        setShowTestModal(true);
        
        // Also show training modal after showing test modal
        setTimeout(() => {
          setShowTrainModal(true);
          setTrainingModel(newModel);
        }, 500);
      } else {
        setError(data.error || 'Failed to change model');
      }
    } catch (err) {
      console.error('Model change error:', err);
      setError(`Failed to change model: ${err.message}`);
    } finally {
      setIsChangingModel(false);
    }
  };

  const getModelDisplayName = (modelName) => {
    const model = ollamaStatus.models.find(m => m.name === modelName);
    if (!model) return modelName;
    
    const parts = [];
    parts.push(model.friendlyName || modelName);
    if (model.sizeFormatted) parts.push(model.sizeFormatted);
    if (model.performance) parts.push(model.performance);
    
    return parts.join(' • ');
  };

  const handleTestModalConfirm = async () => {
    if (!pendingModel) return;
    
    setShowTestModal(false);
    setTestInProgress(true);
    setTestProgress(0);
    setTestMessage('Running baseline tests...');
    setTestCanChat(false);
    
    try {
      const response = await fetch('/api/assistant/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: pendingModel }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestMessage('Tests completed! Generating report...');
        setTestProgress(100);
        setTestCanChat(true);
        
        // Show success message
        setMessages(prev => [...prev, {
          role: 'system',
          content: `✓ Model tests completed! Results: ${data.accuracy || 'N/A'}% accuracy. ${data.reportPath ? 'Opening report...' : ''}`,
          timestamp: new Date().toISOString(),
        }]);
        
        // Auto-open report if available
        if (data.reportPath) {
          window.open(data.reportPath, '_blank');
        }
      } else {
        setTestMessage('Tests failed - see error below');
        setError(data.error || 'Failed to run tests');
        setTestCanChat(true);
      }
    } catch (err) {
      console.error('Test error:', err);
      setTestMessage('Tests error - see message');
      setError(`Failed to run tests: ${err.message}`);
      setTestCanChat(true);
    } finally {
      // Keep status bar visible for 5 seconds after completion
      setTimeout(() => {
        setTestInProgress(false);
      }, 5000);
    }
  };

  const handleTestModalCancel = () => {
    setShowTestModal(false);
    setPendingModel(null);
  };

  const handleTrainModalConfirm = async () => {
    if (!trainingModel) return;
    
    setShowTrainModal(false);
    setTrainingInProgress(true);
    setTrainingProgress(0);
    setTrainingMessage('Starting model training...');
    
    try {
      const response = await fetch('/api/assistant/train-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: trainingModel }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTrainingMessage('Training in progress: Processing knowledge base...');
        setTrainingProgress(50);
        
        // Simulate progress during training
        const progressInterval = setInterval(() => {
          setTrainingProgress(prev => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return prev;
            }
            return prev + Math.random() * 15;
          });
        }, 2000);
        
        // Poll for completion
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/assistant/training-status/${trainingModel}`);
            const statusData = await statusRes.json();
            
            if (statusData.completed) {
              clearInterval(pollInterval);
              clearInterval(progressInterval);
              
              setTrainingProgress(100);
              setTrainingMessage(`Training complete! Model learned ${statusData.examples_processed} concepts about Forge Terminal.`);
              
              // Show success message
              setMessages(prev => [...prev, {
                role: 'system',
                content: `✓ Model training complete! ${trainingModel} has been trained on 50 Forge Terminal knowledge examples.`,
                timestamp: new Date().toISOString(),
              }]);
              
              // Auto-dismiss after 10 seconds
              setTimeout(() => {
                setTrainingInProgress(false);
              }, 10000);
            }
          } catch (err) {
            console.error('Status check error:', err);
          }
        }, 3000);
      } else {
        setTrainingMessage('Training failed - see error');
        setError(data.error || 'Failed to train model');
      }
    } catch (err) {
      console.error('Training error:', err);
      setTrainingMessage('Training error - see message');
      setError(`Failed to train model: ${err.message}`);
      setTrainingInProgress(false);
    }
  };

  const handleTrainModalCancel = () => {
    setShowTrainModal(false);
    setTrainingModel(null);
  };

  const getCurrentModelInfo = () => {
    if (!selectedModel) return null;
    return ollamaStatus.models.find(m => m.name === selectedModel);
  };

  if (!isOpen) return null;

  return (
    <div className="assistant-panel" style={{ ['--assistant-font-size']: `${assistantFontSize || 14}px` }}>
      {/* Model Test Modal */}
      <ModelTestModal
        modelName={pendingModel ? getModelDisplayName(pendingModel) : ''}
        isOpen={showTestModal}
        onConfirm={handleTestModalConfirm}
        onCancel={handleTestModalCancel}
        isLoading={false}
      />

      {/* Model Test Status Bar */}
      <ModelTestStatus
        isActive={testInProgress}
        progress={testProgress}
        message={testMessage}
        canChat={testCanChat}
      />

      {/* Model Training Modal */}
      <TrainModelModal
        modelName={trainingModel ? getModelDisplayName(trainingModel) : ''}
        isOpen={showTrainModal}
        onConfirm={handleTrainModalConfirm}
        onCancel={handleTrainModalCancel}
        isLoading={false}
      />

      {/* Model Training Status Bar */}
      <TrainModelStatus
        isActive={trainingInProgress}
        progress={trainingProgress}
        message={trainingMessage}
        isTraining={trainingInProgress}
      />

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
          <div 
            className={`assistant-status ${showModelSelector ? 'expanded' : ''}`}
            onClick={() => !isChangingModel && setShowModelSelector(!showModelSelector)}
            style={{ cursor: 'pointer' }}
          >
            <div className="status-main">
              <span className="status-indicator status-online"></span>
              <span className="status-text">
                {selectedModel ? getModelDisplayName(selectedModel) : 'No model selected'}
              </span>
              <span className="status-action">
                {showModelSelector ? '▼' : '▶'} Click to change
              </span>
            </div>
            
            {showModelSelector && (
              <div className="model-selector-dropdown" onClick={(e) => e.stopPropagation()}>
                {ollamaStatus.models.map((model) => (
                  <div
                    key={model.name}
                    className={`model-option ${model.name === selectedModel ? 'selected' : ''} ${isChangingModel ? 'disabled' : ''}`}
                    onClick={() => !isChangingModel && handleModelChange(model.name)}
                  >
                    <div className="model-name">{model.friendlyName || model.name}</div>
                    <div className="model-meta">
                      {model.sizeFormatted && <span className="model-size">{model.sizeFormatted}</span>}
                      {model.performance && <span className={`model-perf perf-${model.performance.toLowerCase().replace(' ', '-')}`}>{model.performance}</span>}
                      {model.bestFor && <span className="model-best">{model.bestFor}</span>}
                    </div>
                  </div>
                ))}
                {ollamaStatus.models.length === 0 && (
                  <div className="model-option disabled">
                    No models available. Run: ollama pull mistral
                  </div>
                )}
              </div>
            )}
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
