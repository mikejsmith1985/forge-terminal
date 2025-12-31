import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, X, Copy, Play, ChevronRight, ChevronDown,
  Zap, Settings, GitBranch, FileCode, Brain, Bot, Terminal,
  Shield, Workflow, BookOpen, Sparkles, AlertTriangle, ExternalLink
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
            cmd: 'claude --dangerously-skip-permissions',
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
        name: 'Session Management',
        icon: Terminal,
        description: 'Control conversation state',
        features: [
          { 
            name: 'Continue Session', 
            cmd: 'copilot --continue',
            desc: 'Resume last conversation',
            category: 'cli'
          },
          { 
            name: 'Resume Specific', 
            cmd: 'copilot --resume',
            desc: 'Pick from recent sessions',
            category: 'cli'
          },
          { 
            name: 'Quick Prompt', 
            cmd: 'copilot -p "',
            desc: 'One-off question, no session',
            category: 'cli',
            appendCursor: true
          },
        ]
      },
      {
        name: 'Model & Output',
        icon: Sparkles,
        description: 'Control AI behavior',
        features: [
          { 
            name: 'Switch Model', 
            cmd: '/model',
            desc: 'Choose different AI model',
            category: 'slash'
          },
          { 
            name: 'Stream Output', 
            cmd: 'copilot --stream',
            desc: 'Token-by-token output',
            category: 'cli'
          },
          { 
            name: 'Show Banner', 
            cmd: 'copilot --banner',
            desc: 'Display animated startup banner',
            category: 'cli'
          },
          { 
            name: 'Screen Reader', 
            cmd: 'copilot --screen-reader',
            desc: 'Optimize output for accessibility',
            category: 'cli'
          },
        ]
      },
      {
        name: 'Security & Permissions',
        icon: Shield,
        description: 'Control what Copilot can access',
        features: [
          { 
            name: 'Allow Tool', 
            cmd: 'copilot --allow-tool ',
            desc: 'Explicitly allow a system tool',
            category: 'cli',
            appendCursor: true
          },
          { 
            name: 'Deny Tool', 
            cmd: 'copilot --deny-tool ',
            desc: 'Block a specific tool',
            category: 'cli',
            appendCursor: true
          },
          { 
            name: 'Allow All Paths', 
            cmd: 'copilot --allow-all-paths',
            desc: '⚠️ Bypass path approvals',
            category: 'cli',
            dangerous: true
          },
          { 
            name: 'Serial Execution', 
            cmd: 'copilot --disable-parallel-tools-execution',
            desc: 'Run tools one at a time (safer)',
            category: 'cli'
          },
        ]
      },
      {
        name: 'Context Variables',
        icon: FileCode,
        description: 'Reference code in prompts',
        features: [
          { 
            name: '#file', 
            cmd: '#file:',
            desc: 'Reference a specific file',
            category: 'context',
            appendCursor: true
          },
          { 
            name: '#selection', 
            cmd: '#selection',
            desc: 'Reference current selection',
            category: 'context'
          },
          { 
            name: '#function', 
            cmd: '#function:',
            desc: 'Reference a function by name',
            category: 'context',
            appendCursor: true
          },
          { 
            name: '#class', 
            cmd: '#class:',
            desc: 'Reference a class by name',
            category: 'context',
            appendCursor: true
          },
        ]
      },
      {
        name: 'Built-in Commands',
        icon: Zap,
        description: 'Slash commands in conversation',
        features: [
          { 
            name: 'Explain Code', 
            cmd: '/explain',
            desc: 'Get explanation of code',
            category: 'slash'
          },
          { 
            name: 'Fix Issues', 
            cmd: '/fix',
            desc: 'Auto-fix code problems',
            category: 'slash'
          },
          { 
            name: 'Generate Tests', 
            cmd: '/tests',
            desc: 'Create tests for code',
            category: 'slash'
          },
          { 
            name: 'Show Usage', 
            cmd: '/usage',
            desc: 'Display token statistics',
            category: 'slash'
          },
        ]
      },
      {
        name: 'MCP Integration',
        icon: Settings,
        description: 'Connect external AI tools',
        features: [
          { 
            name: 'View Config', 
            cmd: 'cat ~/.copilot/config.json 2>/dev/null || echo "No config found at ~/.copilot/config.json"',
            desc: 'Show Copilot configuration',
            category: 'info'
          },
          { 
            name: 'Config Location', 
            cmd: 'echo "Windows: %USERPROFILE%\\.copilot\\config.json" && echo "macOS/Linux: ~/.copilot/config.json"',
            desc: 'Where to edit settings',
            category: 'info'
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
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCLI, setSelectedCLI] = useState('claude'); // Manual selection
  const [expandedCategories, setExpandedCategories] = useState(new Set(['Subagents', 'Session Management']));
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
    
    if (feature.appendCursor) {
      onSendToTerminal(feature.cmd);
      if (onToast) onToast(`Inserted: ${feature.name}`, 'info', 1500);
    } else {
      onSendToTerminal(feature.cmd);
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
                onClick={() => setSelectedCLI(key)}
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
          <span className="forge-assist-hint">
            Press <kbd>Esc</kbd> to close • Click to run • <Copy size={12} /> to copy
          </span>
        </div>
      </div>
    </div>
  );
}