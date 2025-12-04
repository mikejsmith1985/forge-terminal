import React, { useState, useEffect, useRef } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, MessageSquare, Power, Settings } from 'lucide-react';
import ForgeTerminal from './components/ForgeTerminal'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import ShellToggle from './components/ShellToggle'

function App() {
  const [commands, setCommands] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [shellConfig, setShellConfig] = useState({ shellType: 'powershell', wslDistro: '', wslHomePath: '' })
  const [wslAvailable, setWslAvailable] = useState(false)
  const terminalRef = useRef(null)

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
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.className = savedTheme;
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data && data.shellType) {
        setShellConfig(data);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  const saveConfig = async (config) => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setShellConfig(config);
      // Reconnect terminal with new shell
      if (terminalRef.current) {
        terminalRef.current.reconnect();
      }
    } catch (err) {
      console.error('Failed to save config:', err);
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
      // Check for Ctrl+Shift+1/2/3/4...
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
  }, [commands]);

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
    if (window.confirm('Quit Forge Terminal?')) {
      try {
        await fetch('/api/shutdown', { method: 'POST' });
        window.close(); // Try to close the tab
      } catch (err) {
        // Server already shut down, that's expected
        window.close();
      }
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
    if (terminalRef.current) {
      terminalRef.current.sendCommand(cmd.command)
      terminalRef.current.focus()
    }
  }

  const handlePaste = (cmd) => {
    if (terminalRef.current) {
      terminalRef.current.pasteCommand(cmd.command)
      terminalRef.current.focus()
    }
  }

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

    if (active.id !== over.id) {
      const oldIndex = commands.findIndex((c) => c.id === active.id);
      const newIndex = commands.findIndex((c) => c.id === over.id);

      const newCommands = arrayMove(commands, oldIndex, newIndex);
      saveCommands(newCommands);
    }
  };

  return (
    <div className="app">
      <div className="terminal-pane">
        <div className="terminal-header">
          <ShellToggle 
            shellConfig={shellConfig} 
            onToggle={handleShellToggle}
            wslAvailable={wslAvailable}
          />
          <button 
            className="btn btn-ghost btn-icon" 
            onClick={() => setIsSettingsModalOpen(true)} 
            title="Shell Settings"
          >
            <Settings size={18} />
          </button>
        </div>
        <ForgeTerminal ref={terminalRef} theme={theme} shellConfig={shellConfig} />
      </div>
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>⚡ Commands</h3>
          <div className="header-actions">
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Theme">
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="btn btn-feedback btn-icon" onClick={() => setIsFeedbackModalOpen(true)} title="Send Feedback">
              <MessageSquare size={18} />
            </button>
            <button className="btn btn-danger btn-icon" onClick={handleShutdown} title="Quit Forge">
              <Power size={18} />
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>
              <Plus size={16} /> Add
            </button>
          </div>
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

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCommand}
        initialData={editingCommand}
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
    </div>
  )
}

export default App
