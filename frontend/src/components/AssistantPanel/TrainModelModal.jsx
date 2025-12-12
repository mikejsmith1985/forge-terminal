import React from 'react';
import './TrainModelModal.css';

const TrainModelModal = ({ modelName, isOpen, onConfirm, onCancel, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="train-model-modal-overlay">
      <div className="train-model-modal">
        <div className="train-model-modal-content">
          <h3>Train Model?</h3>
          <p>
            Would you like to train <strong>{modelName}</strong> on comprehensive Forge Terminal knowledge?
          </p>
          <p className="train-model-info">
            Training includes 50 Q&A pairs covering core features, command cards, theming, shortcuts, Windows/WSL support, security, assistant features, troubleshooting, configuration, and deployment.
          </p>
          <p className="train-model-note">
            ℹ️ Training typically takes 30-60 seconds depending on model size and system performance.
          </p>
        </div>
        <div className="train-model-modal-actions">
          <button
            className="train-model-btn train-model-btn-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            Skip Training
          </button>
          <button
            className="train-model-btn train-model-btn-confirm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Starting...' : 'Train Model'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainModelModal;
