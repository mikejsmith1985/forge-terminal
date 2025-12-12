import React from 'react';
import './ModelTestStatus.css';

const ModelTestStatus = ({ isActive, progress, message, canChat }) => {
  if (!isActive) return null;

  return (
    <div className="model-test-status-bar">
      <div className="model-test-status-content">
        <div className="model-test-spinner"></div>
        <div className="model-test-status-info">
          <div className="model-test-status-message">{message}</div>
          {progress && (
            <div className="model-test-progress-wrapper">
              <div className="model-test-progress-bar">
                <div className="model-test-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="model-test-progress-text">{progress}%</span>
            </div>
          )}
          {!canChat && (
            <div className="model-test-warning">
              ⚠️ Model is busy testing. Please wait for tests to complete.
            </div>
          )}
          {canChat && (
            <div className="model-test-info-text">
              ✓ You can continue chatting while tests run in the background.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelTestStatus;
