import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BrainCircuit } from 'lucide-react';

const ThinkingBlock = ({ content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="thinking-block" style={{ 
      border: '1px solid #333', 
      borderRadius: '4px', 
      margin: '8px 0',
      backgroundColor: '#1e1e1e'
    }}>
      <div 
        className="thinking-header" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px',
          cursor: 'pointer',
          color: '#888',
          fontSize: '0.9em'
        }}
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <BrainCircuit size={16} style={{ marginLeft: '8px', marginRight: '8px' }} />
        <span>Thinking Process</span>
      </div>
      
      {isOpen && (
        <div className="thinking-content" style={{
          padding: '8px 12px',
          borderTop: '1px solid #333',
          color: '#aaa',
          fontFamily: 'monospace',
          fontSize: '0.85em',
          whiteSpace: 'pre-wrap'
        }}>
          {content}
        </div>
      )}
    </div>
  );
};

export default ThinkingBlock;
