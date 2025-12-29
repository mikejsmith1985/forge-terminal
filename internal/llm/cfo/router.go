// Package cfo provides intelligent model selection based on budget constraints.
// The "CFO" (Chief Financial Officer) router optimizes model selection to balance
// quality and cost while respecting the user's budget.
package cfo

import (
	"fmt"
	"strings"
	"sync"

	"github.com/mikejsmith1985/forge-terminal/internal/llm/ledger"
	"github.com/mikejsmith1985/forge-terminal/internal/llm/pricing"
)

// RiskLevel represents the budget risk assessment.
type RiskLevel string

const (
	RiskLow      RiskLevel = "low"      // Plenty of budget remaining
	RiskMedium   RiskLevel = "medium"   // On track but watch spending
	RiskHigh     RiskLevel = "high"     // Approaching limit
	RiskCritical RiskLevel = "critical" // At or over budget
)

// RouteDecision represents the CFO's routing decision.
type RouteDecision struct {
	SelectedModel   string    `json:"selected_model"`
	RequestedModel  string    `json:"requested_model"`  // What was originally requested
	WasDowngraded   bool      `json:"was_downgraded"`
	Reason          string    `json:"reason"`
	EstimatedCost   float64   `json:"estimated_cost"`
	RiskLevel       RiskLevel `json:"risk_level"`
	RemainingBudget float64   `json:"remaining_budget"`
	Warning         string    `json:"warning,omitempty"`
}

// ModelPreference represents a prioritized list of models.
type ModelPreference struct {
	Preferred  string   // First choice
	Fallbacks  []string // Cheaper alternatives in order
	IsFree     bool     // Use free/local if available
}

// Router is the CFO that makes model selection decisions.
type Router struct {
	mu       sync.RWMutex
	ledger   *ledger.Ledger
	registry *pricing.Registry

	// Model tier preferences (configurable)
	speedModels     []string // Fast, cheap models
	reasoningModels []string // Powerful, expensive models
	freeModels      []string // Local/free models
}

// NewRouter creates a new CFO router.
func NewRouter() (*Router, error) {
	l, err := ledger.GetLedger()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize ledger: %w", err)
	}

	r := &Router{
		ledger:   l,
		registry: pricing.GetRegistry(),
		speedModels: []string{
			"gpt-4o-mini",
			"claude-3.5-haiku",
			"claude-3-5-haiku-20241022",
			"claude-haiku-4.5",
			"gpt-5-mini",
			"gpt-5.1-codex-mini",
		},
		reasoningModels: []string{
			"gpt-4o",
			"claude-3.5-sonnet",
			"claude-3-5-sonnet-20241022",
			"claude-sonnet-4",
			"claude-sonnet-4-20250514",
			"gpt-5",
			"gpt-5.1",
			"gpt-5.1-codex",
			"o1",
		},
		freeModels: []string{
			"llama3.2",
			"llama3.1",
			"codellama",
			"mistral",
			"deepseek-coder",
		},
	}

	return r, nil
}

// ResolveModel determines the best model to use given constraints.
// It considers the requested model, available providers, and budget.
func (r *Router) ResolveModel(prompt string, requestedModel string, availableModels []string) RouteDecision {
	r.mu.Lock()
	defer r.mu.Unlock()

	decision := RouteDecision{
		RequestedModel: requestedModel,
		SelectedModel:  requestedModel,
	}

	// Get current budget status
	status := r.ledger.GetStatus()
	decision.RemainingBudget = status.Remaining

	// Assess risk level
	decision.RiskLevel = r.assessRisk(status)

	// Estimate cost for requested model
	estimatedInputTokens := r.estimateTokens(prompt)
	estimatedOutputTokens := estimatedInputTokens * 2 // Assume 2x output

	// Get model cost
	modelCost, hasModel := r.registry.GetModel(requestedModel)
	if hasModel {
		switch modelCost.CostUnit {
		case pricing.UnitCredits:
			decision.EstimatedCost = modelCost.CreditMultiplier
		case pricing.UnitUSD:
			decision.EstimatedCost = r.registry.EstimateCostUSD(
				requestedModel,
				estimatedInputTokens,
				estimatedOutputTokens,
			)
		case pricing.UnitFree:
			decision.EstimatedCost = 0
		}
	}

	// Decision logic based on risk and cost
	switch decision.RiskLevel {
	case RiskCritical:
		// Budget exhausted - force free model or cheapest available
		freeModel := r.findFreeModel(availableModels)
		if freeModel != "" {
			decision.SelectedModel = freeModel
			decision.WasDowngraded = true
			decision.Reason = "Budget exhausted - using free model"
			decision.Warning = "Your budget is exhausted. Using local/free model."
			decision.EstimatedCost = 0
		} else {
			cheapest := r.findCheapestModel(availableModels)
			if cheapest != "" && cheapest != requestedModel {
				decision.SelectedModel = cheapest
				decision.WasDowngraded = true
				decision.Reason = "Budget exhausted - using cheapest available"
				decision.Warning = "Your budget is exhausted. Downgraded to cheapest model."
			} else {
				decision.Warning = "Budget exhausted! Consider adding funds or using a free model."
			}
		}

	case RiskHigh:
		// Near limit - downgrade expensive models
		if r.isExpensiveModel(requestedModel) {
			cheaper := r.findCheaperAlternative(requestedModel, availableModels)
			if cheaper != "" {
				decision.SelectedModel = cheaper
				decision.WasDowngraded = true
				decision.Reason = "Budget constraint - downgraded to save budget"
				decision.Warning = fmt.Sprintf(
					"Downgraded from %s to %s to conserve budget (%.0f%% used)",
					requestedModel, cheaper, status.PercentUsed,
				)
				// Recalculate cost for new model
				if newCost, ok := r.registry.GetModel(cheaper); ok {
					decision.EstimatedCost = newCost.CreditMultiplier
				}
			}
		} else {
			decision.Reason = "Budget at risk but model is affordable"
			decision.Warning = fmt.Sprintf("Budget warning: %.0f%% used", status.PercentUsed)
		}

	case RiskMedium:
		// Watch spending but allow requested model
		decision.Reason = "Model approved - budget on track"
		if status.PercentUsed > 70 {
			decision.Warning = fmt.Sprintf("Budget notice: %.0f%% used", status.PercentUsed)
		}

	case RiskLow:
		// Plenty of budget - approve as-is
		decision.Reason = "Model approved - budget healthy"
	}

	return decision
}

// estimateTokens provides a rough token estimate from text length.
// Heuristic: ~4 characters per token for English text.
func (r *Router) estimateTokens(text string) int {
	// len(text) / 4 is a reasonable approximation
	tokens := len(text) / 4
	if tokens < 100 {
		tokens = 100 // Minimum
	}
	return tokens
}

// assessRisk determines the risk level based on budget status.
func (r *Router) assessRisk(status ledger.BudgetStatus) RiskLevel {
	if status.PercentUsed >= 100 {
		return RiskCritical
	}
	if status.PercentUsed >= 90 {
		return RiskHigh
	}

	// Compare spending rate to time progress
	// If spending faster than time passing, increase risk
	if status.PercentUsed > status.TimeProgress+20 {
		if status.PercentUsed > 70 {
			return RiskHigh
		}
		return RiskMedium
	}

	if status.PercentUsed > 50 {
		return RiskMedium
	}

	return RiskLow
}

// isExpensiveModel checks if a model is in the expensive tier.
func (r *Router) isExpensiveModel(modelID string) bool {
	modelID = strings.ToLower(modelID)

	// Check for expensive keywords
	expensivePatterns := []string{"opus", "codex-max", "o1", "gpt-5.2"}
	for _, pattern := range expensivePatterns {
		if strings.Contains(modelID, pattern) {
			return true
		}
	}

	// Check multiplier if available
	if cost, ok := r.registry.GetModel(modelID); ok {
		if cost.CostUnit == pricing.UnitCredits && cost.CreditMultiplier >= 2.0 {
			return true
		}
		if cost.CostUnit == pricing.UnitUSD && cost.InputCostPerMillion >= 10.0 {
			return true
		}
	}

	return false
}

// findFreeModel finds a free/local model from available options.
func (r *Router) findFreeModel(available []string) string {
	availSet := make(map[string]bool)
	for _, m := range available {
		availSet[strings.ToLower(m)] = true
	}

	for _, free := range r.freeModels {
		if availSet[strings.ToLower(free)] {
			return free
		}
	}
	return ""
}

// findCheapestModel finds the cheapest model from available options.
func (r *Router) findCheapestModel(available []string) string {
	var cheapest string
	var lowestCost float64 = -1

	for _, modelID := range available {
		cost, ok := r.registry.GetModel(modelID)
		if !ok {
			continue
		}

		var modelCost float64
		switch cost.CostUnit {
		case pricing.UnitFree:
			return modelID // Free is always cheapest
		case pricing.UnitCredits:
			modelCost = cost.CreditMultiplier
		case pricing.UnitUSD:
			modelCost = cost.InputCostPerMillion // Rough comparison
		}

		if lowestCost < 0 || modelCost < lowestCost {
			lowestCost = modelCost
			cheapest = modelID
		}
	}

	return cheapest
}

// findCheaperAlternative finds a cheaper alternative to the given model.
func (r *Router) findCheaperAlternative(modelID string, available []string) string {
	currentCost, ok := r.registry.GetModel(modelID)
	if !ok {
		return ""
	}

	var currentCostValue float64
	switch currentCost.CostUnit {
	case pricing.UnitCredits:
		currentCostValue = currentCost.CreditMultiplier
	case pricing.UnitUSD:
		currentCostValue = currentCost.InputCostPerMillion
	case pricing.UnitFree:
		return "" // Already free
	}

	// Try to find a model with similar capability but lower cost
	// First, check speed models as they're usually cheaper
	for _, speed := range r.speedModels {
		for _, avail := range available {
			if strings.EqualFold(speed, avail) {
				if altCost, ok := r.registry.GetModel(speed); ok {
					var altCostValue float64
					switch altCost.CostUnit {
					case pricing.UnitCredits:
						altCostValue = altCost.CreditMultiplier
					case pricing.UnitUSD:
						altCostValue = altCost.InputCostPerMillion
					case pricing.UnitFree:
						return speed // Free is always better
					}
					if altCostValue < currentCostValue {
						return speed
					}
				}
			}
		}
	}

	// Try reasoning models if we're on an expensive one
	if r.isExpensiveModel(modelID) {
		for _, reasoning := range r.reasoningModels {
			for _, avail := range available {
				if strings.EqualFold(reasoning, avail) {
					if altCost, ok := r.registry.GetModel(reasoning); ok {
						var altCostValue float64
						switch altCost.CostUnit {
						case pricing.UnitCredits:
							altCostValue = altCost.CreditMultiplier
						case pricing.UnitUSD:
							altCostValue = altCost.InputCostPerMillion
						}
						if altCostValue < currentCostValue {
							return reasoning
						}
					}
				}
			}
		}
	}

	return ""
}

// RecordUsage records a completed request's usage in the ledger.
func (r *Router) RecordUsage(modelID, provider string, inputTokens, outputTokens int) (float64, error) {
	return r.ledger.AddExpense(modelID, provider, inputTokens, outputTokens)
}

// GetBudgetStatus returns the current budget status.
func (r *Router) GetBudgetStatus() ledger.BudgetStatus {
	return r.ledger.GetStatus()
}

// SetBudget updates the budget configuration.
func (r *Router) SetBudget(limit float64, unit pricing.CostUnit, renewalDay int) error {
	return r.ledger.SetBudget(limit, unit, renewalDay)
}

// CanAfford checks if a request can be afforded.
func (r *Router) CanAfford(modelID string, estimatedTokens int) bool {
	cost, ok := r.registry.GetModel(modelID)
	if !ok {
		return true // Unknown model, allow
	}

	var estimatedCost float64
	switch cost.CostUnit {
	case pricing.UnitCredits:
		estimatedCost = cost.CreditMultiplier
	case pricing.UnitUSD:
		estimatedCost = r.registry.EstimateCostUSD(modelID, estimatedTokens, estimatedTokens*2)
	case pricing.UnitFree:
		return true
	}

	return r.ledger.CanAfford(estimatedCost)
}

// GetModelCostInfo returns pricing info for a model.
func (r *Router) GetModelCostInfo(modelID string) (*pricing.ModelCost, bool) {
	return r.registry.GetModel(modelID)
}

// GetAllModels returns all known models with pricing.
func (r *Router) GetAllModels() []*pricing.ModelCost {
	return r.registry.ListModels()
}

// SmartRouteDecision extends RouteDecision with SLM analysis.
type SmartRouteDecision struct {
	RouteDecision

	// SLM analysis results
	Complexity         int            `json:"complexity"`
	TaskType           string         `json:"task_type"`
	ExpectedIterations map[string]int `json:"expected_iterations,omitempty"`
	Confidence         float64        `json:"confidence"`
	AnalysisProvider   string         `json:"analysis_provider"`
	AnalysisLatencyMs  int64          `json:"analysis_latency_ms"`

	// Value calculations
	ValueScores map[string]float64 `json:"value_scores,omitempty"` // Model -> value score
}

// ResolveModelSmart uses SLM analysis for optimal model selection.
// This is the v3.5.0 smart routing method that considers:
// - Prompt complexity
// - Estimated iterations per model
// - Budget constraints
// - Value optimization (capability per credit)
func (r *Router) ResolveModelSmart(prompt string, availableModels []string, slmAnalysis interface{}) SmartRouteDecision {
	r.mu.Lock()
	defer r.mu.Unlock()

	decision := SmartRouteDecision{}
	decision.RiskLevel = RiskLow

	// Get current budget status
	status := r.ledger.GetStatus()
	decision.RemainingBudget = status.Remaining
	decision.RiskLevel = r.assessRisk(status)

	// Extract SLM analysis if provided
	if analysis, ok := slmAnalysis.(map[string]interface{}); ok {
		if complexity, ok := analysis["complexity"].(int); ok {
			decision.Complexity = complexity
		}
		if taskType, ok := analysis["task_type"].(string); ok {
			decision.TaskType = taskType
		}
		if iterations, ok := analysis["iterations"].(map[string]int); ok {
			decision.ExpectedIterations = iterations
		}
		if confidence, ok := analysis["confidence"].(float64); ok {
			decision.Confidence = confidence
		}
		if provider, ok := analysis["provider"].(string); ok {
			decision.AnalysisProvider = provider
		}
		if latency, ok := analysis["latency_ms"].(int64); ok {
			decision.AnalysisLatencyMs = latency
		}
	}

	// Calculate value scores for each model
	valueScores := make(map[string]float64)
	safeDaily := status.Remaining / float64(max(1, status.DaysRemaining))

	for _, modelID := range availableModels {
		cost, ok := r.registry.GetModel(modelID)
		if !ok {
			continue
		}

		// Get expected iterations (default to 1)
		iterations := 1
		if decision.ExpectedIterations != nil {
			if iter, ok := decision.ExpectedIterations[modelID]; ok && iter > 0 {
				iterations = iter
			}
		}

		// Calculate total expected cost
		var totalCost float64
		switch cost.CostUnit {
		case pricing.UnitCredits:
			totalCost = cost.CreditMultiplier * float64(iterations)
		case pricing.UnitUSD:
			estimatedTokens := r.estimateTokens(prompt)
			singleCost := r.registry.EstimateCostUSD(modelID, estimatedTokens, estimatedTokens*2)
			totalCost = singleCost * float64(iterations)
		case pricing.UnitFree:
			totalCost = 0.001 // Tiny non-zero for math
		}

		// Get capability score (simplified: based on cost tier)
		capability := r.getModelCapability(modelID)

		// Value = capability / total cost
		costDenom := totalCost
		if costDenom < 0.001 {
			costDenom = 0.001
		}
		value := float64(capability) / costDenom

		// Risk adjustment: penalize if cost exceeds safe daily spend
		if totalCost > safeDaily && status.PercentUsed > 50 {
			riskPenalty := safeDaily / totalCost
			value *= riskPenalty
		}

		valueScores[modelID] = value
	}

	decision.ValueScores = valueScores

	// Find the best value model
	var bestModel string
	var bestValue float64 = -1

	for modelID, value := range valueScores {
		if value > bestValue {
			bestValue = value
			bestModel = modelID
		}
	}

	if bestModel != "" {
		decision.SelectedModel = bestModel
		if cost, ok := r.registry.GetModel(bestModel); ok {
			switch cost.CostUnit {
			case pricing.UnitCredits:
				decision.EstimatedCost = cost.CreditMultiplier
			case pricing.UnitUSD:
				estimatedTokens := r.estimateTokens(prompt)
				decision.EstimatedCost = r.registry.EstimateCostUSD(bestModel, estimatedTokens, estimatedTokens*2)
			}
		}
		decision.Reason = "Selected by smart routing (best value)"
	} else {
		// Fallback to cheapest
		decision.SelectedModel = r.findCheapestModel(availableModels)
		decision.Reason = "Fallback to cheapest model"
	}

	return decision
}

// getModelCapability returns a capability score (1-10) for a model.
func (r *Router) getModelCapability(modelID string) int {
	modelID = strings.ToLower(modelID)

	// Reasoning tier (10)
	if strings.Contains(modelID, "opus") || strings.Contains(modelID, "o1") {
		return 10
	}

	// High capability (9)
	if strings.Contains(modelID, "gemini-3") || strings.Contains(modelID, "sonnet-4.5") {
		return 9
	}

	// Standard (8)
	if strings.Contains(modelID, "sonnet") || strings.Contains(modelID, "gpt-4o") ||
		strings.Contains(modelID, "gpt-5") {
		return 8
	}

	// Mid tier (6)
	if strings.Contains(modelID, "haiku") || strings.Contains(modelID, "mini") {
		return 6
	}

	// Free/local (5)
	if strings.Contains(modelID, "llama") || strings.Contains(modelID, "mistral") {
		return 5
	}

	return 7 // Default
}

// max returns the larger of two integers.
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// Global router instance
var (
	globalRouter     *Router
	globalRouterOnce sync.Once
	globalRouterErr  error
)

// GetRouter returns the global CFO router instance.
func GetRouter() (*Router, error) {
	globalRouterOnce.Do(func() {
		globalRouter, globalRouterErr = NewRouter()
	})
	return globalRouter, globalRouterErr
}
