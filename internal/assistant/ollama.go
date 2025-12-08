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
		Name string `json:"name"`
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

// GetModels returns the list of available models.
func (c *OllamaClient) GetModels(ctx context.Context) ([]string, error) {
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

	models := make([]string, len(tagsResp.Models))
	for i, m := range tagsResp.Models {
		models[i] = m.Name
	}

	return models, nil
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

// BuildSystemPrompt creates a system prompt for the assistant.
func BuildSystemPrompt() string {
	return `You are a helpful terminal assistant integrated into Forge Terminal.
You help users with command-line tasks by:
1. Understanding their terminal context (current directory, recent commands, output)
2. Suggesting appropriate commands
3. Explaining command-line concepts clearly

When suggesting commands:
- Provide a single, clear command
- Explain what it does briefly
- Only suggest safe, common commands
- If a task requires multiple steps, list them clearly

Keep responses concise and actionable. Focus on being helpful and accurate.`
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
