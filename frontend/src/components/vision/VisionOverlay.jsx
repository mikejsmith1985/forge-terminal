import React, { useEffect, useState, useRef } from 'react';
import './vision.css';

/**
 * VisionOverlay - Container for all vision overlays
 * Positioned absolutely over the terminal
 */
export default function VisionOverlay({ activeOverlay, onAction, onDismiss }) {
  const overlayRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard navigation
  useEffect(() => {
    if (!activeOverlay) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onDismiss();
        return;
      }

      // Get all actionable items (buttons with data-action attribute)
      const actionButtons = overlayRef.current?.querySelectorAll('[data-action]');
      if (!actionButtons || actionButtons.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % actionButtons.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + actionButtons.length) % actionButtons.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        actionButtons[selectedIndex]?.click();
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < actionButtons.length) {
          e.preventDefault();
          actionButtons[index]?.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeOverlay, selectedIndex, onDismiss]);

  // Reset selection when overlay changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeOverlay?.type]);

  if (!activeOverlay) {
    return null;
  }

  return (
    <div ref={overlayRef} className="vision-overlay-container">
      {activeOverlay.type === 'GIT_STATUS' && (
        <GitStatusOverlay 
          data={activeOverlay.payload}
          onAction={onAction}
          onDismiss={onDismiss}
          selectedIndex={selectedIndex}
        />
      )}
      {activeOverlay.type === 'JSON_BLOCK' && (
        <JSONOverlay 
          data={activeOverlay.payload}
          onAction={onAction}
          onDismiss={onDismiss}
          selectedIndex={selectedIndex}
        />
      )}
    </div>
  );
}

/**
 * GitStatusOverlay - Interactive git status display
 */
function GitStatusOverlay({ data, onAction, onDismiss, selectedIndex }) {
  const { branch, staged, unstaged, untracked } = data;

  const handleStageFile = (filename) => {
    onAction({
      type: 'INJECT_COMMAND',
      command: `git add "${filename}"`
    });
  };

  const handleUnstageFile = (filename) => {
    onAction({
      type: 'INJECT_COMMAND',
      command: `git reset HEAD "${filename}"`
    });
  };

  const handleStageAll = () => {
    onAction({
      type: 'INJECT_COMMAND',
      command: 'git add .'
    });
  };

  const renderFileList = (files, status, actionLabel, onActionClick) => {
    if (!files || files.length === 0) return null;

    return (
      <div className="vision-file-section">
        <div className="vision-section-header">{status}</div>
        {files.map((file, idx) => (
          <div key={idx} className="vision-file-item">
            <span className="vision-file-icon">{getFileIcon(file.status)}</span>
            <span className="vision-file-name">{file.name}</span>
            <button 
              className="vision-file-action"
              data-action="true"
              onClick={() => onActionClick(file.name)}
            >
              {actionLabel}
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="vision-overlay git-status-overlay">
      <div className="vision-overlay-header">
        <div className="vision-overlay-title">
          <span className="vision-git-icon">⎇</span>
          <span>Git Status</span>
          {branch && <span className="vision-branch-name">{branch}</span>}
        </div>
        <button className="vision-close-btn" onClick={onDismiss}>×</button>
      </div>

      <div className="vision-overlay-content">
        {renderFileList(staged, 'Staged Changes', 'Unstage', handleUnstageFile)}
        {renderFileList(unstaged, 'Unstaged Changes', 'Stage', handleStageFile)}
        {renderFileList(untracked, 'Untracked Files', 'Stage', handleStageFile)}

        {(unstaged?.length > 0 || untracked?.length > 0) && (
          <div className="vision-actions">
            <button 
              className="vision-action-btn" 
              data-action="true"
              onClick={handleStageAll}
            >
              Stage All Changes
            </button>
          </div>
        )}
      </div>

      <div className="vision-overlay-footer">
        <span className="vision-hint">↑↓ Navigate • Enter Select • 1-9 Quick • ESC Close</span>
      </div>
    </div>
  );
}

function getFileIcon(status) {
  switch (status) {
    case 'modified':
      return '●';
    case 'new file':
      return '+';
    case 'deleted':
      return '−';
    case 'renamed':
      return '→';
    case 'untracked':
      return '?';
    default:
      return '○';
  }
}

/**
 * JSONOverlay - Pretty JSON viewer with actions
 */
function JSONOverlay({ data, onAction, onDismiss, selectedIndex }) {
  const { pretty, type, size, raw } = data;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleCopyRaw = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="vision-overlay json-overlay">
      <div className="vision-overlay-header">
        <div className="vision-overlay-title">
          <span className="vision-git-icon">{ }</span>
          <span>JSON {type === 'array' ? 'Array' : 'Object'}</span>
          <span className="vision-branch-name">{size} bytes</span>
        </div>
        <button className="vision-close-btn" onClick={onDismiss}>×</button>
      </div>

      <div className="vision-overlay-content">
        <pre className="json-preview">{pretty}</pre>

        <div className="vision-actions">
          <button 
            className="vision-action-btn" 
            data-action="true"
            onClick={handleCopy}
          >
            {copied ? '✓ Copied!' : 'Copy Pretty'}
          </button>
          <button 
            className="vision-action-btn" 
            data-action="true"
            onClick={handleCopyRaw}
          >
            Copy Minified
          </button>
        </div>
      </div>

      <div className="vision-overlay-footer">
        <span className="vision-hint">↑↓ Navigate • Enter Select • ESC Close</span>
      </div>
    </div>
  );
}
