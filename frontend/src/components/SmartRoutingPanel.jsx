import React, { useState, useEffect, useRef } from 'react';
import './SmartRoutingPanel.css';

const SmartRoutingPanel = ({ 
  prompt, 
  mentionedFiles = [], 
  currentModel = 'claude-sonnet-4.5',
  onAccept,
  onReject 
}) => {
  const [classification, setClassification] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (!prompt || prompt.trim().length === 0) {
      setLoading(false);
      return;
    }

    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Abort any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Debounce API calls by 500ms to prevent rapid-fire requests
    debounceRef.current = setTimeout(async () => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        setLoading(true);
        setError(null);

        // Step 1: Classify the task
        const classifyRes = await fetch('/api/routing/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt, 
            mentionedFiles 
          }),
          signal
        });

        if (!classifyRes.ok) {
          throw new Error('Classification failed');
        }

        const classifyData = await classifyRes.json();
        setClassification(classifyData);

        // Step 2: Get recommendation
        const recommendRes = await fetch('/api/routing/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern: classifyData.pattern,
            current_model: currentModel
          }),
          signal
        });

        if (!recommendRes.ok) {
          throw new Error('Recommendation failed');
        }

        const recommendData = await recommendRes.json();
        setRecommendation(recommendData);

      } catch (err) {
        if (err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        console.error('[SmartRouting] Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 500); // 500ms debounce

    // Cleanup on unmount or when dependencies change
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [prompt, mentionedFiles, currentModel]);

  if (loading) {
    return (
      <div className="smart-routing-panel loading" data-testid="smart-routing-panel">
        <div className="loading-spinner"></div>
        <span>Analyzing task...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="smart-routing-panel error" data-testid="smart-routing-panel">
        <span className="error-icon">⚠️</span>
        <span>Failed to get recommendation: {error}</span>
      </div>
    );
  }

  if (!classification || !recommendation) {
    return null;
  }

  // Don't show panel if recommended model is same as current
  if (recommendation.recommended_model === currentModel) {
    return null;
  }

  const formatModelName = (model) => {
    const parts = model.split('-');
    return parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1);
  };

  return (
    <div className="smart-routing-panel" data-testid="smart-routing-panel">
      <div className="panel-header">
        <span className="icon">🎯</span>
        <h3>Smart Router Recommendation</h3>
      </div>

      <div className="panel-content">
        {/* Task Classification */}
        <div className="classification-section">
          <div className="label">Detected Pattern:</div>
          <div className="pattern-badge" data-testid="detected-pattern">
            {classification.pattern.replace('-', ' ')}
          </div>
          <div className="complexity">
            Complexity: {classification.complexity}/10
          </div>
        </div>

        {/* Recommended Model */}
        <div className="recommendation-section">
          <div className="recommended-model" data-testid="recommended-model">
            <span className="checkmark">✓</span>
            <strong>{formatModelName(recommendation.recommended_model)}</strong>
            <span className="expected-prompts" data-testid="expected-prompts">
              ~{recommendation.expected_prompts.toFixed(1)} prompts
            </span>
          </div>
          <div className="reasoning" data-testid="model-reasoning">
            {recommendation.reasoning}
          </div>
        </div>

        {/* Historical Data */}
        {recommendation.historical_data ? (
          <div className="historical-section" data-testid="historical-data">
            <div className="historical-header">
              📊 Based on {recommendation.total_samples} similar tasks
            </div>
            <div className="model-comparison-list">
              {recommendation.model_comparison.map((model, idx) => (
                <div 
                  key={model.model} 
                  className={`model-comparison-item ${idx === 0 ? 'recommended' : ''}`}
                  data-testid={`model-comparison-${model.model.includes('opus') ? 'opus' : model.model.includes('sonnet') ? 'sonnet' : 'haiku'}`}
                >
                  <span className="model-name">
                    {formatModelName(model.model)}
                  </span>
                  <span className="model-stats">
                    avg {model.average_prompts.toFixed(1)} prompts 
                    ({model.success_rate.toFixed(0)}% success)
                  </span>
                  <span className="sample-count">
                    {model.sample_count} samples
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="no-historical-data" data-testid="no-historical-data">
            <span className="info-icon">ℹ️</span>
            No historical data yet - recommendation based on task complexity
          </div>
        )}

        {/* Cost Comparison */}
        {recommendation.cost_comparison && (
          <div className="cost-section" data-testid="cost-comparison">
            <div className="cost-header">Cost Analysis</div>
            <div className="cost-details" data-testid="cost-reasoning">
              {recommendation.cost_comparison.cost_delta > 0 ? (
                <>
                  <span className="cost-delta positive">
                    +{recommendation.cost_comparison.cost_delta.toFixed(2)} credits
                  </span>
                  <span className="cost-explanation">
                    but saves ~{Math.abs(recommendation.cost_comparison.prompts_saved).toFixed(1)} prompts
                  </span>
                </>
              ) : (
                <>
                  <span className="cost-delta negative">
                    {recommendation.cost_comparison.cost_delta.toFixed(2)} credits
                  </span>
                  <span className="cost-explanation">
                    saves both cost and {Math.abs(recommendation.cost_comparison.prompts_saved).toFixed(1)} prompts
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="panel-actions">
        <button
          className="btn-use-recommended"
          data-testid="use-recommended-model-button"
          onClick={() => onAccept(recommendation.recommended_model)}
        >
          Use {formatModelName(recommendation.recommended_model)}
        </button>
        <button
          className="btn-keep-current"
          data-testid="keep-current-model-button"
          onClick={onReject}
        >
          Keep {formatModelName(currentModel)}
        </button>
      </div>
    </div>
  );
};

export default SmartRoutingPanel;
