// Package slm provides Ollama integration for SLM routing.
package slm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	ollamaDefaultURL = "http://localhost:11434"
	ollamaTimeout    = 30 * time.Second
)

// Preferred models for routing analysis (in order of preference)
var preferredOllamaModels = []string{
	"qwen2.5:0.5b",
	"qwen2.5:1.5b",
	"qwen2.5:3b",
	"llama3.2:1b",
	"llama3.2:3b",
	"phi3:mini",
	"tinyllama",
}

// OllamaProvider uses a local Ollama instance for SLM analysis.
type OllamaProvider struct {
	baseURL     string
	modelID     string
	available   bool
	initialized bool
	client      *http.Client
}

// NewOllamaProvider creates a new Ollama provider.
func NewOllamaProvider() *OllamaProvider {
	return &OllamaProvider{
		baseURL: ollamaDefaultURL,
		client: &http.Client{
			Timeout: ollamaTimeout,
		},
	}
}

// Name returns the provider identifier.
func (o *OllamaProvider) Name() string {
	return "ollama"
}

// IsAvailable checks if Ollama is running and has a suitable model.
func (o *OllamaProvider) IsAvailable() bool {
	// Quick check - just ping the API
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", o.baseURL+"/api/version", nil)
	if err != nil {
		return false
	}

	resp, err := o.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// Initialize finds and configures a suitable model.
func (o *OllamaProvider) Initialize(ctx context.Context) error {
	if !o.IsAvailable() {
		return fmt.Errorf("ollama not available")
	}

	// List available models
	models, err := o.listModels(ctx)
	if err != nil {
		return fmt.Errorf("failed to list models: %w", err)
	}

	// Find the best available model
	for _, preferred := range preferredOllamaModels {
		for _, available := range models {
			// Check for exact match or prefix match
			if available == preferred || strings.HasPrefix(available, strings.Split(preferred, ":")[0]) {
				o.modelID = available
				o.initialized = true
				o.available = true
				log.Printf("[SLM/Ollama] Using model: %s", o.modelID)
				return nil
			}
		}
	}

	// No preferred model found, but if there's any model, we can try it
	if len(models) > 0 {
		o.modelID = models[0]
		o.initialized = true
		o.available = true
		log.Printf("[SLM/Ollama] Using available model: %s (not in preferred list)", o.modelID)
		return nil
	}

	return fmt.Errorf("no suitable models found in Ollama")
}

// listModels queries Ollama for available models.
func (o *OllamaProvider) listModels(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", o.baseURL+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := o.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	models := make([]string, len(result.Models))
	for i, m := range result.Models {
		models[i] = m.Name
	}

	return models, nil
}

// Analyze uses Ollama to analyze the prompt.
func (o *OllamaProvider) Analyze(ctx context.Context, input PromptContext) (*AnalysisResult, error) {
	if !o.initialized || o.modelID == "" {
		return nil, fmt.Errorf("ollama not initialized")
	}

	start := time.Now()

	// Build the analysis prompt
	prompt := o.buildAnalysisPrompt(input)

	// Call Ollama
	response, err := o.generate(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("ollama generate failed: %w", err)
	}

	// Parse the response
	result, err := o.parseAnalysisResponse(response)
	if err != nil {
		log.Printf("[SLM/Ollama] Failed to parse response, using extracted values: %v", err)
		// Try to extract what we can
		result = o.extractPartialResult(response)
	}

	result.LatencyMs = time.Since(start).Milliseconds()
	result.Provider = "ollama"

	return result, nil
}

// buildAnalysisPrompt creates the prompt for analysis.
func (o *OllamaProvider) buildAnalysisPrompt(input PromptContext) string {
	var sb strings.Builder

	sb.WriteString("Analyze this coding task and predict model requirements.\n\n")
	sb.WriteString("TASK:\n")
	sb.WriteString(input.Prompt)
	sb.WriteString("\n\n")

	sb.WriteString("CONTEXT:\n")
	sb.WriteString(fmt.Sprintf("- Files: %d files", input.FileCount))
	if len(input.FileTypes) > 0 {
		sb.WriteString(fmt.Sprintf(" (%s)", strings.Join(input.FileTypes, ", ")))
	}
	sb.WriteString("\n")
	sb.WriteString(fmt.Sprintf("- Estimated tokens: %d\n", input.EstimatedTokens))
	sb.WriteString(fmt.Sprintf("- Contains error output: %v\n", input.HasErrorOutput))
	sb.WriteString(fmt.Sprintf("- Contains stack trace: %v\n", input.HasStackTrace))

	sb.WriteString("\nRespond with JSON only:\n")
	sb.WriteString(`{"complexity": 1-10, "task_type": "debug|explain|refactor|generate|simple", "iterations": {"haiku": N, "sonnet": N, "opus": N}, "reasoning": "brief explanation"}`)

	return sb.String()
}

// generate calls the Ollama generate API.
func (o *OllamaProvider) generate(ctx context.Context, prompt string) (string, error) {
	payload := map[string]interface{}{
		"model":  o.modelID,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.1, // Low temperature for consistent analysis
			"num_predict": 256, // Short response expected
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		Response string `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Response, nil
}

// parseAnalysisResponse parses the JSON response from the model.
func (o *OllamaProvider) parseAnalysisResponse(response string) (*AnalysisResult, error) {
	// Find JSON in response (model might include extra text)
	start := strings.Index(response, "{")
	end := strings.LastIndex(response, "}")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no valid JSON found in response")
	}

	jsonStr := response[start : end+1]

	var parsed struct {
		Complexity int               `json:"complexity"`
		TaskType   string            `json:"task_type"`
		Iterations map[string]int    `json:"iterations"`
		Reasoning  string            `json:"reasoning"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	// Validate and normalize
	if parsed.Complexity < 1 {
		parsed.Complexity = 1
	}
	if parsed.Complexity > 10 {
		parsed.Complexity = 10
	}

	taskType := TaskType(parsed.TaskType)
	if taskType != TaskDebug && taskType != TaskExplain && 
	   taskType != TaskRefactor && taskType != TaskGenerate && 
	   taskType != TaskSimple {
		taskType = TaskUnknown
	}

	return &AnalysisResult{
		Complexity: parsed.Complexity,
		TaskType:   taskType,
		Iterations: parsed.Iterations,
		Confidence: 0.75, // Higher confidence than heuristics
		Reasoning:  parsed.Reasoning,
	}, nil
}

// extractPartialResult tries to get something useful from an unparseable response.
func (o *OllamaProvider) extractPartialResult(response string) *AnalysisResult {
	// Fallback to heuristic with medium confidence
	engine := GetEngine()
	
	// Try to extract complexity from response text
	complexity := 5 // Default
	if strings.Contains(strings.ToLower(response), "complex") || 
	   strings.Contains(strings.ToLower(response), "difficult") {
		complexity = 7
	} else if strings.Contains(strings.ToLower(response), "simple") ||
	          strings.Contains(strings.ToLower(response), "easy") {
		complexity = 3
	}

	return &AnalysisResult{
		Complexity: complexity,
		TaskType:   TaskUnknown,
		Iterations: engine.estimateIterations(complexity),
		Confidence: 0.5,
		Reasoning:  "Partial extraction from Ollama response",
	}
}

// Shutdown releases resources.
func (o *OllamaProvider) Shutdown() error {
	o.initialized = false
	return nil
}

// Status returns provider state.
func (o *OllamaProvider) Status() EngineStatus {
	return EngineStatus{
		ActiveProvider:  "ollama",
		ModelID:         o.modelID,
		ModelLoaded:     o.initialized,
		OllamaAvailable: o.available,
		OllamaModel:     o.modelID,
	}
}
