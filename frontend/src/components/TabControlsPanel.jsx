import React, { useState, useEffect } from 'react';
import { Palette, Sun, Moon, Info, Tag, Folder, Layers, Terminal, Hash, Pencil } from 'lucide-react';
import { themes, themeOrder } from '../themes';

// ─── Tab Naming Strategy Definitions ───────────────────────────────────────
const NAMING_STRATEGIES = [
  {
    value: 'project-root',
    label: 'Project Root',
    icon: Layers,
    example: 'forge-terminal',
    desc: 'Pins to the workspace root — first child of ProjectsWin. Stays stable no matter how deep you navigate. Recommended for multi-project setups.',
  },
  {
    value: 'current-dir',
    label: 'Current Directory',
    icon: Folder,
    example: 'src',
    desc: 'Always shows the directory you are currently in. Updates automatically on every cd.',
  },
  {
    value: 'parent-child',
    label: 'Parent / Child',
    icon: Folder,
    example: 'forge-terminal/src',
    desc: 'Shows two levels of context: the parent and current directory. Useful when you work in sibling directories.',
  },
  {
    value: 'shell-type',
    label: 'Shell Type',
    icon: Terminal,
    example: 'PowerShell 1',
    desc: 'Names each tab after its shell (PowerShell, CMD, WSL). Never changes on cd — great for identifying shell environments at a glance.',
  },
  {
    value: 'numbered',
    label: 'Numbered',
    icon: Hash,
    example: 'Terminal 1',
    desc: 'Classic numeric labelling. Simple, stable, and distraction-free.',
  },
  {
    value: 'custom-prefix',
    label: 'Custom Prefix',
    icon: Pencil,
    example: 'Dev 1',
    desc: 'Set your own prefix. Each new tab appends a number. Ideal for colour-coded team workflows or personal naming conventions.',
  },
];

/**
 * TabControlsPanel - Configure tab naming strategy, per-tab theme defaults, and global presets.
 */
function TabControlsPanel({ onToast, onNamingChange }) {
  const [tabDefaults, setTabDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTabDefaults();
  }, []);

  const loadTabDefaults = async () => {
    try {
      const res = await fetch('/api/tab-defaults');
      if (res.ok) {
        const data = await res.json();
        setTabDefaults(data);
        // Mirror naming settings to localStorage so App.jsx can read synchronously
        if (data.namingStrategy) {
          localStorage.setItem('forge:tabNamingStrategy', data.namingStrategy);
        }
        if (data.namingPrefix) {
          localStorage.setItem('forge:tabNamingPrefix', data.namingPrefix);
        }
        if (onNamingChange && data.namingStrategy) {
          onNamingChange(data.namingStrategy, data.namingPrefix || 'Dev');
        }
      } else {
        console.error('Failed to load tab defaults');
      }
    } catch (err) {
      console.error('Error loading tab defaults:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveTabDefaults = async () => {
    if (!tabDefaults) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/tab-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tabDefaults),
      });
      
      if (res.ok) {
        // Mirror naming settings to localStorage for instant synchronous reads
        localStorage.setItem('forge:tabNamingStrategy', tabDefaults.namingStrategy || 'project-root');
        localStorage.setItem('forge:tabNamingPrefix', tabDefaults.namingPrefix || 'Dev');
        if (onNamingChange) {
          onNamingChange(tabDefaults.namingStrategy || 'project-root', tabDefaults.namingPrefix || 'Dev');
        }
        if (onToast) onToast('Tab defaults saved!', 'success', 3000);
      } else {
        if (onToast) onToast('Failed to save tab defaults', 'error', 3000);
      }
    } catch (err) {
      console.error('Error saving tab defaults:', err);
      if (onToast) onToast('Error saving tab defaults', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const setGlobalPreset = (preset) => {
    setTabDefaults({ ...tabDefaults, globalPreset: preset });
  };

  const setTabDefault = (tabNumber, theme, mode) => {
    const perTab = { ...tabDefaults.perTab };
    perTab[tabNumber.toString()] = { theme, mode };
    setTabDefaults({ ...tabDefaults, perTab });
  };

  const clearTabDefault = (tabNumber) => {
    const perTab = { ...tabDefaults.perTab };
    delete perTab[tabNumber.toString()];
    setTabDefaults({ ...tabDefaults, perTab });
  };

  const toggleSplitThemes = () => {
    setTabDefaults({ ...tabDefaults, splitThemes: !tabDefaults.splitThemes });
  };

  const setSplitTheme = (target, theme, mode) => {
    if (target === 'terminal') {
      setTabDefaults({
        ...tabDefaults,
        terminalTheme: { theme, mode },
      });
    } else {
      setTabDefaults({
        ...tabDefaults,
        controlRibbon: { theme, mode },
      });
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;
  }

  if (!tabDefaults) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Failed to load settings</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Tab Naming Section ─────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Tag size={16} color="#8b5cf6" />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Tab Naming
          </h4>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888' }}>
          Choose how new tabs are named and how titles update as you navigate directories.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {NAMING_STRATEGIES.map(strategy => {
            const Icon = strategy.icon;
            const isActive = (tabDefaults.namingStrategy || 'project-root') === strategy.value;
            return (
              <label
                key={strategy.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  background: isActive ? '#8b5cf622' : '#111',
                  border: `1px solid ${isActive ? '#8b5cf6' : '#2a2a2a'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="namingStrategy"
                  value={strategy.value}
                  checked={isActive}
                  onChange={() => setTabDefaults({ ...tabDefaults, namingStrategy: strategy.value })}
                  style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#8b5cf6' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <Icon size={13} color={isActive ? '#a78bfa' : '#666'} />
                    <span style={{ fontWeight: 600, color: isActive ? '#e9d5ff' : '#ccc', fontSize: '13px' }}>
                      {strategy.label}
                    </span>
                    <span style={{
                      marginLeft: '6px',
                      padding: '1px 8px',
                      background: isActive ? '#8b5cf633' : '#1e1e1e',
                      border: `1px solid ${isActive ? '#8b5cf666' : '#333'}`,
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: isActive ? '#c4b5fd' : '#666',
                      fontFamily: 'monospace',
                    }}>
                      {strategy.value === 'custom-prefix'
                        ? `${tabDefaults.namingPrefix || 'Dev'} 1`
                        : strategy.example}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', lineHeight: '1.5' }}>
                    {strategy.desc}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Custom prefix input – only visible when custom-prefix is selected */}
        {(tabDefaults.namingStrategy || 'project-root') === 'custom-prefix' && (
          <div style={{
            marginTop: '12px',
            padding: '14px',
            background: '#0d0d0d',
            border: '1px solid #8b5cf644',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <Pencil size={14} color="#8b5cf6" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '6px', fontWeight: 500 }}>
                Custom prefix text
              </label>
              <input
                type="text"
                value={tabDefaults.namingPrefix || ''}
                onChange={(e) => setTabDefaults({ ...tabDefaults, namingPrefix: e.target.value })}
                placeholder="Dev"
                maxLength={20}
                style={{
                  padding: '8px 10px',
                  background: '#1a1a1a',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  width: '180px',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{
              padding: '8px 14px',
              background: '#1e1a2e',
              border: '1px solid #8b5cf633',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'monospace',
              color: '#c4b5fd',
            }}>
              {tabDefaults.namingPrefix || 'Dev'} 1
            </div>
          </div>
        )}

        {/* Connectivity note */}
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: '#0f1a0f',
          border: '1px solid #22c55e33',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}>
          <Info size={13} color="#4ade80" style={{ marginTop: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#86efac', lineHeight: '1.5' }}>
            <strong>Connectivity tip:</strong> If you experience tabs disconnecting unexpectedly,
            switch to <em>Numbered</em> or <em>Shell Type</em> mode. Static names eliminate
            any re-render triggered by auto-rename events during active sessions.
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #222' }} />

      {/* ── Global Presets Section ─────────────────────────────────── */}
      <div>
        <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#fff' }}>
          Global Presets
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
          Choose how new tabs should cycle through themes and modes by default
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { value: 'auto-cycle', label: 'Auto-cycle (alternating dark/light)', desc: 'Tab 1: Dark, Tab 2: Light, Tab 3: Dark...' },
            { value: 'auto-cycle-dark', label: 'Dark mode only', desc: 'All tabs cycle through themes in dark mode' },
            { value: 'auto-cycle-light', label: 'Light mode only', desc: 'All tabs cycle through themes in light mode' },
          ].map(preset => (
            <label
              key={preset.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                background: tabDefaults.globalPreset === preset.value ? '#8b5cf633' : '#1a1a1a',
                border: `1px solid ${tabDefaults.globalPreset === preset.value ? '#8b5cf6' : '#333'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="radio"
                name="globalPreset"
                value={preset.value}
                checked={tabDefaults.globalPreset === preset.value}
                onChange={(e) => setGlobalPreset(e.target.value)}
                style={{ marginTop: '2px', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: '#fff', fontSize: '13px' }}>{preset.label}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{preset.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Visual Diagram */}
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Info size={14} color="#888" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#888' }}>Current Pattern Preview</span>
        </div>
        <div className="theme-diagram" style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {[1, 2, 3, 4, 5].map(i => {
            const mode = tabDefaults.globalPreset === 'auto-cycle'
              ? (i % 2 === 1 ? 'dark' : 'light')
              : tabDefaults.globalPreset === 'auto-cycle-light'
              ? 'light'
              : 'dark';
            
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px',
                  background: mode === 'dark' ? '#1a1a1a' : '#f5f5f4',
                  border: `1px solid ${mode === 'dark' ? '#333' : '#e5e7eb'}`,
                  borderRadius: '4px',
                  minWidth: '60px',
                }}
              >
                <span style={{ fontSize: '10px', color: '#888' }}>Tab {i}</span>
                {mode === 'dark' ? (
                  <Moon size={16} color="#8b5cf6" />
                ) : (
                  <Sun size={16} color="#f59e0b" />
                )}
                <span style={{ fontSize: '9px', color: '#888' }}>{mode}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Tab Defaults */}
      <div>
        <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#fff' }}>
          Per-Tab Explicit Defaults (1-20)
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
          Override the global preset for specific tab positions. Leave blank to use global preset.
        </p>
        
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {Array.from({ length: 20 }, (_, i) => i + 1).map(tabNum => {
            const tabConfig = tabDefaults.perTab[tabNum.toString()] || {};
            const hasConfig = !!tabDefaults.perTab[tabNum.toString()];
            
            return (
              <div
                key={tabNum}
                className="tab-default-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '8px',
                  background: hasConfig ? '#8b5cf61a' : 'transparent',
                  border: hasConfig ? '1px solid #8b5cf633' : '1px solid transparent',
                  borderRadius: '4px',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>#{tabNum}</span>
                
                <select
                  name="theme"
                  value={tabConfig.theme || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setTabDefault(tabNum, e.target.value, tabConfig.mode || 'dark');
                    }
                  }}
                  style={{
                    padding: '6px 8px',
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                >
                  <option value="">Use global preset</option>
                  {themeOrder.map(themeName => (
                    <option key={themeName} value={themeName}>
                      {themes[themeName]?.name || themeName}
                    </option>
                  ))}
                </select>
                
                <select
                  name="mode"
                  value={tabConfig.mode || ''}
                  onChange={(e) => {
                    if (e.target.value && tabConfig.theme) {
                      setTabDefault(tabNum, tabConfig.theme, e.target.value);
                    }
                  }}
                  disabled={!hasConfig}
                  style={{
                    padding: '6px 8px',
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                >
                  <option value="">-</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
                
                {hasConfig && (
                  <button
                    onClick={() => clearTabDefault(tabNum)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#ef4444',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal/Ribbon Split */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <input
            type="checkbox"
            checked={tabDefaults.splitThemes}
            onChange={toggleSplitThemes}
            style={{ cursor: 'pointer' }}
          />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Split Terminal/Ribbon Themes
          </h4>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
          Use different themes for the terminal area and control ribbon (sidebar/topbar)
        </p>
        
        {tabDefaults.splitThemes && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Terminal Theme */}
            <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #333' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500 }}>
                Terminal Theme
              </label>
              <select
                name="terminalTheme"
                value={tabDefaults.terminalTheme.theme}
                onChange={(e) => setSplitTheme('terminal', e.target.value, tabDefaults.terminalTheme.mode)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  marginBottom: '8px',
                }}
              >
                {themeOrder.map(themeName => (
                  <option key={themeName} value={themeName}>
                    {themes[themeName]?.name || themeName}
                  </option>
                ))}
              </select>
              
              <select
                name="terminalMode"
                value={tabDefaults.terminalTheme.mode}
                onChange={(e) => setSplitTheme('terminal', tabDefaults.terminalTheme.theme, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
            
            {/* Control Ribbon Theme */}
            <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #333' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500 }}>
                Control Ribbon Theme
              </label>
              <select
                name="ribbonTheme"
                value={tabDefaults.controlRibbon.theme}
                onChange={(e) => setSplitTheme('ribbon', e.target.value, tabDefaults.controlRibbon.mode)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                  marginBottom: '8px',
                }}
              >
                {themeOrder.map(themeName => (
                  <option key={themeName} value={themeName}>
                    {themes[themeName]?.name || themeName}
                  </option>
                ))}
              </select>
              
              <select
                name="ribbonMode"
                value={tabDefaults.controlRibbon.mode}
                onChange={(e) => setSplitTheme('ribbon', tabDefaults.controlRibbon.theme, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={saveTabDefaults}
        disabled={saving}
        style={{
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Tab Defaults'}
      </button>
    </div>
  );
}

export default TabControlsPanel;
