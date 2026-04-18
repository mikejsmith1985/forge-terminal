// SortableCommandCard renders a single draggable command card with a large
// icon on the left and title/command/actions stacked in a column on the right.
// This mirrors the mockup layout: prominent icon → compact text → Paste + Run.
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Play, Clipboard, Edit2, Trash2, GripVertical, Zap } from 'lucide-react';
import { iconMap, getEmojiFromIcon } from './IconPicker';

export function SortableCommandCard({ command, onExecute, onPaste, onEdit, onDelete }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: command.id });

    const dragStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
    };

    // Resolve icon: emoji takes priority over lucide icon map, fallback to Zap
    const emojiChar = getEmojiFromIcon(command.icon);
    const LucideIcon = !emojiChar && command.icon ? iconMap[command.icon] : null;
    const hasFallbackIcon = !emojiChar && !LucideIcon;

    return (
        <div
            ref={setNodeRef}
            style={dragStyle}
            className={`card ${isDragging ? 'dragging' : ''} ${command.favorite ? 'favorite' : ''} ${command.alwaysAppend ? 'always-append' : ''}`}
        >
            {/* ── Large icon block on the left ── */}
            <div className="card-icon-block">
                {emojiChar && <span>{emojiChar}</span>}
                {LucideIcon && <LucideIcon size={22} />}
                {hasFallbackIcon && <Zap size={22} />}
            </div>

            {/* ── Main content: title row → command text → action buttons ── */}
            <div className="card-content-column">

                {/* Title row: name + keybinding badge + favorite star + hover actions */}
                <div className="card-header">
                    <div className="card-title-row">
                        <span className="card-title">{command.name}</span>
                        {command.keyBinding && (
                            <span className="keybinding-badge">{command.keyBinding}</span>
                        )}
                        {command.alwaysAppend && (
                            <span className="always-append-badge" title="Appended to every prompt">📌</span>
                        )}
                        {command.favorite && (
                            <span className="card-favorite-star" title="Favorite">★</span>
                        )}
                    </div>

                    {/* Edit/delete/drag icons — revealed on card hover */}
                    <div className="card-actions-top">
                        {command.alwaysAppend && (
                            <div
                                className="action-icon always-append-indicator"
                                title="Always Append — added to every prompt"
                                style={{ color: '#f59e0b' }}
                            >
                                <span style={{ fontSize: '11px', fontWeight: 700 }}>A+</span>
                            </div>
                        )}
                        <div
                            {...attributes}
                            {...listeners}
                            className="action-icon"
                            style={{ cursor: 'grab' }}
                            title="Drag to reorder"
                        >
                            <GripVertical size={16} />
                        </div>
                        <div
                            className="action-icon"
                            onClick={(editEvent) => { editEvent.stopPropagation(); onEdit(command); }}
                            title="Edit"
                        >
                            <Edit2 size={16} />
                        </div>
                        <div
                            className="action-icon delete"
                            onClick={(deleteEvent) => { deleteEvent.stopPropagation(); onDelete(command.id); }}
                            title="Delete"
                        >
                            <Trash2 size={16} />
                        </div>
                    </div>
                </div>

                {/* Command or description text — shown in monospace as a code hint */}
                <div className="card-body">
                    <div className="command-preview" title={command.command}>
                        {command.description || command.command}
                    </div>
                </div>

                {/* Paste + Run buttons */}
                <div className={`card-footer ${command.pasteOnly ? 'paste-only' : ''}`}>
                    <button
                        className="btn-action btn-paste"
                        onClick={() => onPaste(command)}
                        title="Paste to Terminal"
                    >
                        <Clipboard size={14} /> Paste
                    </button>
                    {!command.pasteOnly && (
                        <button
                            className="btn-action btn-run"
                            onClick={() => onExecute(command)}
                            title="Run in Terminal"
                        >
                            <Play size={14} /> Run
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
