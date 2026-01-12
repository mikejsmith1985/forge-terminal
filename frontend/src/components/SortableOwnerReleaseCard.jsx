import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import OwnerReleaseCard from './OwnerReleaseCard';

export function SortableOwnerReleaseCard({ command, ...props }) {
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
        position: 'relative',
        marginBottom: '12px', // Match .card margin if possible, usually handled by parent gap or margin
    };

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? 'dragging' : ''}>
            {/* Drag Handle Overlay */}
            <div 
                {...attributes} 
                {...listeners} 
                style={{
                    position: 'absolute',
                    right: '12px',
                    top: '12px',
                    zIndex: 20,
                    cursor: 'grab',
                    color: '#a3a3a3',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7,
                }}
                className="drag-handle-overlay"
                title="Drag to reorder"
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
            >
                <GripVertical size={18} />
            </div>
            <OwnerReleaseCard {...props} />
        </div>
    );
}
