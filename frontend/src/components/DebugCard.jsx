import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';

/**
 * Collapsible Debug Card Component
 * Extracted to separate file to avoid minifier TDZ issues
 */
const DebugCard = ({ id, title, icon: Icon, children, defaultCollapsed = false, isActive = false }) => {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(`debug-card-${id}-collapsed`);
    return saved !== null ? saved === 'true' : defaultCollapsed;
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    localStorage.setItem(`debug-card-${id}-collapsed`, collapsed.toString());
  }, [collapsed, id]);

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="debug-card"
    >
      <div 
        className="debug-card-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px 8px 0 0',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderBottom: collapsed ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} color="#666" />
          </div>
          <Icon size={14} color={isActive ? '#00ff00' : '#888'} />
          <h4 style={{ margin: 0, color: '#fff', fontSize: '12px', fontWeight: 600 }}>
            {title}
          </h4>
          {isActive && (
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00ff00',
              animation: 'pulse 2s infinite',
            }} />
          )}
        </div>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </div>
      {!collapsed && (
        <div 
          className="debug-card-body"
          style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '0 0 8px 8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderTop: 'none',
            fontSize: '11px',
            color: '#ccc',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default DebugCard;
