import React from 'react';
import './ModelTestModal.css';

const ModelTestModal = ({ modelName, isOpen, onConfirm, onCancel, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="model-test-modal-overlay">
      <div className="model-test-modal">
        <div className="model-test-modal-content">
          <h3>Run Model Tests?</h3>
          <p>
            Would you like to run the baseline test suite for <strong>{modelName}</strong>?
          </p>
          <p className="model-test-info">
            This will evaluate the model's performance on 20 standardized questions and generate a visual report.
          </p>
        </div>
        <div className="model-test-modal-actions">
          <button
            className="model-test-btn model-test-btn-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            Skip Tests
          </button>
          <button
            className="model-test-btn model-test-btn-confirm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Starting...' : 'Run Tests'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelTestModal;
