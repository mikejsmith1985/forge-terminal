/**
 * RouterConfigOverlay - Dynamic Provider Discovery UI (v3.4.0)
 *
 * Provides real-time verification of LLM CLI tools (GitHub Copilot, Claude)
 * with automatic authentication status checking and model discovery.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Brain,
  Check,
  AlertCircle,
  Loader2,
  Save,
  Zap,
  Cpu,
  Sparkles,
  RefreshCw,
  Key,
  Terminal,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
  Circle
} from 'lucide-react';
import './RouterConfigOverlay.css';

// Provider status states
const STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  CONNECTED: 'connected',
  AUTH_REQUIRED: 'auth_required',
  NOT_INSTALLED: 'not_installed',
  ERROR: 'error'
};

// Tier configuration
const TIER_CONFIG = {
  tier1: { icon: Zap, color: '#10b981', label: 'Standard', desc: 'Quick tasks: tests, linting, simple edits' },
  tier2: { icon: Cpu, color: '#3b82f6', label: 'Advanced', desc: 'Balanced: refactoring, debugging, reviews' },
  tier3: { icon: Sparkles, color: '#8b5cf6', label: 'Expert', desc: 'Complex: architecture, design, analysis' },
};

const RouterConfigOverlay = ({ isOpen, onClose, onConfigChange }) => {
  // Provider states
  const [providers, setProviders] = useState({
    copilot: { status: STATUS.IDLE, models: [], displayName: 'GitHub Copilot', instructions: '' },
    claude: { status: STATUS.IDLE, models: [], displayName: 'Claude (Anthropic)', instructions: '' }
  });

  // Selected provider for each tier
  const [tierProviders, setTierProviders] = useState({
    tier1: 'copilot',
    tier2: 'copilot',
    tier3: 'claude'
  });

  // Selected model for each tier
  const [tierModels, setTierModels] = useState({
    tier1: '',
    tier2: '',
    tier3: ''
  });

  // Active tier
  const [activeTier, setActiveTier] = useState('tier1');

  // API Key input
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyProvider, setApiKeyProvider] = useState('');

  // UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [copiedInstruction, setCopiedInstruction] = useState(false);

  // Load providers on mount
  useEffect(() => {
    if (isOpen) {
      loadConfig();
      verifyAllProviders();
    }
  }, [isOpen]);

  // Load existing router config
  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/llm/router-config');
      if (response.ok) {
        const data = await response.json();
        if (data.tiers) {
          // Map old config to new provider-based format
          const newTierModels = {};
          const newTierProviders = {};

          Object.entries(data.tiers).forEach(([tierId, tier]) => {
            newTierModels[tierId] = tier.model || '';
            // Infer provider from model name
            if (tier.model?.includes('claude')) {
              newTierProviders[tierId] = 'claude';
            } else {
              newTierProviders[tierId] = 'copilot';
            }
          });

          setTierModels(newTierModels);
          setTierProviders(newTierProviders);
          setActiveTier(data.active_tier || 'tier1');
        }
      }
    } catch (err) {
      console.error('[RouterConfig] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Verify all providers
  const verifyAllProviders = async () => {
    try {
      const response = await fetch('/api/llm/providers');
      if (response.ok) {
        const data = await response.json();
        if (data.providers) {
          const newProviders = { ...providers };
          data.providers.forEach(p => {
            const status = getProviderStatus(p);
            newProviders[p.provider] = {
              status,
              models: p.models || [],
              displayName: p.displayName,
              instructions: p.instructions || '',
              binaryPath: p.binaryPath || '',
              installed: p.installed,
              authenticated: p.authenticated
            };
          });
          setProviders(newProviders);

          // Set default models if not already set
          setTierModels(prev => {
            const updated = { ...prev };
            Object.entries(tierProviders).forEach(([tierId, providerId]) => {
              if (!updated[tierId] && newProviders[providerId]?.models?.length > 0) {
                updated[tierId] = newProviders[providerId].models[0].id;
              }
            });
            return updated;
          });
        }
      }
    } catch (err) {
      console.error('[RouterConfig] Provider verification error:', err);
    }
  };

  // Get status from provider response
  const getProviderStatus = (p) => {
    if (!p.installed) return STATUS.NOT_INSTALLED;
    if (!p.authenticated) return STATUS.AUTH_REQUIRED;
    return STATUS.CONNECTED;
  };

  // Verify single provider (with optional API key)
  const verifyProvider = async (providerName, apiKey = null) => {
    setProviders(prev => ({
      ...prev,
      [providerName]: { ...prev[providerName], status: STATUS.CHECKING }
    }));

    try {
      const response = await fetch('/api/llm/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, apiKey })
      });

      const data = await response.json();
      const status = getProviderStatus(data);

      setProviders(prev => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          status,
          models: data.models || [],
          displayName: data.displayName || providerName,
          instructions: data.instructions || '',
          binaryPath: data.binaryPath || '',
          installed: data.installed,
          authenticated: data.authenticated
        }
      }));

      // Update tier model if this provider is selected and now has models
      if (data.models?.length > 0) {
        setTierModels(prev => {
          const updated = { ...prev };
          Object.entries(tierProviders).forEach(([tierId, pid]) => {
            if (pid === providerName && !updated[tierId]) {
              updated[tierId] = data.models[0].id;
            }
          });
          return updated;
        });
      }

      return data;
    } catch (err) {
      console.error(`[RouterConfig] Verify ${providerName} error:`, err);
      setProviders(prev => ({
        ...prev,
        [providerName]: { ...prev[providerName], status: STATUS.ERROR }
      }));
      return null;
    }
  };

  // Handle API key submission
  const handleSubmitApiKey = async () => {
    if (!apiKeyInput || !apiKeyProvider) return;

    const result = await verifyProvider(apiKeyProvider, apiKeyInput);
    if (result?.authenticated) {
      setApiKeyInput('');
      setApiKeyProvider('');
      setSuccess(`${result.displayName} connected successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  // Handle provider change for a tier
  const handleTierProviderChange = (tierId, providerId) => {
    setTierProviders(prev => ({ ...prev, [tierId]: providerId }));

    // Set default model for new provider
    const providerModels = providers[providerId]?.models || [];
    if (providerModels.length > 0) {
      setTierModels(prev => ({ ...prev, [tierId]: providerModels[0].id }));
    } else {
      setTierModels(prev => ({ ...prev, [tierId]: '' }));
    }
  };

  // Handle model change for a tier
  const handleTierModelChange = (tierId, modelId) => {
    setTierModels(prev => ({ ...prev, [tierId]: modelId }));
  };

  // Save configuration
  const saveConfig = async () => {
    setSaving(true);
    setError(null);

    try {
      // Convert to the format expected by the backend
      const config = {
        tiers: {
          tier1: { name: TIER_CONFIG.tier1.label, model: tierModels.tier1 },
          tier2: { name: TIER_CONFIG.tier2.label, model: tierModels.tier2 },
          tier3: { name: TIER_CONFIG.tier3.label, model: tierModels.tier3 },
        },
        active_tier: activeTier
      };

      const response = await fetch('/api/llm/router-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      setSuccess('Configuration saved!');
      if (onConfigChange) onConfigChange(config);

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

  // Copy instructions to clipboard
  const copyInstructions = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInstruction(true);
      setTimeout(() => setCopiedInstruction(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Render provider status indicator
  const StatusIndicator = ({ status }) => {
    switch (status) {
      case STATUS.CHECKING:
        return <Loader2 className="status-icon checking" size={16} />;
      case STATUS.CONNECTED:
        return <CheckCircle2 className="status-icon connected" size={16} />;
      case STATUS.AUTH_REQUIRED:
        return <AlertCircle className="status-icon auth-required" size={16} />;
      case STATUS.NOT_INSTALLED:
        return <XCircle className="status-icon not-installed" size={16} />;
      case STATUS.ERROR:
        return <XCircle className="status-icon error" size={16} />;
      default:
        return <Circle className="status-icon idle" size={16} />;
    }
  };

  // Render provider card
  const ProviderCard = ({ id, provider }) => {
    const isExpanded = expandedProvider === id;
    const needsAuth = provider.status === STATUS.AUTH_REQUIRED;
    const notInstalled = provider.status === STATUS.NOT_INSTALLED;

    return (
      <div className={`provider-card ${provider.status}`}>
        <div className="provider-header" onClick={() => setExpandedProvider(isExpanded ? null : id)}>
          <div className="provider-info">
            <StatusIndicator status={provider.status} />
            <span className="provider-name">{provider.displayName}</span>
            {provider.status === STATUS.CONNECTED && provider.models?.length > 0 && (
              <span className="model-count">{provider.models.length} models</span>
            )}
          </div>
          <div className="provider-actions">
            <button
              className="btn-icon"
              onClick={(e) => { e.stopPropagation(); verifyProvider(id); }}
              title="Refresh status"
            >
              <RefreshCw size={14} />
            </button>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {isExpanded && (
          <div className="provider-details">
            {provider.binaryPath && (
              <div className="provider-path">
                <Terminal size={12} />
                <code>{provider.binaryPath}</code>
              </div>
            )}

            {(needsAuth || notInstalled) && provider.instructions && (
              <div className="provider-instructions">
                <div className="instructions-header">
                  <span>{notInstalled ? 'Installation Instructions' : 'Authentication Required'}</span>
                  <button
                    className="btn-copy"
                    onClick={() => copyInstructions(provider.instructions)}
                  >
                    {copiedInstruction ? <Check size={12} /> : <Copy size={12} />}
                    {copiedInstruction ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="instructions-text">{provider.instructions}</pre>
              </div>
            )}

            {needsAuth && id === 'claude' && (
              <div className="api-key-section">
                <div className="api-key-header">
                  <Key size={14} />
                  <span>Or enter your API key:</span>
                </div>
                <div className="api-key-input">
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={apiKeyProvider === id ? apiKeyInput : ''}
                    onChange={(e) => {
                      setApiKeyProvider(id);
                      setApiKeyInput(e.target.value);
                    }}
                  />
                  <button
                    className="btn-connect"
                    onClick={handleSubmitApiKey}
                    disabled={!apiKeyInput || apiKeyProvider !== id}
                  >
                    Connect
                  </button>
                </div>
              </div>
            )}

            {provider.status === STATUS.CONNECTED && provider.models?.length > 0 && (
              <div className="provider-models">
                <span className="models-label">Available Models:</span>
                <div className="models-list">
                  {provider.models.map(model => (
                    <div key={model.id} className="model-item">
                      <span className="model-id">{model.name || model.id}</span>
                      {model.description && (
                        <span className="model-desc">{model.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render tier card
  const TierCard = ({ tierId, tierInfo }) => {
    const Icon = tierInfo.icon;
    const selectedProvider = tierProviders[tierId];
    const providerData = providers[selectedProvider];
    const availableModels = providerData?.models || [];
    const isActive = activeTier === tierId;
    const isProviderConnected = providerData?.status === STATUS.CONNECTED;

    return (
      <div className={`tier-card ${isActive ? 'active' : ''}`} style={{ '--tier-color': tierInfo.color }}>
        <div className="tier-header">
          <Icon size={20} style={{ color: tierInfo.color }} />
          <span className="tier-name">{tierInfo.label}</span>
          {isActive && <span className="active-badge">Active</span>}
        </div>

        <div className="tier-description">{tierInfo.desc}</div>

        <div className="tier-config">
          <label className="config-label">Provider</label>
          <select
            className="tier-select"
            value={selectedProvider}
            onChange={(e) => handleTierProviderChange(tierId, e.target.value)}
          >
            {Object.entries(providers).map(([id, p]) => (
              <option key={id} value={id} disabled={p.status !== STATUS.CONNECTED}>
                {p.displayName} {p.status === STATUS.CONNECTED ? '' : '(Not Connected)'}
              </option>
            ))}
          </select>

          <label className="config-label">Model</label>
          <select
            className="tier-select"
            value={tierModels[tierId] || ''}
            onChange={(e) => handleTierModelChange(tierId, e.target.value)}
            disabled={!isProviderConnected || availableModels.length === 0}
          >
            {availableModels.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name || model.id}
                </option>
              ))
            )}
          </select>
        </div>

        <button
          className={`tier-activate-btn ${isActive ? 'is-active' : ''}`}
          onClick={() => setActiveTier(tierId)}
          disabled={isActive}
        >
          {isActive ? 'Default Tier' : 'Set as Default'}
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="router-config-overlay">
      <div className="router-config-backdrop" onClick={onClose} />
      <div className="router-config-modal router-config-modal-v2">
        <div className="router-config-header">
          <div className="router-config-title">
            <Brain size={24} className="router-config-icon" />
            <h2>AI Provider Configuration</h2>
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
              {/* Provider Connection Section */}
              <section className="config-section">
                <h3 className="section-title">Provider Connection</h3>
                <p className="section-desc">
                  Connect to your AI providers. The system will verify CLI tools and authentication status.
                </p>
                <div className="providers-list">
                  {Object.entries(providers).map(([id, provider]) => (
                    <ProviderCard key={id} id={id} provider={provider} />
                  ))}
                </div>
              </section>

              {/* Tier Configuration Section */}
              <section className="config-section">
                <h3 className="section-title">Tier Configuration</h3>
                <p className="section-desc">
                  Configure which provider and model handles each complexity tier.
                </p>
                <div className="tiers-grid">
                  {Object.entries(TIER_CONFIG).map(([tierId, tierInfo]) => (
                    <TierCard key={tierId} tierId={tierId} tierInfo={tierInfo} />
                  ))}
                </div>
              </section>

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
