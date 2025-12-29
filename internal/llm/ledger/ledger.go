// Package ledger provides a persistent spending tracker for LLM usage.
// It maintains a local JSON file to track monthly usage against a budget.
package ledger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm/pricing"
)

// UsageRecord represents a single usage entry.
type UsageRecord struct {
	Timestamp    time.Time `json:"timestamp"`
	ModelID      string    `json:"model_id"`
	Provider     string    `json:"provider"`
	InputTokens  int       `json:"input_tokens"`
	OutputTokens int       `json:"output_tokens"`
	Cost         float64   `json:"cost"` // Cost in the budget's unit
}

// LedgerData represents the persisted ledger state.
type LedgerData struct {
	// Budget configuration
	BudgetLimit float64          `json:"budget_limit"` // Monthly budget limit
	BudgetUnit  pricing.CostUnit `json:"budget_unit"`  // "credits" or "usd"
	RenewalDay  int              `json:"renewal_day"`  // Day of month to reset (1-28)

	// Current period tracking
	CurrentUsage   float64       `json:"current_usage"`    // Total spent this period
	PeriodStart    time.Time     `json:"period_start"`     // Start of current billing period
	LastUpdated    time.Time     `json:"last_updated"`     // Last modification time
	RequestCount   int           `json:"request_count"`    // Number of requests this period
	UsageHistory   []UsageRecord `json:"usage_history"`    // Detailed history (last 100 entries)
	
	// Historical data
	MonthlyTotals map[string]float64 `json:"monthly_totals"` // "2025-01": 150.50
}

// Ledger manages the spending ledger with thread-safe operations.
type Ledger struct {
	mu       sync.RWMutex
	data     *LedgerData
	filePath string
	registry *pricing.Registry
}

// DefaultFilePath returns the default ledger file path (~/.forge/ledger.json).
func DefaultFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".forge", "ledger.json")
}

// NewLedger creates or loads a ledger from the specified path.
func NewLedger(filePath string) (*Ledger, error) {
	l := &Ledger{
		filePath: filePath,
		registry: pricing.GetRegistry(),
	}

	if err := l.load(); err != nil {
		// Initialize with defaults if file doesn't exist
		l.data = &LedgerData{
			BudgetLimit:   1500,                  // Default budget
			BudgetUnit:    pricing.UnitCredits,   // Default to Copilot credits
			RenewalDay:    1,                     // Reset on 1st of month
			CurrentUsage:  0,
			PeriodStart:   calculatePeriodStart(1),
			LastUpdated:   time.Now(),
			RequestCount:  0,
			UsageHistory:  []UsageRecord{},
			MonthlyTotals: make(map[string]float64),
		}
		// Create directory if needed
		dir := filepath.Dir(filePath)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("failed to create ledger directory: %w", err)
		}
		// Save initial state
		if err := l.save(); err != nil {
			return nil, fmt.Errorf("failed to save initial ledger: %w", err)
		}
	}

	// Check for period reset
	l.checkPeriodReset()

	return l, nil
}

// load reads the ledger from disk.
func (l *Ledger) load() error {
	data, err := os.ReadFile(l.filePath)
	if err != nil {
		return err
	}

	l.data = &LedgerData{}
	if err := json.Unmarshal(data, l.data); err != nil {
		return fmt.Errorf("failed to parse ledger: %w", err)
	}

	// Initialize maps if nil
	if l.data.MonthlyTotals == nil {
		l.data.MonthlyTotals = make(map[string]float64)
	}
	if l.data.UsageHistory == nil {
		l.data.UsageHistory = []UsageRecord{}
	}

	return nil
}

// save writes the ledger to disk.
func (l *Ledger) save() error {
	l.data.LastUpdated = time.Now()

	data, err := json.MarshalIndent(l.data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal ledger: %w", err)
	}

	return os.WriteFile(l.filePath, data, 0600)
}

// checkPeriodReset checks if the current period has ended and resets if needed.
func (l *Ledger) checkPeriodReset() {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	currentPeriodStart := calculatePeriodStart(l.data.RenewalDay)

	// If the stored period start is before the calculated current period start,
	// we need to reset
	if l.data.PeriodStart.Before(currentPeriodStart) {
		// Archive the previous period
		monthKey := l.data.PeriodStart.Format("2006-01")
		l.data.MonthlyTotals[monthKey] = l.data.CurrentUsage

		// Reset for new period
		l.data.CurrentUsage = 0
		l.data.RequestCount = 0
		l.data.PeriodStart = currentPeriodStart
		l.data.UsageHistory = []UsageRecord{} // Clear history for new period

		l.save()
	}

	// Also check if LastUpdated is from a previous month (handles cold start)
	if !l.data.LastUpdated.IsZero() {
		lastMonth := l.data.LastUpdated.Month()
		currentMonth := now.Month()
		lastYear := l.data.LastUpdated.Year()
		currentYear := now.Year()

		if lastYear < currentYear || (lastYear == currentYear && lastMonth < currentMonth) {
			// Archive if not already done
			monthKey := l.data.PeriodStart.Format("2006-01")
			if _, exists := l.data.MonthlyTotals[monthKey]; !exists && l.data.CurrentUsage > 0 {
				l.data.MonthlyTotals[monthKey] = l.data.CurrentUsage
			}

			// Reset
			l.data.CurrentUsage = 0
			l.data.RequestCount = 0
			l.data.PeriodStart = currentPeriodStart
			l.data.UsageHistory = []UsageRecord{}

			l.save()
		}
	}
}

// calculatePeriodStart returns the start date of the current billing period.
func calculatePeriodStart(renewalDay int) time.Time {
	now := time.Now()
	
	// Clamp renewal day to valid range
	if renewalDay < 1 {
		renewalDay = 1
	}
	if renewalDay > 28 {
		renewalDay = 28
	}

	// Calculate the period start
	year := now.Year()
	month := now.Month()

	// If we haven't reached the renewal day this month, use last month
	if now.Day() < renewalDay {
		month--
		if month < 1 {
			month = 12
			year--
		}
	}

	return time.Date(year, month, renewalDay, 0, 0, 0, 0, time.Local)
}

// AddExpense records a new expense in the ledger.
func (l *Ledger) AddExpense(modelID, provider string, inputTokens, outputTokens int) (float64, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Check for period reset first
	now := time.Now()
	currentPeriodStart := calculatePeriodStart(l.data.RenewalDay)
	if l.data.PeriodStart.Before(currentPeriodStart) {
		// Archive and reset (unlocked version)
		monthKey := l.data.PeriodStart.Format("2006-01")
		l.data.MonthlyTotals[monthKey] = l.data.CurrentUsage
		l.data.CurrentUsage = 0
		l.data.RequestCount = 0
		l.data.PeriodStart = currentPeriodStart
		l.data.UsageHistory = []UsageRecord{}
	}

	// Calculate cost based on provider
	var cost float64
	switch l.data.BudgetUnit {
	case pricing.UnitCredits:
		cost = l.registry.EstimateCostCredits(modelID, 1)
	case pricing.UnitUSD:
		cost = l.registry.EstimateCostUSD(modelID, inputTokens, outputTokens)
	default:
		cost = 0
	}

	// Record the expense
	record := UsageRecord{
		Timestamp:    now,
		ModelID:      modelID,
		Provider:     provider,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
		Cost:         cost,
	}

	l.data.CurrentUsage += cost
	l.data.RequestCount++

	// Keep last 100 records
	l.data.UsageHistory = append(l.data.UsageHistory, record)
	if len(l.data.UsageHistory) > 100 {
		l.data.UsageHistory = l.data.UsageHistory[len(l.data.UsageHistory)-100:]
	}

	if err := l.save(); err != nil {
		return cost, fmt.Errorf("failed to save ledger: %w", err)
	}

	return cost, nil
}

// GetStatus returns the current budget status.
func (l *Ledger) GetStatus() BudgetStatus {
	l.mu.RLock()
	defer l.mu.RUnlock()

	now := time.Now()
	periodEnd := calculateNextPeriodStart(l.data.RenewalDay)
	daysInPeriod := periodEnd.Sub(l.data.PeriodStart).Hours() / 24
	daysElapsed := now.Sub(l.data.PeriodStart).Hours() / 24
	daysRemaining := periodEnd.Sub(now).Hours() / 24

	// Calculate time progress and budget progress
	timeProgress := 0.0
	if daysInPeriod > 0 {
		timeProgress = daysElapsed / daysInPeriod
	}

	budgetProgress := 0.0
	if l.data.BudgetLimit > 0 {
		budgetProgress = l.data.CurrentUsage / l.data.BudgetLimit
	}

	// Determine health status
	health := HealthHealthy
	if budgetProgress >= 1.0 {
		health = HealthExhausted
	} else if budgetProgress > timeProgress+0.2 {
		// Spending faster than time passing (with 20% buffer)
		health = HealthWarning
	} else if budgetProgress > 0.9 {
		health = HealthCritical
	}

	remaining := l.data.BudgetLimit - l.data.CurrentUsage
	if remaining < 0 {
		remaining = 0
	}

	return BudgetStatus{
		CurrentUsage:   l.data.CurrentUsage,
		BudgetLimit:    l.data.BudgetLimit,
		BudgetUnit:     l.data.BudgetUnit,
		Remaining:      remaining,
		PercentUsed:    budgetProgress * 100,
		DaysElapsed:    int(daysElapsed),
		DaysRemaining:  int(daysRemaining),
		TimeProgress:   timeProgress * 100,
		RequestCount:   l.data.RequestCount,
		Health:         health,
		PeriodStart:    l.data.PeriodStart,
		RenewalDay:     l.data.RenewalDay,
	}
}

// calculateNextPeriodStart returns the start of the next billing period.
func calculateNextPeriodStart(renewalDay int) time.Time {
	current := calculatePeriodStart(renewalDay)
	year := current.Year()
	month := current.Month() + 1
	if month > 12 {
		month = 1
		year++
	}
	return time.Date(year, month, renewalDay, 0, 0, 0, 0, time.Local)
}

// BudgetHealth represents the health status of the budget.
type BudgetHealth string

const (
	HealthHealthy   BudgetHealth = "healthy"   // On track
	HealthWarning   BudgetHealth = "warning"   // Spending faster than expected
	HealthCritical  BudgetHealth = "critical"  // Near limit
	HealthExhausted BudgetHealth = "exhausted" // Over budget
)

// BudgetStatus represents the current budget state.
type BudgetStatus struct {
	CurrentUsage   float64          `json:"current_usage"`
	BudgetLimit    float64          `json:"budget_limit"`
	BudgetUnit     pricing.CostUnit `json:"budget_unit"`
	Remaining      float64          `json:"remaining"`
	PercentUsed    float64          `json:"percent_used"`
	DaysElapsed    int              `json:"days_elapsed"`
	DaysRemaining  int              `json:"days_remaining"`
	TimeProgress   float64          `json:"time_progress"` // Percent of period elapsed
	RequestCount   int              `json:"request_count"`
	Health         BudgetHealth     `json:"health"`
	PeriodStart    time.Time        `json:"period_start"`
	RenewalDay     int              `json:"renewal_day"`
}

// SetBudget updates the budget configuration.
func (l *Ledger) SetBudget(limit float64, unit pricing.CostUnit, renewalDay int) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if renewalDay < 1 || renewalDay > 28 {
		renewalDay = 1
	}

	l.data.BudgetLimit = limit
	l.data.BudgetUnit = unit
	l.data.RenewalDay = renewalDay

	return l.save()
}

// GetHistory returns the usage history for the current period.
func (l *Ledger) GetHistory() []UsageRecord {
	l.mu.RLock()
	defer l.mu.RUnlock()

	// Return a copy
	history := make([]UsageRecord, len(l.data.UsageHistory))
	copy(history, l.data.UsageHistory)
	return history
}

// GetMonthlyTotals returns historical monthly totals.
func (l *Ledger) GetMonthlyTotals() map[string]float64 {
	l.mu.RLock()
	defer l.mu.RUnlock()

	// Return a copy
	totals := make(map[string]float64)
	for k, v := range l.data.MonthlyTotals {
		totals[k] = v
	}
	return totals
}

// ResetPeriod manually resets the current period (for testing/admin).
func (l *Ledger) ResetPeriod() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Archive current
	monthKey := l.data.PeriodStart.Format("2006-01")
	l.data.MonthlyTotals[monthKey] = l.data.CurrentUsage

	// Reset
	l.data.CurrentUsage = 0
	l.data.RequestCount = 0
	l.data.PeriodStart = calculatePeriodStart(l.data.RenewalDay)
	l.data.UsageHistory = []UsageRecord{}

	return l.save()
}

// CanAfford checks if the estimated cost can be afforded.
func (l *Ledger) CanAfford(estimatedCost float64) bool {
	l.mu.RLock()
	defer l.mu.RUnlock()

	return l.data.CurrentUsage+estimatedCost <= l.data.BudgetLimit
}

// GetRemainingBudget returns the remaining budget.
func (l *Ledger) GetRemainingBudget() float64 {
	l.mu.RLock()
	defer l.mu.RUnlock()

	remaining := l.data.BudgetLimit - l.data.CurrentUsage
	if remaining < 0 {
		return 0
	}
	return remaining
}

// Global ledger instance
var (
	globalLedger     *Ledger
	globalLedgerOnce sync.Once
	globalLedgerErr  error
)

// GetLedger returns the global ledger instance.
func GetLedger() (*Ledger, error) {
	globalLedgerOnce.Do(func() {
		globalLedger, globalLedgerErr = NewLedger(DefaultFilePath())
	})
	return globalLedger, globalLedgerErr
}
