import React, { useState, useEffect } from 'react';

/**
 * SuccessCriteriaEditor - Configure success criteria for a workflow node
 * @param {Object} props
 * @param {Object} props.value - Current success criteria
 * @param {Function} props.onChange - Callback when criteria changes
 */
export function SuccessCriteriaEditor({ value, onChange }) {
  const [enabled, setEnabled] = useState(!!value);
  const [criteria, setCriteria] = useState({
    type: 'manual',
    threshold: 80,
    operator: '>=',
  });

  useEffect(() => {
    if (value) {
      setCriteria({
        type: value.type || 'manual',
        threshold: value.threshold ?? 80,
        operator: value.operator || '>=',
      });
      setEnabled(true);
    } else {
      setEnabled(false);
    }
  }, [value]);

  const handleEnabledChange = (e) => {
    const isEnabled = e.target.checked;
    setEnabled(isEnabled);
    if (isEnabled) {
      onChange(criteria);
    } else {
      onChange(null);
    }
  };

  const handleChange = (field, val) => {
    const updated = {
      ...criteria,
      [field]: val,
    };
    setCriteria(updated);
    if (enabled) {
      onChange(updated);
    }
  };

  return (
    <div className="success-criteria-editor">
      {/* Enable/Disable Checkbox */}
      <div className="criteria-enable">
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleEnabledChange}
          />
          <span>Enable success criteria validation</span>
        </label>
      </div>

      {enabled && (
        <div className="criteria-fields">
          {/* Criteria Type */}
          <div className="form-group">
            <label htmlFor="criteria-type">Criteria Type</label>
            <select
              id="criteria-type"
              value={criteria.type}
              onChange={(e) => handleChange('type', e.target.value)}
            >
              <option value="manual">Manual (User confirms)</option>
              <option value="exitCode">Exit Code</option>
              <option value="testCoverage">Test Coverage %</option>
              <option value="passRate">Test Pass Rate %</option>
            </select>
          </div>

          {/* Threshold and Operator (for numeric criteria) */}
          {(criteria.type === 'testCoverage' || criteria.type === 'passRate') && (
            <div className="criteria-threshold-group">
              <div className="form-group">
                <label htmlFor="criteria-operator">Operator</label>
                <select
                  id="criteria-operator"
                  value={criteria.operator}
                  onChange={(e) => handleChange('operator', e.target.value)}
                >
                  <option value=">=">&gt;= (Greater than or equal)</option>
                  <option value=">">&gt; (Greater than)</option>
                  <option value="==">== (Exactly equal)</option>
                  <option value="<">&lt; (Less than)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="criteria-threshold">Threshold (%)</label>
                <input
                  type="number"
                  id="criteria-threshold"
                  value={criteria.threshold}
                  onChange={(e) => handleChange('threshold', parseFloat(e.target.value))}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>
          )}

          {/* Exit Code Threshold */}
          {criteria.type === 'exitCode' && (
            <div className="form-group">
              <label htmlFor="criteria-threshold">Expected Exit Code</label>
              <input
                type="number"
                id="criteria-threshold"
                value={criteria.threshold}
                onChange={(e) => handleChange('threshold', parseInt(e.target.value, 10))}
                min="0"
              />
              <small className="form-help">
                Typically 0 for success, non-zero for failure
              </small>
            </div>
          )}

          {/* Manual Criteria Info */}
          {criteria.type === 'manual' && (
            <div className="criteria-info">
              <p className="form-help">
                User will be prompted to confirm if this step succeeded or failed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
