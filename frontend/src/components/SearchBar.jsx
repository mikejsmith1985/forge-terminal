import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * SearchBar Component
 * 
 * Terminal search bar with navigation controls.
 * Shows match count and provides prev/next navigation.
 */
function SearchBar({ 
  isOpen, 
  onClose, 
  onSearch, 
  onNext, 
  onPrev, 
  matchCount = 0,
  currentMatch = 0 
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Clear search when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setQuery(value);
    onSearch(value);
  }, [onSearch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  }, [onClose, onNext, onPrev]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="search-bar" data-testid="search-bar">
      <div className="search-input-wrapper">
        <Search size={16} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search in terminal..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          data-testid="search-input"
        />
        {query && matchCount > 0 && (
          <span className="search-count" data-testid="search-count">
            {currentMatch} of {matchCount}
          </span>
        )}
        {query && matchCount === 0 && (
          <span className="search-no-results" data-testid="search-no-results">
            No results
          </span>
        )}
      </div>
      <div className="search-actions">
        <button 
          className="search-btn" 
          onClick={onPrev} 
          title="Previous match (Shift+Enter)"
          disabled={!query || matchCount === 0}
          data-testid="search-prev"
        >
          <ChevronUp size={16} />
        </button>
        <button 
          className="search-btn" 
          onClick={onNext} 
          title="Next match (Enter)"
          disabled={!query || matchCount === 0}
          data-testid="search-next"
        >
          <ChevronDown size={16} />
        </button>
        <button 
          className="search-btn search-close" 
          onClick={handleClose} 
          title="Close (Escape)"
          data-testid="search-close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default SearchBar;
