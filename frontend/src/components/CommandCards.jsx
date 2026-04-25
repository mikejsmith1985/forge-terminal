import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';
import { RefreshCw } from 'lucide-react';
import DirectoryCard from './DirectoryCard';

const CommandCards = ({ commands, loading, error, onExecute, onPaste, onEdit, onDelete, onRetry, onToast, shellType, cwd, directoryCardVisible = true, onHideDirectoryCard }) => {
  if (loading) {
    return (
      <div className="command-cards-container">
        {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} />}
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
        {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} />}
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

  return (
    <div className="command-cards-container">
      {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} />}
      {commands.length > 0 ? (
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
      ) : (
        <div className="command-cards-empty">
          <p>No command cards yet. Click the + button to add one.</p>
        </div>
      )}
    </div>
  );
};

export default CommandCards;
