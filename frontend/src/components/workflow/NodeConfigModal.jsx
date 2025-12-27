import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SuccessCriteriaEditor } from './SuccessCriteriaEditor';

/**
 * NodeConfigModal - Configure workflow node properties
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSave - Save callback with updated node data
 * @param {Object} props.node - Node to configure
 * @param {Array} props.commandCards - Available command cards for assignment
 */
export function NodeConfigModal({ isOpen, onClose, onSave, node, commandCards = [] }) {
  const [formData, setFormData] = useState({
    label: '',
    description: '',
    commandCardId: null,
    successCriteria: null,
  });

  useEffect(() => {
    if (isOpen && node) {
      setFormData({
        label: node.data?.label || '',
        description: node.data?.description || '',
        commandCardId: node.data?.commandCardId || null,
        successCriteria: node.data?.successCriteria || null,
      });
    }
  }, [isOpen, node]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCommandCardSelect = (e) => {
    const cardId = e.target.value ? parseInt(e.target.value, 10) : null;
    setFormData(prev => ({
      ...prev,
      commandCardId: cardId,
    }));
  };

  const handleSuccessCriteriaChange = (criteria) => {
    setFormData(prev => ({
      ...prev,
      successCriteria: criteria,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...node,
      data: {
        ...node.data,
        label: formData.label,
        description: formData.description,
        commandCardId: formData.commandCardId,
        successCriteria: formData.successCriteria,
      },
    });
    onClose();
  };

  if (!isOpen) return null;

  const nodeType = node?.data?.nodeType || 'command';
  const isCommandNode = nodeType === 'command';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configure Node</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Node Label */}
            <div className="form-group">
              <label htmlFor="label">
                Label <span className="required">*</span>
              </label>
              <input
                type="text"
                id="label"
                name="label"
                value={formData.label}
                onChange={handleChange}
                placeholder="e.g., Run Tests, Deploy to Staging"
                required
                autoFocus
              />
            </div>

            {/* Node Description */}
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Optional longer explanation of this step"
                rows={3}
              />
            </div>

            {/* Command Card Selection (only for command nodes) */}
            {isCommandNode && (
              <div className="form-group">
                <label htmlFor="commandCard">Assign Command Card</label>
                <select
                  id="commandCard"
                  value={formData.commandCardId || ''}
                  onChange={handleCommandCardSelect}
                >
                  <option value="">-- No command assigned --</option>
                  {commandCards.map(card => (
                    <option key={card.id} value={card.id}>
                      {card.name || card.description || card.command}
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  The command card will be executed when this step runs
                </small>
              </div>
            )}

            {/* Success Criteria (for command and decision nodes) */}
            {(isCommandNode || nodeType === 'decision') && (
              <div className="form-group">
                <label>Success Criteria</label>
                <SuccessCriteriaEditor
                  value={formData.successCriteria}
                  onChange={handleSuccessCriteriaChange}
                />
                <small className="form-help">
                  Define how to determine if this step succeeds or fails
                </small>
              </div>
            )}

            {/* Node Type Info */}
            <div className="form-group">
              <div className="node-type-info">
                <strong>Node Type:</strong> {nodeType}
                {nodeType === 'start' && (
                  <p className="node-type-description">
                    Starting point of the workflow. No configuration needed.
                  </p>
                )}
                {nodeType === 'end' && (
                  <p className="node-type-description">
                    End point of the workflow. No configuration needed.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
