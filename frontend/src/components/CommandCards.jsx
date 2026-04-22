import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';
import { SortableOwnerReleaseCard } from './SortableOwnerReleaseCard';
import { RefreshCw } from 'lucide-react';
import OwnerReleaseCard from './OwnerReleaseCard';
import DirectoryCard from './DirectoryCard';
import EnterpriseWorkflowCard from './EnterpriseWorkflowCard';
import MCPSetupCard from './MCPSetupCard';
import MCPDiscoveryCard from './MCPDiscoveryCard';
import CompanionAccessCard from './CompanionAccessCard';

const CommandCards = ({ commands, loading, error, onExecute, onPaste, onEdit, onDelete, onRetry, onToast, shellType, cwd, directoryCardVisible = true, onHideDirectoryCard }) => { // onOpenTutor removed — Code Tutor fully disabled
  if (loading) {
    return (
      <div className="command-cards-container">
        {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} />}
        {/* Owner Release Card always renders */}
        <OwnerReleaseCard 
          onExecuteCommand={onExecute}
          onToast={onToast}
          shellType={shellType}
          cwd={cwd}
        />
        <EnterpriseWorkflowCard onExecuteCommand={onExecute} onToast={onToast} cwd={cwd} />
        <MCPSetupCard />
        <MCPDiscoveryCard />
        <CompanionAccessCard />
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
        {/* Owner Release Card always renders */}
        <OwnerReleaseCard 
          onExecuteCommand={onExecute}
          onToast={onToast}
          shellType={shellType}
          cwd={cwd}
        />
        <EnterpriseWorkflowCard onExecuteCommand={onExecute} onToast={onToast} cwd={cwd} />
        <MCPSetupCard />
        <MCPDiscoveryCard />
        <CompanionAccessCard />
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

  // Show all cards including system cards
  const userCards = commands;

  return (
    <div className="command-cards-container">
      {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} />}
      {/* User Cards Section */}
      {userCards.length > 0 ? (
        <SortableContext
          items={userCards.map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {userCards.map(cmd => {
            if (cmd.id === -1) {
              return (
                <SortableOwnerReleaseCard
                  key={cmd.id}
                  command={cmd}
                  onDelete={onDelete}
                  onExecuteCommand={onExecute}
                  onToast={onToast}
                  shellType={shellType}
                  cwd={cwd}
                />
              );
            }
            return (
              <SortableCommandCard
                key={cmd.id}
                command={cmd}
                onExecute={onExecute}
                onPaste={onPaste}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })}
        </SortableContext>
      ) : (
        <div className="command-cards-empty">
           {/* Fallback Release Card if list is truly empty */}
           <DirectoryCard onExecute={onExecute} />
           <OwnerReleaseCard 
             onExecuteCommand={onExecute}
             onToast={onToast}
             shellType={shellType}
             cwd={cwd}
           />
          <p>No command cards yet. Click the + button to add one.</p>
        </div>
      )}
      {/* Enterprise Workflow Architect card — always visible */}
      <EnterpriseWorkflowCard onExecuteCommand={onExecute} onToast={onToast} cwd={cwd} />
      {/* Adaptive Build Environments card — always visible */}
      <MCPSetupCard />
      {/* MCP Discovery — catalog of external MCP servers with copy-config */}
      <MCPDiscoveryCard />
      {/* Companion Access — license-gated QR pairing for the Forge Companion PWA */}
      <CompanionAccessCard />
    </div>
  );
};

export default CommandCards;
