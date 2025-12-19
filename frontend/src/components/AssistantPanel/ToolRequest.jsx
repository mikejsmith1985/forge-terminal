import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';

const ToolRequest = ({ tool, params, onApprove, onDeny }) => {
  return (
    <div className="tool-request" style={{
      border: '1px solid #d97706',
      borderRadius: '4px',
      margin: '8px 0',
      backgroundColor: '#451a03',
      padding: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: '#fbbf24' }}>
        <ShieldAlert size={18} style={{ marginRight: '8px' }} />
        <span style={{ fontWeight: 'bold' }}>Tool Request: {tool}</span>
      </div>
      
      <div style={{ 
        backgroundColor: '#1e1e1e', 
        padding: '8px', 
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '0.85em',
        marginBottom: '12px',
        whiteSpace: 'pre-wrap'
      }}>
        {JSON.stringify(params, null, 2)}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={onApprove}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            backgroundColor: '#15803d',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <Check size={16} style={{ marginRight: '4px' }} />
          Allow
        </button>
        <button 
          onClick={onDeny}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            backgroundColor: '#b91c1c',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <X size={16} style={{ marginRight: '4px' }} />
          Deny
        </button>
      </div>
    </div>
  );
};

export default ToolRequest;
