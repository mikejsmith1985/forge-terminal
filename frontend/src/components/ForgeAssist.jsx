import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Command, Terminal, MessageSquare, Search, Zap, Hash, X, Copy, Play } from 'lucide-react';
import './ForgeAssist.css';

/**
 * ForgeAssist - Context-aware command palette for CLI tools
 * Shows relevant commands based on detected CLI (Copilot, Claude, Git, etc.)
 * Triggered by Ctrl+/ or button click
 */

// Command definitions for each CLI tool
const CLI_COMMANDS = {
  copilot: {
    name: 'GitHub Copilot CLI',
    icon: '🤖',
    color: '#8b5cf6',
    slashCommands: [
      { cmd: '/help', desc: 'Show all available commands' },
      { cmd: '/model', desc: 'Switch AI model' },
      { cmd: '/clear', desc: 'Clear conversation' },
      { cmd: '/usage', desc: 'Show token usage stats' },
      { cmd: '/explain', desc: 'Explain code' },
      { cmd: '/fix', desc: 'Fix code issues' },
      { cmd: '/tests', desc: 'Generate tests' },
    ],
    quickCommands: [
      { name: 'Continue Session', cmd: 'copilot --continue', desc: 'Resume last conversation' },
      { name: 'Quick Question', cmd: 'copilot -p "', desc: 'One-off prompt', appendCursor: true },
      { name: 'Resume Specific', cmd: 'copilot --resume', desc: 'Pick from recent sessions' },
    ],
    contextVars: ['#file', '#selection', '#function', '#class', '#block', '#line'],
  },
  claude: {
    name: 'Claude Code CLI',
    icon: '🧠',
    color: '#f59e0b',
    slashCommands: [
      { cmd: '/help', desc: 'Show all commands' },
      { cmd: '/model', desc: 'Switch model' },
      { cmd: '/clear', desc: 'Clear history' },
      { cmd: '/compact', desc: 'Compress context' },
      { cmd: '/cost', desc: 'Show usage cost' },
      { cmd: '/doctor', desc: 'Health check' },
      { cmd: '/init', desc: 'Initialize CLAUDE.md' },
      { cmd: '/memory', desc: 'Edit memory file' },
      { cmd: '/review', desc: 'Code review' },
    ],
    quickCommands: [
      { name: 'Continue Session', cmd: 'claude --continue', desc: 'Resume last conversation' },
      { name: 'Plan Mode (Opus)', cmd: 'claude --model opus', desc: 'Use Opus for planning' },
      { name: 'Quick Question', cmd: 'claude -p "', desc: 'One-off prompt', appendCursor: true },
      { name: 'Full Auto', cmd: 'claude --dangerously-skip-permissions', desc: '⚠️ Skip all prompts' },
    ],
    contextVars: [],
  },
  git: {
    name: 'Git',
    icon: '⎇',
    color: '#f14e32',
    slashCommands: [],
    quickCommands: [
      { name: 'Status', cmd: 'git status', desc: 'Show working tree status' },
      { name: 'Diff', cmd: 'git diff', desc: 'Show changes' },
      { name: 'Stage All', cmd: 'git add .', desc: 'Stage all changes' },
      { name: 'Commit', cmd: 'git commit -m "', desc: 'Commit with message', appendCursor: true },
      { name: 'Push', cmd: 'git push', desc: 'Push to remote' },
      { name: 'Pull', cmd: 'git pull', desc: 'Pull from remote' },
      { name: 'Log', cmd: 'git log --oneline -10', desc: 'Recent commits' },
      { name: 'Stash', cmd: 'git stash', desc: 'Stash changes' },
      { name: 'Stash Pop', cmd: 'git stash pop', desc: 'Apply stashed changes' },
    ],
    contextVars: [],
  },
  npm: {
    name: 'npm',
    icon: '📦',
    color: '#cb3837',
    slashCommands: [],
    quickCommands: [
      { name: 'Install', cmd: 'npm install', desc: 'Install dependencies' },
      { name: 'Run Dev', cmd: 'npm run dev', desc: 'Start dev server' },
      { name: 'Run Build', cmd: 'npm run build', desc: 'Production build' },
      { name: 'Run Test', cmd: 'npm test', desc: 'Run tests' },
      { name: 'Update', cmd: 'npm update', desc: 'Update packages' },
      { name: 'Audit', cmd: 'npm audit', desc: 'Security audit' },
    ],
    contextVars: [],
  },
  general: {
    name: 'General',
    icon: '💻',
    color: '#888',
    slashCommands: [],
    quickCommands: [
      { name: 'Start Copilot', cmd: 'copilot', desc: 'Launch Copilot CLI' },
      { name: 'Start Claude', cmd: 'claude', desc: 'Launch Claude Code' },
      { name: 'List Files', cmd: 'ls -la', desc: 'List directory contents' },
      { name: 'Clear Terminal', cmd: 'clear', desc: 'Clear screen' },
    ],
    contextVars: [],
  },
};

// Detect which CLI is likely active based on terminal buffer
function detectActiveCLI(terminalBuffer) {
  if (!terminalBuffer) return 'general';
  
  const buffer = terminalBuffer.toLowerCase();
  const lastChunk = buffer.slice(-2000); // Check last portion
  
  // Check for active CLI indicators
  if (lastChunk.includes('copilot>') || lastChunk.includes('github copilot') || 
      lastChunk.includes('copilot cli') || /copilot\s*$/.test(lastChunk)) {
    return 'copilot';
  }
  if (lastChunk.includes('claude>') || lastChunk.includes('claude code') ||
      lastChunk.includes('anthropic') || /claude\s*$/.test(lastChunk)) {
    return 'claude';
  }
  if (lastChunk.includes('on branch') || lastChunk.includes('git status') ||
      lastChunk.includes('changes not staged') || lastChunk.includes('untracked files')) {
    return 'git';
  }
  if (lastChunk.includes('npm run') || lastChunk.includes('package.json') ||
      lastChunk.includes('node_modules')) {
    return 'npm';
  }
  
  return 'general';
}

export default function ForgeAssist({ 
  isOpen, 
  onClose, 
  onSendToTerminal, 
  onSendToChat,
  terminalBuffer,
  activeView = 'terminal', // 'terminal' or 'chat'
  onToast
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detectedCLI, setDetectedCLI] = useState('general');
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Detect CLI when opened or buffer changes
  useEffect(() => {
    if (isOpen) {
      const cli = detectActiveCLI(terminalBuffer);
      setDetectedCLI(cli);
      setSearchQuery('');
      setSelectedIndex(0);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, terminalBuffer]);

  // Get current CLI config
  const cliConfig = CLI_COMMANDS[detectedCLI] || CLI_COMMANDS.general;

  // Build filtered command list
  const getFilteredCommands = useCallback(() => {
    const query = searchQuery.toLowerCase();
    const commands = [];

    // Add slash commands
    cliConfig.slashCommands.forEach(cmd => {
      if (!query || cmd.cmd.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)) {
        commands.push({ ...cmd, type: 'slash', category: 'Slash Commands' });
      }
    });

    // Add quick commands
    cliConfig.quickCommands.forEach(cmd => {
      if (!query || cmd.name.toLowerCase().includes(query) || cmd.cmd.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)) {
        commands.push({ ...cmd, type: 'quick', category: 'Quick Commands' });
      }
    });

    // Add context variables
    if (cliConfig.contextVars.length > 0) {
      cliConfig.contextVars.forEach(v => {
        if (!query || v.toLowerCase().includes(query)) {
          commands.push({ cmd: v, desc: 'Context variable', type: 'context', category: 'Context Variables' });
        }
      });
    }

    // If searching across all CLIs
    if (query && commands.length === 0) {
      Object.entries(CLI_COMMANDS).forEach(([key, config]) => {
        if (key === detectedCLI) return;
        config.quickCommands.forEach(cmd => {
          if (cmd.name.toLowerCase().includes(query) || cmd.cmd.toLowerCase().includes(query)) {
            commands.push({ ...cmd, type: 'quick', category: `${config.name}` });
          }
        });
      });
    }

    return commands;
  }, [searchQuery, cliConfig, detectedCLI]);

  const filteredCommands = getFilteredCommands();

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands.length > 0) {
        e.preventDefault();
        executeCommand(filteredCommands[selectedIndex]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute command
  const executeCommand = (command) => {
    if (!command) return;

    const target = activeView === 'chat' ? onSendToChat : onSendToTerminal;
    
    if (command.appendCursor) {
      // For commands that need user input, just insert and let them type
      target(command.cmd);
      if (onToast) onToast(`Inserted: ${command.cmd}`, 'info', 1500);
    } else {
      target(command.cmd);
      if (onToast) onToast(`Sent: ${command.cmd}`, 'success', 1500);
    }
    
    onClose();
  };

  // Copy command to clipboard
  const copyCommand = (cmd, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd);
    if (onToast) onToast(`Copied: ${cmd}`, 'success', 1500);
  };

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands = {};
  filteredCommands.forEach((cmd, idx) => {
    if (!groupedCommands[cmd.category]) {
      groupedCommands[cmd.category] = [];
    }
    groupedCommands[cmd.category].push({ ...cmd, globalIndex: idx });
  });

  return (
    <div className="forge-assist-overlay" onClick={onClose}>
      <div className="forge-assist-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="forge-assist-header">
          <div className="forge-assist-title">
            <Command size={18} />
            <span>Forge Assist</span>
            <span 
              className="forge-assist-cli-badge"
              style={{ background: cliConfig.color + '33', color: cliConfig.color, borderColor: cliConfig.color }}
            >
              {cliConfig.icon} {cliConfig.name}
            </span>
          </div>
          <button className="forge-assist-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="forge-assist-search">
          <Search size={16} className="forge-assist-search-icon" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="forge-assist-search-input"
          />
          <div className="forge-assist-target">
            {activeView === 'terminal' ? (
              <><Terminal size={12} /> Terminal</>
            ) : (
              <><MessageSquare size={12} /> Chat</>
            )}
          </div>
        </div>

        {/* Commands List */}
        <div className="forge-assist-list" ref={listRef}>
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category} className="forge-assist-group">
              <div className="forge-assist-group-header">
                {category === 'Slash Commands' && <Zap size={12} />}
                {category === 'Quick Commands' && <Play size={12} />}
                {category === 'Context Variables' && <Hash size={12} />}
                {category}
              </div>
              {commands.map((cmd) => (
                <div
                  key={cmd.globalIndex}
                  data-index={cmd.globalIndex}
                  className={`forge-assist-item ${cmd.globalIndex === selectedIndex ? 'selected' : ''}`}
                  onClick={() => executeCommand(cmd)}
                >
                  <div className="forge-assist-item-content">
                    <code className="forge-assist-cmd">{cmd.cmd}</code>
                    {cmd.name && <span className="forge-assist-name">{cmd.name}</span>}
                    <span className="forge-assist-desc">{cmd.desc}</span>
                  </div>
                  <div className="forge-assist-item-actions">
                    <button 
                      className="forge-assist-copy"
                      onClick={(e) => copyCommand(cmd.cmd, e)}
                      title="Copy to clipboard"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="forge-assist-empty">
              No commands found for "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="forge-assist-footer">
          <span>↑↓ Navigate</span>
          <span>Enter Send</span>
          <span>Esc Close</span>
          <span>Ctrl+/ Toggle</span>
        </div>
      </div>
    </div>
  );
}
