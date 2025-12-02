import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Play, Clipboard, Edit2, Trash2, GripVertical } from 'lucide-react';

export function SortableCommandCard({ command, onExecute, onPaste, onEdit, onDelete }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: command.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`card ${isDragging ? 'dragging' : ''} ${command.favorite ? 'favorite' : ''}`}
        >
            <div className="card-header">
                <div className="card-title-row">
                    {command.keyBinding && (
                        <span className="keybinding-badge">{command.keyBinding}</span>
                    )}
                    <span className="card-title">{command.name}</span>
                </div>

                <div className="card-actions-top">
                    <div {...attributes} {...listeners} className="action-icon" style={{ cursor: 'grab' }} title="Drag to reorder">
                        <GripVertical size={18} />
                    </div>
                    <div className="action-icon" onClick={() => onEdit(command)} title="Edit Command">
                        <Edit2 size={18} />
                    </div>
                    <div className="action-icon delete" onClick={() => onDelete(command.id)} title="Delete Command">
                        <Trash2 size={18} />
                    </div>
                </div>
            </div>

            <div className="card-body">
                <div className="command-preview" title={command.command}>
                    {command.description || command.command}
                </div>
            </div>

            <div className={`card-footer ${command.pasteOnly ? 'paste-only' : ''}`}>
                <button
                    className="btn-action btn-paste"
                    onClick={() => onPaste(command)}
                    title="Paste to Terminal"
                >
                    <Clipboard size={16} /> Paste
                </button>
                {!command.pasteOnly && (
                    <button
                        className="btn-action btn-run"
                        onClick={() => onExecute(command)}
                        title="Run in Terminal"
                    >
                        <Play size={16} /> Run
                    </button>
                )}
            </div>
        </div>
    );
}
