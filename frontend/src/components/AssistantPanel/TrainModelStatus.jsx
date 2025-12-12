import React from 'react';
import './TrainModelStatus.css';

const TrainModelStatus = ({ isActive, progress, message, isTraining }) => {
  if (!isActive) return null;

  return (
    <div className="train-model-status-bar">
      <div className="train-model-status-content">
        <div className="train-model-spinner"></div>
        <div className="train-model-status-info">
          <div className="train-model-status-message">{message}</div>
          {progress && (
            <div className="train-model-progress-wrapper">
              <div className="train-model-progress-bar">
                <div className="train-model-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="train-model-progress-text">{progress}%</span>
            </div>
          )}
          {isTraining && (
            <div className="train-model-training-note">
              📚 Training in progress: Teaching model about Forge Terminal features...
            </div>
          )}
          {!isTraining && progress === 100 && (
            <div className="train-model-success-note">
              ✓ Training complete! Model is now aware of Forge Terminal features.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainModelStatus;
