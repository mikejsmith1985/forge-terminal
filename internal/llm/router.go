// Package llm provides model tier routing for intelligent model selection.
package llm

import (
	"log"
	"regexp"
	"strings"
	"sync"
)

// ModelTier represents the complexity tier for LLM selection.
type ModelTier string

const (
	TierHaiku  ModelTier = "Haiku"  // Fast, lightweight tasks (quick edits, tests, linting)
	TierSonnet ModelTier = "Sonnet" // Balanced tasks (refactoring, debugging, code review)
	TierOpus   ModelTier = "Opus"   // Complex tasks (architecture, design, system-level changes)
)

// Tool represents an LLM tool with its configuration
type Tool struct {
	Name  string
	Tier  ModelTier
	Model string
}

// TaskClassifier analyzes input to determine the appropriate model tier.
type TaskClassifier struct {
	architecturePatterns []*regexp.Regexp
	refactorPatterns     []*regexp.Regexp
	quickTaskPatterns    []*regexp.Regexp
}

// Router provides intelligent model selection based on prompt analysis
type Router struct {
	mu         sync.RWMutex
	classifier *TaskClassifier
	config     *ConfigLoader
	tools      map[ModelTier]Tool
}

// NewRouter creates a new router with default configuration
// Model names are tier descriptors, not hardcoded model IDs - actual model selection
// is handled by the CLI or configured by the user in forge.toml/~/.copilot/config.json
func NewRouter(configLoader *ConfigLoader) *Router {
	return &Router{
		classifier: NewTaskClassifier(),
		config:     configLoader,
		tools: map[ModelTier]Tool{
			TierHaiku: {
				Name:  "fast",
				Tier:  TierHaiku,
				Model: "auto", // Let CLI choose
			},
			TierSonnet: {
				Name:  "balanced",
				Tier:  TierSonnet,
				Model: "auto", // Let CLI choose
			},
			TierOpus: {
				Name:  "advanced",
				Tier:  TierOpus,
				Model: "auto", // Let CLI choose
			},
		},
	}
}

// SelectTool analyzes the prompt and selects the appropriate LLM tool
// Heuristic: if prompt has "debug", "error", "@" file references -> Tier 3 (Opus)
// Otherwise, use pattern-based classification
func (r *Router) SelectTool(prompt string) Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	prompt = strings.TrimSpace(prompt)

	log.Printf("[Router] Selecting tool for prompt: %s", prompt)

	// Priority heuristics for Active Engineer mode
	// Check for error/debug keywords
	lowerPrompt := strings.ToLower(prompt)
	if strings.Contains(lowerPrompt, "debug") ||
	   strings.Contains(lowerPrompt, "error") ||
	   strings.Contains(lowerPrompt, "fix bug") ||
	   strings.Contains(lowerPrompt, "troubleshoot") {
		log.Printf("[Router] Heuristic match: debug/error keywords -> Opus")
		tier := TierOpus
		if tool, ok := r.tools[tier]; ok {
			return tool
		}
	}

	// Check for @ file references (Active Engineer context injection)
	if strings.Contains(prompt, "[@") || strings.Contains(prompt, "@") {
		log.Printf("[Router] Heuristic match: @ file reference -> Opus")
		tier := TierOpus
		if tool, ok := r.tools[tier]; ok {
			return tool
		}
	}

	// Use classifier for general pattern matching
	tier := r.classifier.ClassifyTask(prompt)

	if tool, ok := r.tools[tier]; ok {
		log.Printf("[Router] Classified as tier %s, selected tool: %s", tier, tool.Name)
		return tool
	}

	// Fallback to Sonnet
	log.Printf("[Router] Fallback to Sonnet")
	return r.tools[TierSonnet]
}

// NewTaskClassifier creates a new task classifier with predefined patterns.
func NewTaskClassifier() *TaskClassifier {
	return &TaskClassifier{
		architecturePatterns: []*regexp.Regexp{
			// Architecture keywords - require deep understanding
			regexp.MustCompile(`(?i)\b(architect|design|system|structure|blueprint|schema|infrastructure|framework)\b`),
			regexp.MustCompile(`(?i)\b(scalability|performance|optimization|bottleneck|microservice|monolith)\b`),
			regexp.MustCompile(`(?i)\b(database\s+design|data\s+model|entity\s+relationship|ER\s+diagram)\b`),
			regexp.MustCompile(`(?i)\b(security\s+audit|threat\s+model|attack\s+vector|vulnerability)\b`),
			regexp.MustCompile(`(?i)\b(distributed\s+system|load\s+balancing|clustering|sharding)\b`),
			regexp.MustCompile(`(?i)\b(protocol\s+design|API\s+design|interface\s+design)\b`),
		},
		refactorPatterns: []*regexp.Regexp{
			// Refactoring keywords - require code understanding
			regexp.MustCompile(`(?i)\b(refactor|restructure|reorganize|improve|cleanup|simplify)\b`),
			regexp.MustCompile(`(?i)\b(debug|fix\s+bug|troubleshoot|investigate|diagnose)\b`),
			regexp.MustCompile(`(?i)\b(code\s+review|review\s+code|pull\s+request|PR\s+review)\b`),
			regexp.MustCompile(`(?i)\b(optimize|enhance|upgrade|migrate|convert)\b`),
			regexp.MustCompile(`(?i)\b(implement|add\s+feature|new\s+functionality|extend)\b`),
		},
		quickTaskPatterns: []*regexp.Regexp{
			// Quick task keywords - simple, fast operations
			regexp.MustCompile(`(?i)\b(test|lint|format|validate|check)\b`),
			regexp.MustCompile(`(?i)\b(typo|spelling|syntax|whitespace|indentation)\b`),
			regexp.MustCompile(`(?i)\b(comment|document|explain|describe)\b`),
			regexp.MustCompile(`(?i)\b(rename|move\s+file|delete\s+file|copy)\b`),
			regexp.MustCompile(`(?i)\b(git\s+commit|git\s+status|git\s+log|git\s+diff)\b`),
			regexp.MustCompile(`(?i)\b(list|show|display|print|echo)\b`),
		},
	}
}

// ClassifyTask analyzes the input text and returns the recommended model tier.
func (tc *TaskClassifier) ClassifyTask(input string) ModelTier {
	input = strings.TrimSpace(input)

	log.Printf("[ModelRouter] Classifying task: %s", input)

	// Check architecture patterns first (highest priority)
	for _, pattern := range tc.architecturePatterns {
		if pattern.MatchString(input) {
			log.Printf("[ModelRouter] Matched architecture pattern: %s -> Opus", pattern.String())
			return TierOpus
		}
	}

	// Check quick task patterns (lowest priority, highest speed)
	for _, pattern := range tc.quickTaskPatterns {
		if pattern.MatchString(input) {
			log.Printf("[ModelRouter] Matched quick task pattern: %s -> Haiku", pattern.String())
			return TierHaiku
		}
	}

	// Check refactor patterns (middle tier)
	for _, pattern := range tc.refactorPatterns {
		if pattern.MatchString(input) {
			log.Printf("[ModelRouter] Matched refactor pattern: %s -> Sonnet", pattern.String())
			return TierSonnet
		}
	}

	// Default to Sonnet for balanced performance
	log.Printf("[ModelRouter] No specific pattern matched -> defaulting to Sonnet")
	return TierSonnet
}

// Global classifier instance
var globalClassifier = NewTaskClassifier()

// ClassifyTask uses the global classifier.
func ClassifyTask(input string) ModelTier {
	return globalClassifier.ClassifyTask(input)
}

// GetModelRecommendation provides a human-readable recommendation.
func GetModelRecommendation(tier ModelTier) string {
	switch tier {
	case TierOpus:
		return "Complex architectural task detected. Recommending Opus 4.5 for deep analysis."
	case TierSonnet:
		return "Balanced task detected. Recommending Sonnet 4 for efficient processing."
	case TierHaiku:
		return "Quick task detected. Recommending Haiku 3.5 for fast completion."
	default:
		return "Unknown task type. Defaulting to Sonnet 4."
	}
}
