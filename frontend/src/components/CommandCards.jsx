import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';
import { RefreshCw } from 'lucide-react';
import DirectoryCard from './DirectoryCard';

// Inline SVG mark for Anthropic / Claude
const ClaudeMark = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.5 2.5 7v10L12 22.5 21.5 17V7L12 1.5zm0 2.06L19.5 8v8L12 20.44 4.5 16V8L12 3.56z"/>
    <path d="M12 7.5v9M8.5 9.75l3.5 2 3.5-2"/>
  </svg>
)

// GitHub mark for Copilot
const CopilotMark = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
  </svg>
)

const CLI_TOOLS = [
  { id: 'claude',  label: 'Claude',  Icon: ClaudeMark,  color: '#d4875e' },
  { id: 'copilot', label: 'Copilot', Icon: CopilotMark, color: '#8b6fcb' },
]

const CliToolSelector = ({ tool, onChange }) => (
  <div className="cli-tool-selector">
    <span className="cli-tool-selector-label">Run with</span>
    {CLI_TOOLS.map(({ id, label, Icon, color }) => (
      <button
        key={id}
        className={`cli-tool-btn ${tool === id ? 'active' : ''}`}
        style={tool === id ? { '--tool-color': color } : {}}
        onClick={() => onChange(id)}
        title={`Use ${label} CLI for workflow cards`}
      >
        <Icon />
        {label}
      </button>
    ))}
  </div>
)

const CommandCards = ({
  commands, loading, error,
  onExecute, onPaste, onEdit, onDelete, onRetry, onToast,
  shellType, cwd,
  directoryCardVisible = true, onHideDirectoryCard,
  preferredCliTool = 'claude', onCliToolChange,
}) => {
  if (loading) {
    return (
      <div className="command-cards-container">
        {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} onToast={onToast} />}
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
        {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} onToast={onToast} />}
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
      {directoryCardVisible && <DirectoryCard onExecute={onExecute} onHide={onHideDirectoryCard} onToast={onToast} />}
      <CliToolSelector tool={preferredCliTool} onChange={onCliToolChange} />
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
              preferredCliTool={preferredCliTool}
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
