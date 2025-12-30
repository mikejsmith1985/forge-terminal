import React, { useState, useEffect } from 'react';
import { Terminal, RefreshCw, Plus, X, Check, AlertCircle, Copy, Zap, Command, BookOpen, Shield, Settings2, Hash, Users } from 'lucide-react';

/**
 * CLISettingsPanel - Manages Copilot CLI and Claude CLI configurations
 * Surfaces underutilized CLI features through the Forge UI
 */
const CLISettingsPanel = ({ onToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [newTrustedFolder, setNewTrustedFolder] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [showAdvancedClaude, setShowAdvancedClaude] = useState(false);
  const [showCopilotSlashCommands, setShowCopilotSlashCommands] = useState(false);
  const [showAdvancedCopilot, setShowAdvancedCopilot] = useState(false);
  const [newAllowedTool, setNewAllowedTool] = useState('');
  const [newDisallowedTool, setNewDisallowedTool] = useState('');
  const [newCopilotAllowedTool, setNewCopilotAllowedTool] = useState('');

  // Copilot CLI slash commands reference
  const copilotSlashCommands = [
    { cmd: '/help', desc: 'Show all available commands and usage', category: 'info' },
    { cmd: '/model', desc: 'Switch AI model (gpt-4o, claude-sonnet, etc.)', category: 'model' },
    { cmd: '/clear', desc: 'Clear conversation history', category: 'session' },
    { cmd: '/usage', desc: 'Show token usage and premium request stats', category: 'info' },
    { cmd: '/explain', desc: 'Explain selected or current code', category: 'coding' },
    { cmd: '/fix', desc: 'Propose fixes for code issues', category: 'coding' },
    { cmd: '/tests', desc: 'Generate unit tests for code', category: 'coding' },
    { cmd: '/new', desc: 'Start a new project', category: 'project' },
    { cmd: '/delete', desc: 'Delete current conversation', category: 'session' },
  ];

  // Copilot context variables
  const copilotContextVars = [
    { var: '#file', desc: 'Include entire file content' },
    { var: '#selection', desc: 'Include selected text' },
    { var: '#block', desc: 'Current code block' },
    { var: '#function', desc: 'Current function/method' },
    { var: '#class', desc: 'Current class' },
    { var: '#line', desc: 'Current line' },
    { var: '#path', desc: 'File path' },
    { var: '#project', desc: 'Project/workspace context' },
    { var: '#sym', desc: 'Current symbol' },
  ];

  // Claude slash commands reference
  const slashCommands = [
    { cmd: '/help', desc: 'Show all available commands', category: 'info' },
    { cmd: '/model', desc: 'Switch AI model mid-session', category: 'model' },
    { cmd: '/clear', desc: 'Clear conversation history', category: 'session' },
    { cmd: '/compact', desc: 'Compress context to save tokens', category: 'session' },
    { cmd: '/compact [focus]', desc: 'Compress with focus on specific topic', category: 'session' },
    { cmd: '/config', desc: 'View/edit settings', category: 'config' },
    { cmd: '/cost', desc: 'Show token usage and cost', category: 'info' },
    { cmd: '/doctor', desc: 'Check Claude Code health', category: 'info' },
    { cmd: '/init', desc: 'Initialize CLAUDE.md in project', category: 'project' },
    { cmd: '/memory', desc: 'Edit CLAUDE.md memory file', category: 'project' },
    { cmd: '/permissions', desc: 'View/manage tool permissions', category: 'security' },
    { cmd: '/review', desc: 'Request code review', category: 'coding' },
    { cmd: '/vim', desc: 'Enter vim mode for editing', category: 'editing' },
  ];

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

  // Copy command to clipboard
  const copyCommand = (cmd) => {
    navigator.clipboard.writeText(cmd);
    if (onToast) onToast(`Copied: ${cmd}`, 'success', 1500);
  };

  // Create a command card from a CLI command
  const createCommandCard = async (name, command, description) => {
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          description: description,
          command: command,
          category: 'claude',
          icon: '🤖'
        })
      });
      if (res.ok) {
        if (onToast) onToast(`Command card "${name}" created!`, 'success', 3000);
      } else {
        if (onToast) onToast('Failed to create command card', 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to create command card:', err);
      if (onToast) onToast('Failed to create command card', 'error', 3000);
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

            {/* Copilot Slash Commands Reference */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <button
                onClick={() => setShowCopilotSlashCommands(!showCopilotSlashCommands)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                  <Command size={16} style={{ color: '#8b5cf6' }} />
                  Slash Commands & Context Variables
                </span>
                <span style={{ color: '#888' }}>{showCopilotSlashCommands ? '▲' : '▼'}</span>
              </button>
              
              {showCopilotSlashCommands && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '10px' }}>
                    Use these commands inside Copilot CLI interactive sessions. Click to copy.
                  </p>
                  
                  {/* Slash Commands */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '8px', color: '#8b5cf6' }}>
                      Slash Commands
                    </div>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      {copilotSlashCommands.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => copyCommand(item.cmd)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: '#0a0a0a',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <code style={{ 
                              color: '#8b5cf6', 
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              minWidth: '80px'
                            }}>
                              {item.cmd}
                            </code>
                            <span style={{ fontSize: '0.7rem', color: '#888' }}>{item.desc}</span>
                          </div>
                          <Copy size={10} style={{ color: '#666' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Context Variables */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Hash size={14} style={{ color: '#22c55e' }} />
                      Context Variables
                    </div>
                    <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: '8px' }}>
                      Add context to prompts: "Explain #function" or "Fix #selection"
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {copilotContextVars.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => copyCommand(item.var)}
                          title={item.desc}
                          style={{
                            padding: '4px 8px',
                            background: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#22c55e',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                          }}
                        >
                          {item.var}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Launch Commands for Copilot */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                <Zap size={16} style={{ color: '#22c55e' }} />
                Quick Launch Commands
              </label>
              <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '10px' }}>
                Click to copy, or create a command card for quick access from the toolbar.
              </p>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                {[
                  { name: 'Continue Session', cmd: 'copilot --continue', desc: 'Resume your last conversation' },
                  { name: 'Resume Specific', cmd: 'copilot --resume', desc: 'Pick from recent sessions' },
                  { name: 'Quick Question', cmd: 'copilot -p "your question"', desc: 'One-off prompt, no session' },
                  { name: 'Explain Code', cmd: 'copilot -p "explain this code"', desc: 'Code explanation' },
                  { name: 'Fix Errors', cmd: 'copilot -p "fix the errors in this code"', desc: 'Quick debugging help' },
                  { name: 'Generate Tests', cmd: 'copilot -p "generate unit tests"', desc: 'Auto-generate tests' },
                  { name: 'Full Auto Mode', cmd: 'copilot --allow-all-paths', desc: '⚠️ Auto-approve all paths' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: '#0a0a0a',
                      borderRadius: '6px',
                      gap: '10px'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: '2px' }}>{item.name}</div>
                      <code style={{ 
                        fontSize: '0.7rem', 
                        color: '#8b5cf6',
                        fontFamily: 'monospace',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.cmd}
                      </code>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => copyCommand(item.cmd)}
                        title="Copy command"
                        style={{
                          padding: '6px',
                          background: '#333',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#888',
                          cursor: 'pointer'
                        }}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => createCommandCard(item.name, item.cmd, item.desc)}
                        title="Create command card"
                        style={{
                          padding: '6px',
                          background: '#1e40af',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Copilot Settings */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '12px'
            }}>
              <button
                onClick={() => setShowAdvancedCopilot(!showAdvancedCopilot)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                  <Settings2 size={16} style={{ color: '#8b5cf6' }} />
                  Advanced Settings
                </span>
                <span style={{ color: '#888' }}>{showAdvancedCopilot ? '▲' : '▼'}</span>
              </button>
              
              {showAdvancedCopilot && (
                <div style={{ marginTop: '12px' }}>
                  {/* Execution Settings */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 500 }}>
                      Execution Settings
                    </label>
                    {[
                      { key: 'stream', label: 'Streaming Output', desc: 'Show tokens as they arrive (vs. waiting for complete response)' },
                      { key: 'parallel_tool_execution', label: 'Parallel Tool Execution', desc: 'Run multiple tools simultaneously for faster results' },
                      { key: 'screen_reader', label: 'Screen Reader Mode', desc: 'Optimize output for accessibility tools' },
                      { key: 'show_banner', label: 'Show Banner', desc: 'Display Copilot CLI banner at launch' },
                    ].map(feature => (
                      <label 
                        key={feature.key}
                        style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          background: '#0a0a0a',
                          borderRadius: '6px',
                          marginBottom: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={config.copilot?.[feature.key] !== false}
                          onChange={(e) => saveCopilotConfig({ [feature.key]: e.target.checked })}
                          disabled={saving}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.8rem' }}>{feature.label}</div>
                          <div style={{ fontSize: '0.7rem', color: '#888' }}>{feature.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Tool Permissions */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 500 }}>
                      <Shield size={14} style={{ color: '#22c55e' }} />
                      Pre-Allowed Tools
                    </label>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '6px', 
                      marginBottom: '8px',
                      padding: '8px',
                      background: '#0a0a0a',
                      borderRadius: '6px',
                      minHeight: '36px'
                    }}>
                      {(config.copilot?.allowed_tools || []).map((tool, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 6px',
                            background: '#052e16',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            color: '#22c55e'
                          }}
                        >
                          {tool}
                          <X
                            size={10}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              const updated = (config.copilot?.allowed_tools || []).filter((_, i) => i !== idx);
                              saveCopilotConfig({ allowed_tools: updated });
                            }}
                          />
                        </span>
                      ))}
                      {(config.copilot?.allowed_tools || []).length === 0 && (
                        <span style={{ color: '#666', fontSize: '0.7rem' }}>None (will prompt for each tool)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={newCopilotAllowedTool}
                        onChange={(e) => setNewCopilotAllowedTool(e.target.value)}
                        placeholder="e.g., chmod, rm, git"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid #333',
                          background: '#1a1a1a',
                          color: '#fff',
                          fontSize: '0.75rem'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCopilotAllowedTool.trim()) {
                            const updated = [...(config.copilot?.allowed_tools || []), newCopilotAllowedTool.trim()];
                            saveCopilotConfig({ allowed_tools: updated });
                            setNewCopilotAllowedTool('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newCopilotAllowedTool.trim()) {
                            const updated = [...(config.copilot?.allowed_tools || []), newCopilotAllowedTool.trim()];
                            saveCopilotConfig({ allowed_tools: updated });
                            setNewCopilotAllowedTool('');
                          }
                        }}
                        style={{
                          padding: '6px 10px',
                          background: newCopilotAllowedTool.trim() ? '#22c55e' : '#333',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: newCopilotAllowedTool.trim() ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '0.65rem' }}>
                      Tools Copilot can use without asking. Use --allow-tool or --deny-tool flags.
                    </small>
                  </div>

                  {/* MCP Configuration */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 500 }}>
                      <Users size={14} style={{ color: '#f59e0b' }} />
                      MCP (Model Context Protocol)
                    </label>
                    <div style={{ 
                      padding: '10px', 
                      background: '#0a0a0a', 
                      borderRadius: '6px',
                      fontSize: '0.75rem'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={config.copilot?.enable_github_mcp === true}
                          onChange={(e) => saveCopilotConfig({ enable_github_mcp: e.target.checked })}
                          disabled={saving}
                          style={{ width: '14px', height: '14px' }}
                        />
                        <span>Enable all GitHub MCP tools</span>
                      </label>
                      <div style={{ color: '#888', fontSize: '0.7rem' }}>
                        MCP config: <code style={{ color: '#f59e0b' }}>~/.copilot/mcp-config.json</code>
                      </div>
                    </div>
                  </div>

                  {/* Custom Instructions */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
                      Custom Instructions File
                    </label>
                    <div style={{ 
                      padding: '10px', 
                      background: '#0a0a0a', 
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      color: '#888'
                    }}>
                      <div>Store coding conventions and context in:</div>
                      <code style={{ color: '#8b5cf6', display: 'block', marginTop: '4px' }}>
                        .github/copilot-instructions.md
                      </code>
                      <div style={{ marginTop: '6px' }}>For agents and reusable prompts:</div>
                      <code style={{ color: '#8b5cf6', display: 'block', marginTop: '4px' }}>
                        .github/agents/*.md
                      </code>
                    </div>
                  </div>

                  {/* Config File Locations */}
                  <div style={{ 
                    padding: '10px', 
                    background: '#0a0a0a', 
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    color: '#888'
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: '6px', color: '#fff' }}>
                      <BookOpen size={12} style={{ marginRight: '6px' }} />
                      Config File Locations
                    </div>
                    <div>Settings: <code style={{ color: '#8b5cf6' }}>~/.copilot/config.json</code></div>
                    <div>MCP: <code style={{ color: '#8b5cf6' }}>~/.copilot/mcp-config.json</code></div>
                  </div>
                </div>
              )}
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

            {/* Slash Commands Reference */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginTop: '12px'
            }}>
              <button
                onClick={() => setShowSlashCommands(!showSlashCommands)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                  <Command size={16} style={{ color: '#f59e0b' }} />
                  Slash Commands Reference
                </span>
                <span style={{ color: '#888' }}>{showSlashCommands ? '▲' : '▼'}</span>
              </button>
              
              {showSlashCommands && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '10px' }}>
                    Use these commands inside Claude Code interactive sessions. Click to copy.
                  </p>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {slashCommands.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => copyCommand(item.cmd)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: '#0a0a0a',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#1a1a1a'}
                        onMouseOut={(e) => e.currentTarget.style.background = '#0a0a0a'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <code style={{ 
                            color: '#f59e0b', 
                            fontSize: '0.8rem',
                            fontFamily: 'monospace',
                            minWidth: '120px'
                          }}>
                            {item.cmd}
                          </code>
                          <span style={{ fontSize: '0.75rem', color: '#888' }}>{item.desc}</span>
                        </div>
                        <Copy size={12} style={{ color: '#666' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Launch Commands */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginTop: '12px'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px', 
                fontWeight: 500,
                fontSize: '0.9rem'
              }}>
                <Zap size={16} style={{ color: '#22c55e' }} />
                Quick Launch Commands
              </label>
              <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '10px' }}>
                Click to copy, or create a command card for quick access from the toolbar.
              </p>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                {[
                  { name: 'Continue Session', cmd: 'claude --continue', desc: 'Resume your last conversation' },
                  { name: 'Plan Mode', cmd: 'claude --model opus', desc: 'Start with Opus for complex planning' },
                  { name: 'Quick Answer', cmd: 'claude -p "your question"', desc: 'One-off question, no session' },
                  { name: 'Review Code', cmd: 'claude -p "review this code for issues"', desc: 'Quick code review' },
                  { name: 'Explain Error', cmd: 'claude -p "explain this error and how to fix it"', desc: 'Debug assistance' },
                  { name: 'Full Auto Mode', cmd: 'claude --dangerously-skip-permissions', desc: '⚠️ Skip all prompts (careful!)' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: '#0a0a0a',
                      borderRadius: '6px',
                      gap: '10px'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: '2px' }}>{item.name}</div>
                      <code style={{ 
                        fontSize: '0.7rem', 
                        color: '#22c55e',
                        fontFamily: 'monospace',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.cmd}
                      </code>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => copyCommand(item.cmd)}
                        title="Copy command"
                        style={{
                          padding: '6px',
                          background: '#333',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#888',
                          cursor: 'pointer'
                        }}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => createCommandCard(item.name, item.cmd, item.desc)}
                        title="Create command card"
                        style={{
                          padding: '6px',
                          background: '#1e40af',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Settings */}
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginTop: '12px'
            }}>
              <button
                onClick={() => setShowAdvancedClaude(!showAdvancedClaude)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                  <Settings2 size={16} style={{ color: '#8b5cf6' }} />
                  Advanced Settings
                </span>
                <span style={{ color: '#888' }}>{showAdvancedClaude ? '▲' : '▼'}</span>
              </button>
              
              {showAdvancedClaude && (
                <div style={{ marginTop: '12px' }}>
                  {/* Output Format */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
                      Output Format
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['text', 'json', 'stream-json'].map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => saveClaudeConfig({ output_format: fmt })}
                          style={{
                            flex: 1,
                            padding: '8px',
                            background: config.claude?.output_format === fmt ? '#8b5cf6' : '#333',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '0.7rem' }}>
                      Format for non-interactive output. Use stream-json for real-time updates.
                    </small>
                  </div>

                  {/* System Prompt */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
                      Append to System Prompt
                    </label>
                    <textarea
                      value={config.claude?.append_system_prompt || ''}
                      onChange={(e) => saveClaudeConfig({ append_system_prompt: e.target.value })}
                      placeholder="Additional instructions to add to every session..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #333',
                        background: '#0a0a0a',
                        color: '#fff',
                        fontSize: '0.85rem',
                        resize: 'vertical'
                      }}
                    />
                    <small style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '0.7rem' }}>
                      These instructions are added to Claude's system prompt for every session.
                    </small>
                  </div>

                  {/* Permission Tools */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 500 }}>
                      <Shield size={14} style={{ color: '#22c55e' }} />
                      Allowed Tools (auto-approve)
                    </label>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '6px', 
                      marginBottom: '8px',
                      padding: '8px',
                      background: '#0a0a0a',
                      borderRadius: '6px',
                      minHeight: '40px'
                    }}>
                      {(config.claude?.allowed_tools || []).map((tool, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            background: '#052e16',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            color: '#22c55e'
                          }}
                        >
                          {tool}
                          <X
                            size={12}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              const updated = (config.claude?.allowed_tools || []).filter((_, i) => i !== idx);
                              saveClaudeConfig({ allowed_tools: updated });
                            }}
                          />
                        </span>
                      ))}
                      {(config.claude?.allowed_tools || []).length === 0 && (
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>None configured</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={newAllowedTool}
                        onChange={(e) => setNewAllowedTool(e.target.value)}
                        placeholder="e.g., Read, Write, Bash(git *)"
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid #333',
                          background: '#1a1a1a',
                          color: '#fff',
                          fontSize: '0.8rem'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newAllowedTool.trim()) {
                            const updated = [...(config.claude?.allowed_tools || []), newAllowedTool.trim()];
                            saveClaudeConfig({ allowed_tools: updated });
                            setNewAllowedTool('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newAllowedTool.trim()) {
                            const updated = [...(config.claude?.allowed_tools || []), newAllowedTool.trim()];
                            saveClaudeConfig({ allowed_tools: updated });
                            setNewAllowedTool('');
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          background: newAllowedTool.trim() ? '#22c55e' : '#333',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: newAllowedTool.trim() ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '0.7rem' }}>
                      Tools Claude can use without asking. Examples: Read, Write, Bash(git *)
                    </small>
                  </div>

                  {/* Config File Locations */}
                  <div style={{ 
                    padding: '10px', 
                    background: '#0a0a0a', 
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#888'
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: '6px', color: '#fff' }}>
                      <BookOpen size={12} style={{ marginRight: '6px' }} />
                      Config File Locations
                    </div>
                    <div>Global: <code style={{ color: '#f59e0b' }}>~/.claude/settings.json</code></div>
                    <div>Project: <code style={{ color: '#f59e0b' }}>.claude/settings.json</code></div>
                    <div>Local: <code style={{ color: '#f59e0b' }}>.claude/settings.local.json</code></div>
                    <div style={{ marginTop: '6px' }}>
                      Memory: <code style={{ color: '#22c55e' }}>CLAUDE.md</code> in project root
                    </div>
                  </div>
                </div>
              )}
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
