import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Command, Terminal, MessageSquare, Search, Zap, Hash, X, Copy, Play, Target, FileCode, Brain, CheckCircle, Rocket, ChevronRight, Loader2 } from 'lucide-react';
import './ForgeAssist.css';

/**
 * ForgeAssist - Context-aware command palette for CLI tools
 * v3.9.0: Enhanced with Task Mode + SLM Integration
 * 
 * Features:
 * - Context-aware CLI detection (Copilot, Claude, Git, npm)
 * - Task Mode with 5 stages: Context → Plan → Implement → Validate → Deliver
 * - SLM-powered command suggestions (local AI, zero cost)
 * - Quick command execution to terminal
 * 
 * Triggered by Ctrl+/ or button click
 */

// Task stages for Task Mode
const TASK_STAGES = [
  { id: 'context', name: 'Context', icon: FileCode, color: '#3b82f6', desc: 'Gather files and understand scope' },
  { id: 'plan', name: 'Plan', icon: Brain, color: '#8b5cf6', desc: 'AI generates approach' },
  { id: 'implement', name: 'Implement', icon: Terminal, color: '#f59e0b', desc: 'Work in terminal' },
  { id: 'validate', name: 'Validate', icon: CheckCircle, color: '#10b981', desc: 'Run tests and checks' },
  { id: 'deliver', name: 'Deliver', icon: Rocket, color: '#ef4444', desc: 'Commit and deploy' },
];

// Stage-specific command suggestions
const STAGE_COMMANDS = {
  context: [
    { cmd: 'git status', desc: 'Check current changes', name: 'Git Status' },
    { cmd: 'git diff', desc: 'Review file changes', name: 'Git Diff' },
    { cmd: 'ls -la', desc: 'List directory contents', name: 'List Files' },
  ],
  plan: [
    { cmd: 'copilot', desc: 'Start Copilot for planning', name: 'Copilot Session' },
    { cmd: 'claude', desc: 'Start Claude for planning', name: 'Claude Session' },
    { cmd: 'cat README.md', desc: 'Review project docs', name: 'Read README' },
  ],
  implement: [
    { cmd: 'copilot --continue', desc: 'Continue last session', name: 'Continue Copilot' },
    { cmd: 'claude --continue', desc: 'Continue last session', name: 'Continue Claude' },
    { cmd: 'npm run dev', desc: 'Start dev server', name: 'Dev Server' },
  ],
  validate: [
    { cmd: 'npm test', desc: 'Run test suite', name: 'Run Tests' },
    { cmd: 'npm run lint', desc: 'Check code quality', name: 'Lint Code' },
    { cmd: 'npm run build', desc: 'Verify build works', name: 'Build Check' },
  ],
  deliver: [
    { cmd: 'git add .', desc: 'Stage all changes', name: 'Stage All' },
    { cmd: 'git commit -m "', desc: 'Commit with message', name: 'Commit', appendCursor: true },
    { cmd: 'git push', desc: 'Push to remote', name: 'Push' },
  ],
};

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
  terminalBuffer,
  activeView = 'terminal', // v3.8.2: Only terminal view remains
  onToast,
  contextFiles = [], // v3.9.0: Files from LensFilePicker for context
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detectedCLI, setDetectedCLI] = useState('general');
  const [mode, setMode] = useState('commands'); // 'commands' or 'task'
  const [taskStage, setTaskStage] = useState('context');
  const [slmStatus, setSlmStatus] = useState(null);
  const [slmLoading, setSlmLoading] = useState(false);
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

  // Fetch SLM status on mount
  useEffect(() => {
    if (isOpen && !slmStatus) {
      fetch('/api/slm/status')
        .then(res => res.json())
        .then(data => setSlmStatus(data.status))
        .catch(() => setSlmStatus(null));
    }
  }, [isOpen, slmStatus]);

  // Get current CLI config
  const cliConfig = CLI_COMMANDS[detectedCLI] || CLI_COMMANDS.general;

  // Build filtered command list
  const getFilteredCommands = useCallback(() => {
    const query = searchQuery.toLowerCase();
    const commands = [];
    
    // In Task Mode, show stage-specific commands
    if (mode === 'task') {
      const stageCommands = STAGE_COMMANDS[taskStage] || [];
      stageCommands.forEach(cmd => {
        if (!query || cmd.name.toLowerCase().includes(query) || cmd.cmd.toLowerCase().includes(query)) {
          commands.push({ ...cmd, type: 'stage', category: `${TASK_STAGES.find(s => s.id === taskStage)?.name || 'Task'} Commands` });
        }
      });
      return commands;
    }

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
  }, [searchQuery, cliConfig, detectedCLI, mode, taskStage]);

  const filteredCommands = getFilteredCommands();

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Tab to switch modes
      if (e.key === 'Tab') {
        e.preventDefault();
        setMode(prev => prev === 'commands' ? 'task' : 'commands');
        setSelectedIndex(0);
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
  }, [isOpen, filteredCommands, selectedIndex, onClose, mode]);

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

    // v3.8.2: Terminal is the only view
    if (command.appendCursor) {
      // For commands that need user input, just insert and let them type
      onSendToTerminal(command.cmd);
      if (onToast) onToast(`Inserted: ${command.cmd}`, 'info', 1500);
    } else {
      onSendToTerminal(command.cmd);
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

  // Advance to next task stage
  const advanceStage = () => {
    const currentIdx = TASK_STAGES.findIndex(s => s.id === taskStage);
    if (currentIdx < TASK_STAGES.length - 1) {
      setTaskStage(TASK_STAGES[currentIdx + 1].id);
      setSelectedIndex(0);
      if (onToast) onToast(`Stage: ${TASK_STAGES[currentIdx + 1].name}`, 'info', 1500);
    } else {
      if (onToast) onToast('🎉 Task complete!', 'success', 2000);
    }
  };

  // Group commands by category
  const groupedCommands = {};
  filteredCommands.forEach((cmd, idx) => {
    if (!groupedCommands[cmd.category]) {
      groupedCommands[cmd.category] = [];
    }
    groupedCommands[cmd.category].push({ ...cmd, globalIndex: idx });
  });

  // Get current task stage info
  const currentStage = TASK_STAGES.find(s => s.id === taskStage);

  return (
    <div className="forge-assist-overlay" onClick={onClose}>
      <div className="forge-assist-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="forge-assist-header">
          <div className="forge-assist-title">
            <Command size={18} />
            <span>Forge Assist</span>
            {mode === 'commands' ? (
              <span 
                className="forge-assist-cli-badge"
                style={{ background: cliConfig.color + '33', color: cliConfig.color, borderColor: cliConfig.color }}
              >
                {cliConfig.icon} {cliConfig.name}
              </span>
            ) : (
              <span 
                className="forge-assist-cli-badge"
                style={{ background: currentStage?.color + '33', color: currentStage?.color, borderColor: currentStage?.color }}
              >
                <Target size={12} /> Task Mode
              </span>
            )}
          </div>
          <button className="forge-assist-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Mode Toggle + Search */}
        <div className="forge-assist-search">
          <div className="forge-assist-mode-toggle">
            <button 
              className={`mode-btn ${mode === 'commands' ? 'active' : ''}`}
              onClick={() => { setMode('commands'); setSelectedIndex(0); }}
            >
              <Command size={14} /> Commands
            </button>
            <button 
              className={`mode-btn ${mode === 'task' ? 'active' : ''}`}
              onClick={() => { setMode('task'); setSelectedIndex(0); }}
            >
              <Target size={14} /> Task
            </button>
          </div>
          <div className="forge-assist-search-row">
            <Search size={16} className="forge-assist-search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder={mode === 'task' ? `Search ${currentStage?.name} commands...` : "Search commands..."}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="forge-assist-search-input"
            />
            {slmStatus?.model_loaded && (
              <div className="forge-assist-slm-badge" title="SLM Active - Local AI suggestions">
                🧠 SLM
              </div>
            )}
            {slmStatus && !slmStatus.model_loaded && mode === 'task' && (
              <div 
                className="forge-assist-slm-badge slm-inactive" 
                title="Enable Smart Routing in Settings for AI-powered suggestions"
                style={{ background: '#1c1917', borderColor: '#44403c', color: '#888', cursor: 'pointer' }}
                onClick={() => {
                  if (onToast) onToast('Open Settings (⚙️) → Smart Routing to install local AI', 'info', 4000);
                }}
              >
                🧠 Enable SLM
              </div>
            )}
          </div>
        </div>

        {/* Task Stage Progress (only in Task Mode) */}
        {mode === 'task' && (
          <div className="forge-assist-stages">
            {TASK_STAGES.map((stage, idx) => {
              const StageIcon = stage.icon;
              const isActive = stage.id === taskStage;
              const isPast = TASK_STAGES.findIndex(s => s.id === taskStage) > idx;
              return (
                <React.Fragment key={stage.id}>
                  <button
                    className={`stage-dot ${isActive ? 'active' : ''} ${isPast ? 'complete' : ''}`}
                    style={{ 
                      '--stage-color': stage.color,
                      background: isActive || isPast ? stage.color : 'transparent',
                      borderColor: stage.color
                    }}
                    onClick={() => { setTaskStage(stage.id); setSelectedIndex(0); }}
                    title={`${stage.name}: ${stage.desc}`}
                  >
                    <StageIcon size={12} />
                  </button>
                  {idx < TASK_STAGES.length - 1 && (
                    <div className={`stage-line ${isPast ? 'complete' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Context Summary (Task Mode only) */}
        {mode === 'task' && taskStage === 'context' && contextFiles.length > 0 && (
          <div className="forge-assist-context-summary">
            <FileCode size={14} />
            <span>{contextFiles.length} files in context</span>
          </div>
        )}

        {/* Commands List */}
        <div className="forge-assist-list" ref={listRef}>
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category} className="forge-assist-group">
              <div className="forge-assist-group-header">
                {category === 'Slash Commands' && <Zap size={12} />}
                {category === 'Quick Commands' && <Play size={12} />}
                {category === 'Context Variables' && <Hash size={12} />}
                {category.includes('Commands') && mode === 'task' && <Target size={12} />}
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
          <span>Tab Switch Mode</span>
          {mode === 'task' && (
            <button className="footer-advance-btn" onClick={advanceStage}>
              Next Stage <ChevronRight size={12} />
            </button>
          )}
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
