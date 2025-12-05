import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, Minus, MessageSquare, Power, Settings, RotateCcw, Palette, PanelLeft, PanelRight } from 'lucide-react';
import ForgeTerminal from './components/ForgeTerminal'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import ShellToggle from './components/ShellToggle'
import TabBar from './components/TabBar'
import SearchBar from './components/SearchBar'
import { ToastContainer, useToast } from './components/Toast'
import { themes, themeOrder, applyTheme } from './themes'
import { useTabManager } from './hooks/useTabManager'

const MAX_TABS = 20;

function App() {
  const [commands, setCommands] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem('colorTheme') || 'molten';
  })
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'right';
  })
  const [shellConfig, setShellConfig] = useState({ shellType: 'powershell', wslDistro: '', wslHomePath: '' })
  const [wslAvailable, setWslAvailable] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('terminalFontSize');
    return saved ? parseInt(saved, 10) : 14;
  })
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  
  // Tab management
  const {
    tabs,
    activeTabId,
    activeTab,
    createTab,
    closeTab,
    switchTab,
    updateTabTitle,
    updateTabShellConfig,
    updateTabColorTheme,
    reorderTabs,
  } = useTabManager(shellConfig);
  
  // Store refs for each terminal by tab ID
  const terminalRefs = useRef({});
  const { toasts, addToast, removeToast } = useToast()

  const DEFAULT_FONT_SIZE = 14;
  const MIN_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 24;

  // Get ref for active terminal
  const getActiveTerminalRef = useCallback(() => {
    return activeTabId ? terminalRefs.current[activeTabId] : null;
  }, [activeTabId]);

  const handleFontSizeChange = (delta) => {
    setFontSize(prev => {
      const newSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
      localStorage.setItem('terminalFontSize', newSize.toString());
      return newSize;
    });
  };

  const handleFontSizeReset = () => {
    setFontSize(DEFAULT_FONT_SIZE);
    localStorage.setItem('terminalFontSize', DEFAULT_FONT_SIZE.toString());
  };

  const cycleColorTheme = () => {
    // Cycle the active tab's color theme
    const currentTabTheme = activeTab?.colorTheme || colorTheme;
    const currentIndex = themeOrder.indexOf(currentTabTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const nextTheme = themeOrder[nextIndex];
    
    // Update the active tab's theme
    if (activeTabId) {
      updateTabColorTheme(activeTabId, nextTheme);
    }
    
    // Also update the global colorTheme state and apply
    setColorTheme(nextTheme);
    localStorage.setItem('colorTheme', nextTheme);
    applyTheme(nextTheme, theme);
    addToast(`Theme: ${themes[nextTheme].name}`, 'info', 1500);
  };

  const toggleSidebarPosition = () => {
    const newPosition = sidebarPosition === 'right' ? 'left' : 'right';
    setSidebarPosition(newPosition);
    localStorage.setItem('sidebarPosition', newPosition);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadCommands()
    loadConfig()
    checkWSL()
    checkForUpdates()
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedColorTheme = localStorage.getItem('colorTheme') || 'molten';
    setTheme(savedTheme);
    setColorTheme(savedColorTheme);
    document.documentElement.className = savedTheme;
    applyTheme(savedColorTheme, savedTheme);
    
    // Check for updates periodically (every 30 minutes)
    const updateInterval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => clearInterval(updateInterval);
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data && data.shellType) {
        // Check if config differs from the initial default
        const defaultConfig = { shellType: 'powershell', wslDistro: '', wslHomePath: '' };
        const configDiffers = 
          data.shellType !== defaultConfig.shellType ||
          data.wslDistro !== defaultConfig.wslDistro ||
          data.wslHomePath !== defaultConfig.wslHomePath;
        
        setShellConfig(data);
        // Update the first tab's shell config to match loaded settings
        if (tabs.length > 0) {
          updateTabShellConfig(tabs[0].id, data);
        }
        // Reconnect the terminal if loaded config differs from default
        // (the initial tab was created with default settings before config loaded)
        if (configDiffers) {
          setTimeout(() => {
            const termRef = getActiveTerminalRef();
            if (termRef) {
              termRef.reconnect();
            }
          }, 500);
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  const saveConfig = async (config) => {
    const oldShell = shellConfig.shellType;
    const newShell = config.shellType;
    
    // Show warning toast when switching between PS and WSL
    if ((oldShell === 'powershell' && newShell === 'wsl') || 
        (oldShell === 'wsl' && newShell === 'powershell')) {
      addToast(`Switching from ${oldShell.toUpperCase()} to ${newShell.toUpperCase()}. Current session will end.`, 'warning', 4000);
    } else if (oldShell !== newShell) {
      addToast(`Switching to ${newShell.toUpperCase()}`, 'info', 2000);
    }
    
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setShellConfig(config);
      // Reconnect active terminal with new shell
      const termRef = getActiveTerminalRef();
      if (termRef) {
        termRef.reconnect();
      }
    } catch (err) {
      console.error('Failed to save config:', err);
      addToast('Failed to save shell configuration', 'error', 3000);
    }
  }

  const checkWSL = async () => {
    try {
      const res = await fetch('/api/wsl/detect');
      const data = await res.json();
      setWslAvailable(data.available || false);
    } catch (err) {
      setWslAvailable(false);
    }
  }

  const checkForUpdates = async () => {
    try {
      const res = await fetch('/api/update/check');
      const data = await res.json();
      if (data.available) {
        addToast(
          `Update available: ${data.latestVersion}`,
          'update',
          0, // Don't auto-dismiss
          {
            action: 'Update Now',
            onAction: () => applyUpdate(data.latestVersion)
          }
        );
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }

  const applyUpdate = async (version) => {
    addToast(`Downloading update ${version}...`, 'info', 0);
    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast('Update applied! Restarting...', 'success', 3000);
        // The server will restart, page will reload automatically
        setTimeout(() => window.location.reload(), 2000);
      } else {
        addToast(`Update failed: ${data.error}`, 'error', 5000);
      }
    } catch (err) {
      addToast(`Update failed: ${err.message}`, 'error', 5000);
    }
  }

  const handleShellToggle = () => {
    // Cycle through available shells
    let nextShell;
    switch (shellConfig.shellType) {
      case 'cmd':
        nextShell = 'powershell';
        break;
      case 'powershell':
        nextShell = wslAvailable ? 'wsl' : 'cmd';
        break;
      case 'wsl':
        nextShell = 'cmd';
        break;
      default:
        nextShell = 'powershell';
    }
    saveConfig({ ...shellConfig, shellType: nextShell });
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.className = newTheme;
    applyTheme(colorTheme, newTheme);
  };

  // Smart keybinding generator
  // First 10 cards: Ctrl+Shift+0-9
  // Card 11+: Auto-increment from previous card's keybinding
  const generateSmartKeybinding = (position, existingCommands) => {
    // Cards 1-10: Ctrl+Shift+0, Ctrl+Shift+1, ... Ctrl+Shift+9
    if (position <= 10) {
      const key = position === 10 ? '0' : String(position);
      return `Ctrl+Shift+${key}`;
    }
    
    // Card 11+: Try to auto-increment from previous card
    if (existingCommands.length > 0) {
      const lastCmd = existingCommands[existingCommands.length - 1];
      if (lastCmd.keyBinding) {
        const match = lastCmd.keyBinding.match(/Ctrl\+Shift\+(.+)$/i);
        if (match) {
          const lastKey = match[1];
          const nextKey = incrementKey(lastKey);
          if (nextKey) {
            return `Ctrl+Shift+${nextKey}`;
          }
        }
      }
    }
    
    // Fallback: use letters starting from A for 11+
    const letterIndex = position - 11;
    if (letterIndex < 26) {
      return `Ctrl+Shift+${String.fromCharCode(65 + letterIndex)}`;
    }
    
    return '';
  };
  
  // Increment a key (letter or number)
  const incrementKey = (key) => {
    // If it's a single digit
    if (/^[0-9]$/.test(key)) {
      const num = parseInt(key);
      if (num < 9) {
        return String(num + 1);
      }
      // After 9, switch to letters
      return 'A';
    }
    
    // If it's a single letter
    if (/^[A-Z]$/i.test(key)) {
      const upper = key.toUpperCase();
      if (upper < 'Z') {
        return String.fromCharCode(upper.charCodeAt(0) + 1);
      }
      // Wrapped around, no more keys
      return null;
    }
    
    return null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+F: Open search
      if (e.ctrlKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Tab shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1-9)
      if (e.ctrlKey && !e.shiftKey) {
        // Ctrl+T: New tab
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          handleNewTab();
          return;
        }
        
        // Ctrl+W: Close active tab
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            closeTab(activeTabId);
          }
          return;
        }
        
        // Ctrl+Tab / Ctrl+Shift+Tab: Cycle through tabs
        if (e.key === 'Tab') {
          e.preventDefault();
          const currentIndex = tabs.findIndex(t => t.id === activeTabId);
          if (currentIndex !== -1) {
            const nextIndex = e.shiftKey 
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length;
            switchTab(tabs[nextIndex].id);
          }
          return;
        }
        
        // Ctrl+1 through Ctrl+9: Switch to tab by number
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          const tabIndex = digit - 1;
          if (tabIndex < tabs.length) {
            switchTab(tabs[tabIndex].id);
          }
          return;
        }
      }
      
      // Check for Ctrl+Shift+1/2/3/4... (command shortcuts)
      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        // Find command with this binding
        // Note: This is a simple check, might need more robust parsing if bindings get complex
        // But charter says "Ctrl+Shift+1", etc.
        const binding = `Ctrl+Shift+${key.toUpperCase()}`; // e.g. Ctrl+Shift+1
        // Also handle number keys directly if e.key is '!' or '@' etc due to shift
        // But usually e.key is the character produced.
        // Actually, let's just match against the string in the command.

        // We need to normalize or check carefully. 
        // For now, let's iterate and check.
        const matchedCommand = commands.find(cmd => {
          if (!cmd.keyBinding) return false;
          // Simple normalization for comparison
          const normalize = s => s.toLowerCase().replace(/\s+/g, '');
          const pressed = `Ctrl+Shift+${e.code.replace('Digit', '').replace('Key', '')}`;
          return normalize(cmd.keyBinding) === normalize(pressed);
        });

        if (matchedCommand) {
          e.preventDefault();
          if (matchedCommand.pasteOnly) {
            handlePaste(matchedCommand);
          } else {
            handleExecute(matchedCommand);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commands, tabs, activeTabId, closeTab, switchTab]);

  // Handle new tab creation
  const handleNewTab = useCallback(() => {
    const newTabId = createTab(shellConfig);
    if (newTabId === null) {
      addToast('Maximum tab limit reached (20)', 'warning', 3000);
    }
  }, [createTab, shellConfig, addToast]);

  // Handle tab switch - focus terminal after switching and apply tab's theme
  const handleTabSwitch = useCallback((tabId) => {
    switchTab(tabId);
    
    // Apply the tab's color theme
    const targetTab = tabs.find(t => t.id === tabId);
    if (targetTab?.colorTheme) {
      setColorTheme(targetTab.colorTheme);
      applyTheme(targetTab.colorTheme, theme);
    }
    
    // Small delay to ensure the terminal is visible before focusing
    setTimeout(() => {
      const termRef = terminalRefs.current[tabId];
      if (termRef) {
        termRef.focus();
      }
    }, 50);
  }, [switchTab, tabs, theme]);

  // Handle tab close
  const handleTabClose = useCallback((tabId) => {
    if (tabs.length > 1) {
      closeTab(tabId);
      // Clean up the ref
      delete terminalRefs.current[tabId];
    }
  }, [tabs.length, closeTab]);


  const loadCommands = () => {
    fetch('/api/commands')
      .then(r => r.json())
      .then(data => {
        // Ensure data is an array
        const cmds = Array.isArray(data) ? data : [];
        setCommands(cmds);
      })
      .catch(err => console.error('Failed to load commands:', err))
  }

  const handleShutdown = async () => {
    addToast('Shutting down Forge Terminal...', 'warning', 3000);
    
    // Small delay so user sees the toast
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      await fetch('/api/shutdown', { method: 'POST' });
      window.close(); // Try to close the tab
    } catch (err) {
      // Server already shut down, that's expected
      window.close();
    }
  }

  const saveCommands = async (newCommands) => {
    try {
      await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCommands)
      })
      setCommands(newCommands)
    } catch (err) {
      console.error('Failed to save commands:', err)
    }
  }

  const handleExecute = (cmd) => {
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.sendCommand(cmd.command)
      termRef.focus()
    }
  }

  const handlePaste = (cmd) => {
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.pasteCommand(cmd.command)
      termRef.focus()
    }
  }

  // Search handlers
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    const termRef = getActiveTerminalRef();
    if (termRef && query) {
      const found = termRef.findNext(query);
      // The xterm search addon doesn't provide a match count directly
      // We'll track if matches are found
      setSearchMatchCount(found ? 1 : 0);
      setSearchCurrentMatch(found ? 1 : 0);
    } else if (termRef) {
      termRef.clearSearch();
      setSearchMatchCount(0);
      setSearchCurrentMatch(0);
    }
  }, [getActiveTerminalRef]);

  const handleSearchNext = useCallback(() => {
    const termRef = getActiveTerminalRef();
    if (termRef && searchQuery) {
      termRef.findNext(searchQuery);
    }
  }, [getActiveTerminalRef, searchQuery]);

  const handleSearchPrev = useCallback(() => {
    const termRef = getActiveTerminalRef();
    if (termRef && searchQuery) {
      termRef.findPrevious(searchQuery);
    }
  }, [getActiveTerminalRef, searchQuery]);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchMatchCount(0);
    setSearchCurrentMatch(0);
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.clearSearch();
      termRef.focus();
    }
  }, [getActiveTerminalRef]);

  const handleAdd = () => {
    setEditingCommand(null)
    setIsModalOpen(true)
  }

  const handleEdit = (cmd) => {
    setEditingCommand(cmd)
    setIsModalOpen(true)
  }

  const handleDelete = (id) => {
    const newCommands = commands.filter(c => c.id !== id)
    saveCommands(newCommands)
  }

  const handleSaveCommand = (commandData) => {
    let newCommands;
    if (editingCommand) {
      // Update existing
      newCommands = commands.map(c =>
        c.id === editingCommand.id ? { ...commandData, id: c.id } : c
      )
    } else {
      // Add new with smart keybinding
      const newId = Math.max(0, ...commands.map(c => c.id)) + 1
      const cardPosition = commands.length + 1; // Position of new card (1-indexed)
      
      // Auto-assign keybinding if not already set
      let finalData = { ...commandData };
      if (!finalData.keyBinding) {
        finalData.keyBinding = generateSmartKeybinding(cardPosition, commands);
      }
      
      newCommands = [...commands, { ...finalData, id: newId }]
    }
    saveCommands(newCommands)
    setIsModalOpen(false)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = commands.findIndex((c) => c.id === active.id);
      const newIndex = commands.findIndex((c) => c.id === over.id);

      const newCommands = arrayMove(commands, oldIndex, newIndex);
      saveCommands(newCommands);
    }
  };

  const sidebar = (
    <div className="sidebar">
      {/* Row 1: Title and Add button */}
      <div className="sidebar-header">
        <h3>⚡ Commands</h3>
        <button className="btn btn-primary" onClick={handleAdd}>
          <Plus size={16} /> Add
        </button>
      </div>

      {/* Row 2: Theme controls */}
      <div className="theme-controls">
        <button className="btn btn-ghost btn-icon" onClick={cycleColorTheme} title={`Theme: ${themes[colorTheme]?.name || 'Molten Metal'}`}>
          <Palette size={18} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Light/Dark">
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleSidebarPosition} title={`Move sidebar to ${sidebarPosition === 'right' ? 'left' : 'right'}`}>
          {sidebarPosition === 'right' ? <PanelLeft size={18} /> : <PanelRight size={18} />}
        </button>
        <div className="spacer"></div>
        <button className="btn btn-danger btn-icon" onClick={handleShutdown} title="Quit Forge">
          <Power size={18} />
        </button>
      </div>

      {/* Row 3: Shell and terminal controls */}
      <div className="terminal-controls">
        <ShellToggle 
          shellConfig={shellConfig} 
          onToggle={handleShellToggle}
          wslAvailable={wslAvailable}
        />
        <div className="font-size-controls">
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(-1)} 
            title="Decrease Font Size"
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <Minus size={14} />
          </button>
          <span className="font-size-display" title="Font Size">{fontSize}px</span>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(1)} 
            title="Increase Font Size"
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <Plus size={14} />
          </button>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={handleFontSizeReset} 
            title="Reset Font Size"
            disabled={fontSize === DEFAULT_FONT_SIZE}
          >
            <RotateCcw size={12} />
          </button>
        </div>
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsSettingsModalOpen(true)} 
          title="Shell Settings"
        >
          <Settings size={18} />
        </button>
        <button className="btn btn-feedback btn-icon" onClick={() => setIsFeedbackModalOpen(true)} title="Send Feedback">
          <MessageSquare size={18} />
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <CommandCards
          commands={commands}
          onExecute={handleExecute}
          onPaste={handlePaste}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </DndContext>
    </div>
  );

  return (
    <div className={`app ${sidebarPosition === 'left' ? 'sidebar-left' : ''}`}>
      {sidebarPosition === 'left' && sidebar}
      <div className="terminal-pane">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={handleTabSwitch}
          onTabClose={handleTabClose}
          onNewTab={handleNewTab}
          onReorder={reorderTabs}
          disableNewTab={tabs.length >= MAX_TABS}
        />
        <SearchBar
          isOpen={isSearchOpen}
          onClose={handleSearchClose}
          onSearch={handleSearch}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          matchCount={searchMatchCount}
          currentMatch={searchCurrentMatch}
        />
        <div className="terminal-pane-content">
          <div className="terminal-container">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-wrapper ${tab.id !== activeTabId ? 'hidden' : ''}`}
              >
                <ForgeTerminal
                  ref={(el) => {
                    if (el) {
                      terminalRefs.current[tab.id] = el;
                    }
                  }}
                  tabId={tab.id}
                  isVisible={tab.id === activeTabId}
                  theme={theme}
                  colorTheme={colorTheme}
                  fontSize={fontSize}
                  shellConfig={tab.shellConfig}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {sidebarPosition === 'right' && sidebar}

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCommand}
        initialData={editingCommand}
        commands={commands}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        shellConfig={shellConfig}
        onSave={saveConfig}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default App
