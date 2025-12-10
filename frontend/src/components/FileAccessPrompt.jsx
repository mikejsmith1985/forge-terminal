import React, { useState } from 'react';
import { Shield, ShieldAlert, Info } from 'lucide-react';

export default function FileAccessPrompt({ isOpen, onChoice }) {
  const [selectedMode, setSelectedMode] = useState('restricted');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      const response = await fetch('/api/files/access-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode })
      });
      
      if (!response.ok) {
        throw new Error('Failed to set file access mode');
      }
      
      // Store choice in localStorage so we don't prompt again
      localStorage.setItem('fileAccessModeSet', 'true');
      localStorage.setItem('fileAccessMode', selectedMode);
      
      onChoice(selectedMode);
    } catch (err) {
      console.error('Failed to set file access mode:', err);
      alert('Failed to save setting. Please try again.');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>
            <Shield size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} />
            File Access Permissions
          </h3>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: '20px', color: '#ccc' }}>
            Choose how Forge Terminal should access files on your system. 
            You can change this later in Settings.
          </p>

          {/* Restricted Option */}
          <div 
            onClick={() => setSelectedMode('restricted')}
            style={{
              padding: '16px',
              marginBottom: '12px',
              border: `2px solid ${selectedMode === 'restricted' ? '#8b5cf6' : '#333'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              background: selectedMode === 'restricted' ? '#1e1b4b' : '#1a1a1a',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <input 
                type="radio" 
                checked={selectedMode === 'restricted'} 
                onChange={() => setSelectedMode('restricted')}
                style={{ marginTop: '4px' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Shield size={18} style={{ color: '#22c55e' }} />
                  <strong style={{ color: '#fff' }}>Project-Scoped (Recommended)</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.9em', color: '#aaa' }}>
                  Only access files within your terminal's working directory. 
                  Safer for shared systems and prevents accidental access to system files.
                </p>
                <div style={{ 
                  marginTop: '8px', 
                  padding: '8px', 
                  background: '#0a0a0a', 
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  color: '#888'
                }}>
                  <Info size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Best for: Development work, shared machines, security-conscious users
                </div>
              </div>
            </div>
          </div>

          {/* Unrestricted Option */}
          <div 
            onClick={() => setSelectedMode('unrestricted')}
            style={{
              padding: '16px',
              marginBottom: '20px',
              border: `2px solid ${selectedMode === 'unrestricted' ? '#8b5cf6' : '#333'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              background: selectedMode === 'unrestricted' ? '#1e1b4b' : '#1a1a1a',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <input 
                type="radio" 
                checked={selectedMode === 'unrestricted'} 
                onChange={() => setSelectedMode('unrestricted')}
                style={{ marginTop: '4px' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ShieldAlert size={18} style={{ color: '#f59e0b' }} />
                  <strong style={{ color: '#fff' }}>Full System Access</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.9em', color: '#aaa' }}>
                  Access any file your user account can read. Convenient for browsing 
                  the entire filesystem, but requires trust in the application.
                </p>
                <div style={{ 
                  marginTop: '8px', 
                  padding: '8px', 
                  background: '#422006', 
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  color: '#fed7aa',
                  border: '1px solid #f97316'
                }}>
                  <ShieldAlert size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Best for: Personal machines, system administration, experienced users
                </div>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            paddingTop: '12px',
            borderTop: '1px solid #333'
          }}>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{
                padding: '10px 24px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
