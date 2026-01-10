import React, { useState, useEffect, useRef } from 'react';
import { Send, X } from 'lucide-react';
import './PersistentInstructionBar.css';

/**
 * PersistentInstructionBar - Floating input bar for appending context to prompts
 * v3.12.15: Explicit input mechanism (not PTY interception)
 * 
 * Positioned above Forge Assist button, allows user to:
 * 1. Type their prompt
 * 2. See persistent instruction context
 * 3. Send combined text to terminal (like Command Cards)
 */
function PersistentInstructionBar({ 
  isExpanded: externalIsExpanded,
  forgeAssistBtnPos, 
  onSend,
  onOpen,
  onClose,
  onEdit
}) {
  const [userPrompt, setUserPrompt] = useState('');
  const [persistentInstructions, setPersistentInstructions] = useState([]);
  const promptInputRef = useRef(null);

  // Load instructions from localStorage and listen for updates
  useEffect(() => {
    const loadInstructions = () => {
      try {
        const saved = localStorage.getItem('forgeAssist_persistentInstructions');
        if (saved) {
          setPersistentInstructions(JSON.parse(saved));
        } else {
          setPersistentInstructions([]);
        }
      } catch (e) {
        setPersistentInstructions([]);
      }
    };

    loadInstructions();
    window.addEventListener('forge-persistent-instructions-updated', loadInstructions);
    return () => window.removeEventListener('forge-persistent-instructions-updated', loadInstructions);
  }, []);

  // Compute active instruction text
  const activeInstructions = persistentInstructions.filter(i => i.enabled);
  const persistentInstructionText = activeInstructions.map(i => i.text).join('\n\n');
  // Global enable toggle for the persistent-instruction bar (persisted in localStorage)
  const [globalBarEnabled, setGlobalBarEnabled] = useState(() => {
    const v = localStorage.getItem('forgeAssist_persistentInstructionBarEnabled');
    if (v === null) return true;
    return v === 'true';
  });
  useEffect(() => {
    const handler = () => {
      const v = localStorage.getItem('forgeAssist_persistentInstructionBarEnabled');
      setGlobalBarEnabled(v === null ? true : v === 'true');
    };
    window.addEventListener('forge-persistent-instruction-bar-enabled-changed', handler);
    return () => window.removeEventListener('forge-persistent-instruction-bar-enabled-changed', handler);
  }, []);
  const isEnabled = globalBarEnabled && activeInstructions.length > 0;

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

    // Combine user prompt with persistent instruction
    const fullPrompt = `${userPrompt.trim()}\n\n${persistentInstructionText}\n`;
    
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

  // Browser-style address bar positioning: extends leftward from Forge Assist button
  // The Forge Assist button acts as the "home" button
  const barRight = forgeAssistBtnPos.right;
  const barBottom = forgeAssistBtnPos.bottom;

  return (
    <>
      {/* Browser-style Address Bar (expanded mode) */}
      {isExpanded && (
        <div
          style={{
            position: 'fixed',
            right: `${barRight + 60}px`, // Start 60px left of Forge Assist button (button width)
            bottom: `${barBottom}px`,
            zIndex: 998, // Below Forge Assist button (999)
            display: 'flex',
            alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(35,35,35,0.98) 100%)',
            backdropFilter: 'blur(20px)',
            border: '2px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '12px',
            padding: '8px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            minWidth: '400px',
            maxWidth: '600px',
            gap: '12px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* Input field (browser URL bar style) */}
          <input
            ref={promptInputRef}
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Type your prompt here..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.08)';
              e.target.style.borderColor = 'rgba(139, 92, 246, 0.5)';
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.05)';
              e.target.style.borderColor = 'rgba(255,255,255,0.1)';
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!userPrompt.trim()}
            title="Send (Enter)"
            style={{
              background: userPrompt.trim() ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'rgba(100,100,100,0.3)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              color: userPrompt.trim() ? '#fff' : '#666',
              cursor: userPrompt.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              boxShadow: userPrompt.trim() ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (userPrompt.trim()) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = userPrompt.trim() ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none';
            }}
          >
            <Send size={16} />
            Send
          </button>

          {/* Close button */}
          <button
            onClick={handleCancel}
            title="Close (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#888';
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}

export default PersistentInstructionBar;