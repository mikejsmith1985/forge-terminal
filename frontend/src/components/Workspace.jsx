import { useState } from 'react';
import { Folder, Command } from 'lucide-react';
import FileExplorer from './FileExplorer';
import CommandCards from './CommandCards';
import './Workspace.css';

export default function Workspace({ 
  currentPath, 
  onFileOpen, 
  terminalRef,
  commands,
  onCommandRun,
  onCommandAdd,
  onCommandDelete,
  onCommandsReorder,
  commandsLoading,
  commandsError,
  onCommandEdit,
  onCommandPaste
}) {
  const [activeTab, setActiveTab] = useState('files');
  
  return (
    <div className="workspace">
      <div className="workspace-tabs">
        <button
          className={`workspace-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Folder size={16} />
          Files
        </button>
        <button
          className={`workspace-tab ${activeTab === 'cards' ? 'active' : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          <Command size={16} />
          Cards
        </button>
      </div>
      
      <div className="workspace-content">
        {activeTab === 'files' ? (
          <FileExplorer
            currentPath={currentPath}
            onFileOpen={onFileOpen}
            terminalRef={terminalRef}
          />
        ) : (
          <CommandCards
            commands={commands}
            loading={commandsLoading}
            error={commandsError}
            onExecute={onCommandRun}
            onPaste={onCommandPaste}
            onEdit={onCommandEdit}
            onDelete={onCommandDelete}
            onRetry={onCommandsReorder}
          />
        )}
      </div>
    </div>
  );
}
