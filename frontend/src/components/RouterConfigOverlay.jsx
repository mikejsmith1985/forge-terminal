/**
 * RouterConfigOverlay - Chat Configuration UI for v3.3.0
 * 
 * Simple tool + model selection for the chat interface.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Brain, Check, AlertCircle, Play, Loader2, Save } from 'lucide-react';
import './RouterConfigOverlay.css';

// Available tools and their models
const TOOLS = [
  { id: 'copilot', name: 'GitHub Copilot CLI', command: 'copilot' },
  { id: 'aider', name: 'Aider', command: 'aider' },
  { id: 'claude', name: 'Claude CLI', command: 'claude' },
];

const MODELS = {
  copilot: [
    { id: 'default', name: 'Default (GPT-4)' },
  ],
  aider: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  claude: [
    { id: 'default', name: 'Default' },
  ],
};

const RouterConfigOverlay = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState({
    tool: 'copilot',
    model: 'default',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Load configuration on mount
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/llm/router-config');
      if (!response.ok) {
        throw new Error('Failed to load configuration');
      }
      const data = await response.json();
      // Handle legacy config format
      if (data.tool) {
        setConfig({ tool: data.tool, model: data.model || 'default' });
      } else if (data.routing?.tier1_name) {
        // Migrate from old tier-based config
        const toolName = data.routing.tier1_name.toLowerCase();
        setConfig({ tool: toolName, model: 'default' });
      }
    } catch (err) {
      console.error('[RouterConfig] Load error:', err);
      // Use defaults on error
      setError('Using default configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/llm/router-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setSuccess('Configuration saved!');
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[RouterConfig] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testTool = async () => {
    const tool = TOOLS.find(t => t.id === config.tool);
    if (!tool) return;

    const testCmd = `${tool.command} --version`;
    setTestResult({ loading: true });

    try {
      const response = await fetch('/api/llm/test-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: testCmd }),
      });

      const data = await response.json();
      setTestResult({
        loading: false,
        installed: data.installed,
        version: data.version,
        error: data.error,
      });
    } catch (err) {
      setTestResult({
        loading: false,
        installed: false,
        error: err.message,
      });
    }
  };

  const handleToolChange = (toolId) => {
    setConfig({ tool: toolId, model: MODELS[toolId]?.[0]?.id || 'default' });
    setTestResult(null);
  };

  if (!isOpen) return null;

  const availableModels = MODELS[config.tool] || [];

  return (
    <div className="router-config-overlay">
      <div className="router-config-backdrop" onClick={onClose} />
      <div className="router-config-modal router-config-modal-simple">
        <div className="router-config-header">
          <div className="router-config-title">
            <Brain size={24} className="router-config-icon" />
            <h2>Chat Settings</h2>
          </div>
          <button className="router-config-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="router-config-body">
          {loading ? (
            <div className="router-config-loading">
              <Loader2 className="spinner" size={32} />
              <p>Loading...</p>
            </div>
          ) : (
            <>
              {/* Tool Selection */}
              <div className="config-section">
                <label className="config-label">AI Tool</label>
                <div className="tool-options">
                  {TOOLS.map(tool => (
                    <button
                      key={tool.id}
                      className={`tool-option ${config.tool === tool.id ? 'selected' : ''}`}
                      onClick={() => handleToolChange(tool.id)}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              {availableModels.length > 1 && (
                <div className="config-section">
                  <label className="config-label">Model</label>
                  <select
                    className="model-select"
                    value={config.model}
                    onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  >
                    {availableModels.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Test Tool */}
              <div className="config-section">
                <button
                  className="test-tool-btn"
                  onClick={testTool}
                  disabled={testResult?.loading}
                >
                  {testResult?.loading ? (
                    <Loader2 className="spinner" size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  Test Tool
                </button>

                {testResult && !testResult.loading && (
                  <div className={`test-result ${testResult.installed ? 'success' : 'error'}`}>
                    {testResult.installed ? (
                      <>
                        <Check size={16} />
                        <span>Installed {testResult.version && `(${testResult.version})`}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={16} />
                        <span>{testResult.error || 'Not found'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="router-config-footer">
          {error && (
            <div className="router-config-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="router-config-success">
              <Check size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="router-config-actions">
            <button className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-save"
              onClick={saveConfig}
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouterConfigOverlay;
