package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/llm/cfo"
	"github.com/mikejsmith1985/forge-terminal/internal/llm/ledger"
	"github.com/mikejsmith1985/forge-terminal/internal/llm/pricing"
)

// BudgetConfigRequest represents a request to update budget configuration.
type BudgetConfigRequest struct {
	BudgetLimit float64 `json:"budget_limit"`
	BudgetUnit  string  `json:"budget_unit"` // "credits" or "usd"
	RenewalDay  int     `json:"renewal_day"`
}

// BudgetStatusResponse represents the budget status response.
type BudgetStatusResponse struct {
	Status      ledger.BudgetStatus `json:"status"`
	Models      []*pricing.ModelCost `json:"models,omitempty"`
	Providers   []*pricing.ProviderConfig `json:"providers,omitempty"`
}

// handleBudgetStatus handles GET /api/llm/budget
// Returns the current budget status.
func handleBudgetStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	router, err := cfo.GetRouter()
	if err != nil {
		log.Printf("[Budget API] Failed to get router: %v", err)
		http.Error(w, "Failed to get budget status", http.StatusInternalServerError)
		return
	}

	status := router.GetBudgetStatus()

	// Include model and provider info for UI
	response := BudgetStatusResponse{
		Status:    status,
		Models:    router.GetAllModels(),
		Providers: pricing.GetRegistry().ListProviders(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleBudgetConfig handles POST /api/llm/budget/config
// Updates the budget configuration.
func handleBudgetConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BudgetConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Validate
	if req.BudgetLimit <= 0 {
		http.Error(w, "Budget limit must be positive", http.StatusBadRequest)
		return
	}

	var unit pricing.CostUnit
	switch req.BudgetUnit {
	case "credits":
		unit = pricing.UnitCredits
	case "usd":
		unit = pricing.UnitUSD
	default:
		http.Error(w, "Budget unit must be 'credits' or 'usd'", http.StatusBadRequest)
		return
	}

	if req.RenewalDay < 1 || req.RenewalDay > 28 {
		req.RenewalDay = 1
	}

	router, err := cfo.GetRouter()
	if err != nil {
		log.Printf("[Budget API] Failed to get router: %v", err)
		http.Error(w, "Failed to update budget", http.StatusInternalServerError)
		return
	}

	if err := router.SetBudget(req.BudgetLimit, unit, req.RenewalDay); err != nil {
		log.Printf("[Budget API] Failed to set budget: %v", err)
		http.Error(w, "Failed to save budget configuration", http.StatusInternalServerError)
		return
	}

	log.Printf("[Budget API] Updated budget: %.2f %s (renewal day: %d)", 
		req.BudgetLimit, req.BudgetUnit, req.RenewalDay)

	// Return updated status
	status := router.GetBudgetStatus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleBudgetHistory handles GET /api/llm/budget/history
// Returns the usage history.
func handleBudgetHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	l, err := ledger.GetLedger()
	if err != nil {
		http.Error(w, "Failed to get ledger", http.StatusInternalServerError)
		return
	}

	response := struct {
		History       []ledger.UsageRecord   `json:"history"`
		MonthlyTotals map[string]float64     `json:"monthly_totals"`
	}{
		History:       l.GetHistory(),
		MonthlyTotals: l.GetMonthlyTotals(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleBudgetReset handles POST /api/llm/budget/reset
// Manually resets the current billing period.
func handleBudgetReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	l, err := ledger.GetLedger()
	if err != nil {
		http.Error(w, "Failed to get ledger", http.StatusInternalServerError)
		return
	}

	if err := l.ResetPeriod(); err != nil {
		log.Printf("[Budget API] Failed to reset period: %v", err)
		http.Error(w, "Failed to reset period", http.StatusInternalServerError)
		return
	}

	log.Printf("[Budget API] Budget period manually reset")

	// Return updated status
	status := l.GetStatus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleModelPricing handles GET /api/llm/pricing
// Returns all model pricing information.
func handleModelPricing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	registry := pricing.GetRegistry()

	response := struct {
		Models    []*pricing.ModelCost      `json:"models"`
		Providers []*pricing.ProviderConfig `json:"providers"`
	}{
		Models:    registry.ListModels(),
		Providers: registry.ListProviders(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// RouteDecisionResponse wraps the CFO decision for API response.
type RouteDecisionResponse struct {
	cfo.RouteDecision
	BudgetStatus ledger.BudgetStatus `json:"budget_status"`
}

// handleRoutePreview handles POST /api/llm/route/preview
// Previews what model would be selected without actually making a request.
func handleRoutePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Prompt          string   `json:"prompt"`
		RequestedModel  string   `json:"requested_model"`
		AvailableModels []string `json:"available_models,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	router, err := cfo.GetRouter()
	if err != nil {
		http.Error(w, "Failed to get router", http.StatusInternalServerError)
		return
	}

	// If no available models specified, use defaults
	if len(req.AvailableModels) == 0 {
		req.AvailableModels = []string{
			"gpt-4o-mini", "gpt-4o", "claude-3.5-haiku", "claude-3.5-sonnet",
			"claude-sonnet-4", "claude-opus-4", "llama3.2",
		}
	}

	decision := router.ResolveModel(req.Prompt, req.RequestedModel, req.AvailableModels)

	response := RouteDecisionResponse{
		RouteDecision: decision,
		BudgetStatus:  router.GetBudgetStatus(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
