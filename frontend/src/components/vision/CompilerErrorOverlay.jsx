import React, { useState } from 'react';
import './vision.css';

/**
 * CompilerErrorOverlay - Display compiler/interpreter errors with context
 * Shows: file, line, column, error message, and suggested actions
 */
export default function CompilerErrorOverlay({ 
  data, 
  onAction, 
  onDismiss, 
  selectedIndex 
}) {
  const { language, file, line, column, message, errorCode, exception } = data;
  const [showContext, setShowContext] = useState(false);

  const handleJumpToError = () => {
    onAction({
      type: 'INJECT_COMMAND',
      command: `cat "${file}" | sed -n '${Math.max(1, line - 2)},${line + 2}p'`
    });
  };

  const handleOpenInEditor = () => {
    onAction({
      type: 'INJECT_COMMAND',
      command: `${process.env.EDITOR || 'nano'} +${line} "${file}"`
    });
  };

  const handleShowLines = () => {
    const start = Math.max(1, line - 5);
    const end = line + 5;
    onAction({
      type: 'INJECT_COMMAND',
      command: `sed -n '${start},${end}p' "${file}" | cat -n`
    });
  };

  const getLanguageIcon = () => {
    switch (language) {
      case 'go':
        return '🐹';
      case 'rust':
        return '🦀';
      case 'typescript':
        return '📘';
      case 'python':
        return '🐍';
      case 'java':
        return '☕';
      default:
        return '⚠️';
    }
  };

  const getErrorSeverity = () => {
    // Rust error codes start with E
    if (errorCode && errorCode.startsWith('E')) {
      return 'error';
    }
    // TypeScript error codes are TS####
    if (errorCode && errorCode.startsWith('TS')) {
      return 'error';
    }
    // Python/Java exceptions indicate runtime errors
    if (exception) {
      return 'exception';
    }
    return 'error';
  };

  const errorSeverity = getErrorSeverity();

  return (
    <div className="vision-overlay compiler-error-overlay">
      <div className="vision-overlay-header">
        <div className="vision-overlay-title">
          <span className="vision-git-icon">{getLanguageIcon()}</span>
          <span>
            {exception ? 'Exception' : 'Compiler Error'}
            {' - '}
            {language.toUpperCase()}
          </span>
          {errorCode && <span className="vision-error-code">{errorCode}</span>}
        </div>
        <button className="vision-close-btn" onClick={onDismiss}>×</button>
      </div>

      <div className="vision-overlay-content compiler-error-content">
        {/* File and location */}
        <div className="compiler-error-location">
          <div className="location-file">
            <span className="location-label">File:</span>
            <span className="location-path">{file}</span>
          </div>
          <div className="location-coords">
            <span className="location-label">Line:</span>
            <span className="location-line">{line}</span>
            {column && (
              <>
                <span className="location-label">Col:</span>
                <span className="location-column">{column}</span>
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        <div className={`compiler-error-message ${errorSeverity}`}>
          <div className="message-label">
            {exception ? 'Exception Type:' : 'Error Message:'}
          </div>
          <div className="message-text">
            {exception || message}
          </div>
          {exception && message && (
            <div className="message-detail">
              <div className="detail-label">Details:</div>
              <div className="detail-text">{message}</div>
            </div>
          )}
        </div>

        {/* Context toggle */}
        <div className="compiler-error-actions">
          <button
            className="vision-action-btn"
            data-action="true"
            onClick={() => setShowContext(!showContext)}
          >
            {showContext ? '▼ Hide Context' : '▶ Show Context'}
          </button>

          <button
            className="vision-action-btn"
            data-action="true"
            onClick={handleJumpToError}
          >
            View Error Line
          </button>

          <button
            className="vision-action-btn"
            data-action="true"
            onClick={handleOpenInEditor}
          >
            Open in Editor
          </button>

          <button
            className="vision-action-btn"
            data-action="true"
            onClick={handleShowLines}
          >
            Show Context (±5)
          </button>
        </div>

        {/* Quick tips */}
        <div className="compiler-error-tips">
          <div className="tips-label">Tips:</div>
          <ul className="tips-list">
            {language === 'go' && (
              <>
                <li>Run: <code>go vet ./...</code> to find common mistakes</li>
                <li>Check: imports and function names spelling</li>
              </>
            )}
            {language === 'rust' && (
              <>
                <li>Error codes: <code>rustc --explain {errorCode}</code></li>
                <li>Run: <code>cargo check</code> for faster feedback</li>
              </>
            )}
            {language === 'typescript' && (
              <>
                <li>Use <code>tsc --noEmit</code> for type checking only</li>
                <li>Check: variable types and function signatures</li>
              </>
            )}
            {language === 'python' && (
              <>
                <li>Run with <code>python -m pdb script.py</code> to debug</li>
                <li>Check: indentation and variable names</li>
              </>
            )}
            {language === 'java' && (
              <>
                <li>Exception occurred at: line {line}</li>
                <li>Review the stack trace for the root cause</li>
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="vision-overlay-footer">
        <span className="vision-hint">↑↓ Navigate • Enter Select • ESC Close</span>
      </div>
    </div>
  );
}
