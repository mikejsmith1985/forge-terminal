/**
 * RouterConfigOverlay - AI Router Configuration UI for v3.3.6
 *
 * Simplified tier-based model selection for the chat interface.
 * Directly maps to the new tiers API structure.
 */

import React, { useState, useEffect } from 'react';
import { X, Brain, Check, AlertCircle, Loader2, Save, Zap, Cpu, Sparkles } from 'lucide-react';
import './RouterConfigOverlay.css';

// Available models for selection
const AVAILABLE_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & affordable' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Balanced performance' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Advanced reasoning' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', description: 'Maximum capability' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High-performance' },
];

// Tier icons and colors
const TIER_CONFIG = {
  tier1: { icon: Zap, color: '#10b981', label: 'Standard' },
  tier2: { icon: Cpu, color: '#3b82f6', label: 'Advanced' },
  tier3: { icon: Sparkles, color: '#8b5cf6', label: 'Expert' },
};

const RouterConfigOverlay = ({ isOpen, onClose, onConfigChange }) => {
  const [config, setConfig] = useState({
    tiers: {
      tier1: { name: 'Standard', model: 'gpt-4o-mini' },
      tier2: { name: 'Advanced', model: 'gpt-4o' },
      tier3: { name: 'Expert', model: 'claude-3-5-sonnet' },
    },
    active_tier: 'tier1',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load configuration on mount
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/llm/router-config');
      if (!response.ok) {
        throw new Error('Failed to load configuration');
      }
      const data = await response.json();

      // Direct mapping - new API returns tiers structure
      if (data.tiers) {
        setConfig({
          tiers: data.tiers,
          active_tier: data.active_tier || 'tier1',
        });
      }
    } catch (err) {
      console.error('[RouterConfig] Load error:', err);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/llm/router-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setSuccess('Configuration saved!');

      // Notify parent of config change
      if (onConfigChange) {
        onConfigChange(config);
      }

      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[RouterConfig] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTierModelChange = (tierId, model) => {
    setConfig(prev => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tierId]: {
          ...prev.tiers[tierId],
          model,
        },
      },
    }));
  };

  const handleActiveTierChange = (tierId) => {
    setConfig(prev => ({
      ...prev,
      active_tier: tierId,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="router-config-overlay">
      <div className="router-config-backdrop" onClick={onClose} />
      <div className="router-config-modal">
        <div className="router-config-header">
          <div className="router-config-title">
            <Brain size={24} className="router-config-icon" />
            <h2>AI Router Configuration</h2>
          </div>
          <button className="router-config-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="router-config-body">
          {loading ? (
            <div className="router-config-loading">
              <Loader2 className="spinner" size={32} />
              <p>Loading configuration...</p>
            </div>
          ) : (
            <>
              <p className="config-description">
                Configure which AI model handles each complexity tier.
                Tasks are automatically routed based on their complexity.
              </p>

              {/* Tier Configuration */}
              <div className="tiers-grid">
                {Object.entries(TIER_CONFIG).map(([tierId, tierInfo]) => {
                  const Icon = tierInfo.icon;
                  const tierData = config.tiers[tierId] || { name: tierInfo.label, model: 'gpt-4o-mini' };
                  const isActive = config.active_tier === tierId;

                  return (
                    <div
                      key={tierId}
                      className={`tier-card ${isActive ? 'active' : ''}`}
                      style={{ '--tier-color': tierInfo.color }}
                    >
                      <div className="tier-header">
                        <Icon size={20} style={{ color: tierInfo.color }} />
                        <span className="tier-name">{tierData.name}</span>
                        {isActive && <span className="active-badge">Active</span>}
                      </div>

                      <div className="tier-description">
                        {tierId === 'tier1' && 'Quick tasks: tests, linting, simple edits'}
                        {tierId === 'tier2' && 'Balanced: refactoring, debugging, reviews'}
                        {tierId === 'tier3' && 'Complex: architecture, design, analysis'}
                      </div>

                      <select
                        className="tier-model-select"
                        value={tierData.model}
                        onChange={(e) => handleTierModelChange(tierId, e.target.value)}
                      >
                        {AVAILABLE_MODELS.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name} - {model.description}
                          </option>
                        ))}
                      </select>

                      <button
                        className={`tier-activate-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleActiveTierChange(tierId)}
                        disabled={isActive}
                      >
                        {isActive ? 'Default Tier' : 'Set as Default'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="config-info">
                <AlertCircle size={14} />
                <span>
                  The active tier is used when complexity cannot be determined automatically.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="router-config-footer">
          {error && (
            <div className="router-config-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="router-config-success">
              <Check size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="router-config-actions">
            <button className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-save"
              onClick={saveConfig}
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouterConfigOverlay;
