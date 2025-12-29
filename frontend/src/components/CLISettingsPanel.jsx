import React, { useState, useEffect } from 'react';
import { Terminal, RefreshCw, Plus, X, Check, AlertCircle } from 'lucide-react';

/**
 * CLISettingsPanel - Manages Copilot CLI and Claude CLI configurations
 * Surfaces underutilized CLI features through the Forge UI
 */
const CLISettingsPanel = ({ onToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [newTrustedFolder, setNewTrustedFolder] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cli/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to load CLI config:', err);
      if (onToast) onToast('Failed to load CLI configuration', 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const saveCopilotConfig = async (updates) => {
    setSaving(true);
    try {
      const res = await fetch('/api/cli/copilot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        // Update local state
        setConfig(prev => ({
          ...prev,
          copilot: { ...prev.copilot, ...updates }
        }));
        if (onToast) onToast('Copilot settings saved!', 'success', 2000);
      } else {
        if (onToast) onToast('Failed to save Copilot settings', 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to save Copilot config:', err);
      if (onToast) onToast('Failed to save settings', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveClaudeConfig = async (updates) => {
    setSaving(true);
    try {
      const res = await fetch('/api/cli/claude/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        setConfig(prev => ({
          ...prev,
          claude: { ...prev.claude, ...updates }
        }));
        if (onToast) onToast('Claude settings saved!', 'success', 2000);
      } else {
        if (onToast) onToast('Failed to save Claude settings', 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to save Claude config:', err);
      if (onToast) onToast('Failed to save settings', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const addTrustedFolder = async () => {
    if (!newTrustedFolder.trim()) return;
    
    try {
      const res = await fetch('/api/cli/copilot/trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: newTrustedFolder.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({
          ...prev,
          copilot: { ...prev.copilot, trusted_folders: data.folders }
        }));
        setNewTrustedFolder('');
        if (onToast) onToast('Folder added to trusted list', 'success', 2000);
      }
    } catch (err) {
      console.error('Failed to add trusted folder:', err);
      if (onToast) onToast('Failed to add folder', 'error', 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
        Loading CLI configuration...
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#f87171',
        background: '#1c1917',
        borderRadius: '8px'
      }}>
        <AlertCircle size={24} style={{ marginBottom: '8px' }} />
        <p>Failed to load CLI configuration</p>
        <button 
          onClick={loadConfig}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            background: '#333',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} style={{ marginRight: '6px' }} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0' }}>
      {/* Copilot CLI Section */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ 
          marginBottom: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          color: config.copilot_installed ? '#fff' : '#888'
        }}>
          <Terminal size={18} style={{ color: '#8b5cf6' }} />
          GitHub Copilot CLI
          {config.copilot_installed ? (
            <span style={{ 
              fontSize: '0.7rem', 
              background: '#22c55e', 
              color: '#000',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '8px'
            }}>
              Installed
            </span>
          ) : (
            <span style={{ 
              fontSize: '0.7rem', 
              background: '#f59e0b', 
              color: '#000',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '8px'
            }}>
              Not Found
            </span>
          )}
        </h4>

        {config.copilot_installed && (
          <>
            {/* Model Selection */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Default Model
              </label>
              <select
                value={config.copilot?.model || ''}
                onChange={(e) => saveCopilotConfig({ model: e.target.value })}
                disabled={saving}
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#0a0a0a', 
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">Auto (CLI default)</option>
                {config.copilot_models?.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              <small style={{ 
                display: 'block', 
                marginTop: '6px', 
                color: '#888', 
                fontSize: '0.75rem' 
              }}>
                This model will be used for all Forge chat requests via Copilot CLI
              </small>
            </div>

            {/* Theme Selection */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Theme
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['auto', 'dark', 'light'].map(theme => (
                  <button
                    key={theme}
                    onClick={() => saveCopilotConfig({ theme })}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: config.copilot?.theme === theme ? '#8b5cf6' : '#333',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            {/* Feature Toggles */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '12px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Features
              </label>
              
              {[
                { key: 'render_markdown', label: 'Render Markdown', desc: 'Format markdown in responses' },
                { key: 'stream', label: 'Streaming', desc: 'Stream responses in real-time' },
                { key: 'parallel_tool_execution', label: 'Parallel Tools', desc: 'Execute multiple tools simultaneously' },
              ].map(feature => (
                <label 
                  key={feature.key}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: '#0a0a0a',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={config.copilot?.[feature.key] !== false}
                    onChange={(e) => saveCopilotConfig({ [feature.key]: e.target.checked })}
                    disabled={saving}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{feature.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>{feature.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Trusted Folders */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '12px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Trusted Folders
              </label>
              
              <div style={{ marginBottom: '12px' }}>
                {config.copilot?.trusted_folders?.length > 0 ? (
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto',
                    background: '#0a0a0a',
                    borderRadius: '6px',
                    padding: '8px'
                  }}>
                    {config.copilot.trusted_folders.map((folder, idx) => (
                      <div 
                        key={idx}
                        style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          fontSize: '0.8rem',
                          color: '#a3a3a3',
                          borderBottom: idx < config.copilot.trusted_folders.length - 1 ? '1px solid #222' : 'none'
                        }}
                      >
                        <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {folder}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '12px', 
                    background: '#0a0a0a', 
                    borderRadius: '6px',
                    color: '#888',
                    fontSize: '0.8rem',
                    textAlign: 'center'
                  }}>
                    No folders trusted yet
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newTrustedFolder}
                  onChange={(e) => setNewTrustedFolder(e.target.value)}
                  placeholder="C:\ProjectsWin or /home/user/projects"
                  onKeyDown={(e) => e.key === 'Enter' && addTrustedFolder()}
                  style={{ 
                    flex: 1,
                    padding: '8px 12px', 
                    borderRadius: '6px', 
                    border: '1px solid #333', 
                    background: '#0a0a0a', 
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  onClick={addTrustedFolder}
                  disabled={!newTrustedFolder.trim()}
                  style={{
                    padding: '8px 12px',
                    background: newTrustedFolder.trim() ? '#22c55e' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: newTrustedFolder.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              <small style={{ 
                display: 'block', 
                marginTop: '8px', 
                color: '#888', 
                fontSize: '0.75rem' 
              }}>
                Copilot CLI will have read/write access to these folders without prompting
              </small>
            </div>
          </>
        )}

        {!config.copilot_installed && (
          <div style={{ 
            background: '#1c1917', 
            border: '1px solid #44403c',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '0.85rem'
          }}>
            <p style={{ marginBottom: '12px' }}>
              GitHub Copilot CLI is not installed. Install it to enable AI-powered terminal assistance.
            </p>
            <code style={{ 
              display: 'block',
              background: '#0a0a0a',
              padding: '10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#a3a3a3'
            }}>
              npm install -g @githubnext/github-copilot-cli
            </code>
          </div>
        )}
      </div>

      {/* Claude CLI Section */}
      <div>
        <h4 style={{ 
          marginBottom: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          color: config.claude_installed ? '#fff' : '#888'
        }}>
          <Terminal size={18} style={{ color: '#f59e0b' }} />
          Claude CLI
          {config.claude_installed ? (
            <span style={{ 
              fontSize: '0.7rem', 
              background: '#22c55e', 
              color: '#000',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '8px'
            }}>
              Installed
            </span>
          ) : (
            <span style={{ 
              fontSize: '0.7rem', 
              background: '#f59e0b', 
              color: '#000',
              padding: '2px 8px',
              borderRadius: '10px',
              marginLeft: '8px'
            }}>
              Not Found
            </span>
          )}
        </h4>

        {config.claude_installed && (
          <>
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Default Model
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {config.claude_models?.map(model => (
                  <button
                    key={model}
                    onClick={() => saveClaudeConfig({ model })}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: config.claude?.model === model ? '#f59e0b' : '#333',
                      border: 'none',
                      borderRadius: '6px',
                      color: config.claude?.model === model ? '#000' : '#fff',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: config.claude?.model === model ? 600 : 400
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
              <small style={{ 
                display: 'block', 
                marginTop: '8px', 
                color: '#888', 
                fontSize: '0.75rem' 
              }}>
                Aliases map to latest model versions (e.g., "sonnet" → claude-sonnet-4-5)
              </small>
            </div>

            {/* Issue #52: Additional Claude CLI Features */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '12px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Claude Code Features
              </label>
              
              {[
                { key: 'auto_approve_read', label: 'Auto-approve read operations', desc: 'Automatically approve file reading without prompting' },
                { key: 'auto_approve_edit', label: 'Auto-approve edit operations', desc: 'Automatically approve file edits (use with caution)' },
                { key: 'auto_approve_bash', label: 'Auto-approve bash commands', desc: 'Automatically run shell commands (use with caution)' },
                { key: 'mcp_enabled', label: 'MCP Protocol Support', desc: 'Enable Model Context Protocol for enhanced tool integration' },
                { key: 'verbose', label: 'Verbose Output', desc: 'Show detailed logs for debugging' },
              ].map(feature => (
                <label 
                  key={feature.key}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: '#0a0a0a',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={config.claude?.[feature.key] === true}
                    onChange={(e) => saveClaudeConfig({ [feature.key]: e.target.checked })}
                    disabled={saving}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{feature.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>{feature.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Max Tokens */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px'
            }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                Max Output Tokens
              </label>
              <input
                type="number"
                value={config.claude?.max_tokens || 16000}
                onChange={(e) => saveClaudeConfig({ max_tokens: parseInt(e.target.value) || 16000 })}
                min={1000}
                max={128000}
                step={1000}
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#0a0a0a', 
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
              <small style={{ 
                display: 'block', 
                marginTop: '6px', 
                color: '#888', 
                fontSize: '0.75rem' 
              }}>
                Maximum tokens for Claude responses (1K-128K). Higher = more detailed but more expensive.
              </small>
            </div>
          </>
        )}

        {!config.claude_installed && (
          <div style={{ 
            background: '#1c1917', 
            border: '1px solid #44403c',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '0.85rem'
          }}>
            <p style={{ marginBottom: '12px' }}>
              Claude CLI is not installed. Install it for Anthropic API access.
            </p>
            <code style={{ 
              display: 'block',
              background: '#0a0a0a',
              padding: '10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#a3a3a3'
            }}>
              npm install -g @anthropic-ai/claude-code
            </code>
          </div>
        )}
      </div>

      {/* Refresh Button */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          onClick={loadConfig}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: '#333',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh Configuration
        </button>
      </div>
    </div>
  );
};

export default CLISettingsPanel;
