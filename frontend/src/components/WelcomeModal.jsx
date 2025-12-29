import React from 'react';
import { X, Terminal, Sparkles } from 'lucide-react';

/**
 * Welcome Modal - Shows on first launch or after upgrade
 * v3.5.3: Simplified to just welcome and start the tour
 */
function WelcomeModal({ isOpen, onClose, version, onStartTour }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleStartTour();
    }
  };

  const handleStartTour = () => {
    onClose();
    // Tour will auto-start via useGuidedTour after welcome is dismissed
  };

  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      // Close modal on Escape, Enter, or any printable key
      if (e.key === 'Escape' || e.key === 'Enter' || (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1)) {
        if (e.key === 'Escape' || e.key === 'Enter') e.preventDefault();
        handleStartTour();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal welcome-modal" style={{ maxWidth: '500px' }}>
        <button className="modal-close" onClick={handleStartTour} title="Close">
          <X size={20} />
        </button>

        <div className="welcome-content" style={{ textAlign: 'center', padding: '40px 30px' }}>
          {/* ASCII Art Logo */}
          <pre className="welcome-ascii" style={{ fontSize: '0.6rem', lineHeight: 1.2 }}>
{`
    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  
    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  
    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
`}
          </pre>
          <div className="welcome-subtitle" style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '10px' }}>TERMINAL</div>
          <div className="welcome-version" style={{ color: '#888', marginBottom: '20px' }}>v{version}</div>

          <div style={{ 
            background: 'rgba(139, 92, 246, 0.1)', 
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '30px'
          }}>
            <Sparkles size={32} style={{ color: '#a78bfa', marginBottom: '12px' }} />
            <p style={{ fontSize: '1.1rem', lineHeight: 1.6, margin: 0, color: '#e5e5e5' }}>
              <strong>One binary, double-click, works.</strong>
            </p>
            <p style={{ fontSize: '0.9rem', color: '#a3a3a3', marginTop: '10px', marginBottom: 0 }}>
              Let's take a quick tour to discover all the features.
            </p>
          </div>

          <div className="welcome-footer">
            <button 
              className="btn btn-primary welcome-start-btn" 
              onClick={handleStartTour}
              style={{ 
                padding: '14px 32px', 
                fontSize: '1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <Terminal size={20} />
              Start Tour
            </button>
            <div className="welcome-hint" style={{ marginTop: '16px', color: '#666', fontSize: '0.85rem' }}>
              Press any key to continue
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomeModal;
