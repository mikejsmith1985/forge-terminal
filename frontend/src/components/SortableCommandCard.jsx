import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Play, Clipboard, Edit2, Trash2, GripVertical, Brain } from 'lucide-react';
import { iconMap, emojiMap } from './IconPicker';

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

    // Get icon component if specified - check emoji first, then lucide icons
    const isEmoji = command.icon && command.icon.startsWith('emoji-');
    const emojiChar = isEmoji ? emojiMap[command.icon] : null;
    const CommandIcon = !isEmoji && command.icon ? iconMap[command.icon] : null;

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
                    {command.triggerAM && (
                        <div className="action-icon am-trigger" title="Triggers AM on execute" style={{ color: '#8b5cf6' }}>
                            <Brain size={16} />
                        </div>
                    )}
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
                    {emojiChar && <span className="command-icon" style={{ fontSize: '18px', marginRight: '8px' }}>{emojiChar}</span>}
                    {CommandIcon && <CommandIcon size={18} className="command-icon" />}
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
