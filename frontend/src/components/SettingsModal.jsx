import React, { useState, useEffect } from 'react';
import { Settings, Terminal, Monitor, Monitor as DesktopIcon, Shield, Cpu, Play, Palette, Zap, RotateCcw, Database, History, Bell } from 'lucide-react';
import CLISettingsPanel from './CLISettingsPanel';
import TabControlsPanel from './TabControlsPanel';
import CardHistoryPanel from './CardHistoryPanel';
import NotificationsPanel from './NotificationsPanel';
import { ClaudeCLICommandsTable } from './ClaudeCLICommands';
import { themes, themeOrder } from '../themes';

const SettingsModal = ({ isOpen, onClose, shellConfig, onSave, onToast, devMode = false, onDevModeChange, initialTab = 'shell', onRestartTour, defaultTabTheme = 'auto-cycle', onDefaultTabThemeChange }) => {
  const [config, setConfig] = useState(shellConfig);
  const [wslInfo, setWslInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingShortcut, setCreatingShortcut] = useState(false);
  const [restoringCards, setRestoringCards] = useState(false);
  const [defaultCards, setDefaultCards] = useState([]);
  const [missingCards, setMissingCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [fileAccessMode, setFileAccessMode] = useState('restricted');
  const [activeTab, setActiveTab] = useState(initialTab); // 'shell' or 'cli'

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
    }
  }, [isOpen, devMode]);

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
      <div className="modal" style={{ width: '620px', maxWidth: '95vw' }}>
        <div className="modal-header">
          <h3><Settings size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} /> Settings</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          padding: '0 16px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
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
          <button
            onClick={() => setActiveTab('tabs')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'tabs' ? '#fff' : '#888',
              borderBottom: activeTab === 'tabs' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Palette size={16} />
            Tab Controls
          </button>
          <button
            onClick={() => setActiveTab('data')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'data' ? '#fff' : '#888',
              borderBottom: activeTab === 'data' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Database size={16} />
            Data & History
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: activeTab === 'notifications' ? '#fff' : '#888',
              borderBottom: activeTab === 'notifications' ? '2px solid #8b5cf6' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Bell size={16} />
            Notifications
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'claude' ? (
            <ClaudeCLICommandsTable />
          ) : activeTab === 'cli' ? (
            <CLISettingsPanel onToast={onToast} />
          ) : activeTab === 'tabs' ? (
            <TabControlsPanel onToast={onToast} />
          ) : activeTab === 'data' ? (
            <div>
              {/* Default Cards Section */}
              <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #333' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCcw size={20} />
                  Default Command Cards
                </h3>
                {missingCards.length > 0 ? (
                  <div>
                    <p style={{ marginBottom: '16px', color: '#aaa' }}>
                      The following default command cards are missing and can be restored:
                    </p>
                    <div style={{ marginBottom: '16px' }}>
                      {missingCards.map(card => (
                        <label key={card.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            checked={selectedCards.includes(card.id)}
                            onChange={() => {
                              if (selectedCards.includes(card.id)) {
                                setSelectedCards(selectedCards.filter(id => id !== card.id));
                              } else {
                                setSelectedCards([...selectedCards, card.id]);
                              }
                            }}
                          />
                          <span style={{ color: '#ddd' }}>{card.description}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleRestoreDefaultCards}
                      disabled={restoringCards || selectedCards.length === 0}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <RotateCcw size={16} />
                      {restoringCards ? 'Restoring...' : `Restore ${selectedCards.length} Card(s)`}
                    </button>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    padding: '16px',
                    borderRadius: '8px',
                    color: '#22c55e'
                  }}>
                    ✓ All default command cards are present
                  </div>
                )}
              </div>

              {/* Card History Section */}
              <div>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={20} />
                  Card Version History
                </h3>
                <CardHistoryPanel onToast={onToast} />
              </div>
            </div>
          ) : activeTab === 'backups' ? (
            <BackupsPanel onToast={onToast} />
          ) : activeTab === 'notifications' ? (
            <NotificationsPanel onToast={onToast} />
          ) : (
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

          {/* Default Tab Theme Section */}
          <div style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #333'
          }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500 }}>
              Default Theme for New Tabs
            </label>
            <select
              value={defaultTabTheme}
              onChange={(e) => {
                if (onDefaultTabThemeChange) {
                  onDefaultTabThemeChange(e.target.value);
                }
              }}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#fff',
                fontSize: '0.9em'
              }}
            >
              <option value="auto-cycle">Auto-Cycle All Themes</option>
              <option value="auto-cycle-dark">Auto-Cycle (Dark Themes Only)</option>
              <option value="auto-cycle-light">Auto-Cycle (Light Themes Only)</option>
              <optgroup label="Choose Specific Theme">
                {themeOrder.map((themeId) => (
                  <option key={themeId} value={themeId}>
                    {themes[themeId].name}
                  </option>
                ))}
              </optgroup>
            </select>
            <small style={{
              display: 'block',
              marginTop: '8px',
              color: '#888',
              fontSize: '0.8em'
            }}>
              {defaultTabTheme === 'auto-cycle'
                ? 'New tabs will cycle through all themes in both light and dark modes'
                : defaultTabTheme === 'auto-cycle-dark'
                ? 'New tabs will cycle through all themes in dark mode only'
                : defaultTabTheme === 'auto-cycle-light'
                ? 'New tabs will cycle through all themes in light mode only'
                : `All new tabs will use ${themes[defaultTabTheme]?.name || 'the selected theme'}`
              }
            </small>
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
