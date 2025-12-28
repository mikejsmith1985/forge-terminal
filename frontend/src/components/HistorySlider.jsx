/**
 * HistorySlider - Time-Travel Scrubber Component
 * Industrial Phase 2: Terminal state reconstruction at any timestamp
 * 
 * Features:
 * - Slider to scrub through terminal history
 * - Ghost terminal overlay to preview past states
 * - Real-time fetching from /api/am/session/:tabId/rewind
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Rewind, FastForward, X, Play, Pause } from 'lucide-react';
import './HistorySlider.css';

// Debounce hook for slider changes
const useDebounce = (callback, delay) => {
  const timeoutRef = useRef(null);
  
  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
};

export const HistorySlider = ({ 
  tabId, 
  isOpen, 
  onClose, 
  onPreview,
  position = 'bottom' 
}) => {
  const [timeRange, setTimeRange] = useState(null);
  const [currentValue, setCurrentValue] = useState(100); // 0-100 percentage
  const [currentTime, setCurrentTime] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);
  const playIntervalRef = useRef(null);

  // Fetch time range on mount
  useEffect(() => {
    if (!isOpen || !tabId) return;

    const fetchTimeRange = async () => {
      try {
        const response = await fetch(`/api/am/session/${tabId}/range`);
        if (!response.ok) {
          throw new Error('No history available');
        }
        const data = await response.json();
        
        if (data.available) {
          setTimeRange({
            earliest: new Date(data.earliest),
            latest: new Date(data.latest),
            count: data.snapshotCount
          });
          setCurrentTime(new Date(data.latest));
          setError(null);
        } else {
          setError('No history snapshots available yet');
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch history');
      }
    };

    fetchTimeRange();
    
    // Refresh every 10 seconds
    const interval = setInterval(fetchTimeRange, 10000);
    return () => clearInterval(interval);
  }, [isOpen, tabId]);

  // Fetch preview when slider changes
  const fetchPreview = useCallback(async (timestamp) => {
    if (!tabId || !timestamp) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/am/session/${tabId}/rewind?t=${timestamp.toISOString()}`
      );
      
      if (!response.ok) {
        throw new Error('Snapshot not found');
      }
      
      const data = await response.json();
      setPreviewContent(data.cleanedContent);
      setCurrentTime(new Date(data.timestamp));
      
      if (onPreview) {
        onPreview(data);
      }
    } catch (err) {
      console.error('[HistorySlider] Preview fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tabId, onPreview]);

  // Debounced fetch for slider changes
  const debouncedFetch = useDebounce(fetchPreview, 150);

  // Handle slider change
  const handleSliderChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setCurrentValue(value);

    if (timeRange) {
      const duration = timeRange.latest.getTime() - timeRange.earliest.getTime();
      const targetMs = timeRange.earliest.getTime() + (duration * value / 100);
      const targetTime = new Date(targetMs);
      setCurrentTime(targetTime);
      debouncedFetch(targetTime);
    }
  };

  // Jump to start/end
  const jumpToStart = () => {
    setCurrentValue(0);
    if (timeRange) {
      setCurrentTime(timeRange.earliest);
      fetchPreview(timeRange.earliest);
    }
  };

  const jumpToEnd = () => {
    setCurrentValue(100);
    if (timeRange) {
      setCurrentTime(timeRange.latest);
      setPreviewContent(null);
      if (onPreview) {
        onPreview(null);
      }
    }
  };

  // Playback controls
  const togglePlayback = () => {
    if (isPlaying) {
      // Stop
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      // Start
      setIsPlaying(true);
      playIntervalRef.current = setInterval(() => {
        setCurrentValue(prev => {
          if (prev >= 100) {
            clearInterval(playIntervalRef.current);
            setIsPlaying(false);
            return 100;
          }
          const newValue = Math.min(100, prev + 2);
          
          if (timeRange) {
            const duration = timeRange.latest.getTime() - timeRange.earliest.getTime();
            const targetMs = timeRange.earliest.getTime() + (duration * newValue / 100);
            fetchPreview(new Date(targetMs));
          }
          
          return newValue;
        });
      }, 500);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // Format time for display
  const formatTime = (date) => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  if (!isOpen) return null;

  return (
    <div className={`history-slider-container ${position}`}>
      <div className="history-slider-header">
        <div className="history-slider-title">
          <Clock size={16} />
          <span>Time Travel</span>
          {timeRange && (
            <span className="snapshot-count">
              {timeRange.count} snapshots
            </span>
          )}
        </div>
        <button 
          className="history-slider-close" 
          onClick={onClose}
          title="Close Time Travel"
        >
          <X size={16} />
        </button>
      </div>

      {error ? (
        <div className="history-slider-error">
          <span>{error}</span>
          <small>Terminal activity will be captured as you use it.</small>
        </div>
      ) : (
        <div className="history-slider-content">
          <div className="history-slider-controls">
            <button 
              className="history-control-btn"
              onClick={jumpToStart}
              title="Jump to start"
            >
              <Rewind size={16} />
            </button>

            <button 
              className="history-control-btn play-btn"
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <div className="history-slider-track">
              <input
                type="range"
                min="0"
                max="100"
                value={currentValue}
                onChange={handleSliderChange}
                className="history-slider-input"
              />
              <div 
                className="history-slider-progress"
                style={{ width: `${currentValue}%` }}
              />
            </div>

            <button 
              className="history-control-btn"
              onClick={jumpToEnd}
              title="Jump to present"
            >
              <FastForward size={16} />
            </button>
          </div>

          <div className="history-slider-info">
            <span className="time-display">
              {formatTime(currentTime)}
            </span>
            {isLoading && (
              <span className="loading-indicator">Loading...</span>
            )}
            {currentValue < 100 && previewContent && (
              <span className="preview-indicator">
                Viewing past state
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ghost Terminal Overlay */}
      {previewContent && currentValue < 100 && (
        <div className="ghost-terminal-overlay">
          <div className="ghost-terminal-header">
            <span>Terminal State at {formatTime(currentTime)}</span>
            <button 
              className="ghost-close-btn"
              onClick={() => {
                setPreviewContent(null);
                jumpToEnd();
              }}
            >
              Return to Present
            </button>
          </div>
          <pre className="ghost-terminal-content">
            {previewContent}
          </pre>
        </div>
      )}
    </div>
  );
};

export default HistorySlider;
