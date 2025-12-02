import React from 'react';

const CommandCards = ({ commands, onExecute, onPaste, onEdit, onDelete }) => {
  return (
    <div className="command-cards">
      {commands.map(cmd => (
        <div key={cmd.id} className={`card ${cmd.favorite ? 'favorite' : ''}`}>
          <div className="card-header">
            <span className="card-title">{cmd.description}</span>
            <span className="keybinding">{cmd.keyBinding}</span>
          </div>
          <div className="card-body">
            <code className="command-preview">{cmd.command}</code>
          </div>
          <div className="card-actions">
            {!cmd.pasteOnly && (
              <button 
                className="btn btn-ghost" 
                title="Execute (Paste + Enter)"
                onClick={() => onExecute(cmd)}
              >
                ▶️
              </button>
            )}
            <button 
              className="btn btn-ghost" 
              title="Paste Only"
              onClick={() => onPaste(cmd)}
            >
              📋
            </button>
            <button 
              className="btn btn-ghost" 
              title="Edit"
              onClick={() => onEdit(cmd)}
            >
              ✏️
            </button>
            <button 
              className="btn btn-ghost delete-btn" 
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                if(confirm('Are you sure you want to delete this command?')) {
                  onDelete(cmd.id);
                }
              }}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommandCards;
