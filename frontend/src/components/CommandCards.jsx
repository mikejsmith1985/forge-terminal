import React, { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';
import ReleaseManagerCard from './ReleaseManagerCard';
import SystemCommandCard from './SystemCommandCard';
import { RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { isReleaseManagerCard, isSystemCard } from '../utils/defaultCommandCards';

const CommandCards = ({ commands, loading, error, onExecute, onPaste, onEdit, onDelete, onRetry, onToast, shellType }) => {
  const [isSystemCollapsed, setIsSystemCollapsed] = useState(() => {
    return localStorage.getItem('systemCardsCollapsed') === 'true';
  });
  const [systemPosition, setSystemPosition] = useState(() => {
    return localStorage.getItem('systemCardsPosition') || 'top';
  });

  const toggleSystemCollapsed = () => {
    const newValue = !isSystemCollapsed;
    setIsSystemCollapsed(newValue);
    localStorage.setItem('systemCardsCollapsed', newValue);
  };

  const toggleSystemPosition = () => {
    const newValue = systemPosition === 'top' ? 'bottom' : 'top';
    setSystemPosition(newValue);
    localStorage.setItem('systemCardsPosition', newValue);
  };
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

  // Separate system cards from user cards
  const systemCards = commands.filter(isSystemCard);
  const userCards = commands.filter(cmd => !isSystemCard(cmd));

  const renderSystemCards = () => (
    <div className="system-cards-section">
      <div className="system-cards-divider" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={toggleSystemCollapsed}>
        <button 
          className="btn-icon-sm" 
          style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', display: 'flex' }}
        >
          {isSystemCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <span style={{ flex: 1 }}>System Cards</span>
        <button 
          className="btn-icon-sm" 
          onClick={(e) => { e.stopPropagation(); toggleSystemPosition(); }}
          title={systemPosition === 'top' ? "Move to Bottom" : "Move to Top"}
          style={{ background: 'none', border: 'none', color: 'inherit', padding: '4px', cursor: 'pointer', display: 'flex', opacity: 0.7 }}
        >
          {systemPosition === 'top' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
        </button>
      </div>
      {!isSystemCollapsed && systemCards.map(cmd => {
        if (isReleaseManagerCard(cmd)) {
          return (
            <ReleaseManagerCard
              key={cmd.id}
              onExecuteCommand={onExecute}
              onToast={onToast}
              shellType={shellType}
            />
          );
        }
        // Render other system cards using SystemCommandCard
        return (
          <SystemCommandCard
            key={cmd.id}
            card={cmd}
            onExecuteCommand={onExecute}
            onToast={onToast}
            onConfigureCard={onEdit}
          />
        );
      })}
    </div>
  );

  return (
    <div className="command-cards-container">
      {/* System Cards Section (Top) */}
      {systemCards.length > 0 && systemPosition === 'top' && renderSystemCards()}

      {/* User Cards Section */}
      {userCards.length > 0 && (
        <>
          {systemCards.length > 0 && systemPosition === 'top' && (
            <div className="user-cards-divider">
              <span>Your Command Cards</span>
            </div>
          )}
          <SortableContext
            items={userCards.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {userCards.map(cmd => (
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
          {systemCards.length > 0 && systemPosition === 'bottom' && (
            <div className="user-cards-divider" style={{ marginTop: '16px' }}>
              <span>System Cards</span>
            </div>
          )}
        </>
      )}

      {/* System Cards Section (Bottom) */}
      {systemCards.length > 0 && systemPosition === 'bottom' && renderSystemCards()}

      {/* Empty State */}
      {systemCards.length === 0 && userCards.length === 0 && (
        <div className="command-cards-empty">
          <p>No command cards yet. Click the + button to add one.</p>
        </div>
      )}
    </div>
  );
};

export default CommandCards;
