// Package slm provides model capability definitions for smart routing.
//
// DEPRECATED: The hardcoded model lists (CopilotModels, ClaudeModels) in this file
// are no longer used. Model selection is now delegated to the CLI tools themselves
// (copilot, claude) which handle model availability dynamically.
//
// Users can configure their preferred models via:
// - ~/.copilot/config.json for Copilot CLI
// - Claude CLI settings for Claude
// - forge.toml for Forge-specific overrides
//
// This file is retained for reference but should not be used for routing decisions.
package slm

// ModelCapability defines a model's characteristics for routing decisions
type ModelCapability struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Provider     string   `json:"provider"`     // "copilot" or "claude"
	CLI          string   `json:"cli"`          // CLI tool name
	
	// Capability scores (1-10)
	Reasoning    int      `json:"reasoning"`    // Complex logic, architecture
	Coding       int      `json:"coding"`       // Code generation quality
	Speed        int      `json:"speed"`        // Response time
	Context      int      `json:"context"`      // Context window handling
	Creativity   int      `json:"creativity"`   // Novel solutions
	
	// Cost indicators
	CostTier     string   `json:"costTier"`     // "low", "medium", "high", "premium"
	CostPerMTok  float64  `json:"costPerMTok"`  // Approximate cost per million tokens
	
	// Best suited for
	TaskTypes    []string `json:"taskTypes"`    // debug, refactor, explain, generate, architecture
	
	// Limitations
	MaxTokens    int      `json:"maxTokens"`    // Max output tokens
	ContextSize  int      `json:"contextSize"`  // Context window size
}

// CopilotModels defines capabilities for GitHub Copilot CLI models
var CopilotModels = map[string]ModelCapability{
	"claude-opus-4.5": {
		ID: "claude-opus-4.5", Name: "Claude Opus 4.5", Provider: "anthropic", CLI: "copilot",
		Reasoning: 10, Coding: 10, Speed: 3, Context: 9, Creativity: 10,
		CostTier: "premium", CostPerMTok: 75.0,
		TaskTypes: []string{"architecture", "complex-debug", "design", "refactor-large"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"claude-sonnet-4.5": {
		ID: "claude-sonnet-4.5", Name: "Claude Sonnet 4.5", Provider: "anthropic", CLI: "copilot",
		Reasoning: 9, Coding: 9, Speed: 6, Context: 9, Creativity: 8,
		CostTier: "high", CostPerMTok: 15.0,
		TaskTypes: []string{"debug", "refactor", "explain", "generate", "review"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"claude-sonnet-4": {
		ID: "claude-sonnet-4", Name: "Claude Sonnet 4", Provider: "anthropic", CLI: "copilot",
		Reasoning: 8, Coding: 8, Speed: 7, Context: 8, Creativity: 7,
		CostTier: "medium", CostPerMTok: 9.0,
		TaskTypes: []string{"debug", "refactor", "explain", "generate"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"claude-haiku-4.5": {
		ID: "claude-haiku-4.5", Name: "Claude Haiku 4.5", Provider: "anthropic", CLI: "copilot",
		Reasoning: 6, Coding: 7, Speed: 9, Context: 7, Creativity: 5,
		CostTier: "low", CostPerMTok: 1.0,
		TaskTypes: []string{"explain", "simple-fix", "format", "quick-question"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"gpt-5.1-codex-max": {
		ID: "gpt-5.1-codex-max", Name: "GPT-5.1 Codex Max", Provider: "openai", CLI: "copilot",
		Reasoning: 10, Coding: 10, Speed: 4, Context: 10, Creativity: 9,
		CostTier: "premium", CostPerMTok: 60.0,
		TaskTypes: []string{"architecture", "complex-debug", "generate-large", "refactor-large"},
		MaxTokens: 16384, ContextSize: 256000,
	},
	"gpt-5.1-codex": {
		ID: "gpt-5.1-codex", Name: "GPT-5.1 Codex", Provider: "openai", CLI: "copilot",
		Reasoning: 9, Coding: 9, Speed: 6, Context: 9, Creativity: 8,
		CostTier: "high", CostPerMTok: 20.0,
		TaskTypes: []string{"debug", "refactor", "generate", "review"},
		MaxTokens: 16384, ContextSize: 128000,
	},
	"gpt-5.2": {
		ID: "gpt-5.2", Name: "GPT-5.2", Provider: "openai", CLI: "copilot",
		Reasoning: 9, Coding: 8, Speed: 7, Context: 9, Creativity: 9,
		CostTier: "high", CostPerMTok: 15.0,
		TaskTypes: []string{"explain", "debug", "generate", "creative"},
		MaxTokens: 8192, ContextSize: 128000,
	},
	"gpt-5.1": {
		ID: "gpt-5.1", Name: "GPT-5.1", Provider: "openai", CLI: "copilot",
		Reasoning: 8, Coding: 8, Speed: 7, Context: 8, Creativity: 8,
		CostTier: "medium", CostPerMTok: 10.0,
		TaskTypes: []string{"debug", "explain", "generate", "refactor"},
		MaxTokens: 8192, ContextSize: 128000,
	},
	"gpt-5": {
		ID: "gpt-5", Name: "GPT-5", Provider: "openai", CLI: "copilot",
		Reasoning: 8, Coding: 7, Speed: 8, Context: 8, Creativity: 7,
		CostTier: "medium", CostPerMTok: 8.0,
		TaskTypes: []string{"explain", "debug", "generate"},
		MaxTokens: 8192, ContextSize: 128000,
	},
	"gpt-5.1-codex-mini": {
		ID: "gpt-5.1-codex-mini", Name: "GPT-5.1 Codex Mini", Provider: "openai", CLI: "copilot",
		Reasoning: 6, Coding: 7, Speed: 9, Context: 7, Creativity: 5,
		CostTier: "low", CostPerMTok: 2.0,
		TaskTypes: []string{"simple-fix", "format", "quick-question", "autocomplete"},
		MaxTokens: 4096, ContextSize: 32000,
	},
	"gpt-5-mini": {
		ID: "gpt-5-mini", Name: "GPT-5 Mini", Provider: "openai", CLI: "copilot",
		Reasoning: 5, Coding: 6, Speed: 10, Context: 6, Creativity: 5,
		CostTier: "low", CostPerMTok: 1.5,
		TaskTypes: []string{"quick-question", "format", "simple-explain"},
		MaxTokens: 4096, ContextSize: 32000,
	},
	"gpt-4.1": {
		ID: "gpt-4.1", Name: "GPT-4.1", Provider: "openai", CLI: "copilot",
		Reasoning: 7, Coding: 7, Speed: 8, Context: 7, Creativity: 6,
		CostTier: "medium", CostPerMTok: 5.0,
		TaskTypes: []string{"explain", "debug", "generate"},
		MaxTokens: 8192, ContextSize: 128000,
	},
	"gemini-3-pro-preview": {
		ID: "gemini-3-pro-preview", Name: "Gemini 3 Pro Preview", Provider: "google", CLI: "copilot",
		Reasoning: 8, Coding: 7, Speed: 8, Context: 10, Creativity: 7,
		CostTier: "medium", CostPerMTok: 7.0,
		TaskTypes: []string{"explain", "generate", "analyze", "large-context"},
		MaxTokens: 8192, ContextSize: 1000000,
	},
}

// ClaudeModels defines capabilities for Claude CLI models
var ClaudeModels = map[string]ModelCapability{
	"opus": {
		ID: "opus", Name: "Claude Opus", Provider: "anthropic", CLI: "claude",
		Reasoning: 10, Coding: 10, Speed: 3, Context: 9, Creativity: 10,
		CostTier: "premium", CostPerMTok: 75.0,
		TaskTypes: []string{"architecture", "complex-debug", "design", "refactor-large"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"sonnet": {
		ID: "sonnet", Name: "Claude Sonnet", Provider: "anthropic", CLI: "claude",
		Reasoning: 9, Coding: 9, Speed: 6, Context: 9, Creativity: 8,
		CostTier: "high", CostPerMTok: 15.0,
		TaskTypes: []string{"debug", "refactor", "explain", "generate", "review"},
		MaxTokens: 8192, ContextSize: 200000,
	},
	"haiku": {
		ID: "haiku", Name: "Claude Haiku", Provider: "anthropic", CLI: "claude",
		Reasoning: 6, Coding: 7, Speed: 9, Context: 7, Creativity: 5,
		CostTier: "low", CostPerMTok: 1.0,
		TaskTypes: []string{"explain", "simple-fix", "format", "quick-question"},
		MaxTokens: 8192, ContextSize: 200000,
	},
}

// GetAllModels returns all available models
func GetAllModels() map[string]ModelCapability {
	all := make(map[string]ModelCapability)
	for k, v := range CopilotModels {
		all[k] = v
	}
	for k, v := range ClaudeModels {
		all[k] = v
	}
	return all
}

// GetModelsByCLI returns models available for a specific CLI
func GetModelsByCLI(cli string) []ModelCapability {
	var models []ModelCapability
	
	if cli == "copilot" {
		for _, m := range CopilotModels {
			models = append(models, m)
		}
	} else if cli == "claude" {
		for _, m := range ClaudeModels {
			models = append(models, m)
		}
	}
	
	return models
}

// GetModelsByTaskType returns models best suited for a task type
func GetModelsByTaskType(taskType string) []ModelCapability {
	var suitable []ModelCapability
	
	for _, m := range GetAllModels() {
		for _, t := range m.TaskTypes {
			if t == taskType {
				suitable = append(suitable, m)
				break
			}
		}
	}
	
	return suitable
}

// GetModelsByCostTier returns models in a cost tier
func GetModelsByCostTier(tier string) []ModelCapability {
	var models []ModelCapability
	
	for _, m := range GetAllModels() {
		if m.CostTier == tier {
			models = append(models, m)
		}
	}
	
	return models
}

// RecommendModel suggests the best model based on task complexity and budget
func RecommendModel(complexity int, budgetRemaining float64, availableCLIs []string) *ModelCapability {
	allModels := GetAllModels()
	var candidates []ModelCapability
	
	// Filter by available CLIs
	for _, m := range allModels {
		for _, cli := range availableCLIs {
			if m.CLI == cli {
				candidates = append(candidates, m)
				break
			}
		}
	}
	
	if len(candidates) == 0 {
		return nil
	}
	
	// Score each candidate
	type scored struct {
		model ModelCapability
		score float64
	}
	
	var scored_models []scored
	for _, m := range candidates {
		// Score based on complexity match
		var score float64
		
		// High complexity needs high reasoning/coding
		if complexity >= 8 {
			score = float64(m.Reasoning+m.Coding) / 2.0
		} else if complexity >= 5 {
			score = float64(m.Reasoning+m.Coding+m.Speed) / 3.0
		} else {
			// Low complexity prioritizes speed
			score = float64(m.Speed*2+m.Coding) / 3.0
		}
		
		// Budget penalty for expensive models when budget is low
		if budgetRemaining < 10 && m.CostTier == "premium" {
			score *= 0.3
		} else if budgetRemaining < 50 && m.CostTier == "high" {
			score *= 0.7
		}
		
		// Boost for cost efficiency when budget is constrained
		if budgetRemaining < 100 {
			if m.CostTier == "low" {
				score *= 1.3
			} else if m.CostTier == "medium" {
				score *= 1.1
			}
		}
		
		scored_models = append(scored_models, scored{model: m, score: score})
	}
	
	// Find best
	if len(scored_models) == 0 {
		return nil
	}
	
	best := scored_models[0]
	for _, s := range scored_models[1:] {
		if s.score > best.score {
			best = s
		}
	}
	
	return &best.model
}
