/**
 * AgenticEditor - The "Director's Monitor" for Agentic Coding
 * 
 * This editor treats the user as a Reviewer/Director, not a typist.
 * 
 * Architecture:
 * - Layer 1 (Base): ReadOnly syntax-highlighted code
 * - Layer 2 (Ghost): Agent proposal overlays (green additions, red deletions)
 * - Layer 3 (HUD): Accept/Reject controls, Anchor icons, Spec Header
 * 
 * Key Interactions:
 * - j/k: Navigate between change chunks
 * - Space: Accept current chunk
 * - x: Reject current chunk
 * - e: Edit current chunk manually
 * - Ctrl+Shift+A: Create anchor on selected lines
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Check, X, Edit3, MessageSquare, ChevronUp, ChevronDown, Play, Save } from 'lucide-react';
import './AgenticEditor.css';

// Anchor data structure
const createAnchor = (id, startLine, endLine, prompt) => ({
  id,
  startLine,
  endLine,
  prompt,
  agentReply: '',
  status: 'pending', // 'pending', 'applied', 'rejected'
  createdAt: new Date().toISOString()
});

// Diff chunk data structure  
const createChunk = (id, type, startLine, endLine, oldContent, newContent) => ({
  id,
  type, // 'add', 'delete', 'modify'
  startLine,
  endLine,
  oldContent,
  newContent,
  status: 'pending' // 'pending', 'accepted', 'rejected'
});

export default function AgenticEditor({
  file,
  content: initialContent,
  proposedChanges = [], // Array of diff chunks from agent
  anchors: initialAnchors = [],
  spec: initialSpec = '',
  language = 'plaintext',
  readOnly = false,
  onSave,
  onClose,
  onRunAgent,
  onAnchorCreate,
  onAnchorUpdate,
  onChunkAccept,
  onChunkReject,
  onSpecChange,
  theme = 'dark'
}) {
  // State
  const [content, setContent] = useState(initialContent || '');
  const [lines, setLines] = useState([]);
  const [chunks, setChunks] = useState(proposedChanges);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1);
  const [anchors, setAnchors] = useState(initialAnchors);
  const [spec, setSpec] = useState(initialSpec);
  const [isSpecEditing, setIsSpecEditing] = useState(false);
  const [selectedRange, setSelectedRange] = useState(null); // { start: number, end: number }
  const [isAnchorInputVisible, setIsAnchorInputVisible] = useState(false);
  const [anchorInputValue, setAnchorInputValue] = useState('');
  const [editingChunk, setEditingChunk] = useState(null); // Chunk being manually edited
  const [editingContent, setEditingContent] = useState('');
  const [activeAnchorThread, setActiveAnchorThread] = useState(null);
  
  // Refs
  const editorRef = useRef(null);
  const specInputRef = useRef(null);
  const anchorInputRef = useRef(null);
  
  // Parse content into lines
  useEffect(() => {
    if (content) {
      setLines(content.split('\n'));
    }
  }, [content]);
  
  // Load file content
  useEffect(() => {
    if (file?.path) {
      loadFile(file.path);
    }
  }, [file]);
  
  const loadFile = async (path) => {
    try {
      const response = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, rootPath: '.' })
      });
      
      if (response.ok) {
        const data = await response.json();
        setContent(data.content || '');
      }
    } catch (err) {
      console.error('[AgenticEditor] Failed to load file:', err);
    }
  };
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle when editor is focused
      if (!editorRef.current?.contains(document.activeElement)) return;
      
      // Don't handle if in input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch (e.key.toLowerCase()) {
        case 'j': // Next chunk
          e.preventDefault();
          navigateChunk(1);
          break;
          
        case 'k': // Previous chunk
          e.preventDefault();
          navigateChunk(-1);
          break;
          
        case ' ': // Accept chunk
          if (currentChunkIndex >= 0 && !e.ctrlKey) {
            e.preventDefault();
            acceptChunk(currentChunkIndex);
          }
          break;
          
        case 'x': // Reject chunk
          if (currentChunkIndex >= 0) {
            e.preventDefault();
            rejectChunk(currentChunkIndex);
          }
          break;
          
        case 'e': // Edit chunk
          if (currentChunkIndex >= 0) {
            e.preventDefault();
            enterEditMode(currentChunkIndex);
          }
          break;
      }
      
      // Ctrl+Shift+A: Create anchor
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (selectedRange) {
          setIsAnchorInputVisible(true);
          setTimeout(() => anchorInputRef.current?.focus(), 50);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChunkIndex, chunks, selectedRange]);
  
  // Navigate between chunks
  const navigateChunk = useCallback((direction) => {
    if (chunks.length === 0) return;
    
    let newIndex = currentChunkIndex + direction;
    if (newIndex < 0) newIndex = chunks.length - 1;
    if (newIndex >= chunks.length) newIndex = 0;
    
    setCurrentChunkIndex(newIndex);
    
    // Scroll chunk into view
    const chunkElement = document.querySelector(`[data-chunk-id="${chunks[newIndex]?.id}"]`);
    chunkElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChunkIndex, chunks]);
  
  // Accept a chunk
  const acceptChunk = useCallback((index) => {
    const chunk = chunks[index];
    if (!chunk || chunk.status !== 'pending') return;
    
    setChunks(prev => prev.map((c, i) => 
      i === index ? { ...c, status: 'accepted' } : c
    ));
    
    // Apply the change to content
    if (chunk.type === 'add' || chunk.type === 'modify') {
      const newLines = [...lines];
      const linesToReplace = chunk.endLine - chunk.startLine + 1;
      newLines.splice(chunk.startLine - 1, linesToReplace, ...chunk.newContent.split('\n'));
      setLines(newLines);
      setContent(newLines.join('\n'));
    } else if (chunk.type === 'delete') {
      const newLines = [...lines];
      newLines.splice(chunk.startLine - 1, chunk.endLine - chunk.startLine + 1);
      setLines(newLines);
      setContent(newLines.join('\n'));
    }
    
    // Move to next pending chunk
    const nextPendingIndex = chunks.findIndex((c, i) => i > index && c.status === 'pending');
    if (nextPendingIndex >= 0) {
      setCurrentChunkIndex(nextPendingIndex);
    }
    
    onChunkAccept?.(chunk);
  }, [chunks, lines, onChunkAccept]);
  
  // Reject a chunk
  const rejectChunk = useCallback((index) => {
    const chunk = chunks[index];
    if (!chunk || chunk.status !== 'pending') return;
    
    setChunks(prev => prev.map((c, i) => 
      i === index ? { ...c, status: 'rejected' } : c
    ));
    
    // Move to next pending chunk
    const nextPendingIndex = chunks.findIndex((c, i) => i > index && c.status === 'pending');
    if (nextPendingIndex >= 0) {
      setCurrentChunkIndex(nextPendingIndex);
    }
    
    onChunkReject?.(chunk);
  }, [chunks, onChunkReject]);
  
  // Enter edit mode for a chunk
  const enterEditMode = useCallback((index) => {
    const chunk = chunks[index];
    if (!chunk) return;
    
    setEditingChunk(chunk);
    setEditingContent(chunk.newContent || chunk.oldContent || '');
  }, [chunks]);
  
  // Save edit and exit edit mode
  const saveEdit = useCallback(() => {
    if (!editingChunk) return;
    
    // Update the chunk with edited content
    setChunks(prev => prev.map(c => 
      c.id === editingChunk.id 
        ? { ...c, newContent: editingContent, status: 'accepted' }
        : c
    ));
    
    // Apply to content
    const newLines = [...lines];
    const linesToReplace = editingChunk.endLine - editingChunk.startLine + 1;
    newLines.splice(editingChunk.startLine - 1, linesToReplace, ...editingContent.split('\n'));
    setLines(newLines);
    setContent(newLines.join('\n'));
    
    setEditingChunk(null);
    setEditingContent('');
  }, [editingChunk, editingContent, lines]);
  
  // Cancel edit mode
  const cancelEdit = useCallback(() => {
    setEditingChunk(null);
    setEditingContent('');
  }, []);
  
  // Handle line selection for anchors
  const handleLineClick = useCallback((lineNum, e) => {
    if (e.shiftKey && selectedRange) {
      // Extend selection
      setSelectedRange({
        start: Math.min(selectedRange.start, lineNum),
        end: Math.max(selectedRange.end, lineNum)
      });
    } else {
      // Start new selection
      setSelectedRange({ start: lineNum, end: lineNum });
    }
  }, [selectedRange]);
  
  // Create anchor from selection
  const createAnchorFromSelection = useCallback(() => {
    if (!selectedRange || !anchorInputValue.trim()) return;
    
    const newAnchor = createAnchor(
      `anchor-${Date.now()}`,
      selectedRange.start,
      selectedRange.end,
      anchorInputValue.trim()
    );
    
    setAnchors(prev => [...prev, newAnchor]);
    setIsAnchorInputVisible(false);
    setAnchorInputValue('');
    setSelectedRange(null);
    
    onAnchorCreate?.(newAnchor);
  }, [selectedRange, anchorInputValue, onAnchorCreate]);
  
  // Get anchor for a line
  const getAnchorForLine = useCallback((lineNum) => {
    return anchors.find(a => lineNum >= a.startLine && lineNum <= a.endLine);
  }, [anchors]);
  
  // Get chunk for a line
  const getChunkForLine = useCallback((lineNum) => {
    return chunks.find(c => lineNum >= c.startLine && lineNum <= c.endLine);
  }, [chunks]);
  
  // Check if line is in selection
  const isLineSelected = useCallback((lineNum) => {
    if (!selectedRange) return false;
    return lineNum >= selectedRange.start && lineNum <= selectedRange.end;
  }, [selectedRange]);
  
  // Render a single line with overlays
  const renderLine = useCallback((line, lineNum) => {
    const chunk = getChunkForLine(lineNum);
    const anchor = getAnchorForLine(lineNum);
    const isSelected = isLineSelected(lineNum);
    const isCurrentChunk = chunk && chunks.indexOf(chunk) === currentChunkIndex;
    const isFirstLineOfAnchor = anchor && anchor.startLine === lineNum;
    
    let lineClass = 'editor-line';
    if (isSelected) lineClass += ' line-selected';
    if (chunk) {
      lineClass += ` chunk-${chunk.type}`;
      if (chunk.status === 'accepted') lineClass += ' chunk-accepted';
      if (chunk.status === 'rejected') lineClass += ' chunk-rejected';
      if (isCurrentChunk) lineClass += ' chunk-current';
    }
    if (editingChunk && lineNum >= editingChunk.startLine && lineNum <= editingChunk.endLine) {
      lineClass += ' chunk-editing';
    }
    
    return (
      <div 
        key={lineNum} 
        className={lineClass}
        data-line={lineNum}
        data-chunk-id={chunk?.id}
        onClick={(e) => handleLineClick(lineNum, e)}
      >
        {/* Line number gutter */}
        <span className="line-number">{lineNum}</span>
        
        {/* Anchor icon */}
        {isFirstLineOfAnchor && (
          <span 
            className={`anchor-icon anchor-${anchor.status}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveAnchorThread(anchor);
            }}
            title={anchor.prompt}
          >
            <MessageSquare size={14} />
          </span>
        )}
        
        {/* Line content */}
        <span className="line-content">
          {editingChunk && lineNum >= editingChunk.startLine && lineNum <= editingChunk.endLine ? (
            // Show editing textarea for first line of chunk
            lineNum === editingChunk.startLine ? (
              <textarea
                className="chunk-editor"
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit();
                  if (e.key === 's' && e.ctrlKey) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                autoFocus
              />
            ) : null
          ) : (
            // Normal line display
            <>
              {chunk?.type === 'delete' && chunk.status === 'pending' && (
                <span className="ghost-delete">{line}</span>
              )}
              {chunk?.type === 'add' && chunk.status === 'pending' && (
                <span className="ghost-add">{chunk.newContent.split('\n')[lineNum - chunk.startLine]}</span>
              )}
              {chunk?.type === 'modify' && chunk.status === 'pending' && (
                <>
                  <span className="ghost-delete">{line}</span>
                  <span className="ghost-add">{chunk.newContent.split('\n')[lineNum - chunk.startLine]}</span>
                </>
              )}
              {!chunk && <span>{line || '\u00A0'}</span>}
              {chunk?.status !== 'pending' && <span>{line || '\u00A0'}</span>}
            </>
          )}
        </span>
        
        {/* Chunk controls (HUD Layer 3) */}
        {isCurrentChunk && chunk.status === 'pending' && !editingChunk && (
          <div className="chunk-controls">
            <button 
              className="chunk-btn accept" 
              onClick={(e) => { e.stopPropagation(); acceptChunk(currentChunkIndex); }}
              title="Accept (Space)"
            >
              <Check size={14} />
            </button>
            <button 
              className="chunk-btn reject" 
              onClick={(e) => { e.stopPropagation(); rejectChunk(currentChunkIndex); }}
              title="Reject (x)"
            >
              <X size={14} />
            </button>
            <button 
              className="chunk-btn edit" 
              onClick={(e) => { e.stopPropagation(); enterEditMode(currentChunkIndex); }}
              title="Edit (e)"
            >
              <Edit3 size={14} />
            </button>
          </div>
        )}
      </div>
    );
  }, [
    chunks, currentChunkIndex, anchors, selectedRange, editingChunk, editingContent,
    getChunkForLine, getAnchorForLine, isLineSelected, handleLineClick,
    acceptChunk, rejectChunk, enterEditMode, saveEdit, cancelEdit
  ]);
  
  // Chunk navigation indicator
  const chunkIndicator = useMemo(() => {
    if (chunks.length === 0) return null;
    
    const pendingCount = chunks.filter(c => c.status === 'pending').length;
    const acceptedCount = chunks.filter(c => c.status === 'accepted').length;
    const rejectedCount = chunks.filter(c => c.status === 'rejected').length;
    
    return (
      <div className="chunk-indicator">
        <span>Chunk {currentChunkIndex + 1} of {chunks.length}</span>
        <span className="chunk-stats">
          <span className="pending">{pendingCount} pending</span>
          <span className="accepted">{acceptedCount} accepted</span>
          <span className="rejected">{rejectedCount} rejected</span>
        </span>
        <div className="chunk-nav">
          <button onClick={() => navigateChunk(-1)} title="Previous (k)">
            <ChevronUp size={16} />
          </button>
          <button onClick={() => navigateChunk(1)} title="Next (j)">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    );
  }, [chunks, currentChunkIndex, navigateChunk]);
  
  return (
    <div 
      className={`agentic-editor ${theme}`}
      data-testid="agentic-editor"
      ref={editorRef}
      tabIndex={0}
    >
      {/* Spec Header (Layer 3 - HUD) */}
      <div className={`spec-header ${isSpecEditing ? 'editing' : ''}`}>
        {isSpecEditing ? (
          <textarea
            ref={specInputRef}
            className="spec-editor"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            onBlur={() => {
              setIsSpecEditing(false);
              onSpecChange?.(spec);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsSpecEditing(false);
                onSpecChange?.(spec);
              }
            }}
            placeholder="# File Specification\n\nDescribe what this file should do..."
          />
        ) : (
          <div 
            className="spec-content markdown"
            onClick={() => setIsSpecEditing(true)}
          >
            {spec ? (
              <div className="md-content">
                {/* Simple markdown rendering - could use react-markdown */}
                {spec.split('\n').map((line, i) => {
                  if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>;
                  if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
                  if (line.startsWith('- ')) return <li key={i}>{line.slice(2)}</li>;
                  return <p key={i}>{line || '\u00A0'}</p>;
                })}
              </div>
            ) : (
              <div className="spec-placeholder">
                Click to add a specification for this file...
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Toolbar */}
      <div className="editor-toolbar">
        <span className="file-name">{file?.name || 'Untitled'}</span>
        
        {chunkIndicator}
        
        <div className="toolbar-actions">
          {onRunAgent && (
            <button className="run-agent-button" onClick={() => onRunAgent(content, anchors)}>
              <Play size={16} /> Run Agent
            </button>
          )}
          {onSave && (
            <button onClick={() => onSave(content)}>
              <Save size={16} /> Save
            </button>
          )}
          {onClose && (
            <button onClick={onClose}>
              <X size={16} /> Close
            </button>
          )}
        </div>
      </div>
      
      {/* Main Editor Area (Layers 1 & 2) */}
      <div className="editor-content">
        {lines.map((line, index) => renderLine(line, index + 1))}
      </div>
      
      {/* Anchor Input Popup */}
      {isAnchorInputVisible && selectedRange && (
        <div 
          className="anchor-input-popup"
          style={{ top: `${(selectedRange.start - 1) * 24 + 100}px` }}
        >
          <input
            ref={anchorInputRef}
            className="anchor-input"
            type="text"
            value={anchorInputValue}
            onChange={(e) => setAnchorInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createAnchorFromSelection();
              if (e.key === 'Escape') {
                setIsAnchorInputVisible(false);
                setAnchorInputValue('');
              }
            }}
            placeholder="Describe what you want the agent to do with this code..."
          />
          <button onClick={createAnchorFromSelection}>
            <MessageSquare size={14} /> Create Anchor
          </button>
        </div>
      )}
      
      {/* Anchor Thread Panel */}
      {activeAnchorThread && (
        <div className="anchor-thread thread-panel">
          <div className="thread-header">
            <span>Lines {activeAnchorThread.startLine}-{activeAnchorThread.endLine}</span>
            <span className={`anchor-status ${activeAnchorThread.status}`}>
              {activeAnchorThread.status}
            </span>
            <button onClick={() => setActiveAnchorThread(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="thread-content">
            <div className="thread-prompt anchor-prompt">
              <strong>You:</strong> {activeAnchorThread.prompt}
            </div>
            {activeAnchorThread.agentReply && (
              <div className="thread-reply">
                <strong>Agent:</strong> {activeAnchorThread.agentReply}
              </div>
            )}
          </div>
          <div className="thread-actions">
            <button onClick={() => {
              onRunAgent?.(content, [activeAnchorThread]);
            }}>
              <Play size={14} /> Run Agent on This
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export helper functions for testing
export { createAnchor, createChunk };
