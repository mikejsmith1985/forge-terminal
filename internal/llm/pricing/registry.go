// Package pricing provides model cost definitions for different LLM providers.
// This is the "Source of Truth" for all model pricing in the CFO router system.
package pricing

import "sync"

// CostUnit represents the billing unit type for a provider.
type CostUnit string

const (
	// UnitCredits is used by GitHub Copilot (credit multipliers).
	UnitCredits CostUnit = "credits"
	// UnitUSD is used by Anthropic (per million tokens).
	UnitUSD CostUnit = "usd"
	// UnitFree is used by local models (Ollama, etc).
	UnitFree CostUnit = "free"
)

// ModelCost represents the cost profile for a single model.
type ModelCost struct {
	ModelID     string   `json:"model_id"`
	DisplayName string   `json:"display_name"`
	Provider    string   `json:"provider"`    // "copilot", "anthropic", "ollama"
	CostUnit    CostUnit `json:"cost_unit"`

	// For Copilot (Credits system) - single multiplier per request
	CreditMultiplier float64 `json:"credit_multiplier,omitempty"`

	// For Anthropic (USD/token system) - per million tokens
	InputCostPerMillion  float64 `json:"input_cost_per_million,omitempty"`
	OutputCostPerMillion float64 `json:"output_cost_per_million,omitempty"`
}

// ProviderConfig holds provider-level configuration.
type ProviderConfig struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	CostUnit    CostUnit `json:"cost_unit"`
	IsLocal     bool     `json:"is_local"`
}

// Registry holds all known model pricing information.
type Registry struct {
	mu        sync.RWMutex
	models    map[string]*ModelCost   // keyed by model ID
	providers map[string]*ProviderConfig
}

// NewRegistry creates a new pricing registry with default model costs.
func NewRegistry() *Registry {
	r := &Registry{
		models:    make(map[string]*ModelCost),
		providers: make(map[string]*ProviderConfig),
	}
	r.loadDefaults()
	return r
}

// loadDefaults populates the registry with known model pricing.
func (r *Registry) loadDefaults() {
	// Provider configurations
	r.providers = map[string]*ProviderConfig{
		"copilot": {
			Name:        "copilot",
			DisplayName: "GitHub Copilot",
			CostUnit:    UnitCredits,
			IsLocal:     false,
		},
		"anthropic": {
			Name:        "anthropic",
			DisplayName: "Anthropic Claude",
			CostUnit:    UnitUSD,
			IsLocal:     false,
		},
		"ollama": {
			Name:        "ollama",
			DisplayName: "Ollama (Local)",
			CostUnit:    UnitFree,
			IsLocal:     true,
		},
	}

	// GitHub Copilot Models (Credit multipliers)
	// Credit costs are relative - 1.0 = standard, higher = more expensive
	copilotModels := []*ModelCost{
		{ModelID: "gpt-4o-mini", DisplayName: "GPT-4o Mini", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.25},
		{ModelID: "gpt-4o", DisplayName: "GPT-4o", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "gpt-4.1", DisplayName: "GPT-4.1", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "gpt-5-mini", DisplayName: "GPT-5 Mini", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.5},
		{ModelID: "gpt-5", DisplayName: "GPT-5", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.5},
		{ModelID: "gpt-5.1", DisplayName: "GPT-5.1", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.5},
		{ModelID: "gpt-5.2", DisplayName: "GPT-5.2", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 2.0},
		{ModelID: "gpt-5.1-codex", DisplayName: "GPT-5.1 Codex", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.5},
		{ModelID: "gpt-5.1-codex-mini", DisplayName: "GPT-5.1 Codex Mini", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.5},
		{ModelID: "gpt-5.1-codex-max", DisplayName: "GPT-5.1 Codex Max", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 3.0},
		{ModelID: "claude-3.5-haiku", DisplayName: "Claude 3.5 Haiku", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.33},
		{ModelID: "claude-3-5-haiku-20241022", DisplayName: "Claude 3.5 Haiku", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.33},
		{ModelID: "claude-3.5-sonnet", DisplayName: "Claude 3.5 Sonnet", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "claude-3-5-sonnet-20241022", DisplayName: "Claude 3.5 Sonnet", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "claude-sonnet-4", DisplayName: "Claude Sonnet 4", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "claude-sonnet-4-20250514", DisplayName: "Claude Sonnet 4", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "claude-sonnet-4.5", DisplayName: "Claude Sonnet 4.5", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.5},
		{ModelID: "claude-haiku-4.5", DisplayName: "Claude Haiku 4.5", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 0.33},
		{ModelID: "claude-opus-4", DisplayName: "Claude Opus 4", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 3.0},
		{ModelID: "claude-opus-4-20250514", DisplayName: "Claude Opus 4", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 3.0},
		{ModelID: "claude-opus-4.5", DisplayName: "Claude Opus 4.5", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 3.0},
		{ModelID: "gemini-3-pro-preview", DisplayName: "Gemini 3 Pro", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 1.0},
		{ModelID: "o1-preview", DisplayName: "O1 Preview", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 2.0},
		{ModelID: "o1", DisplayName: "O1", Provider: "copilot", CostUnit: UnitCredits, CreditMultiplier: 2.0},
	}

	// Anthropic Direct API Models (USD per million tokens)
	anthropicModels := []*ModelCost{
		{ModelID: "claude-3-5-haiku-20241022", DisplayName: "Claude 3.5 Haiku", Provider: "anthropic", CostUnit: UnitUSD, InputCostPerMillion: 0.80, OutputCostPerMillion: 4.00},
		{ModelID: "claude-3-5-sonnet-20241022", DisplayName: "Claude 3.5 Sonnet", Provider: "anthropic", CostUnit: UnitUSD, InputCostPerMillion: 3.00, OutputCostPerMillion: 15.00},
		{ModelID: "claude-sonnet-4-20250514", DisplayName: "Claude Sonnet 4", Provider: "anthropic", CostUnit: UnitUSD, InputCostPerMillion: 3.00, OutputCostPerMillion: 15.00},
		{ModelID: "claude-opus-4-20250514", DisplayName: "Claude Opus 4", Provider: "anthropic", CostUnit: UnitUSD, InputCostPerMillion: 15.00, OutputCostPerMillion: 75.00},
		{ModelID: "claude-3-opus-20240229", DisplayName: "Claude 3 Opus", Provider: "anthropic", CostUnit: UnitUSD, InputCostPerMillion: 15.00, OutputCostPerMillion: 75.00},
	}

	// Ollama / Local Models (Free)
	ollamaModels := []*ModelCost{
		{ModelID: "llama3.2", DisplayName: "Llama 3.2", Provider: "ollama", CostUnit: UnitFree},
		{ModelID: "llama3.1", DisplayName: "Llama 3.1", Provider: "ollama", CostUnit: UnitFree},
		{ModelID: "codellama", DisplayName: "CodeLlama", Provider: "ollama", CostUnit: UnitFree},
		{ModelID: "mistral", DisplayName: "Mistral", Provider: "ollama", CostUnit: UnitFree},
		{ModelID: "mixtral", DisplayName: "Mixtral", Provider: "ollama", CostUnit: UnitFree},
		{ModelID: "deepseek-coder", DisplayName: "DeepSeek Coder", Provider: "ollama", CostUnit: UnitFree},
	}

	// Register all models
	for _, m := range copilotModels {
		r.models[m.ModelID] = m
	}
	for _, m := range anthropicModels {
		// For Anthropic models, use provider-prefixed key to differentiate from Copilot
		key := "anthropic:" + m.ModelID
		r.models[key] = m
	}
	for _, m := range ollamaModels {
		r.models[m.ModelID] = m
	}
}

// GetModel returns the cost profile for a specific model.
// For Anthropic direct API, use "anthropic:model-id" format.
func (r *Registry) GetModel(modelID string) (*ModelCost, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.models[modelID]
	return m, ok
}

// GetModelForProvider returns the cost profile for a model from a specific provider.
func (r *Registry) GetModelForProvider(modelID, provider string) (*ModelCost, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if provider == "anthropic" {
		// Check for anthropic-prefixed key first
		if m, ok := r.models["anthropic:"+modelID]; ok {
			return m, true
		}
	}

	// Fallback to direct lookup
	if m, ok := r.models[modelID]; ok {
		if m.Provider == provider {
			return m, true
		}
	}

	return nil, false
}

// GetProvider returns the configuration for a provider.
func (r *Registry) GetProvider(name string) (*ProviderConfig, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[name]
	return p, ok
}

// ListModels returns all registered models.
func (r *Registry) ListModels() []*ModelCost {
	r.mu.RLock()
	defer r.mu.RUnlock()

	models := make([]*ModelCost, 0, len(r.models))
	for _, m := range r.models {
		models = append(models, m)
	}
	return models
}

// ListModelsForProvider returns all models for a specific provider.
func (r *Registry) ListModelsForProvider(provider string) []*ModelCost {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var models []*ModelCost
	for _, m := range r.models {
		if m.Provider == provider {
			models = append(models, m)
		}
	}
	return models
}

// ListProviders returns all registered providers.
func (r *Registry) ListProviders() []*ProviderConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()

	providers := make([]*ProviderConfig, 0, len(r.providers))
	for _, p := range r.providers {
		providers = append(providers, p)
	}
	return providers
}

// EstimateCostCredits calculates the credit cost for a Copilot model.
func (r *Registry) EstimateCostCredits(modelID string, numRequests int) float64 {
	m, ok := r.GetModel(modelID)
	if !ok || m.CostUnit != UnitCredits {
		return 0
	}
	return m.CreditMultiplier * float64(numRequests)
}

// EstimateCostUSD calculates the USD cost for token-based models.
func (r *Registry) EstimateCostUSD(modelID string, inputTokens, outputTokens int) float64 {
	m, ok := r.GetModel(modelID)
	if !ok || m.CostUnit != UnitUSD {
		// Try with anthropic prefix
		m, ok = r.GetModel("anthropic:" + modelID)
		if !ok || m.CostUnit != UnitUSD {
			return 0
		}
	}

	inputCost := (float64(inputTokens) / 1_000_000) * m.InputCostPerMillion
	outputCost := (float64(outputTokens) / 1_000_000) * m.OutputCostPerMillion
	return inputCost + outputCost
}

// Global registry instance
var (
	globalRegistry     *Registry
	globalRegistryOnce sync.Once
)

// GetRegistry returns the global pricing registry.
func GetRegistry() *Registry {
	globalRegistryOnce.Do(func() {
		globalRegistry = NewRegistry()
	})
	return globalRegistry
}
