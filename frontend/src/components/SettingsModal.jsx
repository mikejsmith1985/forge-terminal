import React, { useState, useEffect } from 'react';
import { Settings, Terminal, Monitor, Monitor as DesktopIcon, Shield, DollarSign, Zap, Brain, Cpu, Play, Download, Loader } from 'lucide-react';
import CLISettingsPanel from './CLISettingsPanel';
import { ClaudeCLICommandsTable } from './ClaudeCLICommands';

const SettingsModal = ({ isOpen, onClose, shellConfig, onSave, onToast, devMode = false, onDevModeChange, amMasterEnabled = true, onAMMasterChange, amDefaultEnabled = true, onAMDefaultChange, initialTab = 'shell', onRestartTour }) => {
  const [config, setConfig] = useState(shellConfig);
  const [wslInfo, setWslInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingShortcut, setCreatingShortcut] = useState(false);
  const [restoringCards, setRestoringCards] = useState(false);
  const [defaultCards, setDefaultCards] = useState([]);
  const [missingCards, setMissingCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [fileAccessMode, setFileAccessMode] = useState('restricted');
  const [activeTab, setActiveTab] = useState(initialTab); // 'shell' or 'budget'
  const [budgetStatus, setBudgetStatus] = useState(null);
  const [budgetConfig, setBudgetConfig] = useState({ budget_limit: 1500, budget_unit: 'credits', renewal_day: 1 });
  const [loadingBudget, setLoadingBudget] = useState(false);
  const [slmInstallStatus, setSlmInstallStatus] = useState(null);
  const [isInstallingSlm, setIsInstallingSlm] = useState(false);
  
  // v3.5.0: SLM Smart Routing state
  const [slmStatus, setSlmStatus] = useState(null);
  const [learningStats, setLearningStats] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);

  // Update activeTab when initialTab prop changes
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen) {
      detectWSL();
      checkMissingCards();
      loadFileAccessMode();
      loadBudgetStatus();
      loadSLMStatus();
      loadSlmInstallStatus();
      if (devMode) {
        loadLearningStats();
        loadOllamaStatus();
      }
    }
  }, [isOpen, devMode]);

  useEffect(() => {
    setConfig(shellConfig);
  }, [shellConfig]);

  const loadBudgetStatus = async () => {
    setLoadingBudget(true);
    try {
      const res = await fetch('/api/llm/budget');
      if (res.ok) {
        const data = await res.json();
        setBudgetStatus(data.status);
        if (data.status) {
          setBudgetConfig({
            budget_limit: data.status.budget_limit,
            budget_unit: data.status.budget_unit,
            renewal_day: data.status.renewal_day
          });
        }
      }
    } catch (err) {
      console.error('Failed to load budget status:', err);
    } finally {
      setLoadingBudget(false);
    }
  };

  // v3.5.0: Load SLM engine status
  const loadSLMStatus = async () => {
    try {
      const res = await fetch('/api/slm/status');
      if (res.ok) {
        const data = await res.json();
        setSlmStatus(data.status);
      }
    } catch (err) {
      console.error('Failed to load SLM status:', err);
    }
  };

  // Load SLM installation status (model + binary)
  const loadSlmInstallStatus = async () => {
    try {
      const res = await fetch('/api/slm/install/status');
      if (res.ok) {
        const data = await res.json();
        setSlmInstallStatus(data);
      }
    } catch (err) {
      console.error('Failed to load SLM install status:', err);
    }
  };

  // Install SLM (model + binary)
  const installSlm = async () => {
    setIsInstallingSlm(true);
    try {
      const res = await fetch('/api/slm/install', { method: 'POST' });
      const data = await res.json();
      
      if (data.ready) {
        onToast?.('🧠 SLM installed successfully! Smart Routing is now active.', 'success', 5000);
        loadSLMStatus();
        loadSlmInstallStatus();
      } else {
        const modelStatus = data.model?.status;
        const binaryStatus = data.binary?.status;
        if (modelStatus === 'error' || binaryStatus === 'error') {
          const errorMsg = data.model?.message || data.binary?.message || 'Unknown error';
          onToast?.(`⚠️ SLM installation issue: ${errorMsg}`, 'error', 7000);
        }
      }
    } catch (err) {
      console.error('Failed to install SLM:', err);
      onToast?.('❌ Failed to install SLM: ' + err.message, 'error', 5000);
    } finally {
      setIsInstallingSlm(false);
      loadSlmInstallStatus();
    }
  };

  // v3.5.0: Load learning statistics
  const loadLearningStats = async () => {
    try {
      const res = await fetch('/api/slm/learning');
      if (res.ok) {
        const data = await res.json();
        setLearningStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load learning stats:', err);
    }
  };

  // v3.5.0: Load Ollama status
  const loadOllamaStatus = async () => {
    try {
      const res = await fetch('/api/ollama/status');
      if (res.ok) {
        const data = await res.json();
        setOllamaStatus(data);
      }
    } catch (err) {
      console.error('Failed to load Ollama status:', err);
    }
  };

  // v3.5.0: Clear learning data
  const clearLearningData = async () => {
    if (!confirm('Are you sure you want to clear all learning data? This cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch('/api/slm/learning/clear', { method: 'DELETE' });
      if (res.ok) {
        setLearningStats({ total_samples: 0, accuracy_rate: 0 });
        if (onToast) onToast('Learning data cleared', 'success', 3000);
      }
    } catch (err) {
      console.error('Failed to clear learning data:', err);
      if (onToast) onToast('Failed to clear learning data', 'error', 3000);
    }
  };

  const saveBudgetConfig = async () => {
    try {
      const res = await fetch('/api/llm/budget/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setBudgetStatus(data);
        if (onToast) onToast('Budget configuration saved!', 'success', 3000);
      } else {
        if (onToast) onToast('Failed to save budget config', 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to save budget config:', err);
      if (onToast) onToast('Failed to save budget config', 'error', 3000);
    }
  };

  const checkMissingCards = async () => {
    try {
      // Get default cards from the backend
      const defaultCardsData = [
        { id: 1, description: '🤖 Run Claude Code' },
        { id: 2, description: '📝 Design Command' },
        { id: 3, description: '⚡ Execute Command' },
        { id: 4, description: '🛑 F*** THIS!' },
        { id: 5, description: '📖 Summarize Last Session' },
      ];
      setDefaultCards(defaultCardsData);
      
      // Get current commands
      const res = await fetch('/api/commands');
      const currentCommands = await res.json();
      const currentIds = new Set(currentCommands.map(c => c.id));
      
      // Find missing defaults
      const missing = defaultCardsData.filter(d => !currentIds.has(d.id));
      setMissingCards(missing);
      setSelectedCards(missing.map(c => c.id)); // Select all by default
    } catch (err) {
      console.error('Failed to check missing cards:', err);
    }
  };

  const loadFileAccessMode = async () => {
    try {
      const res = await fetch('/api/files/access-mode');
      const data = await res.json();
      setFileAccessMode(data.mode || 'restricted');
    } catch (err) {
      console.error('Failed to load file access mode:', err);
    }
  };

  const handleRestoreDefaultCards = async () => {
    // If no cards selected (all present), restore all defaults
    const cardsToRestore = selectedCards.length > 0 ? selectedCards : defaultCards.map(c => c.id);
    
    if (cardsToRestore.length === 0) {
      if (onToast) onToast('No cards to restore', 'warning', 3000);
      return;
    }
    
    setRestoringCards(true);
    try {
      const res = await fetch('/api/commands/restore-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandIds: cardsToRestore })
      });
      const data = await res.json();
      
      if (data.success) {
        if (onToast) onToast(`Restored ${data.restored} default card(s)!`, 'success', 3000);
        // Reload in same tab to refresh commands
        window.location.href = window.location.href;
      } else {
        if (onToast) onToast('Failed to restore cards', 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to restore default cards:', err);
      if (onToast) onToast('Failed to restore default cards', 'error', 3000);
    } finally {
      setRestoringCards(false);
    }
  };

  const detectWSL = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wsl/detect');
      const data = await res.json();
      setWslInfo(data);
      
      // Auto-fill distro if not set and WSL is available
      if (data.available && !config.wslDistro && data.distros.length > 0) {
        setConfig(prev => ({
          ...prev,
          wslDistro: data.distros[0],
          wslHomePath: data.defaultHome || ''
        }));
      }
    } catch (err) {
      console.error('Failed to detect WSL:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Save file access mode
    try {
      await fetch('/api/files/access-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: fileAccessMode })
      });
      localStorage.setItem('fileAccessMode', fileAccessMode);
      localStorage.setItem('fileAccessModeSet', 'true');
    } catch (err) {
      console.error('Failed to save file access mode:', err);
      if (onToast) onToast('Failed to save file access mode', 'error', 3000);
    }
    
    onSave(config);
    onClose();
  };

  const handleCreateDesktopShortcut = async () => {
    setCreatingShortcut(true);
    try {
      const res = await fetch('/api/desktop-shortcut', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (onToast) onToast('Desktop shortcut created!', 'success', 3000);
      } else {
        if (onToast) onToast('Failed: ' + data.error, 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to create desktop shortcut:', err);
      if (onToast) onToast('Failed to create desktop shortcut', 'error', 3000);
    } finally {
      setCreatingShortcut(false);
    }
  };

  if (!isOpen) return null;

  // Helper to get health status color
  const getHealthColor = (health) => {
    switch (health) {
      case 'healthy': return '#22c55e';
      case 'warning': return '#f59e0b';
      case 'critical': return '#ef4444';
      case 'exhausted': return '#dc2626';
      default: return '#888';
    }
  };

  // Budget tab content
  const renderBudgetTab = () => (
    <div style={{ padding: '10px 0' }}>
      <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Brain size={18} style={{ color: '#8b5cf6' }} />
        Intelligence & Budget
      </h4>

      {loadingBudget ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Loading budget status...
        </div>
      ) : budgetStatus ? (
        <>
          {/* Budget Progress Bar */}
          <div style={{ 
            background: 'var(--bg-secondary)', 
            borderRadius: '12px', 
            padding: '16px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 500 }}>Monthly Budget</span>
              <span style={{ color: getHealthColor(budgetStatus.health) }}>
                {budgetStatus.health === 'healthy' && '✓ Healthy'}
                {budgetStatus.health === 'warning' && '⚠ Warning'}
                {budgetStatus.health === 'critical' && '🔴 Critical'}
                {budgetStatus.health === 'exhausted' && '⛔ Exhausted'}
              </span>
            </div>
            
            <div style={{ 
              background: '#333', 
              borderRadius: '8px', 
              height: '24px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}>
              <div style={{ 
                background: `linear-gradient(90deg, ${getHealthColor(budgetStatus.health)}, ${getHealthColor(budgetStatus.health)}88)`,
                height: '100%',
                width: `${Math.min(100, budgetStatus.percent_used)}%`,
                transition: 'width 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: budgetStatus.percent_used > 50 ? '#fff' : 'transparent'
              }}>
                {budgetStatus.percent_used.toFixed(0)}%
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#888' }}>
              <span>
                {budgetStatus.current_usage.toFixed(2)} / {budgetStatus.budget_limit.toFixed(0)} {budgetStatus.budget_unit}
              </span>
              <span>
                Day {budgetStatus.days_elapsed} of ~30 ({budgetStatus.time_progress.toFixed(0)}%)
              </span>
            </div>
          </div>

          {/* Budget Configuration */}
          <div style={{ 
            background: 'var(--bg-secondary)', 
            borderRadius: '12px', 
            padding: '16px',
            marginBottom: '16px'
          }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500 }}>
              Budget Configuration
            </label>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '0.8rem', color: '#888', display: 'block', marginBottom: '4px' }}>
                  Monthly Limit
                </label>
                <input
                  type="number"
                  value={budgetConfig.budget_limit}
                  onChange={(e) => setBudgetConfig({ ...budgetConfig, budget_limit: parseFloat(e.target.value) || 0 })}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    borderRadius: '6px', 
                    border: '1px solid #333', 
                    background: '#0a0a0a', 
                    color: '#fff' 
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: '#888', display: 'block', marginBottom: '4px' }}>
                  Unit
                </label>
                <select
                  value={budgetConfig.budget_unit}
                  onChange={(e) => setBudgetConfig({ ...budgetConfig, budget_unit: e.target.value })}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    borderRadius: '6px', 
                    border: '1px solid #333', 
                    background: '#0a0a0a', 
                    color: '#fff' 
                  }}
                >
                  <option value="credits">Credits (Copilot)</option>
                  <option value="usd">USD (Anthropic)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: '#888', display: 'block', marginBottom: '4px' }}>
                Renewal Day (1-28)
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={budgetConfig.renewal_day}
                onChange={(e) => setBudgetConfig({ ...budgetConfig, renewal_day: parseInt(e.target.value) || 1 })}
                style={{ 
                  width: '100px', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#0a0a0a', 
                  color: '#fff' 
                }}
              />
            </div>

            {/* Issue #52: Allow setting current spend for mid-cycle setup */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: '#888', display: 'block', marginBottom: '4px' }}>
                Current Spend (for mid-cycle setup)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={budgetConfig.current_spend || budgetStatus?.current_usage || 0}
                onChange={(e) => setBudgetConfig({ ...budgetConfig, current_spend: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                style={{ 
                  width: '150px', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#0a0a0a', 
                  color: '#fff' 
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                If you're setting this up mid-cycle, enter your current spend to track remaining budget correctly.
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={saveBudgetConfig}
              style={{ width: '100%' }}
            >
              <DollarSign size={16} style={{ marginRight: '6px' }} />
              Save Budget Configuration
            </button>
          </div>

          {/* Smart Routing - v3.9.1 Simplified */}
          <div style={{ 
            background: 'var(--bg-secondary)', 
            borderRadius: '12px', 
            padding: '16px'
          }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Smart Routing (Requires Ollama)
            </label>
            
            <div style={{ 
              background: 'var(--bg-tertiary)', 
              borderRadius: '8px', 
              padding: '12px',
              fontSize: '0.85rem',
              lineHeight: '1.6',
              color: 'var(--text-secondary)'
            }}>
              {/* Honest explanation */}
              <div style={{ marginBottom: '12px' }}>
                Smart Routing uses a local AI to analyze prompts and suggest appropriate models.
                Install Ollama (free) to enable this feature.
              </div>
              
              {/* SLM Status indicator visible to all users */}
              <div style={{ 
                marginTop: '12px',
                padding: '12px',
                background: slmStatus?.active_provider === 'ollama' || slmStatus?.active_provider === 'llama-cpp' ? 'rgba(5, 46, 22, 0.3)' : 
                           'var(--bg-tertiary)',
                border: `1px solid ${slmStatus?.active_provider === 'ollama' || slmStatus?.active_provider === 'llama-cpp' ? '#22c55e' : 
                                    'var(--border-color)'}`,
                borderRadius: '8px',
                fontSize: '0.85rem'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <Brain size={16} />
                  Smart Routing Status
                </div>
                
                {/* Status Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <span>Engine:</span>
                  <span style={{ color: slmStatus?.active_provider === 'disabled' ? '#888' : '#22c55e' }}>
                    {slmStatus?.active_provider === 'disabled' && '⏸️ Not Installed'}
                    {slmStatus?.active_provider === 'ollama' && '🧠 Ollama (Active)'}
                    {slmStatus?.active_provider === 'llama-cpp' && '🧠 Embedded SLM (Active)'}
                    {slmStatus?.active_provider === 'embedded' && '🧠 Embedded SLM'}
                    {!slmStatus && '⏳ Checking...'}
                  </span>
                </div>

                {/* Installation Status */}
                {slmInstallStatus && (
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '0.8rem' }}>
                    <span style={{ color: slmInstallStatus.model_exists ? '#22c55e' : '#888' }}>
                      {slmInstallStatus.model_exists ? '✓' : '○'} Model
                      {slmInstallStatus.model_size_mb ? ` (${slmInstallStatus.model_size_mb}MB)` : ''}
                    </span>
                    <span style={{ color: slmInstallStatus.binary_exists ? '#22c55e' : '#888' }}>
                      {slmInstallStatus.binary_exists ? '✓' : '○'} Runtime
                    </span>
                  </div>
                )}

                {/* Install Button - show when SLM not ready */}
                {slmInstallStatus && !slmInstallStatus.ready && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={installSlm}
                      disabled={isInstallingSlm}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        background: isInstallingSlm ? '#333' : 'linear-gradient(135deg, #667eea, #764ba2)',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: isInstallingSlm ? 'wait' : 'pointer',
                        width: '100%',
                        justifyContent: 'center'
                      }}
                    >
                      {isInstallingSlm ? (
                        <>
                          <Loader size={16} className="spin" />
                          Installing Smart Routing (~150MB)...
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          Install Smart Routing (Free, ~150MB)
                        </>
                      )}
                    </button>
                    <p style={{ fontSize: '0.7rem', color: '#888', marginTop: '8px', textAlign: 'center' }}>
                      Downloads SmolLM2-135M model + llama.cpp runtime. One-time setup.
                    </p>
                  </div>
                )}

                {/* Already ready - show active status */}
                {slmInstallStatus?.ready && slmStatus?.active_provider !== 'ollama' && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    background: '#052e16', 
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#22c55e'
                  }}>
                    ✓ Smart Routing is active! Prompts are analyzed locally before being sent to your AI model.
                  </div>
                )}

                {/* Ollama alternative */}
                {slmStatus?.active_provider === 'disabled' && !slmInstallStatus?.ready && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
                      Or install Ollama for faster local AI analysis:
                    </div>
                    <button
                      onClick={() => {
                        // Open Ollama download page - the installer is simple and quick
                        window.open('https://ollama.ai/download', '_blank');
                        onToast?.('Opening Ollama download page. After installing, run: ollama pull qwen2.5:0.5b', 'info', 7000);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        background: 'transparent',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        color: '#3b82f6',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center'
                      }}
                    >
                      <Download size={14} />
                      Install Ollama (Recommended)
                    </button>
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '10px', 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '6px' }}>
                        After installing Ollama, run this command to download a model:
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <code style={{ 
                          flex: 1,
                          padding: '8px',
                          background: '#1a1a1a',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          color: '#22c55e',
                          fontFamily: 'monospace'
                        }}>
                          ollama pull qwen2.5:0.5b
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('ollama pull qwen2.5:0.5b');
                            onToast?.('Command copied to clipboard!', 'success', 2000);
                          }}
                          style={{
                            padding: '8px',
                            background: '#333',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '0.7rem'
                          }}
                          title="Copy command"
                        >
                          📋
                        </button>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '8px' }}>
                        <strong>Recommended:</strong> qwen2.5:0.5b (~400MB) - Fast, efficient, perfect for routing<br/>
                        <strong>Alternative:</strong> qwen2.5:1.5b (~1GB) - More accurate but slower<br/>
                        <strong>Low RAM?</strong> tinyllama (~600MB) - Works on older machines
                      </div>
                    </div>
                  </div>
                )}

                {/* Show Ollama install option even when embedded SLM is ready */}
                {slmInstallStatus?.ready && slmStatus?.active_provider !== 'ollama' && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={() => {
                        window.open('https://ollama.ai/download', '_blank');
                        onToast?.('Opening Ollama download page. After installing, run: ollama pull qwen2.5:0.5b', 'info', 7000);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        background: 'transparent',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#888',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Download size={12} />
                      Upgrade to Ollama (faster, more models)
                    </button>
                  </div>
                )}

                {learningStats?.total_samples > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginTop: '8px', fontSize: '0.8rem' }}>
                    <span>Learning Samples:</span>
                    <span>{learningStats.total_samples}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* v3.5.0: Smart Routing Engine (Dev Mode only) */}
          {devMode && (
            <div style={{ 
              background: '#1a1a1a', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid #8b5cf6'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Brain size={16} style={{ color: '#8b5cf6' }} />
                <span style={{ fontWeight: 500, color: '#8b5cf6' }}>🧪 Smart Routing Engine (Beta)</span>
              </div>

              {/* Engine Status */}
              <div style={{ fontSize: '0.85rem', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#888' }}>Active Provider:</span>
                  <span style={{ color: '#22c55e' }}>
                    {slmStatus?.active_provider === 'heuristic' && '📊 Heuristic (Rule-based)'}
                    {slmStatus?.active_provider === 'ollama' && '🦙 Ollama (Local AI)'}
                    {slmStatus?.active_provider === 'embedded' && '🧠 Embedded SLM'}
                    {!slmStatus && '⏳ Loading...'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#888' }}>Model:</span>
                  <span>{slmStatus?.model_id || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#888' }}>Analyses:</span>
                  <span>{slmStatus?.total_analyses || 0}</span>
                </div>
              </div>

              {/* Ollama Status */}
              <div style={{ 
                background: ollamaStatus?.available ? '#052e16' : '#1c1917',
                border: `1px solid ${ollamaStatus?.available ? '#22c55e' : '#44403c'}`,
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '0.8rem',
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>
                  {ollamaStatus?.available 
                    ? `🦙 Ollama: ${ollamaStatus.model || 'Available'}`
                    : '🦙 Ollama: Not detected'
                  }
                </span>
                {/* Only suggest installing Ollama if embedded SLM is also not working */}
                {!ollamaStatus?.available && slmStatus?.active_provider !== 'llama-cpp' && (
                  <span style={{ color: '#888', fontSize: '0.75rem' }}>
                    Install for better analysis
                  </span>
                )}
              </div>

              {/* Learning Stats */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 500, marginBottom: '8px', fontSize: '0.85rem' }}>
                  📚 Learning Progress
                </div>
                <div style={{ fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#888' }}>Feedback Samples:</span>
                    <span>{learningStats?.total_samples || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#888' }}>Prediction Accuracy:</span>
                    <span style={{ color: (learningStats?.accuracy_rate || 0) > 0.7 ? '#22c55e' : '#f59e0b' }}>
                      {learningStats?.total_samples > 0 
                        ? `${(learningStats.accuracy_rate * 100).toFixed(0)}%`
                        : 'N/A'
                      }
                    </span>
                  </div>
                  {learningStats?.last_updated && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#888' }}>Last Updated:</span>
                      <span style={{ fontSize: '0.75rem' }}>
                        {new Date(learningStats.last_updated).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { loadSLMStatus(); loadLearningStats(); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={clearLearningData}
                  disabled={!learningStats?.total_samples}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: learningStats?.total_samples ? '#7f1d1d' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: learningStats?.total_samples ? '#fca5a5' : '#666',
                    fontSize: '0.8rem',
                    cursor: learningStats?.total_samples ? 'pointer' : 'not-allowed'
                  }}
                >
                  🗑️ Clear Data
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ 
          background: '#422006', 
          border: '1px solid #f97316',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '0.85em'
        }}>
          ⚠️ Failed to load budget status. The ledger may not be initialized.
        </div>
      )}
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '550px' }}>
        <div className="modal-header">
          <h3><Settings size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} /> Settings</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid #333',
          padding: '0 16px'
        }}>
          <button
            onClick={() => setActiveTab('shell')}
            style={{ 
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'shell' ? '#fff' : '#888',
              borderBottom: activeTab === 'shell' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Terminal size={16} />
            Shell
          </button>
          <button
            onClick={() => setActiveTab('budget')}
            style={{ 
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'budget' ? '#fff' : '#888',
              borderBottom: activeTab === 'budget' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <DollarSign size={16} />
            Intelligence
          </button>
          <button
            onClick={() => setActiveTab('cli')}
            style={{ 
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'cli' ? '#fff' : '#888',
              borderBottom: activeTab === 'cli' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Cpu size={16} />
            CLI
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'claude' ? (
            <ClaudeCLICommandsTable />
          ) : activeTab === 'cli' ? (
            <CLISettingsPanel onToast={onToast} />
          ) : activeTab === 'budget' ? renderBudgetTab() : (
            <>
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#666', 
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>⬇ Scroll for more options ⬇</span>
              </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Default Shell</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className={`btn ${config.shellType === 'cmd' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConfig({ ...config, shellType: 'cmd' })}
                style={{ flex: 1 }}
              >
                <Monitor size={16} style={{ marginRight: '6px' }} />
                CMD
              </button>
              <button
                className={`btn ${config.shellType === 'powershell' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConfig({ ...config, shellType: 'powershell' })}
                style={{ flex: 1 }}
              >
                <Terminal size={16} style={{ marginRight: '6px' }} />
                PowerShell
              </button>
              <button
                className={`btn ${config.shellType === 'wsl' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConfig({ ...config, shellType: 'wsl' })}
                disabled={!wslInfo?.available}
                style={{ flex: 1 }}
                title={wslInfo?.available ? 'Windows Subsystem for Linux' : 'WSL not available'}
              >
                🐧 WSL
              </button>
            </div>
          </div>

          {config.shellType === 'wsl' && (
            <>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>WSL Distribution</label>
                {loading ? (
                  <p style={{ color: '#888' }}>Detecting WSL distributions...</p>
                ) : wslInfo?.available ? (
                  <select
                    value={config.wslDistro}
                    onChange={(e) => setConfig({ ...config, wslDistro: e.target.value })}
                    className="form-control"
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      borderRadius: '6px', 
                      border: '1px solid #333', 
                      background: '#1a1a1a', 
                      color: '#fff' 
                    }}
                  >
                    {wslInfo.distros.map(distro => (
                      <option key={distro} value={distro}>{distro}</option>
                    ))}
                  </select>
                ) : (
                  <p style={{ color: '#f87171' }}>{wslInfo?.reason || 'WSL not available'}</p>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Linux Home Directory</label>
                <input
                  type="text"
                  value={config.wslHomePath}
                  onChange={(e) => setConfig({ ...config, wslHomePath: e.target.value })}
                  placeholder={wslInfo?.defaultHome || '/home/username'}
                  className="form-control"
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    borderRadius: '6px', 
                    border: '1px solid #333', 
                    background: '#1a1a1a', 
                    color: '#fff' 
                  }}
                />
                <small style={{ color: '#888', fontSize: '0.8em' }}>
                  Leave empty to use ~ (auto-detected: {wslInfo?.defaultHome || 'unknown'})
                </small>
              </div>
            </>
          )}

          {config.shellType === 'cmd' && (
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Home Directory</label>
              <input
                type="text"
                value={config.cmdHomePath || ''}
                onChange={(e) => setConfig({ ...config, cmdHomePath: e.target.value })}
                placeholder="e.g., C:\ProjectsWin"
                className="form-control"
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#1a1a1a', 
                  color: '#fff' 
                }}
              />
              <small style={{ color: '#888', fontSize: '0.8em' }}>
                Windows CMD default working directory (e.g., C:\ProjectsWin)
              </small>
            </div>
          )}

          {config.shellType === 'powershell' && (
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Home Directory</label>
              <input
                type="text"
                value={config.psHomePath || ''}
                onChange={(e) => setConfig({ ...config, psHomePath: e.target.value })}
                placeholder="e.g., C:\ProjectsWin"
                className="form-control"
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  background: '#1a1a1a', 
                  color: '#fff' 
                }}
              />
              <small style={{ color: '#888', fontSize: '0.8em' }}>
                PowerShell default working directory (e.g., C:\ProjectsWin)
              </small>
            </div>
          )}

          <div style={{ 
            background: '#262626', 
            padding: '12px', 
            borderRadius: '8px', 
            marginTop: '15px',
            fontSize: '0.9em',
            color: '#a3a3a3'
          }}>
            💡 Changing shell will end the current terminal session.
          </div>

          {/* Desktop Shortcut Section */}
          <div style={{ 
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #333'
          }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Installation</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCreateDesktopShortcut}
                disabled={creatingShortcut}
                style={{ flex: 1 }}
              >
                <DesktopIcon size={16} style={{ marginRight: '6px' }} />
                {creatingShortcut ? 'Creating...' : 'Desktop Shortcut'}
              </button>
              {onRestartTour && (
                <button
                  className="btn btn-secondary"
                  onClick={onRestartTour}
                  style={{ flex: 1 }}
                >
                  <Play size={16} style={{ marginRight: '6px' }} />
                  Replay Tour
                </button>
              )}
            </div>
            <small style={{ 
              display: 'block', 
              marginTop: '8px', 
              color: '#888', 
              fontSize: '0.8em' 
            }}>
              Create a desktop shortcut or replay the feature tour
            </small>
          </div>

          {/* Restore Default Cards Section - Always show */}
          <div style={{ 
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #333'
          }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500 }}>
              Restore Default Command Cards
            </label>
            
            {missingCards.length > 0 ? (
              <>
                <div style={{ 
                  background: '#422006', 
                  border: '1px solid #f97316',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  fontSize: '0.85em'
                }}>
                  <strong>⚠ Missing {missingCards.length} default card(s)</strong>
                  <br />
                  <span style={{ color: '#fed7aa' }}>
                    Select which default cards you want to restore:
                  </span>
                </div>
                
                {missingCards.map(card => (
                  <label 
                    key={card.id}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: '#1a1a1a',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCards.includes(card.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCards([...selectedCards, card.id]);
                        } else {
                          setSelectedCards(selectedCards.filter(id => id !== card.id));
                        }
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>{card.description}</span>
                  </label>
                ))}
                
                <button
                  className="btn btn-primary"
                  onClick={handleRestoreDefaultCards}
                  disabled={restoringCards || selectedCards.length === 0}
                  style={{ width: '100%', marginTop: '10px' }}
                >
                  {restoringCards ? 'Restoring...' : `Restore ${selectedCards.length} Card(s)`}
                </button>
              </>
            ) : (
              <>
                <div style={{ 
                  background: '#1a2e1a', 
                  border: '1px solid #22c55e',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  fontSize: '0.85em',
                  color: '#86efac'
                }}>
                  ✓ All default cards are present
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handleRestoreDefaultCards}
                  disabled={restoringCards}
                  style={{ width: '100%' }}
                >
                  {restoringCards ? 'Restoring...' : 'Restore All Default Cards'}
                </button>
                <small style={{ 
                  display: 'block', 
                  marginTop: '8px', 
                  color: '#888', 
                  fontSize: '0.8em' 
                }}>
                  Re-add all default command cards if you've deleted them
                </small>
              </>
            )}
          </div>

          {/* DevMode Toggle */}
          <div className="form-group" style={{ marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #333' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="devMode"
                checked={devMode}
                onChange={(e) => {
                  if (onDevModeChange) {
                    onDevModeChange(e.target.checked);
                  }
                }}
                style={{ cursor: 'pointer', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: 500, userSelect: 'none' }}>
                Dev Mode
              </span>
              <span style={{ fontSize: '0.85em', color: '#888', marginLeft: '4px' }}>
                (Show experimental features)
              </span>
            </label>
          </div>

          {/* AM Master Control - Global Kill Switch */}
          <div className="form-group" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #333' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
              <input
                type="checkbox"
                name="amMasterEnabled"
                checked={amMasterEnabled}
                onChange={(e) => {
                  if (onAMMasterChange) {
                    onAMMasterChange(e.target.checked);
                  }
                }}
                style={{ cursor: 'pointer', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: 600, userSelect: 'none' }}>
                Master AM Control
              </span>
              <span style={{ fontSize: '0.85em', color: '#888', marginLeft: '4px' }}>
                (Enable/disable AM system globally)
              </span>
            </label>
            
            {amMasterEnabled && (
              <div style={{ 
                background: '#1a2e1a', 
                border: '1px solid #22c55e',
                borderRadius: '8px',
                padding: '10px 12px',
                marginTop: '8px',
                fontSize: '0.85em',
                color: '#86efac'
              }}>
                ✓ AM System Active - Logging enabled across all tabs
              </div>
            )}
            
            {!amMasterEnabled && (
              <div style={{ 
                background: '#422006', 
                border: '1px solid #f97316',
                borderRadius: '8px',
                padding: '10px 12px',
                marginTop: '8px',
                fontSize: '0.85em',
                color: '#fed7aa'
              }}>
                ⚠️ AM System Disabled - No logging on any tab
              </div>
            )}
          </div>

          {/* AM Default Toggle - Only show if Master is ON */}
          {amMasterEnabled && (
            <div className="form-group" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #333' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="amDefaultEnabled"
                  checked={amDefaultEnabled}
                  onChange={(e) => {
                    if (onAMDefaultChange) {
                      onAMDefaultChange(e.target.checked);
                    }
                  }}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 500, userSelect: 'none' }}>
                  Enable AM Logging by Default
                </span>
                <span style={{ fontSize: '0.85em', color: '#888', marginLeft: '4px' }}>
                  (For legal compliance & disaster recovery)
                </span>
              </label>
              <small style={{ 
                display: 'block', 
                marginTop: '8px', 
                marginLeft: '28px',
                color: '#888', 
                fontSize: '0.8em',
                lineHeight: '1.4'
              }}>
                When enabled, new tabs will have AM logging ON by default. You can still toggle individual tabs via right-click.
                {!amDefaultEnabled && (
                  <strong style={{ color: '#f97316', display: 'block', marginTop: '4px' }}>
                    ⚠️ Disabling may compromise legal compliance
                  </strong>
                )}
              </small>
            </div>
          )}

          {/* File Access Security - Now inside modal-body for proper scrolling */}
          <div className="form-group" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px solid #333' }}>
            <h4 style={{ marginBottom: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} />
              File Access Security
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start',
                padding: '12px',
                border: `2px solid ${fileAccessMode === 'restricted' ? '#8b5cf6' : '#333'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                background: fileAccessMode === 'restricted' ? '#1e1b4b' : 'transparent'
              }}>
                <input
                  type="radio"
                  name="fileAccessMode"
                  value="restricted"
                  checked={fileAccessMode === 'restricted'}
                  onChange={(e) => setFileAccessMode(e.target.value)}
                  style={{ marginTop: '2px', marginRight: '10px', cursor: 'pointer' }}
                />
                <div>
                  <strong>Project-Scoped (Recommended)</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', color: '#aaa' }}>
                    Only access files within terminal's working directory
                  </p>
                </div>
              </label>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start',
                padding: '12px',
                border: `2px solid ${fileAccessMode === 'unrestricted' ? '#8b5cf6' : '#333'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                background: fileAccessMode === 'unrestricted' ? '#1e1b4b' : 'transparent'
              }}>
                <input
                  type="radio"
                  name="fileAccessMode"
                  value="unrestricted"
                  checked={fileAccessMode === 'unrestricted'}
                  onChange={(e) => setFileAccessMode(e.target.value)}
                  style={{ marginTop: '2px', marginRight: '10px', cursor: 'pointer' }}
                />
                <div>
                  <strong>Full System Access</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', color: '#aaa' }}>
                    Access any file your user account can read
                  </p>
                </div>
              </label>
            </div>
            
            <p style={{ marginTop: '12px', fontSize: '0.85em', color: '#888', fontStyle: 'italic' }}>
              Used by the File Explorer and Monaco Editor. Changes apply immediately.
            </p>
          </div>
          </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Restart Terminal</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
