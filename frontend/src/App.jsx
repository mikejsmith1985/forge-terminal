import React, { useState, useEffect, useRef } from 'react'
import ForgeTerminal from './components/ForgeTerminal'

function App() {
  const [commands, setCommands] = useState([])
  const terminalRef = useRef(null)

  useEffect(() => {
    // Load commands from API
    fetch('/api/commands')
      .then(r => r.json())
      .then(setCommands)
      .catch(err => console.error('Failed to load commands:', err))
  }, [])

  const saveCommands = async (newCommands) => {
    setCommands(newCommands)
    await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCommands)
    })
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
          <button className="btn btn-primary">+ Add</button>
        </div>
        {sortedCommands.map(cmd => (
          <div key={cmd.id} className={`card ${cmd.favorite ? 'favorite' : ''}`}>
            <div className="card-header">
              <span className="card-title">{cmd.description}</span>
              <span className="keybinding">{cmd.keyBinding}</span>
            </div>
            <div className="card-actions">
              {!cmd.pasteOnly && (
                <button className="btn btn-ghost" title="Execute">▶️</button>
              )}
              <button className="btn btn-ghost" title="Paste">📋</button>
              <button className="btn btn-ghost" title="Edit">✏️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
