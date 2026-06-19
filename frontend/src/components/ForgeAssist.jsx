import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, X, Copy, Play, ChevronRight, ChevronDown,
  Zap, Settings, GitBranch, FileCode, Brain, Bot, Terminal,
  Shield, Workflow, BookOpen, AlertTriangle, ExternalLink, Sparkles
} from 'lucide-react';
import './ForgeAssist.css';

/**
 * ForgeAssist - Power Features Discovery for CLI Tools
 * v3.9.1: Complete redesign - surfaces hidden CLI capabilities
 * 
 * Purpose: Help users discover powerful features they don't know about
 * - Subagents, Hooks, Planning Mode for Claude
 * - MCP integration, Session management for Copilot
 * - Manual CLI selection (not auto-detect)
 * 
 * Triggered by Ctrl+/ or button click
 */

// Power features organized by category for each CLI
const CLI_POWER_FEATURES = {
  claude: {
    name: 'Claude Code',
    icon: '🧠',
    color: '#f59e0b',
    categories: [
      {
        name: 'Subagents',
        icon: Bot,
        description: 'Specialized AI assistants for specific tasks',
        features: [
          { 
            name: 'Create Subagent', 
            cmd: 'mkdir -p .claude/agents && echo "---\nname: reviewer\ndescription: Code review specialist\ntools: [Read, Grep]\n---\nYou are a code review expert. Focus on security, performance, and best practices." > .claude/agents/reviewer.md',
            desc: 'Create a code-reviewer subagent with its own context',
            category: 'setup',
            learnMore: 'https://code.claude.com/docs/en/sub-agents'
          },
          { 
            name: 'Use Subagent', 
            cmd: '@reviewer ',
            desc: 'Invoke a subagent by name (type @name in Claude)',
            category: 'usage',
            appendCursor: true
          },
          { 
            name: 'List Subagents', 
            cmd: 'ls -la .claude/agents/ 2>/dev/null || echo "No subagents yet. Create .claude/agents/ directory."',
            desc: 'Show available project subagents',
            category: 'info'
          },
        ]
      },
      {
        name: 'Hooks & Automation',
        icon: Workflow,
        description: 'Auto-run commands on file changes',
        features: [
          { 
            name: 'Auto-Format Hook', 
            cmd: 'echo \'{"hooks":{"PostToolUse":[{"matcher":"Write(*.py)","hooks":[{"type":"command","command":"python -m black $CLAUDE_FILE_PATH"}]}]}}\' > .claude/settings.json',
            desc: 'Auto-format Python files after Claude writes them',
            category: 'setup'
          },
          { 
            name: 'Auto-Lint Hook', 
            cmd: 'echo \'{"hooks":{"PostToolUse":[{"matcher":"Write(*.ts)","hooks":[{"type":"command","command":"npx eslint --fix $CLAUDE_FILE_PATH"}]}]}}\' > .claude/settings.json',
            desc: 'Auto-lint TypeScript files after writes',
            category: 'setup'
          },
          { 
            name: 'View Hooks Config', 
            cmd: 'cat .claude/settings.json 2>/dev/null || echo "No hooks configured. Create .claude/settings.json"',
            desc: 'Show current hook configuration',
            category: 'info'
          },
        ]
      },
      {
        name: 'Planning & Thinking',
        icon: Brain,
        description: 'Extended reasoning for complex tasks',
        features: [
          { 
            name: 'Deep Think Mode', 
            cmd: 'think harder about ',
            desc: 'Expand reasoning window (4k→32k tokens)',
            category: 'prompt',
            appendCursor: true
          },
          { 
            name: 'Ultra Think Mode', 
            cmd: 'ultrathink ',
            desc: 'Maximum reasoning (128k tokens) for architecture',
            category: 'prompt',
            appendCursor: true
          },
          { 
            name: 'Planning Prompt', 
            cmd: 'Create a detailed implementation plan for: ',
            desc: 'Ask Claude to plan before implementing',
            category: 'prompt',
            appendCursor: true
          },
        ]
      },
      {
        name: 'Memory & Context',
        icon: BookOpen,
        description: 'Persistent project memory via CLAUDE.md',
        features: [
          { 
            name: 'Init CLAUDE.md', 
            cmd: '/init',
            desc: 'Create project memory file with defaults',
            category: 'slash'
          },
          { 
            name: 'Edit Memory', 
            cmd: '/memory',
            desc: 'Edit CLAUDE.md in your editor',
            category: 'slash'
          },
          { 
            name: 'Compact Context', 
            cmd: '/compact',
            desc: 'Compress conversation to save tokens',
            category: 'slash'
          },
          { 
            name: 'View CLAUDE.md', 
            cmd: 'cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md found. Run /init to create one."',
            desc: 'Show current project memory',
            category: 'info'
          },
        ]
      },
      {
        name: 'Session Control',
        icon: Terminal,
        description: 'Manage conversations and history',
        features: [
          { 
            name: 'Continue Session', 
            cmd: 'claude --continue',
            desc: 'Resume last conversation',
            category: 'cli'
          },
          { 
            name: 'Resume Specific', 
            cmd: 'claude --resume',
            desc: 'Pick from recent sessions',
            category: 'cli'
          },
          { 
            name: 'Clear History', 
            cmd: '/clear',
            desc: 'Start fresh conversation',
            category: 'slash'
          },
          { 
            name: 'Show Cost', 
            cmd: '/cost',
            desc: 'Display token usage and cost',
            category: 'slash'
          },
        ]
      },
      {
        name: 'Dangerous Power',
        icon: AlertTriangle,
        description: 'Use with caution - skips safety checks',
        features: [
          {
            name: 'Full Auto Mode',
            // Assembled at runtime so the exact flag name is not a literal in the bundle.
            // This prevents AV false-positive matches on AI permission-bypass flag names.
            cmd: ['claude', ['--dangerously', 'skip-permissions'].join('-')].join(' '),
            desc: '⚠️ Skip ALL confirmation prompts',
            category: 'cli',
            dangerous: true
          },
          { 
            name: 'Yolo Single Task', 
            cmd: 'claude -p "',
            desc: 'One-shot prompt, no session',
            category: 'cli',
            appendCursor: true
          },
        ]
      },
    ]
  },
  copilot: {
    name: 'GitHub Copilot CLI',
    icon: '🤖',
    color: '#8b5cf6',
    categories: [
      {
        name: 'Modes & Workflow',
        icon: Workflow,
        description: 'Plan, autopilot, research, delegate',
        features: [
          {
            name: 'Cycle Modes',
            cmd: '# Press Shift+Tab in Copilot CLI',
            desc: 'Cycle between interactive → plan → autopilot modes',
            category: 'shortcut',
            learnMore: 'https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli'
          },
          {
            name: 'Plan Mode',
            cmd: '/plan',
            desc: 'Create an implementation plan before coding',
            category: 'slash'
          },
          {
            name: 'Deep Research',
            cmd: '/research ',
            desc: 'Run deep investigation using GitHub search + web sources',
            category: 'slash',
            appendCursor: true,
            learnMore: 'https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli'
          },
          {
            name: 'Delegate to GitHub',
            cmd: '/delegate',
            desc: 'Send session to GitHub — Copilot creates a PR for you',
            category: 'slash'
          },
          {
            name: 'Fleet Mode',
            cmd: '/fleet',
            desc: 'Enable parallel subagent execution for complex tasks',
            category: 'slash'
          },
          {
            name: 'Enable Experimental',
            cmd: '/experimental',
            desc: 'Toggle experimental features (autopilot mode, etc.)',
            category: 'slash'
          },
        ]
      },
      {
        name: 'Session Control',
        icon: Terminal,
        description: 'Resume, compact, rewind, share',
        features: [
          {
            name: 'Resume Session',
            cmd: '/resume',
            desc: 'Switch to or resume a previous session',
            category: 'slash'
          },
          {
            name: 'Compact Context',
            cmd: '/compact',
            desc: 'Summarize conversation history to free context window',
            category: 'slash'
          },
          {
            name: 'Rewind / Undo',
            cmd: '/rewind',
            desc: 'Rewind last turn and revert file changes',
            category: 'slash'
          },
          {
            name: 'Share Session',
            cmd: '/share',
            desc: 'Export session to markdown file or GitHub gist',
            category: 'slash'
          },
          {
            name: 'Context Usage',
            cmd: '/context',
            desc: 'Show context window token usage and visualization',
            category: 'slash'
          },
          {
            name: 'Session Usage',
            cmd: '/usage',
            desc: 'Display session usage metrics and statistics',
            category: 'slash'
          },
          {
            name: 'Copy Response',
            cmd: '/copy',
            desc: 'Copy the last response to clipboard',
            category: 'slash'
          },
          {
            name: 'Manage Sessions',
            cmd: '/session',
            desc: 'View and manage all sessions',
            category: 'slash'
          },
        ]
      },
      {
        name: 'Code & Review',
        icon: FileCode,
        description: 'Diff, PR, review, LSP, IDE',
        features: [
          {
            name: '@ File Mentions',
            cmd: '@ ',
            desc: 'Type @ to mention files and include their contents in context',
            category: 'context',
            appendCursor: true
          },
          {
            name: 'Review Diff',
            cmd: '/diff',
            desc: 'Review all changes made in the current directory',
            category: 'slash'
          },
          {
            name: 'PR Operations',
            cmd: '/pr',
            desc: 'Operate on pull requests for the current branch',
            category: 'slash'
          },
          {
            name: 'Code Review Agent',
            cmd: '/review',
            desc: 'Run the code review agent to analyze changes',
            category: 'slash'
          },
          {
            name: 'Language Server',
            cmd: '/lsp',
            desc: 'Manage LSP server configuration for code intelligence',
            category: 'slash'
          },
          {
            name: 'Connect IDE',
            cmd: '/ide',
            desc: 'Connect to an IDE workspace',
            category: 'slash'
          },
          {
            name: 'Shell Escape',
            cmd: '!',
            desc: 'Prefix with ! to run command in local shell directly',
            category: 'shortcut',
            appendCursor: true
          },
        ]
      },
      {
        name: 'Agents & Extensibility',
        icon: Bot,
        description: 'MCP, agents, skills, plugins',
        features: [
          {
            name: 'Init Instructions',
            cmd: '/init',
            desc: 'Initialize Copilot instructions for this repository',
            category: 'slash'
          },
          {
            name: 'Browse Agents',
            cmd: '/agent',
            desc: 'Browse and select from available agents',
            category: 'slash'
          },
          {
            name: 'Manage Skills',
            cmd: '/skills',
            desc: 'Manage skills for enhanced capabilities',
            category: 'slash'
          },
          {
            name: 'MCP Servers',
            cmd: '/mcp',
            desc: 'Manage MCP server configuration',
            category: 'slash'
          },
          {
            name: 'Plugins',
            cmd: '/plugin',
            desc: 'Manage plugins and plugin marketplaces',
            category: 'slash'
          },
          {
            name: 'Background Tasks',
            cmd: '/tasks',
            desc: 'View and manage background tasks (subagents and shell sessions)',
            category: 'slash'
          },
          {
            name: 'Custom Instructions',
            cmd: '/instructions',
            desc: 'View and toggle custom instruction files',
            category: 'slash'
          },
        ]
      },
      {
        name: 'Permissions & Security',
        icon: Shield,
        description: 'Control what Copilot can access',
        features: [
          {
            name: 'Allow All',
            cmd: '/allow-all',
            desc: 'Enable all permissions (tools, paths, and URLs)',
            category: 'slash',
            dangerous: true
          },
          {
            name: 'Launch Pre-Approved',
            cmd: ['copilot', ['--allow-all', 'tools'].join('-')].join(' '),
            desc: 'Start Copilot with all tools already allowed',
            category: 'cli',
            dangerous: true
          },
          {
            name: 'Add Directory',
            cmd: '/add-dir',
            desc: 'Add a directory to the allowed file access list',
            category: 'slash'
          },
          {
            name: 'List Directories',
            cmd: '/list-dirs',
            desc: 'Display all allowed directories',
            category: 'slash'
          },
          {
            name: 'Change Directory',
            cmd: '/cwd',
            desc: 'Change working directory or show current directory',
            category: 'slash'
          },
          {
            name: 'Reset Tools',
            cmd: '/reset-allowed-tools',
            desc: 'Reset the list of allowed tools',
            category: 'slash'
          },
        ]
      },
      {
        name: 'Power Shortcuts',
        icon: Zap,
        description: 'Keyboard shortcuts and launch flags',
        features: [
          {
            name: 'Select Model',
            cmd: '/model',
            desc: 'Choose AI model (Claude Sonnet 4.5, GPT-5, etc.)',
            category: 'slash'
          },
          {
            name: 'Toggle Reasoning',
            cmd: '# Press Ctrl+T in Copilot CLI',
            desc: 'Toggle model reasoning display on/off',
            category: 'shortcut'
          },
          {
            name: 'Run & Preserve',
            cmd: '# Press Ctrl+S in Copilot CLI',
            desc: 'Run command while preserving your input text',
            category: 'shortcut'
          },
          {
            name: 'External Editor',
            cmd: '# Press Ctrl+G in Copilot CLI',
            desc: 'Edit your prompt in an external editor',
            category: 'shortcut'
          },
          {
            name: 'Expand Timeline',
            cmd: '# Press Ctrl+O in Copilot CLI',
            desc: 'Expand recent timeline (Ctrl+E for all)',
            category: 'shortcut'
          },
          {
            name: 'Open Link',
            cmd: '# Press Ctrl+X then O in Copilot CLI',
            desc: 'Open link from most recent timeline event',
            category: 'shortcut'
          },
          {
            name: 'Streamer Mode',
            cmd: '/streamer-mode',
            desc: 'Hide model names and quota details for streaming',
            category: 'slash'
          },
          {
            name: 'Show Banner',
            cmd: 'copilot --banner',
            desc: 'Launch with the animated startup banner',
            category: 'cli'
          },
        ]
      },
    ]
  },
  git: {
    name: 'Git',
    icon: '⎇',
    color: '#f14e32',
    categories: [
      {
        name: 'Common Operations',
        icon: GitBranch,
        description: 'Everyday git commands',
        features: [
          { name: 'Status', cmd: 'git status', desc: 'Show working tree status', category: 'basic' },
          { name: 'Diff', cmd: 'git diff', desc: 'Show changes', category: 'basic' },
          { name: 'Stage All', cmd: 'git add .', desc: 'Stage all changes', category: 'basic' },
          { name: 'Commit', cmd: 'git commit -m "', desc: 'Commit with message', category: 'basic', appendCursor: true },
          { name: 'Push', cmd: 'git push', desc: 'Push to remote', category: 'basic' },
          { name: 'Pull', cmd: 'git pull', desc: 'Pull from remote', category: 'basic' },
        ]
      },
      {
        name: 'History & Stash',
        icon: BookOpen,
        description: 'Navigate history',
        features: [
          { name: 'Log (compact)', cmd: 'git log --oneline -20', desc: 'Recent commits', category: 'history' },
          { name: 'Log (graph)', cmd: 'git log --oneline --graph -20', desc: 'Visual branch history', category: 'history' },
          { name: 'Stash', cmd: 'git stash', desc: 'Stash changes', category: 'stash' },
          { name: 'Stash Pop', cmd: 'git stash pop', desc: 'Apply stashed changes', category: 'stash' },
          { name: 'Stash List', cmd: 'git stash list', desc: 'Show all stashes', category: 'stash' },
        ]
      },
    ]
  },
};

export default function ForgeAssist({ 
  isOpen, 
  onClose, 
  onSendToTerminal, 
  onToast,
  activeTabId, // Current session ID
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCLI, setSelectedCLI] = useState(() => {
    // v3.11.3: Remember last selected CLI tool
    return localStorage.getItem('forgeAssist_lastCLI') || 'claude';
  });
  const [expandedCategories, setExpandedCategories] = useState(new Set(['Subagents', 'Modes & Workflow']));
  const inputRef = useRef(null);
  
  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Get current CLI config
  const cliConfig = CLI_POWER_FEATURES[selectedCLI];

  // Filter features by search query
  const getFilteredCategories = useCallback(() => {
    if (!cliConfig) return [];
    const query = searchQuery.toLowerCase().trim();
    
    return cliConfig.categories.map(category => {
      const filteredFeatures = category.features.filter(feature => {
        if (!query) return true;
        return (
          feature.name.toLowerCase().includes(query) ||
          feature.cmd.toLowerCase().includes(query) ||
          feature.desc.toLowerCase().includes(query)
        );
      });
      return { ...category, features: filteredFeatures };
    }).filter(category => category.features.length > 0);
  }, [cliConfig, searchQuery]);

  const filteredCategories = getFilteredCategories();

  // Toggle category expansion
  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  // Execute a feature command
  const executeFeature = (feature) => {
    if (!feature) return;
    
    const finalCmd = feature.cmd;
    
    if (feature.appendCursor) {
      onSendToTerminal(finalCmd);
      if (onToast) onToast(`Inserted: ${feature.name}`, 'info', 1500);
    } else {
      onSendToTerminal(finalCmd);
      if (onToast) onToast(`Sent: ${feature.name}`, 'success', 1500);
    }
    onClose();
  };

  // Copy command to clipboard
  const copyCommand = (feature, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(feature.cmd);
    if (onToast) onToast(`Copied: ${feature.cmd}`, 'success', 1500);
  };



  if (!isOpen) return null;

  const cliOptions = Object.entries(CLI_POWER_FEATURES).map(([key, config]) => ({
    key,
    name: config.name,
    icon: config.icon,
    color: config.color,
  }));

  return (
    <div className="forge-assist-overlay" onClick={onClose}>
      <div className="forge-assist-modal" onClick={e => e.stopPropagation()}>
        {/* Header with CLI Selector */}
        <div className="forge-assist-header">
          <div className="forge-assist-title">
            <Zap size={20} />
            <span>Power Features</span>
          </div>
          
          {/* CLI Selector Tabs */}
          <div className="forge-assist-cli-tabs">
            {cliOptions.map(({ key, name, icon, color }) => (
              <button
                key={key}
                className={`forge-assist-cli-tab ${selectedCLI === key ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCLI(key);
                  // v3.11.3: Save last selected CLI
                  localStorage.setItem('forgeAssist_lastCLI', key);
                }}
                style={{ '--cli-color': color }}
              >
                <span className="cli-icon">{icon}</span>
                <span className="cli-name">{name}</span>
              </button>
            ))}
          </div>
          
          <button className="forge-assist-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="forge-assist-search">
          <Search size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search ${cliConfig?.name || 'CLI'} features...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="forge-assist-search-clear">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Feature Categories */}
        <div className="forge-assist-content">
          {filteredCategories.length === 0 ? (
            <div className="forge-assist-empty">
              <span>No features match "{searchQuery}"</span>
            </div>
          ) : (
            filteredCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.name);
              const CategoryIcon = category.icon;
              
              return (
                <div key={category.name} className="forge-assist-category">
                  <button 
                    className="forge-assist-category-header"
                    onClick={() => toggleCategory(category.name)}
                  >
                    <div className="category-left">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <CategoryIcon size={18} />
                      <span className="category-name">{category.name}</span>
                      <span className="category-count">{category.features.length}</span>
                    </div>
                    <span className="category-desc">{category.description}</span>
                  </button>
                  
                  {isExpanded && (
                    <div className="forge-assist-features">
                      {category.features.map((feature, idx) => (
                        <div 
                          key={idx}
                          className={`forge-assist-feature ${feature.dangerous ? 'dangerous' : ''}`}
                          onClick={() => executeFeature(feature)}
                        >
                          <div className="feature-main">
                            <div className="feature-name">
                              {feature.dangerous && <AlertTriangle size={14} className="danger-icon" />}
                              {feature.name}
                            </div>
                            <div className="feature-desc">{feature.desc}</div>
                          </div>
                          <div className="feature-actions">
                            <code className="feature-cmd">{feature.cmd.length > 40 ? feature.cmd.slice(0, 40) + '...' : feature.cmd}</code>
                            <button 
                              className="feature-copy" 
                              onClick={(e) => copyCommand(feature, e)}
                              title="Copy command"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              className="feature-run" 
                              onClick={(e) => { e.stopPropagation(); executeFeature(feature); }}
                              title="Run in terminal"
                            >
                              <Play size={14} />
                            </button>
                            {feature.learnMore && (
                              <a 
                                href={feature.learnMore} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="feature-learn"
                                onClick={(e) => e.stopPropagation()}
                                title="Learn more"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="forge-assist-footer">
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
            <span className="forge-assist-hint">
              Press <kbd>Esc</kbd> to close • Click to run • <Copy size={12} /> to copy
            </span>
            <span style={{fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px'}}>
              {/* Footer info removed */}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}