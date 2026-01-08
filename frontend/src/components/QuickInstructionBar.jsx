import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Edit3, Zap } from 'lucide-react';
import './QuickInstructionBar.css';

/**
 * QuickInstructionBar - Floating input bar for appending context to prompts
 * v3.12.15: Explicit input mechanism (not PTY interception)
 * 
 * Positioned above Forge Assist button, allows user to:
 * 1. Type their prompt
 * 2. See quick instruction context
 * 3. Send combined text to terminal (like Command Cards)
 */
function QuickInstructionBar({ 
  isEnabled,
  isExpanded: externalIsExpanded,
  quickInstruction, 
  forgeAssistBtnPos, 
  onSend,
  onOpen,
  onClose 
}) {
  const [userPrompt, setUserPrompt] = useState('');
  const promptInputRef = useRef(null);

  // Use internal state for expansion, but can be controlled externally
  const isExpanded = externalIsExpanded;

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        onClose();
      }
      // Ctrl+Enter to send (when focused in component)
      if (e.ctrlKey && e.key === 'Enter' && isExpanded && userPrompt.trim()) {
        handleSend();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, userPrompt]);

  // Focus prompt input when expanded
  useEffect(() => {
    if (isExpanded && promptInputRef.current) {
      promptInputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSend = () => {
    if (!userPrompt.trim()) return;

    // Combine user prompt with quick instruction
    const fullPrompt = `${userPrompt.trim()}\n\n${quickInstruction}\n`;
    
    onSend(fullPrompt);
    
    // Clear input and collapse
    setUserPrompt('');
    onClose();
  };

  const handleCancel = () => {
    setUserPrompt('');
    onClose();
  };

  if (!isEnabled) return null;

  // Calculate position relative to Forge Assist button
  const barBottom = forgeAssistBtnPos.bottom + 70; // 70px above button

  return (
    <>
      {/* Collapsed Bar - Always visible when enabled */}
      {!isExpanded && (
        <div
          className="quick-instruction-collapsed"
          style={{
            position: 'fixed',
            right: `${forgeAssistBtnPos.right - 10}px`,
            bottom: `${barBottom}px`,
            zIndex: 999
          }}
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
        >
          <Zap size={16} />
          <span>Quick Instruction</span>
          <kbd>Ctrl+I</kbd>
        </div>
      )}

      {/* Expanded Bar */}
      {isExpanded && (
        <div
          className="quick-instruction-bar"
          style={{
            position: 'fixed',
            right: '20px',
            bottom: `${barBottom}px`,
            zIndex: 999
          }}
        >
          {/* Header */}
          <div className="qib-header">
            <Zap size={18} />
            <span>Quick Instruction</span>
            <button
              className="qib-close-btn"
              onClick={handleCancel}
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="qib-content">
            {/* User Prompt Input */}
            <div className="qib-section">
              <label className="qib-label">
                💬 Your Prompt
              </label>
              <textarea
                ref={promptInputRef}
                className="qib-textarea"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Type your question or prompt here..."
                rows={3}
                onKeyDown={(e) => {
                  // Ctrl+Enter to send
                  if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            {/* Quick Instruction Preview */}
            <div className="qib-section">
              <label className="qib-label">
                📝 Appended Context
                <a
                  href="#"
                  className="qib-edit-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose(); // Close Quick Instruction bar
                    // Open Settings modal to Quick Instructions tab
                    // This will be handled by parent component
                  }}
                  title="Edit in Settings"
                >
                  <Edit3 size={12} />
                  Edit
                </a>
              </label>
              <div className="qib-instruction-preview">
                {quickInstruction || '(No instruction configured)'}
              </div>
            </div>

            {/* Combined Preview */}
            {userPrompt.trim() && (
              <div className="qib-section">
                <label className="qib-label">
                  👁️ What Will Be Sent
                </label>
                <div className="qib-combined-preview">
                  <div className="qib-preview-section">
                    {userPrompt.trim()}
                  </div>
                  <div className="qib-preview-divider">• • •</div>
                  <div className="qib-preview-section qib-preview-instruction">
                    {quickInstruction}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="qib-actions">
              <button
                className="qib-btn qib-btn-cancel"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="qib-btn qib-btn-send"
                onClick={handleSend}
                disabled={!userPrompt.trim()}
              >
                <Send size={16} />
                Send
                <kbd style={{ marginLeft: '8px' }}>Ctrl+↵</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default QuickInstructionBar;
