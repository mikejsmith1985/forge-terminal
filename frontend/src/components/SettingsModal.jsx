import React, { useState, useEffect } from 'react';
import { Settings, Terminal, Monitor, Monitor as DesktopIcon } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose, shellConfig, onSave, onToast, devMode = false, onDevModeChange }) => {
  const [config, setConfig] = useState(shellConfig);
  const [wslInfo, setWslInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingShortcut, setCreatingShortcut] = useState(false);
  const [restoringCards, setRestoringCards] = useState(false);
  const [defaultCards, setDefaultCards] = useState([]);
  const [missingCards, setMissingCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);

  useEffect(() => {
    if (isOpen) {
      detectWSL();
      checkMissingCards();
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

  const handleSave = () => {
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

        <div className="modal-body" style={{ padding: '20px' }}>
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
        </div>

        <div className="modal-footer" style={{ 
          padding: '15px 20px', 
          borderTop: '1px solid #333',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Restart Terminal</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
