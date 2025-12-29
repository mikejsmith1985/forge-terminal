/**
 * ChatSearchOverlay - Full-text search for chat history
 * v3.5.1: Search with auto-scroll to results
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { useChatSearch } from '../hooks/useChatStore';
import './ChatSearchOverlay.css';

const ChatSearchOverlay = ({ isOpen, onClose, onScrollToMessage }) => {
  const { query, setQuery, results, isSearching, clearSearch } = useChatSearch(300);
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  const handleSelectResult = (message) => {
    if (onScrollToMessage) {
      onScrollToMessage(message.id);
    }
    onClose();
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const highlightMatch = (text, query) => {
    if (!query.trim()) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i}>{part}</mark> 
        : part
    );
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'user': return '👤';
      case 'assistant': return '🤖';
      case 'command': return '⚡';
      case 'system': return '⚙️';
      case 'file': return '📄';
      case 'image': return '🖼️';
      default: return '💬';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-search-overlay">
      <div className="chat-search-backdrop" onClick={onClose} />
      <div className="chat-search-modal">
        <div className="chat-search-header">
          <div className="chat-search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="chat-search-input"
              placeholder="Search chat history..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button className="clear-search-btn" onClick={clearSearch}>
                <X size={16} />
              </button>
            )}
          </div>
          <button className="close-search-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="chat-search-results">
          {isSearching && (
            <div className="search-loading">
              <div className="spinner" />
              <span>Searching...</span>
            </div>
          )}

          {!isSearching && query && results.length === 0 && (
            <div className="search-empty">
              <MessageSquare size={32} />
              <p>No messages found for "{query}"</p>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="search-results-list">
              {results.map((message, index) => (
                <div
                  key={message.id}
                  className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelectResult(message)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="result-icon">
                    {getTypeIcon(message.type)}
                  </div>
                  <div className="result-content">
                    <div className="result-text">
                      {highlightMatch(
                        message.content.length > 200 
                          ? message.content.substring(0, 200) + '...' 
                          : message.content,
                        query
                      )}
                    </div>
                    <div className="result-meta">
                      <span className="result-time">
                        <Clock size={12} />
                        {formatTimestamp(message.timestamp)}
                      </span>
                      {message.workerName && (
                        <span className="result-worker">
                          {message.workerName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="result-action">
                    <ArrowRight size={16} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div className="search-tips">
              <h4>Search Tips</h4>
              <ul>
                <li>Search by content, commands, or file names</li>
                <li>Use ↑↓ to navigate, Enter to select</li>
                <li>Press Escape to close</li>
              </ul>
            </div>
          )}
        </div>

        <div className="chat-search-footer">
          <span className="search-hint">
            {results.length > 0 ? `${results.length} results` : 'Type to search'}
          </span>
          <div className="keyboard-hints">
            <kbd>↑↓</kbd> Navigate
            <kbd>Enter</kbd> Select
            <kbd>Esc</kbd> Close
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatSearchOverlay;
