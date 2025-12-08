import React, { useState } from 'react';
import './CommandPreview.css';

const CommandPreview = ({ command, onExecute }) => {
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await onExecute(command.command);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="command-preview">
      <div className="command-preview-header">
        <span className="command-icon">💡</span>
        <span className="command-label">Suggested Command</span>
        {command.safe && <span className="command-badge command-safe">Safe</span>}
        {!command.safe && <span className="command-badge command-review">Review</span>}
      </div>

      {command.description && (
        <div className="command-description">
          {command.description}
        </div>
      )}

      <div className="command-code">
        <code>{command.command}</code>
      </div>

      <div className="command-actions">
        <button
          className="command-action-button command-execute"
          onClick={handleExecute}
          disabled={isExecuting}
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
        <button
          className="command-action-button command-copy"
          onClick={() => navigator.clipboard.writeText(command.command)}
        >
          Copy
        </button>
      </div>
    </div>
  );
};

export default CommandPreview;
