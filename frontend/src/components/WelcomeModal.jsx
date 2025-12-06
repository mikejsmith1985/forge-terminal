import React from 'react';
import { X, Terminal, Palette, Layers, Search, Keyboard, Zap, Settings, RefreshCw, BookOpen, FolderOpen, Eye } from 'lucide-react';

/**
 * Welcome Modal - Shows on first launch or after upgrade
 */
function WelcomeModal({ isOpen, onClose, version }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal welcome-modal">
        <button className="modal-close" onClick={onClose} title="Close">
          <X size={20} />
        </button>

        <div className="welcome-content">
          {/* ASCII Art Logo */}
          <pre className="welcome-ascii">
{`
    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  
    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  
    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
`}
          </pre>
          <div className="welcome-subtitle">TERMINAL</div>
          <div className="welcome-version">v{version}</div>

          <div className="welcome-tagline">
            <span className="welcome-quote">"One binary, double-click, works."</span>
          </div>

          {/* Feature Grid */}
          <div className="welcome-features">
            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Terminal size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Full PTY Terminal</strong>
                <span>Interactive apps like vim, htop, claude</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Layers size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Multi-Tab Support</strong>
                <span>Up to 20 tabs with session restore</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Zap size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Command Cards</strong>
                <span>Save & trigger commands instantly</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Palette size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>10 Color Themes</strong>
                <span>Including 4 high-contrast accessibility themes</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Search size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Terminal Search</strong>
                <span>Find text with Ctrl+F</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Keyboard size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Keyboard Shortcuts</strong>
                <span>Ctrl+Shift+1-9 for quick commands</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Settings size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Shell Selection</strong>
                <span>CMD, PowerShell, or WSL on Windows</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <RefreshCw size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Auto-Updates</strong>
                <span>Stay current with one-click updates</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <BookOpen size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>AM (Artificial Memory)</strong>
                <span>Session logging for crash recovery</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Zap size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Auto-Respond</strong>
                <span>Auto-answer AI tool prompts (Y/N)</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <FolderOpen size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Self-Naming Tabs</strong>
                <span>Tabs auto-rename to current folder</span>
              </div>
            </div>

            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <Eye size={24} />
              </div>
              <div className="welcome-feature-text">
                <strong>Accessibility Themes</strong>
                <span>High contrast + colorblind-friendly options</span>
              </div>
            </div>
          </div>

          <div className="welcome-footer">
            <button className="btn btn-primary welcome-start-btn" onClick={onClose}>
              <Terminal size={18} />
              Start Terminal
            </button>
            <div className="welcome-hint">Press any key to continue</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomeModal;
