import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCommandCard } from './SortableCommandCard';

const CommandCards = ({ commands, onExecute, onPaste, onEdit, onDelete }) => {
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
