import React, { useState, useEffect, useRef } from 'react'
import ForgeTerminal from './components/ForgeTerminal'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'

function App() {
  const [commands, setCommands] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState(null)
  const terminalRef = useRef(null)

  useEffect(() => {
    loadCommands()
  }, [])

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
      .then(setCommands)
      .catch(err => console.error('Failed to load commands:', err))
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
      // Add new
      const newId = Math.max(0, ...commands.map(c => c.id)) + 1
      newCommands = [...commands, { ...commandData, id: newId }]
    }
    saveCommands(newCommands)
    setIsModalOpen(false)
  }

  // Sort favorites first
  const sortedCommands = [...commands].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))

  return (
    <div className="app">
      <div className="terminal-pane">
        <ForgeTerminal ref={terminalRef} />
      </div>
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>⚡ Commands</h3>
          <button className="btn btn-primary" onClick={handleAdd}>+ Add</button>
        </div>
        <CommandCards
          commands={sortedCommands}
          onExecute={handleExecute}
          onPaste={handlePaste}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCommand}
        initialData={editingCommand}
      />
    </div>
  )
}

export default App
