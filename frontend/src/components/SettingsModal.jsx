import React, { useState, useEffect } from 'react';
import { Settings, Terminal, Monitor, Monitor as DesktopIcon, Eye, Shield } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose, shellConfig, onSave, onToast, devMode = false, onDevModeChange, amMasterEnabled = true, onAMMasterChange, amDefaultEnabled = true, onAMDefaultChange, visionConfig, onVisionConfigChange }) => {
  const [config, setConfig] = useState(shellConfig);
  const [wslInfo, setWslInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingShortcut, setCreatingShortcut] = useState(false);
  const [restoringCards, setRestoringCards] = useState(false);
  const [defaultCards, setDefaultCards] = useState([]);
  const [missingCards, setMissingCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [fileAccessMode, setFileAccessMode] = useState('restricted');

  useEffect(() => {
    if (isOpen) {
      detectWSL();
      checkMissingCards();
      loadFileAccessMode();
    }
  }, [isOpen]);

  useEffect(() => {
    setConfig(shellConfig);
  }, [shellConfig]);

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

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3><Settings size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} /> Shell Settings</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
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
            <button
              className="btn btn-secondary"
              onClick={handleCreateDesktopShortcut}
              disabled={creatingShortcut}
              style={{ width: '100%' }}
            >
              <DesktopIcon size={16} style={{ marginRight: '6px' }} />
              {creatingShortcut ? 'Creating...' : 'Create Desktop Shortcut'}
            </button>
            <small style={{ 
              display: 'block', 
              marginTop: '8px', 
              color: '#888', 
              fontSize: '0.8em' 
            }}>
              Add a shortcut to your desktop for quick access
            </small>
          </div>

          {/* Shell Hooks Section */}
          <div style={{ 
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #333'
          }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500 }}>
              Shell Hooks
            </label>

            <div style={{ marginBottom: '12px', color: '#a3a3a3' }}>
              Install optional shell hooks to enable Layer 2 (Shell Hooks) for AM. Hooks add minimal wrapper code to your shell rc to emit events when command cards or CLI commands run.
            </div>

            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  const res = await fetch('/api/am/install-hooks', { method: 'POST' });
                  const data = await res.json();
                  if (data.success) {
                    if (onToast) onToast('Shell hooks installed (or instructions saved)', 'success', 4000);
                  } else {
                    if (onToast) onToast('Failed to install hooks: ' + (data.error || 'unknown'), 'error', 4000);
                  }
                } catch (err) {
                  console.error('Install hooks failed:', err);
                  if (onToast) onToast('Failed to install hooks', 'error', 4000);
                }
              }}
              style={{ width: '100%', marginBottom: '10px' }}
            >
              Install Shell Hooks
            </button>

            <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
              If automatic install is not possible, a script will be saved to <code>~/.forge/install-shell-hooks.sh</code> with instructions.
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

          {/* Vision Configuration - Show when Dev Mode is enabled */}
          {devMode && visionConfig && (
            <div style={{ 
              marginTop: '20px',
              paddingTop: '20px',
              borderTop: '1px solid #333'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                marginBottom: '15px',
                fontWeight: 500 
              }}>
                <Eye size={18} style={{ color: '#10b981' }} />
                <span>Forge Vision Configuration</span>
              </label>
              
              <div style={{ 
                background: '#1a2e1a', 
                border: '1px solid #22c55e',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '15px',
                fontSize: '0.85em',
                color: '#86efac'
              }}>
                ✓ Vision is enabled (Dev Mode active)
              </div>

              {/* Detector Toggles */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '10px',
                  fontSize: '0.9em',
                  color: '#a3a3a3'
                }}>
                  Active Detectors:
                </label>
                
                {[
                  { key: 'json', label: 'JSON Blocks', icon: '{ }' },
                  { key: 'compiler_error', label: 'Compiler Errors', icon: '⚠️' },
                  { key: 'stack_trace', label: 'Stack Traces', icon: '📚' },
                  { key: 'git', label: 'Git Status', icon: '⎇' },
                  { key: 'filepath', label: 'File Paths', icon: '📁' },
                ].map(detector => (
                  <label 
                    key={detector.key}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: visionConfig.detectors[detector.key] ? '#1a2e1a' : '#1a1a1a',
                      border: visionConfig.detectors[detector.key] ? '1px solid #22c55e' : '1px solid #333',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visionConfig.detectors[detector.key]}
                      onChange={(e) => {
                        const newConfig = {
                          ...visionConfig,
                          detectors: {
                            ...visionConfig.detectors,
                            [detector.key]: e.target.checked
                          }
                        };
                        onVisionConfigChange(newConfig);
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '1.1em', minWidth: '24px' }}>{detector.icon}</span>
                    <span style={{ flex: 1 }}>{detector.label}</span>
                    {visionConfig.detectors[detector.key] && (
                      <span style={{ fontSize: '0.8em', color: '#22c55e' }}>✓</span>
                    )}
                  </label>
                ))}
              </div>

              {/* JSON Minimum Size Slider */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontSize: '0.9em',
                  color: '#a3a3a3'
                }}>
                  JSON Minimum Size: <strong style={{ color: '#fff' }}>{visionConfig.jsonMinSize} bytes</strong>
                </label>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  value={visionConfig.jsonMinSize}
                  onChange={(e) => {
                    const newConfig = {
                      ...visionConfig,
                      jsonMinSize: parseInt(e.target.value)
                    };
                    onVisionConfigChange(newConfig);
                  }}
                  style={{ 
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    outline: 'none',
                    background: `linear-gradient(to right, #22c55e 0%, #22c55e ${(visionConfig.jsonMinSize - 10) / 90 * 100}%, #333 ${(visionConfig.jsonMinSize - 10) / 90 * 100}%, #333 100%)`,
                    cursor: 'pointer'
                  }}
                />
                <small style={{ 
                  display: 'block', 
                  marginTop: '6px', 
                  color: '#888', 
                  fontSize: '0.75em' 
                }}>
                  Ignore trivial JSON like {'{}'} or [] (prevents noise)
                </small>
              </div>

              {/* Auto-dismiss Toggle */}
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={visionConfig.autoDismiss}
                  onChange={(e) => {
                    const newConfig = {
                      ...visionConfig,
                      autoDismiss: e.target.checked
                    };
                    onVisionConfigChange(newConfig);
                  }}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ flex: 1 }}>Auto-dismiss info overlays</span>
              </label>
              <small style={{ 
                display: 'block', 
                marginTop: '6px', 
                marginLeft: '28px',
                color: '#888', 
                fontSize: '0.75em' 
              }}>
                Info-level overlays (Git, JSON, Paths) dismiss on next command
              </small>
            </div>
          )}

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
