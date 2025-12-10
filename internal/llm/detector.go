// Package llm provides LLM command detection for AI CLI tools.
package llm

import (
	"log"
	"regexp"
	"strings"
)

// Provider represents an LLM CLI provider.
type Provider string

const (
	ProviderGitHubCopilot Provider = "github-copilot"
	ProviderClaude        Provider = "claude"
	ProviderAider         Provider = "aider"
	ProviderUnknown       Provider = "unknown"
)

// CommandType represents the type of LLM command.
type CommandType string

const (
	CommandChat    CommandType = "chat"
	CommandSuggest CommandType = "suggest"
	CommandExplain CommandType = "explain"
	CommandCode    CommandType = "code"
	CommandUnknown CommandType = "unknown"
)

// DetectedCommand represents a detected LLM command.
type DetectedCommand struct {
	Provider Provider
	Type     CommandType
	Prompt   string
	RawInput string
	Detected bool
}

// LLMPattern defines a detection pattern for an LLM CLI.
type LLMPattern struct {
	Name    string
	Regex   *regexp.Regexp
	Extract func(string) (Provider, CommandType)
}

// Detector handles LLM command detection.
type Detector struct {
	patterns []*LLMPattern
}

// NewDetector creates a new LLM detector with all supported patterns.
func NewDetector() *Detector {
	d := &Detector{
		patterns: []*LLMPattern{
			// Exact command patterns (highest priority)
			{
				Name:  "copilot-standalone",
				Regex: regexp.MustCompile(`(?i)^copilot(\s|$)`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderGitHubCopilot, CommandChat
				},
			},
			{
				Name:  "gh-copilot-suggest",
				Regex: regexp.MustCompile(`(?i)^gh\s+copilot\s+suggest`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderGitHubCopilot, CommandSuggest
				},
			},
			{
				Name:  "gh-copilot-explain",
				Regex: regexp.MustCompile(`(?i)^gh\s+copilot\s+explain`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderGitHubCopilot, CommandExplain
				},
			},
			{
				Name:  "gh-copilot",
				Regex: regexp.MustCompile(`(?i)^gh\s+copilot`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderGitHubCopilot, CommandChat
				},
			},
			{
				Name:  "claude-standalone",
				Regex: regexp.MustCompile(`(?i)^claude\s*$`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderClaude, CommandChat
				},
			},
			{
				Name:  "claude-code",
				Regex: regexp.MustCompile(`(?i)^claude\s+code`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderClaude, CommandCode
				},
			},
			{
				Name:  "aider",
				Regex: regexp.MustCompile(`(?i)^aider`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderAider, CommandCode
				},
			},
			// Path-based patterns (fallback for shell-resolved commands)
			{
				Name:  "copilot-path",
				Regex: regexp.MustCompile(`(?i)/copilot(\s|$)`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderGitHubCopilot, CommandChat
				},
			},
			{
				Name:  "claude-path",
				Regex: regexp.MustCompile(`(?i)/claude(\s|$)`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderClaude, CommandChat
				},
			},
			{
				Name:  "aider-path",
				Regex: regexp.MustCompile(`(?i)/aider(\s|$)`),
				Extract: func(cmd string) (Provider, CommandType) {
					return ProviderAider, CommandCode
				},
			},
		},
	}
	return d
}

// DetectCommand analyzes input to determine if it's an LLM command.
func (d *Detector) DetectCommand(input string) *DetectedCommand {
	trimmed := strings.TrimSpace(input)

	log.Printf("[LLM Detector] ═══ DETECTION START ═══")
	log.Printf("[LLM Detector] Raw input: '%s' (len=%d)", input, len(input))
	log.Printf("[LLM Detector] Trimmed: '%s' (len=%d)", trimmed, len(trimmed))
	log.Printf("[LLM Detector] Hex: % X", []byte(trimmed))
	log.Printf("[LLM Detector] Testing %d patterns...", len(d.patterns))

	for i, pattern := range d.patterns {
		log.Printf("[LLM Detector] [%d/%d] Testing pattern '%s'...", i+1, len(d.patterns), pattern.Name)
		
		if pattern.Regex.MatchString(trimmed) {
			provider, cmdType := pattern.Extract(trimmed)
			log.Printf("[LLM Detector] ✅ MATCH! pattern='%s' provider=%s type=%s", pattern.Name, provider, cmdType)
			log.Printf("[LLM Detector] ═══ DETECTION END (MATCHED) ═══")
			return &DetectedCommand{
				Provider: provider,
				Type:     cmdType,
				Prompt:   "",
				RawInput: input,
				Detected: true,
			}
		} else {
			log.Printf("[LLM Detector] ✗ No match for pattern '%s'", pattern.Name)
		}
	}

	log.Printf("[LLM Detector] ❌ NO PATTERNS MATCHED")
	log.Printf("[LLM Detector] ═══ DETECTION END (NO MATCH) ═══")
	return &DetectedCommand{
		Provider: ProviderUnknown,
		Type:     CommandUnknown,
		RawInput: input,
		Detected: false,
	}
}

// IsLLMCommand checks if input is an LLM command.
func (d *Detector) IsLLMCommand(input string) bool {
	return d.DetectCommand(input).Detected
}

// IsLLMProcess checks if a process name/command line is an LLM CLI.
func (d *Detector) IsLLMProcess(cmdLine string) (bool, Provider, CommandType) {
	result := d.DetectCommand(cmdLine)
	return result.Detected, result.Provider, result.Type
}

// Global detector instance for convenience.
var globalDetector = NewDetector()

// DetectCommand uses the global detector.
func DetectCommand(input string) *DetectedCommand {
	return globalDetector.DetectCommand(input)
}

// IsLLMCommand uses the global detector.
func IsLLMCommand(input string) bool {
	return globalDetector.IsLLMCommand(input)
}
