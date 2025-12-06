import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';
import { RefreshCw } from 'lucide-react';

const CommandCards = ({ commands, loading, error, onExecute, onPaste, onEdit, onDelete, onRetry }) => {
  if (loading) {
    return (
      <div className="command-cards-container">
        <div className="command-cards-loading">
          <div className="spinner"></div>
          <p>Loading command cards...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="command-cards-container">
        <div className="command-cards-error">
          <p className="error-message">⚠️ Failed to load command cards</p>
          <p className="error-details">{error}</p>
          {onRetry && (
            <button className="btn btn-primary" onClick={onRetry}>
              <RefreshCw size={16} />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (commands.length === 0) {
    return (
      <div className="command-cards-container">
        <div className="command-cards-empty">
          <p>No command cards yet. Click the + button to add one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="command-cards-container">
      <SortableContext
        items={commands.map(c => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {commands.map(cmd => (
          <SortableCommandCard
            key={cmd.id}
            command={cmd}
            onExecute={onExecute}
            onPaste={onPaste}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </SortableContext>
    </div>
  );
};

export default CommandCards;
