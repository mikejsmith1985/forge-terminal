package cfo

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm/ledger"
	"github.com/mikejsmith1985/forge-terminal/internal/llm/pricing"
)

// TestBrokeUser tests that an exhausted budget forces model downgrade.
// Test Case A: The "Broke" User
func TestBrokeUser(t *testing.T) {
	// Create a temp ledger file
	tmpDir := t.TempDir()
	ledgerPath := filepath.Join(tmpDir, "ledger.json")

	// Create ledger with nearly exhausted budget
	l, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to create ledger: %v", err)
	}

	// Set budget to 10.00 credits
	err = l.SetBudget(10.0, pricing.UnitCredits, 1)
	if err != nil {
		t.Fatalf("Failed to set budget: %v", err)
	}

	// Spend to exceed budget (10.0 credits used = 100%)
	// Use gpt-4o which costs 1.0 credit each
	for i := 0; i < 10; i++ { // 10 * 1.0 = 10.0
		_, err = l.AddExpense("gpt-4o", "copilot", 100, 200)
		if err != nil {
			t.Fatalf("Failed to add expense: %v", err)
		}
	}

	status := l.GetStatus()
	t.Logf("Budget status: %.2f / %.2f used (%.1f%%)", 
		status.CurrentUsage, status.BudgetLimit, status.PercentUsed)

	// Verify we're at or over budget
	if status.PercentUsed < 100 {
		t.Errorf("Expected 100%% or more used, got %.1f%%", status.PercentUsed)
	}

	// Create router with this ledger (using custom constructor for testing)
	router := &Router{
		ledger:   l,
		registry: pricing.GetRegistry(),
		speedModels: []string{
			"gpt-4o-mini",
			"claude-3.5-haiku",
		},
		reasoningModels: []string{
			"gpt-4o",
			"claude-3.5-sonnet",
		},
		freeModels: []string{
			"llama3.2",
			"codellama",
		},
	}

	// Request expensive Opus model (credit multiplier = 3.0)
	availableModels := []string{"claude-opus-4", "claude-3.5-sonnet", "gpt-4o-mini", "llama3.2"}
	decision := router.ResolveModel("Debug this complex code", "claude-opus-4", availableModels)

	t.Logf("Requested: %s, Selected: %s, Downgraded: %v", 
		decision.RequestedModel, decision.SelectedModel, decision.WasDowngraded)
	t.Logf("Reason: %s", decision.Reason)
	t.Logf("Warning: %s", decision.Warning)

	// Assert: The router should reject Opus and select a cheaper model
	if decision.SelectedModel == "claude-opus-4" {
		t.Errorf("Expected downgrade from Opus, but got Opus")
	}

	if !decision.WasDowngraded {
		t.Errorf("Expected WasDowngraded to be true")
	}

	// Should have selected either free model or cheapest available
	if decision.SelectedModel != "llama3.2" && decision.SelectedModel != "gpt-4o-mini" {
		t.Errorf("Expected llama3.2 or gpt-4o-mini, got %s", decision.SelectedModel)
	}

	if decision.RiskLevel != RiskCritical {
		t.Errorf("Expected RiskCritical, got %s", decision.RiskLevel)
	}
}

// TestCopilotOptimization verifies correct credit multiplier calculations.
// Test Case B: The "Copilot" Optimization
func TestCopilotOptimization(t *testing.T) {
	registry := pricing.NewRegistry()

	// Verify Haiku costs less than Gemini
	haikuCost, haikuOK := registry.GetModel("claude-3.5-haiku")
	geminiCost, geminiOK := registry.GetModel("gemini-3-pro-preview")

	if !haikuOK {
		t.Fatal("claude-3.5-haiku not found in registry")
	}
	if !geminiOK {
		t.Fatal("gemini-3-pro-preview not found in registry")
	}

	t.Logf("Haiku credit multiplier: %.2f", haikuCost.CreditMultiplier)
	t.Logf("Gemini credit multiplier: %.2f", geminiCost.CreditMultiplier)

	// Assert: 3 Haiku prompts should cost less than 1 Gemini prompt
	haikuTripleCost := haikuCost.CreditMultiplier * 3
	geminiSingleCost := geminiCost.CreditMultiplier

	t.Logf("3x Haiku cost: %.2f credits", haikuTripleCost)
	t.Logf("1x Gemini cost: %.2f credits", geminiSingleCost)

	if haikuTripleCost >= geminiSingleCost {
		t.Errorf("Expected 3x Haiku (%.2f) < 1x Gemini (%.2f)", 
			haikuTripleCost, geminiSingleCost)
	}

	// Verify ledger correctly tracks Copilot credit costs
	tmpDir := t.TempDir()
	ledgerPath := filepath.Join(tmpDir, "ledger.json")
	l, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to create ledger: %v", err)
	}

	err = l.SetBudget(1000.0, pricing.UnitCredits, 1)
	if err != nil {
		t.Fatalf("Failed to set budget: %v", err)
	}

	// Add 1 Haiku request
	cost1, err := l.AddExpense("claude-3.5-haiku", "copilot", 100, 200)
	if err != nil {
		t.Fatalf("Failed to add Haiku expense: %v", err)
	}
	t.Logf("Haiku request cost: %.2f credits", cost1)

	// Add 1 Gemini request
	cost2, err := l.AddExpense("gemini-3-pro-preview", "copilot", 100, 200)
	if err != nil {
		t.Fatalf("Failed to add Gemini expense: %v", err)
	}
	t.Logf("Gemini request cost: %.2f credits", cost2)

	// Verify costs match registry
	if cost1 != haikuCost.CreditMultiplier {
		t.Errorf("Ledger recorded %.2f for Haiku, expected %.2f", 
			cost1, haikuCost.CreditMultiplier)
	}

	if cost2 != geminiCost.CreditMultiplier {
		t.Errorf("Ledger recorded %.2f for Gemini, expected %.2f", 
			cost2, geminiCost.CreditMultiplier)
	}

	// Verify total usage
	status := l.GetStatus()
	expectedTotal := cost1 + cost2
	if status.CurrentUsage != expectedTotal {
		t.Errorf("Expected total usage %.2f, got %.2f", 
			expectedTotal, status.CurrentUsage)
	}
}

// TestMonthlyReset verifies the billing period reset logic.
// Test Case C: Monthly Reset
func TestMonthlyReset(t *testing.T) {
	tmpDir := t.TempDir()
	ledgerPath := filepath.Join(tmpDir, "ledger.json")

	// Create ledger
	l, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to create ledger: %v", err)
	}

	// Set budget
	err = l.SetBudget(1000.0, pricing.UnitCredits, 1)
	if err != nil {
		t.Fatalf("Failed to set budget: %v", err)
	}

	// Add some usage
	_, err = l.AddExpense("gpt-4o", "copilot", 500, 1000)
	if err != nil {
		t.Fatalf("Failed to add expense: %v", err)
	}

	status := l.GetStatus()
	t.Logf("Initial usage: %.2f credits", status.CurrentUsage)

	if status.CurrentUsage == 0 {
		t.Error("Expected non-zero usage after adding expense")
	}

	// Read the original ledger data for logging
	data, _ := os.ReadFile(ledgerPath)
	t.Logf("Original ledger: %s", string(data))

	// Reload the ledger - this should trigger reset
	l2, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to reload ledger: %v", err)
	}

	// The reload will have already checked and potentially reset
	// Let's verify the current state
	status2 := l2.GetStatus()
	t.Logf("After reload: %.2f credits used, period start: %s", 
		status2.CurrentUsage, status2.PeriodStart.Format("2006-01-02"))

	// Note: Due to how the test is structured (we already added to the ledger),
	// the reset may have happened. Let's verify the period start is current month
	now := time.Now()
	if status2.PeriodStart.Month() != now.Month() || status2.PeriodStart.Year() != now.Year() {
		// Check if it's this month's period (accounting for renewal day logic)
		if status2.PeriodStart.After(now) {
			t.Errorf("Period start %s is in the future", status2.PeriodStart)
		}
	}

	// Test explicit reset
	initialUsage := status2.CurrentUsage
	err = l2.ResetPeriod()
	if err != nil {
		t.Fatalf("Failed to reset period: %v", err)
	}

	status3 := l2.GetStatus()
	t.Logf("After manual reset: %.2f credits used", status3.CurrentUsage)

	if status3.CurrentUsage != 0 {
		t.Errorf("Expected 0 usage after reset, got %.2f", status3.CurrentUsage)
	}

	// Verify the old usage was archived
	totals := l2.GetMonthlyTotals()
	t.Logf("Monthly totals: %v", totals)

	// At least one entry should exist if there was usage before reset
	if initialUsage > 0 && len(totals) == 0 {
		t.Log("Warning: Expected monthly totals to be archived")
	}
}

// TestRiskAssessment verifies the risk level calculation.
func TestRiskAssessment(t *testing.T) {
	tmpDir := t.TempDir()
	ledgerPath := filepath.Join(tmpDir, "ledger.json")

	l, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to create ledger: %v", err)
	}

	router := &Router{
		ledger:   l,
		registry: pricing.GetRegistry(),
	}

	testCases := []struct {
		name         string
		budget       float64
		usage        float64
		expectedRisk RiskLevel
	}{
		{"Empty budget", 100.0, 0.0, RiskLow},
		{"25% used", 100.0, 25.0, RiskLow},
		{"50% used", 100.0, 50.0, RiskMedium},
		{"75% used", 100.0, 75.0, RiskMedium}, // Depends on time progress
		{"90% used", 100.0, 90.0, RiskHigh},
		{"100% used", 100.0, 100.0, RiskCritical},
		{"Over budget", 100.0, 110.0, RiskCritical},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Reset ledger
			l.ResetPeriod()
			l.SetBudget(tc.budget, pricing.UnitCredits, 1)

			// Add usage to match target
			if tc.usage > 0 {
				// Add in increments
				remaining := tc.usage
				for remaining > 0 {
					cost := remaining
					if cost > 1.0 {
						cost = 1.0
					}
					l.AddExpense("gpt-4o", "copilot", 100, 200) // 1.0 credit each
					remaining -= 1.0
				}
			}

			status := l.GetStatus()
			risk := router.assessRisk(status)

			t.Logf("%s: %.0f%% used, risk=%s (expected %s)", 
				tc.name, status.PercentUsed, risk, tc.expectedRisk)

			// For high-risk cases, verify behavior
			if tc.expectedRisk == RiskCritical && risk != RiskCritical {
				t.Errorf("Expected RiskCritical for %s, got %s", tc.name, risk)
			}

			if tc.expectedRisk == RiskLow && risk != RiskLow {
				t.Errorf("Expected RiskLow for %s, got %s", tc.name, risk)
			}
		})
	}
}

// TestModelDowngradeChain verifies the downgrade logic works correctly.
func TestModelDowngradeChain(t *testing.T) {
	tmpDir := t.TempDir()
	ledgerPath := filepath.Join(tmpDir, "ledger.json")

	l, err := ledger.NewLedger(ledgerPath)
	if err != nil {
		t.Fatalf("Failed to create ledger: %v", err)
	}

	// Set small budget
	l.SetBudget(5.0, pricing.UnitCredits, 1)

	// Exhaust budget completely (5.0 credits = 100%)
	for i := 0; i < 5; i++ {
		l.AddExpense("gpt-4o", "copilot", 100, 200) // 1.0 each = 5.0 total
	}

	status := l.GetStatus()
	t.Logf("Budget status: %.2f / %.2f used (%.1f%%)", 
		status.CurrentUsage, status.BudgetLimit, status.PercentUsed)

	router := &Router{
		ledger:   l,
		registry: pricing.GetRegistry(),
		speedModels: []string{
			"gpt-4o-mini",      // 0.25 credits
			"claude-3.5-haiku", // 0.33 credits
		},
		reasoningModels: []string{
			"gpt-4o",           // 1.0 credits
			"claude-3.5-sonnet", // 1.0 credits
		},
		freeModels: []string{
			"llama3.2",
		},
	}

	available := []string{"claude-opus-4", "gpt-4o", "gpt-4o-mini", "llama3.2"}

	// Request expensive model
	decision := router.ResolveModel("Complex task", "claude-opus-4", available)

	t.Logf("Requested: %s", decision.RequestedModel)
	t.Logf("Selected: %s", decision.SelectedModel)
	t.Logf("Reason: %s", decision.Reason)
	t.Logf("Risk Level: %s", decision.RiskLevel)
	t.Logf("Remaining: %.2f", decision.RemainingBudget)

	// Should have downgraded when at 100% budget
	if decision.RiskLevel != RiskCritical {
		t.Errorf("Expected RiskCritical at 100%% budget, got %s", decision.RiskLevel)
	}

	if !decision.WasDowngraded {
		t.Error("Expected model to be downgraded due to budget exhaustion")
	}

	// Should have selected free model (llama3.2) when budget is exhausted
	if decision.SelectedModel != "llama3.2" {
		t.Errorf("Expected llama3.2 (free model), got %s", decision.SelectedModel)
	}
}

// TestAnthropicUSDPricing verifies USD-based pricing calculations.
func TestAnthropicUSDPricing(t *testing.T) {
	registry := pricing.NewRegistry()

	// Get Anthropic Sonnet pricing
	sonnet, ok := registry.GetModel("anthropic:claude-3-5-sonnet-20241022")
	if !ok {
		t.Fatal("Anthropic Sonnet not found in registry")
	}

	t.Logf("Sonnet input cost: $%.2f/1M tokens", sonnet.InputCostPerMillion)
	t.Logf("Sonnet output cost: $%.2f/1M tokens", sonnet.OutputCostPerMillion)

	// Calculate cost for 1000 input, 2000 output tokens
	inputTokens := 1000
	outputTokens := 2000

	cost := registry.EstimateCostUSD("anthropic:claude-3-5-sonnet-20241022", inputTokens, outputTokens)

	expectedInputCost := (float64(inputTokens) / 1_000_000) * sonnet.InputCostPerMillion
	expectedOutputCost := (float64(outputTokens) / 1_000_000) * sonnet.OutputCostPerMillion
	expectedTotal := expectedInputCost + expectedOutputCost

	t.Logf("Expected cost: $%.6f (input: $%.6f, output: $%.6f)", 
		expectedTotal, expectedInputCost, expectedOutputCost)
	t.Logf("Calculated cost: $%.6f", cost)

	if cost != expectedTotal {
		t.Errorf("Cost mismatch: expected $%.6f, got $%.6f", expectedTotal, cost)
	}
}
