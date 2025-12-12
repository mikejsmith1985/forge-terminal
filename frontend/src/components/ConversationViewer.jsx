import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Clock, MessageSquare } from 'lucide-react';
import './ConversationViewer.css';

/**
 * ConversationViewer - Modal for viewing LLM conversation snapshots
 */
const ConversationViewer = ({ tabId, conversationId, onClose }) => {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(0);

  useEffect(() => {
    const fetchConversation = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/am/llm/conversation/${tabId}/${conversationId}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch conversation: ${res.status}`);
        }
        const data = await res.json();
        setConversation(data.conversation);
        // Start at the most recent snapshot
        if (data.conversation.screenSnapshots?.length > 0) {
          setCurrentSnapshotIndex(data.conversation.screenSnapshots.length - 1);
        }
      } catch (err) {
        console.error('[ConversationViewer] Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (tabId && conversationId) {
      fetchConversation();
    }
  }, [tabId, conversationId]);

  const handlePrevious = () => {
    setCurrentSnapshotIndex(Math.max(0, currentSnapshotIndex - 1));
  };

  const handleNext = () => {
    const maxIndex = (conversation?.screenSnapshots?.length || 1) - 1;
    setCurrentSnapshotIndex(Math.min(maxIndex, currentSnapshotIndex + 1));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSnapshotIndex, conversation, onClose]);

  if (loading) {
    return (
      <div className="conversation-viewer-overlay" onClick={onClose}>
        <div className="conversation-viewer" onClick={(e) => e.stopPropagation()}>
          <div className="conversation-viewer-header">
            <h3>Loading Conversation...</h3>
            <button className="close-button" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="conversation-viewer-body loading">
            <p>Fetching conversation data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="conversation-viewer-overlay" onClick={onClose}>
        <div className="conversation-viewer" onClick={(e) => e.stopPropagation()}>
          <div className="conversation-viewer-header">
            <h3>Error</h3>
            <button className="close-button" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="conversation-viewer-body error">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const snapshots = conversation?.screenSnapshots || [];
  const currentSnapshot = snapshots[currentSnapshotIndex];
  const turns = conversation?.turns || [];
  
  // Detect project from metadata
  const projectName = conversation?.metadata?.workingDirectory 
    ? conversation.metadata.workingDirectory.split('/').pop() 
    : 'Unknown Project';

  return (
    <div className="conversation-viewer-overlay" onClick={onClose}>
      <div className="conversation-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="conversation-viewer-header">
          <div className="header-info">
            <h3>{projectName} - {conversation?.provider}</h3>
            <div className="conversation-meta">
              {conversation?.metadata?.gitBranch && (
                <span className="meta-item" title="Git Branch">
                  🌿 {conversation.metadata.gitBranch}
                </span>
              )}
              <span className="meta-item">
                <MessageSquare size={14} />
                {turns.length} turns
              </span>
              <span className="meta-item">
                <Clock size={14} />
                {snapshots.length} snapshots
              </span>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {snapshots.length > 0 ? (
          <>
            <div className="snapshot-controls">
              <button 
                className="nav-button" 
                onClick={handlePrevious}
                disabled={currentSnapshotIndex === 0}
              >
                <ChevronLeft size={18} />
                Previous
              </button>
              <span className="snapshot-counter">
                Snapshot {currentSnapshotIndex + 1} of {snapshots.length}
              </span>
              <button 
                className="nav-button" 
                onClick={handleNext}
                disabled={currentSnapshotIndex === snapshots.length - 1}
              >
                Next
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="conversation-viewer-body">
              {currentSnapshot && (
                <>
                  <div className="snapshot-timestamp">
                    {new Date(currentSnapshot.timestamp).toLocaleString()}
                  </div>
                  <pre className="snapshot-content">
                    {currentSnapshot.cleanedContent || currentSnapshot.rawContent}
                  </pre>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="conversation-viewer-body empty">
            <p>No snapshots captured yet.</p>
            <p className="hint">Snapshots are captured as you interact with the LLM tool.</p>
          </div>
        )}

        <div className="conversation-viewer-footer">
          <p className="keyboard-hints">
            <kbd>←</kbd> <kbd>→</kbd> Navigate • <kbd>Esc</kbd> Close
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConversationViewer;
