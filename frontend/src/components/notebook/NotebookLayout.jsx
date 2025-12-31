/**
 * NotebookLayout - Agentic Notebook View
 * 
 * An alternate view mode to Terminal and Chat that provides a Jupyter-style
 * notebook interface with different cell types:
 * - TerminalBlock: Raw xterm.js for command execution
 * - AgentBlock: Markdown for AI planning/reasoning
 * - LensBlock: File references from sidebar selection
 * 
 * This is the "Agentic Notebook" pivot - a single vertical timeline
 * without chat bubble styling.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Plus, Terminal, Bot, FileCode, Trash2, 
  ChevronUp, ChevronDown, Play, Settings,
  BookOpen, Layers
} from 'lucide-react';
import TerminalBlock from './TerminalBlock';
import AgentBlock, { AGENT_TYPE } from './AgentBlock';
import LensBlock, { PERMISSION } from './LensBlock';
import './NotebookLayout.css';

// Cell types
const CELL_TYPE = {
  TERMINAL: 'terminal',
  AGENT: 'agent',
  LENS: 'lens',
};

// Generate unique cell ID
let cellIdCounter = 0;
const generateCellId = () => `cell-${Date.now()}-${++cellIdCounter}`;

/**
 * Create a new cell object
 */
const createCell = (type, data = {}) => ({
  id: generateCellId(),
  type,
  createdAt: Date.now(),
  ...data,
});

const NotebookLayout = ({
  tabId,
  fontSize = 14,
  colorTheme = 'molten',
  theme = 'dark',
  shellConfig,
  onToggleTerminal,
  onOpenSettings,
  onFileSelect, // Callback when a file is selected from Lens
  selectedFiles = [], // Files selected in sidebar Lens picker
  wsBaseUrl,
}) => {
  // Notebook cells state
  const [cells, setCells] = useState(() => [
    // Start with one empty terminal cell
    createCell(CELL_TYPE.TERMINAL, { command: '' }),
  ]);
  
  const [focusedCellId, setFocusedCellId] = useState(null);
  const cellRefs = useRef({});
  const containerRef = useRef(null);

  // Add cells when files are selected from sidebar
  useEffect(() => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    // Create LensBlock cells for each newly selected file
    const existingFilePaths = cells
      .filter(c => c.type === CELL_TYPE.LENS)
      .map(c => c.file?.path);
    
    const newFiles = selectedFiles.filter(f => !existingFilePaths.includes(f.path));
    
    if (newFiles.length > 0) {
      const newCells = newFiles.map(file => 
        createCell(CELL_TYPE.LENS, { file, permission: PERMISSION.READ })
      );
      setCells(prev => [...newCells, ...prev]); // Add at top
    }
  }, [selectedFiles]);

  // Add a new cell
  const addCell = useCallback((type, afterCellId = null, data = {}) => {
    const newCell = createCell(type, data);
    
    setCells(prev => {
      if (afterCellId) {
        const index = prev.findIndex(c => c.id === afterCellId);
        if (index !== -1) {
          const newCells = [...prev];
          newCells.splice(index + 1, 0, newCell);
          return newCells;
        }
      }
      return [...prev, newCell];
    });
    
    setFocusedCellId(newCell.id);
    return newCell.id;
  }, []);

  // Remove a cell
  const removeCell = useCallback((cellId) => {
    setCells(prev => {
      const filtered = prev.filter(c => c.id !== cellId);
      // Ensure at least one cell remains
      if (filtered.length === 0) {
        return [createCell(CELL_TYPE.TERMINAL, { command: '' })];
      }
      return filtered;
    });
  }, []);

  // Move a cell up or down
  const moveCell = useCallback((cellId, direction) => {
    setCells(prev => {
      const index = prev.findIndex(c => c.id === cellId);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newCells = [...prev];
      [newCells[index], newCells[newIndex]] = [newCells[newIndex], newCells[index]];
      return newCells;
    });
  }, []);

  // Update cell data
  const updateCell = useCallback((cellId, updates) => {
    setCells(prev => prev.map(cell => 
      cell.id === cellId ? { ...cell, ...updates } : cell
    ));
  }, []);

  // Run all terminal cells
  const runAllCells = useCallback(() => {
    cells.forEach(cell => {
      if (cell.type === CELL_TYPE.TERMINAL && cellRefs.current[cell.id]) {
        cellRefs.current[cell.id].run();
      }
    });
  }, [cells]);

  // Render a single cell based on type
  const renderCell = (cell, index) => {
    const isFirst = index === 0;
    const isLast = index === cells.length - 1;
    const isFocused = focusedCellId === cell.id;

    return (
      <div 
        key={cell.id}
        className={`notebook-cell ${cell.type} ${isFocused ? 'focused' : ''}`}
        onClick={() => setFocusedCellId(cell.id)}
      >
        {/* Cell controls */}
        <div className="notebook-cell-controls">
          <span className="cell-number">[{index + 1}]</span>
          
          <div className="cell-actions">
            <button
              className="cell-action-btn"
              onClick={(e) => { e.stopPropagation(); moveCell(cell.id, 'up'); }}
              disabled={isFirst}
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              className="cell-action-btn"
              onClick={(e) => { e.stopPropagation(); moveCell(cell.id, 'down'); }}
              disabled={isLast}
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
            <button
              className="cell-action-btn delete"
              onClick={(e) => { e.stopPropagation(); removeCell(cell.id); }}
              title="Delete cell"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Cell content */}
        <div className="notebook-cell-content">
          {cell.type === CELL_TYPE.TERMINAL && (
            <TerminalBlock
              ref={(el) => { cellRefs.current[cell.id] = el; }}
              cellId={cell.id}
              command={cell.command || ''}
              colorTheme={colorTheme}
              theme={theme}
              fontSize={fontSize}
              wsUrl={wsBaseUrl ? `${wsBaseUrl}?tabId=${tabId}&cellId=${cell.id}` : null}
              onCommandChange={(cmd) => updateCell(cell.id, { command: cmd })}
              onRun={(cmd) => console.log('[Notebook] Running:', cmd)}
            />
          )}
          
          {cell.type === CELL_TYPE.AGENT && (
            <AgentBlock
              cellId={cell.id}
              content={cell.content || ''}
              agentType={cell.agentType || AGENT_TYPE.EXPLANATION}
              model={cell.model}
              timestamp={cell.createdAt}
              isStreaming={cell.isStreaming}
              onRegenerate={() => console.log('[Notebook] Regenerate:', cell.id)}
            />
          )}
          
          {cell.type === CELL_TYPE.LENS && (
            <LensBlock
              cellId={cell.id}
              file={cell.file}
              permission={cell.permission || PERMISSION.READ}
              onPermissionChange={(file, perm) => updateCell(cell.id, { permission: perm })}
              onRemove={() => removeCell(cell.id)}
              onOpen={(file) => console.log('[Notebook] Open file:', file.path)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="notebook-layout" ref={containerRef}>
      {/* Header */}
      <div className="notebook-header">
        <div className="notebook-title">
          <BookOpen size={20} />
          <h2>Notebook</h2>
          <span className="notebook-cell-count">{cells.length} cells</span>
        </div>
        
        <div className="notebook-actions">
          <button
            className="notebook-btn run-all"
            onClick={runAllCells}
            title="Run all terminal cells"
          >
            <Play size={16} />
            <span>Run All</span>
          </button>
          
          {onOpenSettings && (
            <button
              className="notebook-btn settings"
              onClick={onOpenSettings}
              title="Settings"
            >
              <Settings size={16} />
            </button>
          )}
          
          {onToggleTerminal && (
            <button
              className="notebook-btn toggle-terminal"
              onClick={onToggleTerminal}
              title="Switch to Terminal"
            >
              <Terminal size={16} />
              <span>Terminal</span>
            </button>
          )}
        </div>
      </div>

      {/* Add cell toolbar */}
      <div className="notebook-add-toolbar">
        <span className="add-label">Add:</span>
        <button
          className="add-cell-btn terminal"
          onClick={() => addCell(CELL_TYPE.TERMINAL)}
          title="Add Terminal cell"
        >
          <Terminal size={14} />
          <span>Terminal</span>
        </button>
        <button
          className="add-cell-btn agent"
          onClick={() => addCell(CELL_TYPE.AGENT, null, { 
            content: '', 
            agentType: AGENT_TYPE.PLAN 
          })}
          title="Add Agent/AI cell"
        >
          <Bot size={14} />
          <span>Agent</span>
        </button>
        <button
          className="add-cell-btn lens"
          onClick={() => addCell(CELL_TYPE.LENS, null, { 
            file: { name: 'Select a file...', path: '', size: 0 } 
          })}
          title="Add file reference"
        >
          <FileCode size={14} />
          <span>File</span>
        </button>
      </div>

      {/* Cells container */}
      <div className="notebook-cells">
        {cells.map((cell, index) => renderCell(cell, index))}
        
        {/* Quick add button at bottom */}
        <div className="notebook-add-row">
          <button
            className="quick-add-btn"
            onClick={() => addCell(CELL_TYPE.TERMINAL)}
            title="Add cell (Ctrl+Enter)"
          >
            <Plus size={16} />
            <span>Add cell</span>
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="notebook-status">
        <span className="status-item">
          <Layers size={12} />
          {cells.filter(c => c.type === CELL_TYPE.TERMINAL).length} terminal
        </span>
        <span className="status-item">
          <Bot size={12} />
          {cells.filter(c => c.type === CELL_TYPE.AGENT).length} agent
        </span>
        <span className="status-item">
          <FileCode size={12} />
          {cells.filter(c => c.type === CELL_TYPE.LENS).length} files
        </span>
      </div>
    </div>
  );
};

export { NotebookLayout, CELL_TYPE };
export default NotebookLayout;
