import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, X, Copy, Play, ChevronRight, ChevronDown,
  Zap, Settings, GitBranch, FileCode, Brain, Bot, Terminal,
  Shield, Workflow, BookOpen, Sparkles, AlertTriangle, ExternalLink, FileText, Edit, Save, Loader2
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
  
  // Instruction Mode state
  const [isInstructionMode, setIsInstructionMode] = useState(() => {
    return localStorage.getItem('forgeAssist_instructionMode') === 'true';
  });
  const [showInstructionManager, setShowInstructionManager] = useState(false);
  const [instructionFiles, setInstructionFiles] = useState([]);
  const [selectedInstructionFile, setSelectedInstructionFile] = useState(null);
  const [instructionContent, setInstructionContent] = useState('');
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [activeInstructionFile, setActiveInstructionFile] = useState(() => {
    return localStorage.getItem('forgeAssist_activeInstructionFile') || null;
  });

  // Quick Instructions state - toggle-able text snippets that append to prompts
  // This is what the user asked for: "always append" instructions independent of command cards
  const [quickInstructions, setQuickInstructions] = useState(() => {
    const saved = localStorage.getItem('forgeAssist_quickInstructions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showQuickInstructionsPanel, setShowQuickInstructionsPanel] = useState(false);
  const [newInstructionText, setNewInstructionText] = useState('');
  const [newInstructionLabel, setNewInstructionLabel] = useState('');

  // Save quick instructions to localStorage
  const saveQuickInstructions = useCallback((instructions) => {
    localStorage.setItem('forgeAssist_quickInstructions', JSON.stringify(instructions));
    setQuickInstructions(instructions);
  }, []);

  // Add a new quick instruction
  const addQuickInstruction = useCallback(() => {
    if (!newInstructionText.trim()) return;
    const newInstruction = {
      id: Date.now().toString(),
      label: newInstructionLabel.trim() || `Instruction ${quickInstructions.length + 1}`,
      text: newInstructionText.trim(),
      enabled: true,
    };
    const updated = [...quickInstructions, newInstruction];
    saveQuickInstructions(updated);
    setNewInstructionText('');
    setNewInstructionLabel('');
    if (onToast) onToast(`Added: ${newInstruction.label}`, 'success', 1500);
  }, [newInstructionText, newInstructionLabel, quickInstructions, saveQuickInstructions, onToast]);

  // Toggle a quick instruction on/off
  const toggleQuickInstruction = useCallback((id) => {
    const updated = quickInstructions.map(inst => 
      inst.id === id ? { ...inst, enabled: !inst.enabled } : inst
    );
    saveQuickInstructions(updated);
  }, [quickInstructions, saveQuickInstructions]);

  // Delete a quick instruction
  const deleteQuickInstruction = useCallback((id) => {
    const updated = quickInstructions.filter(inst => inst.id !== id);
    saveQuickInstructions(updated);
  }, [quickInstructions, saveQuickInstructions]);

  // Get enabled quick instructions for appending
  const getEnabledQuickInstructions = useCallback(() => {
    return quickInstructions.filter(inst => inst.enabled).map(inst => inst.text);
  }, [quickInstructions]);

  // Toggle instruction mode and persist
  const toggleInstructionMode = useCallback(() => {
    setIsInstructionMode(prev => {
      const newValue = !prev;
      localStorage.setItem('forgeAssist_instructionMode', newValue.toString());
      return newValue;
    });
  }, []);

  // Load instruction files from project
  const loadInstructionFiles = useCallback(async () => {
    try {
      setIsLoadingInstructions(true);
      const response = await fetch('/api/files/instructions');
      if (response.ok) {
        const data = await response.json();
        setInstructionFiles(data.files || []);
      }
    } catch (err) {
      console.error('[ForgeAssist] Failed to load instruction files:', err);
    } finally {
      setIsLoadingInstructions(false);
    }
  }, []);

  // Load content of a specific instruction file
  const loadInstructionContent = useCallback(async (filePath) => {
    try {
      setIsLoadingInstructions(true);
      const response = await fetch(`/api/files/instructions/content?path=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const data = await response.json();
        setInstructionContent(data.content || '');
        setSelectedInstructionFile(filePath);
      }
    } catch (err) {
      console.error('[ForgeAssist] Failed to load instruction content:', err);
      setInstructionContent('');
    } finally {
      setIsLoadingInstructions(false);
    }
  }, []);

  // Open instruction manager
  const openInstructionManager = useCallback(async () => {
    setShowInstructionManager(true);
    await loadInstructionFiles();
  }, [loadInstructionFiles]);

  // Save instructions file
  const saveInstructions = useCallback(async () => {
    if (!selectedInstructionFile) return;
    
    try {
      setIsSavingInstructions(true);
      
      const response = await fetch('/api/files/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedInstructionFile,
          content: instructionContent
        })
      });
      
      if (response.ok) {
        // Set as active instruction file
        setActiveInstructionFile(selectedInstructionFile);
        localStorage.setItem('forgeAssist_activeInstructionFile', selectedInstructionFile);
        
        if (onToast) onToast(`Saved ${selectedInstructionFile}`, 'success', 2000);
        await loadInstructionFiles(); // Refresh list
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      console.error('[ForgeAssist] Failed to save instructions:', err);
      if (onToast) onToast('Failed to save instructions', 'error', 3000);
    } finally {
      setIsSavingInstructions(false);
    }
  }, [selectedInstructionFile, instructionContent, onToast, loadInstructionFiles]);

  // Create a new instruction file
  const createInstructionFile = useCallback(async (filename, template) => {
    try {
      setIsSavingInstructions(true);
      
      const response = await fetch('/api/files/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content: template
        })
      });
      
      if (response.ok) {
        setActiveInstructionFile(filename);
        localStorage.setItem('forgeAssist_activeInstructionFile', filename);
        if (onToast) onToast(`Created ${filename}`, 'success', 2000);
        await loadInstructionFiles();
        await loadInstructionContent(filename);
      }
    } catch (err) {
      console.error('[ForgeAssist] Failed to create instruction file:', err);
      if (onToast) onToast('Failed to create file', 'error', 3000);
    } finally {
      setIsSavingInstructions(false);
    }
  }, [onToast, loadInstructionFiles, loadInstructionContent]);

  // Set a file as active (used for appending to prompts)
  const setFileAsActive = useCallback((filePath) => {
    setActiveInstructionFile(filePath);
    localStorage.setItem('forgeAssist_activeInstructionFile', filePath);
    if (onToast) onToast(`${filePath} set as active instruction file`, 'success', 2000);
  }, [onToast]);

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
    
    let finalCmd = feature.cmd;
    
    // Append enabled quick instructions (user's custom "always append" snippets)
    const enabledInstructions = getEnabledQuickInstructions();
    if (enabledInstructions.length > 0) {
      finalCmd += `\n\n${enabledInstructions.join('\n')}`;
    }
    
    // Also append instruction file reference if instruction mode is active
    if (isInstructionMode && instructionContent.trim()) {
      finalCmd += `\n\n# Please follow and reference the instructions in copilot-instructions.md`;
    }
    
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
                onClick={() => setSelectedCLI(key)}
                style={{ '--cli-color': color }}
              >
                <span className="cli-icon">{icon}</span>
                <span className="cli-name">{name}</span>
              </button>
            ))}
          </div>
          
          {/* Quick Instructions & Instruction Mode Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Quick Instructions Button - NEW: Always append custom snippets */}
            <button 
              onClick={() => setShowQuickInstructionsPanel(true)}
              title="Quick Instructions - Add custom text that always appends to prompts"
              style={{
                background: quickInstructions.some(i => i.enabled) ? '#238636' : '#333',
                border: `2px solid ${quickInstructions.some(i => i.enabled) ? '#2ea043' : '#555'}`,
                color: quickInstructions.some(i => i.enabled) ? '#fff' : '#888',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <Sparkles size={16} />
              <span>Quick</span>
              {quickInstructions.filter(i => i.enabled).length > 0 && (
                <span style={{background: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700}}>
                  {quickInstructions.filter(i => i.enabled).length}
                </span>
              )}
            </button>
            <button 
              className={`forge-assist-instruction-toggle ${isInstructionMode ? 'active' : ''}`}
              onClick={toggleInstructionMode}
              title={isInstructionMode 
                ? "Instruction Mode ON - Instructions appended to prompts" 
                : "Instruction Mode OFF - Click to enable"}
              style={{ 
                background: isInstructionMode ? 'var(--accent-color, #8b5cf6)' : '#333',
                border: `2px solid ${isInstructionMode ? 'var(--accent-color, #8b5cf6)' : '#555'}`,
                color: isInstructionMode ? '#fff' : '#888',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <FileText size={16} />
              <span>Files</span>
              {isInstructionMode && <span style={{background: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700}}>ON</span>}
            </button>
            <button 
              className="forge-assist-manage-instructions"
              onClick={openInstructionManager}
              title="Manage instruction files (CLAUDE.md, copilot-instructions.md, etc.)"
              style={{
                background: '#333',
                border: '2px solid #555',
                color: '#aaa',
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              <Settings size={16} />
            </button>
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
              {!isInstructionMode ? (
                <>
                  <FileText size={12} /> Tip: Enable Instructions mode to append custom guidelines to commands
                </>
              ) : (
                <>
                  <span style={{color: 'var(--accent-color, #8b5cf6)', fontWeight: 600}}>✓ Instruction Mode Active</span> - Your custom instructions will be appended
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Instruction Manager Modal */}
      {showInstructionManager && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary, #1a1a1a)',
            width: '100%',
            maxWidth: '1000px',
            height: '85%',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            border: '2px solid var(--accent-color, #8b5cf6)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid var(--border-color, #333)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <h3 style={{margin: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontSize: '18px'}}>
                  <FileText size={24} style={{color: 'var(--accent-color, #8b5cf6)'}} />
                  AI Instruction Files
                </h3>
                <p style={{margin: 0, fontSize: '13px', color: '#888'}}>
                  Create and manage instruction files for Claude, Copilot, and other AI tools
                </p>
              </div>
              <button 
                onClick={() => setShowInstructionManager(false)}
                style={{background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '4px'}}
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Main Content - Split View */}
            <div style={{flex: 1, display: 'flex', overflow: 'hidden'}}>
              {/* File List Sidebar */}
              <div style={{
                width: '280px',
                borderRight: '1px solid var(--border-color, #333)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div style={{padding: '12px', borderBottom: '1px solid var(--border-color, #333)', fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase'}}>
                  Detected Files
                </div>
                <div style={{flex: 1, overflowY: 'auto', padding: '8px'}}>
                  {isLoadingInstructions ? (
                    <div style={{padding: '20px', textAlign: 'center', color: '#666'}}>
                      <Loader2 size={20} style={{animation: 'spin 1s linear infinite'}} />
                    </div>
                  ) : (
                    <>
                      {instructionFiles.map((file, idx) => (
                        <div 
                          key={idx}
                          onClick={() => file.exists && loadInstructionContent(file.path)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            background: selectedInstructionFile === file.path ? 'var(--accent-color, #8b5cf6)' : file.exists ? '#252525' : '#1a1a1a',
                            border: `1px solid ${file.path === activeInstructionFile ? '#8b5cf6' : file.exists ? '#333' : '#2a2a2a'}`,
                            cursor: file.exists ? 'pointer' : 'default',
                            opacity: file.exists ? 1 : 0.5,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                            <span style={{fontSize: '14px'}}>{file.cliType === 'claude' ? '🧠' : file.cliType === 'copilot' ? '🤖' : '📄'}</span>
                            <span style={{fontSize: '13px', fontWeight: 500, color: selectedInstructionFile === file.path ? '#fff' : file.exists ? '#ccc' : '#666'}}>
                              {file.name}
                            </span>
                            {file.path === activeInstructionFile && (
                              <span style={{marginLeft: 'auto', fontSize: '10px', background: '#238636', color: '#fff', padding: '2px 6px', borderRadius: '3px'}}>ACTIVE</span>
                            )}
                          </div>
                          <div style={{fontSize: '11px', color: selectedInstructionFile === file.path ? 'rgba(255,255,255,0.7)' : '#666', marginLeft: '26px'}}>
                            {file.path}
                          </div>
                          {file.exists && file.size > 0 && (
                            <div style={{fontSize: '10px', color: '#555', marginLeft: '26px', marginTop: '2px'}}>
                              {Math.round(file.size / 1024)}KB • Modified {new Date(file.modTime * 1000).toLocaleDateString()}
                            </div>
                          )}
                          {!file.exists && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const templates = {
                                  'CLAUDE.md': `# Project Instructions for Claude\n\n## Overview\nDescribe your project here.\n\n## Coding Standards\n- Follow existing patterns\n- Write tests for new features\n- Use TypeScript strict mode\n\n## Architecture\nDescribe key architectural decisions.\n`,
                                  '.github/copilot-instructions.md': `# Copilot Instructions\n\n## Project Context\nThis project uses...\n\n## Coding Guidelines\n- Use functional components with hooks\n- Prefer composition over inheritance\n- Write descriptive variable names\n\n## Testing\n- Use Playwright for E2E tests\n- Jest for unit tests\n`,
                                  'copilot-instructions.md': `# Copilot Instructions\n\nAdd your instructions here.\n`,
                                };
                                createInstructionFile(file.path, templates[file.path] || `# ${file.name}\n\nAdd your instructions here.\n`);
                              }}
                              style={{
                                marginTop: '8px',
                                marginLeft: '26px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                background: '#333',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                color: '#aaa',
                                cursor: 'pointer'
                              }}
                            >
                              + Create
                            </button>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              
              {/* Editor Area */}
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                {selectedInstructionFile ? (
                  <>
                    <div style={{padding: '12px 16px', borderBottom: '1px solid var(--border-color, #333)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div style={{fontSize: '14px', fontWeight: 500, color: '#ccc'}}>
                        Editing: <code style={{background: '#252525', padding: '2px 8px', borderRadius: '4px', fontSize: '13px'}}>{selectedInstructionFile}</code>
                      </div>
                      {selectedInstructionFile !== activeInstructionFile && (
                        <button
                          onClick={() => setFileAsActive(selectedInstructionFile)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#aaa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          Set as Active
                        </button>
                      )}
                    </div>
                    <div style={{flex: 1, padding: '16px', overflow: 'hidden'}}>
                      <textarea
                        value={instructionContent}
                        onChange={(e) => setInstructionContent(e.target.value)}
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'var(--bg-tertiary, #0a0a0a)',
                          border: '1px solid var(--border-color, #333)',
                          borderRadius: '8px',
                          padding: '16px',
                          color: '#fff',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          resize: 'none',
                          outline: 'none'
                        }}
                        placeholder="Enter your instructions here..."
                      />
                    </div>
                  </>
                ) : (
                  <div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666', gap: '16px'}}>
                    <FileText size={48} />
                    <p style={{margin: 0, fontSize: '14px'}}>Select a file to edit or create a new one</p>
                    <p style={{margin: 0, fontSize: '12px', color: '#555'}}>Instruction files tell AI tools how to work with your project</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-color, #333)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{fontSize: '12px', color: '#666'}}>
                {activeInstructionFile ? (
                  <>Active file: <code style={{color: '#8b5cf6'}}>{activeInstructionFile}</code> {isInstructionMode ? '✓ Will be referenced' : '(Enable Instruction Mode to use)'}</>
                ) : (
                  'No active instruction file selected'
                )}
              </div>
              <div style={{display: 'flex', gap: '12px'}}>
                <button 
                  onClick={() => setShowInstructionManager(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #333)',
                    background: 'transparent',
                    color: '#aaa',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Close
                </button>
                {selectedInstructionFile && (
                  <button 
                    onClick={saveInstructions}
                    disabled={isSavingInstructions}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--accent-color, #8b5cf6)',
                      color: 'white',
                      cursor: isSavingInstructions ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: isSavingInstructions ? 0.7 : 1
                    }}
                  >
                    {isSavingInstructions ? <Loader2 size={16} style={{animation: 'spin 1s linear infinite'}} /> : <Save size={16} />}
                    {isSavingInstructions ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Instructions Panel - Toggle-able text snippets that always append */}
      {showQuickInstructionsPanel && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary, #1a1a1a)',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80%',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            border: '2px solid #238636'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid var(--border-color, #333)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <h3 style={{margin: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontSize: '18px'}}>
                  <Sparkles size={24} style={{color: '#238636'}} />
                  Quick Instructions
                </h3>
                <p style={{margin: 0, fontSize: '13px', color: '#888'}}>
                  Add custom text snippets that automatically append to your prompts when enabled
                </p>
              </div>
              <button 
                onClick={() => setShowQuickInstructionsPanel(false)}
                style={{background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '4px'}}
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Add New Instruction */}
            <div style={{padding: '16px 20px', borderBottom: '1px solid var(--border-color, #333)'}}>
              <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                <input
                  type="text"
                  placeholder="Label (e.g., 'Follow Standards')"
                  value={newInstructionLabel}
                  onChange={(e) => setNewInstructionLabel(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#0d1117',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <textarea
                  placeholder="Enter instruction text (e.g., 'ensure you follow copilot-instructions.md')"
                  value={newInstructionText}
                  onChange={(e) => setNewInstructionText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#0d1117',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px',
                    minHeight: '60px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
                <button
                  onClick={addQuickInstruction}
                  disabled={!newInstructionText.trim()}
                  style={{
                    padding: '10px 16px',
                    background: newInstructionText.trim() ? '#238636' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: newInstructionText.trim() ? '#fff' : '#666',
                    cursor: newInstructionText.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    fontSize: '13px',
                    alignSelf: 'flex-end'
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            
            {/* Instruction List */}
            <div style={{flex: 1, overflowY: 'auto', padding: '12px 20px'}}>
              {quickInstructions.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px 20px', color: '#666'}}>
                  <Sparkles size={32} style={{marginBottom: '12px', opacity: 0.5}} />
                  <p style={{margin: 0, fontSize: '14px'}}>No quick instructions yet</p>
                  <p style={{margin: '8px 0 0', fontSize: '12px'}}>Add one above to always append it to your prompts</p>
                </div>
              ) : (
                quickInstructions.map((inst) => (
                  <div 
                    key={inst.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px',
                      background: inst.enabled ? 'rgba(35,134,54,0.15)' : '#0d1117',
                      border: `1px solid ${inst.enabled ? '#238636' : '#333'}`,
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <button
                      onClick={() => toggleQuickInstruction(inst.id)}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        border: `2px solid ${inst.enabled ? '#238636' : '#555'}`,
                        background: inst.enabled ? '#238636' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}
                    >
                      {inst.enabled ? '✓' : ''}
                    </button>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontWeight: 600, fontSize: '13px', color: inst.enabled ? '#2ea043' : '#888', marginBottom: '4px'}}>
                        {inst.label}
                      </div>
                      <div style={{fontSize: '12px', color: '#aaa', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                        {inst.text}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteQuickInstruction(inst.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        padding: '4px',
                        flexShrink: 0
                      }}
                      title="Delete"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-color, #333)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{fontSize: '12px', color: '#666'}}>
                {quickInstructions.filter(i => i.enabled).length > 0 ? (
                  <span style={{color: '#2ea043'}}>✓ {quickInstructions.filter(i => i.enabled).length} instruction(s) will append to prompts</span>
                ) : (
                  'No instructions enabled'
                )}
              </div>
              <button 
                onClick={() => setShowQuickInstructionsPanel(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#238636',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}