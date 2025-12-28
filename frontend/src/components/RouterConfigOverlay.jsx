/**
 * RouterConfigOverlay - Smart Router Configuration UI for v3.3.0
 * 
 * Allows users to configure which CLI tool (Copilot, Aider, etc.) 
 * is used for each complexity tier.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Brain, Check, AlertCircle, Play, Loader2, Save } from 'lucide-react';
import './RouterConfigOverlay.css';

const TIER_LABELS = {
  tier1: { name: 'Tier 1 - Quick Tasks', description: 'Fast operations: linting, tests, simple edits' },
  tier2: { name: 'Tier 2 - Standard Tasks', description: 'Refactoring, debugging, code review' },
  tier3: { name: 'Tier 3 - Complex Tasks', description: 'Architecture, design, system-level changes' },
};

const RouterConfigOverlay = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState({
    routing: {
      tier1_name: 'Copilot',
      tier1_cmd: 'gh copilot suggest "{prompt}"',
      tier2_name: 'Copilot',
      tier2_cmd: 'gh copilot suggest "{prompt}"',
      tier3_name: 'Aider',
      tier3_cmd: 'aider --yes-always --model claude-3-5-sonnet-20241022 --message "{prompt}"',
    },
    context: {
      include_cwd: true,
      include_git_branch: true,
      include_vision: true,
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testResults, setTestResults] = useState({});

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
      setConfig(data);
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

      setSuccess('Configuration saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[RouterConfig] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testCommand = async (tier) => {
    const tierKey = `tier${tier}`;
    const cmdField = `tier${tier}_cmd`;
    const cmd = config.routing[cmdField];

    // Extract base command for testing
    const baseCmd = cmd.split(' ')[0];
    const testCmd = `${baseCmd} --version`;

    setTestResults(prev => ({ ...prev, [tierKey]: { loading: true } }));

    try {
      const response = await fetch('/api/llm/test-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: testCmd }),
      });

      const data = await response.json();
      setTestResults(prev => ({
        ...prev,
        [tierKey]: {
          loading: false,
          installed: data.installed,
          version: data.version,
          error: data.error,
        },
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [tierKey]: {
          loading: false,
          installed: false,
          error: err.message,
        },
      }));
    }
  };

  const updateTierConfig = (tier, field, value) => {
    setConfig(prev => ({
      ...prev,
      routing: {
        ...prev.routing,
        [`tier${tier}_${field}`]: value,
      },
    }));
    // Clear test result when config changes
    setTestResults(prev => ({ ...prev, [`tier${tier}`]: null }));
  };

  const updateContext = (field, value) => {
    setConfig(prev => ({
      ...prev,
      context: {
        ...prev.context,
        [field]: value,
      },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="router-config-overlay">
      <div className="router-config-backdrop" onClick={onClose} />
      <div className="router-config-modal">
        <div className="router-config-header">
          <div className="router-config-title">
            <Brain size={24} className="router-config-icon" />
            <h2>Smart Router Configuration</h2>
          </div>
          <button className="router-config-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="router-config-body">
          {loading ? (
            <div className="router-config-loading">
              <Loader2 className="spinner" size={32} />
              <p>Loading configuration...</p>
            </div>
          ) : (
            <>
              <p className="router-config-intro">
                Configure which CLI tool handles each complexity tier. The router automatically 
                selects the best tool based on task analysis.
              </p>

              {/* Tier configurations */}
              {[1, 2, 3].map(tier => {
                const tierKey = `tier${tier}`;
                const label = TIER_LABELS[tierKey];
                const testResult = testResults[tierKey];

                return (
                  <div key={tier} className="router-config-tier">
                    <div className="tier-header">
                      <h3>{label.name}</h3>
                      <span className="tier-description">{label.description}</span>
                    </div>

                    <div className="tier-fields">
                      <div className="tier-field">
                        <label>Tool Name</label>
                        <input
                          type="text"
                          value={config.routing[`tier${tier}_name`] || ''}
                          onChange={(e) => updateTierConfig(tier, 'name', e.target.value)}
                          placeholder="e.g., Copilot, Aider, Claude"
                        />
                      </div>

                      <div className="tier-field tier-field-cmd">
                        <label>Command Template</label>
                        <input
                          type="text"
                          value={config.routing[`tier${tier}_cmd`] || ''}
                          onChange={(e) => updateTierConfig(tier, 'cmd', e.target.value)}
                          placeholder='e.g., gh copilot suggest "{prompt}"'
                        />
                        <span className="tier-field-hint">
                          Use {'{prompt}'} for user input, {'{cwd}'} for directory, {'{branch}'} for git branch
                        </span>
                      </div>

                      <div className="tier-test">
                        <button
                          className="tier-test-btn"
                          onClick={() => testCommand(tier)}
                          disabled={testResult?.loading}
                        >
                          {testResult?.loading ? (
                            <Loader2 className="spinner" size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                          Test
                        </button>

                        {testResult && !testResult.loading && (
                          <div className={`tier-test-result ${testResult.installed ? 'success' : 'error'}`}>
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
                    </div>
                  </div>
                );
              })}

              {/* Context options */}
              <div className="router-config-context">
                <h3>Context Options</h3>
                <p className="context-description">
                  Automatically include terminal context in prompts
                </p>

                <div className="context-options">
                  <label className="context-option">
                    <input
                      type="checkbox"
                      checked={config.context.include_cwd}
                      onChange={(e) => updateContext('include_cwd', e.target.checked)}
                    />
                    <span>Include current working directory</span>
                  </label>

                  <label className="context-option">
                    <input
                      type="checkbox"
                      checked={config.context.include_git_branch}
                      onChange={(e) => updateContext('include_git_branch', e.target.checked)}
                    />
                    <span>Include git branch name</span>
                  </label>

                  <label className="context-option">
                    <input
                      type="checkbox"
                      checked={config.context.include_vision}
                      onChange={(e) => updateContext('include_vision', e.target.checked)}
                    />
                    <span>Include Forge Vision summaries</span>
                  </label>
                </div>
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
                  Save Configuration
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
