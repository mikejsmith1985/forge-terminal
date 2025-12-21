import React, { useState, useCallback } from 'react';
import { Copy, Play, Settings } from 'lucide-react';
import './SystemCommandCard.css';

const SystemCommandCard = ({ card, onExecuteCommand, onToast, onConfigureCard }) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!card.command) {
      if (onToast) {
        onToast('No command to copy', 'error', 2000);
      }
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(card.command);
        setCopySuccess(true);
        if (onToast) {
          onToast('Command copied to clipboard!', 'success', 2000);
        }
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      if (onToast) {
        onToast('Failed to copy command', 'error', 2000);
      }
    }
  }, [card.command, onToast]);

  const handleExecute = useCallback(() => {
    if (!card.command) {
      if (onToast) {
        onToast('No command to execute', 'error', 2000);
      }
      return;
    }

    if (onExecuteCommand) {
      onExecuteCommand({
        id: card.id,
        command: card.command,
        description: card.name,
        triggerAM: card.triggerAM || false,
      });
    }
  }, [card, onExecuteCommand, onToast]);

  const handleConfigure = useCallback(() => {
    if (onConfigureCard) {
      onConfigureCard(card);
    }
  }, [card, onConfigureCard]);

  return (
    <div className={`system-command-card system-card-${card.colorTheme}`}>
      <div className="system-card-header">
        <div className="system-card-title-section">
          <h4 className="system-card-title">{card.name}</h4>
          <p className="system-card-description">{card.description}</p>
        </div>
        {card.configurable && (
          <button
            className="system-card-config-btn"
            onClick={handleConfigure}
            title="Configure this card for your project"
          >
            <Settings size={16} />
          </button>
        )}
      </div>

      <div className="system-card-command-display">
        <pre className="system-card-command-text">{card.command}</pre>
      </div>

      <div className="system-card-actions">
        <button
          className="system-card-action copy-btn"
          onClick={handleCopy}
          title="Copy command to clipboard"
        >
          <Copy size={16} />
          {copySuccess ? 'Copied!' : 'Copy'}
        </button>
        <button
          className="system-card-action execute-btn"
          onClick={handleExecute}
          title="Execute command"
        >
          <Play size={16} />
          Execute
        </button>
      </div>
    </div>
  );
};

export default SystemCommandCard;
