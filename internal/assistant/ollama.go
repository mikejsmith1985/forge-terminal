// Package assistant provides AI assistant functionality.
package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// OllamaClient handles communication with Ollama API.
type OllamaClient struct {
	baseURL string
	model   string
	client  *http.Client
}

// OllamaMessage represents a chat message for Ollama.
type OllamaMessage struct {
	Role    string `json:"role"`    // "system", "user", or "assistant"
	Content string `json:"content"`
}

// OllamaChatRequest represents a chat request to Ollama.
type OllamaChatRequest struct {
	Model    string          `json:"model"`
	Messages []OllamaMessage `json:"messages"`
	Stream   bool            `json:"stream"`
}

// OllamaChatResponse represents a response from Ollama.
type OllamaChatResponse struct {
	Model     string        `json:"model"`
	CreatedAt string        `json:"created_at"`
	Message   OllamaMessage `json:"message"`
	Done      bool          `json:"done"`
}

// OllamaTagsResponse represents the list of available models.
type OllamaTagsResponse struct {
	Models []struct {
		Name       string `json:"name"`
		Size       int64  `json:"size"`
		ModifiedAt string `json:"modified_at"`
	} `json:"models"`
}

// NewOllamaClient creates a new Ollama client.
func NewOllamaClient(baseURL, model string) *OllamaClient {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		// Check environment variable first
		model = os.Getenv("FORGE_OLLAMA_MODEL")
		if model == "" {
			model = "mistral:7b-instruct" // More common default
		}
	}

	return &OllamaClient{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// IsAvailable checks if Ollama is running and accessible.
func (c *OllamaClient) IsAvailable(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/tags", nil)
	if err != nil {
		return false
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// GetModels returns the list of available models with metadata.
func (c *OllamaClient) GetModels(ctx context.Context) ([]ModelInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/tags", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama returned status %d", resp.StatusCode)
	}

	var tagsResp OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tagsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	models := make([]ModelInfo, len(tagsResp.Models))
	for i, m := range tagsResp.Models {
		models[i] = enrichModelInfo(m.Name, m.Size)
	}

	return models, nil
}

// SetModel changes the current model.
func (c *OllamaClient) SetModel(model string) {
	c.model = model
}

// GetCurrentModel returns the currently selected model.
func (c *OllamaClient) GetCurrentModel() string {
	return c.model
}

// Chat sends a chat request to Ollama and returns the response.
func (c *OllamaClient) Chat(ctx context.Context, messages []OllamaMessage) (string, error) {
	chatReq := OllamaChatRequest{
		Model:    c.model,
		Messages: messages,
		Stream:   false,
	}

	body, err := json.Marshal(chatReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResp OllamaChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return chatResp.Message.Content, nil
}

// BuildSystemPrompt creates a system prompt using the knowledge base.
func BuildSystemPrompt() string {
	kb := NewKnowledgeBase()
	return kb.GetSystemPrompt()
}

// BuildContextPrompt creates a context-aware prompt from terminal state.
func BuildContextPrompt(ctx *TerminalContext, userMessage string) []OllamaMessage {
	messages := []OllamaMessage{
		{
			Role:    "system",
			Content: BuildSystemPrompt(),
		},
	}

	// Add context if available
	if ctx != nil {
		contextInfo := fmt.Sprintf("Current directory: %s\n", ctx.WorkingDirectory)
		
		if len(ctx.RecentCommands) > 0 {
			contextInfo += "Recent commands:\n"
			for _, cmd := range ctx.RecentCommands {
				contextInfo += fmt.Sprintf("  $ %s\n", cmd)
			}
		}

		if ctx.RecentOutput != "" {
			contextInfo += fmt.Sprintf("\nRecent output:\n%s\n", ctx.RecentOutput)
		}

		messages = append(messages, OllamaMessage{
			Role:    "system",
			Content: "Terminal context:\n" + contextInfo,
		})
	}

	// Add user message
	messages = append(messages, OllamaMessage{
		Role:    "user",
		Content: userMessage,
	})

	return messages
}

// enrichModelInfo adds friendly names and metadata to model names.
func enrichModelInfo(name string, size int64) ModelInfo {
	info := ModelInfo{
		Name:          name,
		FriendlyName:  makeFriendlyName(name),
		Size:          size,
		SizeFormatted: formatSize(size),
		Family:        extractFamily(name),
	}

	// Add performance/quality ratings based on model type
	switch info.Family {
	case "llama", "llama2", "llama3":
		info.Performance = "Balanced"
		info.Quality = "Excellent"
		info.BestFor = "General purpose, code"
	case "mistral":
		info.Performance = "Fast"
		info.Quality = "Excellent"
		info.BestFor = "Code, chat, reasoning"
	case "codellama":
		info.Performance = "Balanced"
		info.Quality = "Excellent"
		info.BestFor = "Code generation"
	case "phi", "phi2", "phi3":
		info.Performance = "Very Fast"
		info.Quality = "Good"
		info.BestFor = "Quick responses, chat"
	case "gemma":
		info.Performance = "Fast"
		info.Quality = "Good"
		info.BestFor = "Chat, general purpose"
	case "qwen", "qwen2":
		info.Performance = "Balanced"
		info.Quality = "Excellent"
		info.BestFor = "Multilingual, code"
	case "deepseek-coder":
		info.Performance = "Balanced"
		info.Quality = "Excellent"
		info.BestFor = "Code generation, debugging"
	default:
		info.Performance = "Unknown"
		info.Quality = "Unknown"
		info.BestFor = "General purpose"
	}

	return info
}

// makeFriendlyName converts model names to friendly display names.
func makeFriendlyName(name string) string {
	// Examples:
	// "mistral:7b-instruct" -> "Mistral 7B Instruct"
	// "llama2:13b" -> "Llama 2 13B"
	// "codellama:7b" -> "CodeLlama 7B"
	
	// This is a simplified version - could be enhanced
	return name
}

// extractFamily extracts the model family from the name.
func extractFamily(name string) string {
	// Extract base model name before colon
	for i, char := range name {
		if char == ':' {
			return name[:i]
		}
	}
	return name
}

// formatSize formats bytes into human-readable format.
func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
