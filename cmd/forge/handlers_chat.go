package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

type ChatRequest struct {
	Message      string   `json:"message"`
	TabID        string   `json:"tabId"`
	ContextFiles []string `json:"contextFiles"` // File paths for @ mentions (v3.3.6)
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		http.Error(w, "Message required", http.StatusBadRequest)
		return
	}

	tabID := req.TabID
	if tabID == "" || tabID == "default" {
		tabID = "main"
	}

	log.Printf("[Chat API] Processing message: %s (tabId: %s, contextFiles: %d)", req.Message, tabID, len(req.ContextFiles))

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	// Build file context from @ mentions (v3.3.6 Deep Context)
	fileContext := buildFileContext(req.ContextFiles)

	context, err := buildChatContext(tabID)
	if err != nil {
		log.Printf("[Chat API] Warning: failed to build context: %v", err)
		context = ""
	}

	// Combine file context with terminal context
	if fileContext != "" {
		if context != "" {
			context = fileContext + "\n\n---\n\n" + context
		} else {
			context = fileContext
		}
	}

	fullPrompt := buildChatPrompt(req.Message, context)

	log.Printf("[Chat API] Full prompt length: %d chars", len(fullPrompt))

	tier := llm.ClassifyTask(req.Message)
	log.Printf("[Chat API] Classified to tier: %s", tier)

	// Map tier to model name for routing header
	modelName := getModelForTier(tier)

	// Set the routing header so frontend can display which model was used
	w.Header().Set("X-Forge-Routed-To", modelName)
	log.Printf("[Chat API] Routed to model: %s", modelName)

	provider := "auto"
	if os.Getenv("LLM_PROVIDER") != "" {
		provider = os.Getenv("LLM_PROVIDER")
	}

	if err := streamChatResponse(w, fullPrompt, provider); err != nil {
		log.Printf("[Chat API] Stream error: %v", err)
	}
}

// buildFileContext reads files from @ mentions and formats them for the prompt (v3.3.6)
func buildFileContext(filePaths []string) string {
	if len(filePaths) == 0 {
		return ""
	}

	var contextParts []string
	for _, filePath := range filePaths {
		// Clean the path (remove @ prefix if present)
		cleanPath := strings.TrimPrefix(filePath, "@")
		cleanPath = strings.TrimSpace(cleanPath)

		if cleanPath == "" {
			continue
		}

		log.Printf("[Chat API] Reading context file: %s", cleanPath)

		// Read the file
		content, err := os.ReadFile(cleanPath)
		if err != nil {
			// File not found or error - include error message
			log.Printf("[Chat API] Failed to read file %s: %v", cleanPath, err)
			contextParts = append(contextParts, fmt.Sprintf("--- CONTEXT FILE: %s ---\n[File not found: %v]", cleanPath, err))
			continue
		}

		// Limit file size to prevent huge prompts (max 100KB per file)
		maxSize := 100 * 1024
		fileContent := string(content)
		if len(fileContent) > maxSize {
			fileContent = fileContent[:maxSize] + "\n... [truncated - file too large]"
		}

		contextParts = append(contextParts, fmt.Sprintf("--- CONTEXT FILE: %s ---\n%s", cleanPath, fileContent))
		log.Printf("[Chat API] Added context file: %s (%d bytes)", cleanPath, len(fileContent))
	}

	if len(contextParts) == 0 {
		return ""
	}

	return strings.Join(contextParts, "\n\n")
}

func buildChatContext(tabID string) (string, error) {
	var contextParts []string

	stateStore := am.GetStateStore(tabID)
	if stateStore != nil {
		snapshots := stateStore.GetAllSnapshots()
		recentContent := extractRecentLines(snapshots, 50)
		if recentContent != "" {
			contextParts = append(contextParts, "Recent Terminal Output:\n"+recentContent)
		}
	}

	amDir := am.DefaultAMDir()
	insights, err := vision.LoadInsights(amDir, tabID)
	if err == nil && len(insights) > 0 {
		latestInsight := insights[len(insights)-1]
		if latestInsight != nil {
			summary := formatInsightSummary(latestInsight)
			if summary != "" {
				contextParts = append(contextParts, "Recent Analysis:\n"+summary)
			}
		}
	}

	if len(contextParts) == 0 {
		return "", nil
	}

	return strings.Join(contextParts, "\n\n---\n\n"), nil
}

func extractRecentLines(snapshots []am.StateSnapshot, lineCount int) string {
	if len(snapshots) == 0 {
		return ""
	}

	latest := snapshots[len(snapshots)-1]
	lines := strings.Split(latest.CleanedContent, "\n")

	if len(lines) <= lineCount {
		return latest.CleanedContent
	}

	start := len(lines) - lineCount
	return strings.Join(lines[start:], "\n")
}

func formatInsightSummary(insight *vision.Insight) string {
	if insight == nil {
		return ""
	}

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("Last activity at: %s\n", insight.Timestamp.Format("2006-01-02 15:04:05")))

	if insight.Message != "" {
		buf.WriteString(fmt.Sprintf("Type: %s - %s\n", insight.Type, insight.Message))
	}

	return buf.String()
}

func buildChatPrompt(userMessage string, context string) string {
	var prompt strings.Builder

	prompt.WriteString("You are Forge Terminal's AI assistant. You help developers with terminal commands, debugging, and code questions.\n\n")

	if context != "" {
		prompt.WriteString("=== TERMINAL CONTEXT ===\n")
		prompt.WriteString(context)
		prompt.WriteString("\n\n=== USER MESSAGE ===\n")
	}

	prompt.WriteString(userMessage)

	return prompt.String()
}

func streamChatResponse(w http.ResponseWriter, prompt string, provider string) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming not supported")
	}

	if os.Getenv("SKIP_LLM") == "true" {
		mockResponse := "This is a mock response. To enable real LLM responses, set LLM credentials in environment variables."
		_, err := io.WriteString(w, mockResponse)
		if err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		fallbackMsg := "AI assistant is not configured. Please set ANTHROPIC_API_KEY environment variable."
		_, err := io.WriteString(w, fallbackMsg)
		if err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	claudeURL := "https://api.anthropic.com/v1/messages"
	payload := map[string]interface{}{
		"model": "claude-3-5-sonnet-20241022",
		"max_tokens": 2048,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": prompt,
			},
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", claudeURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fallback := fmt.Sprintf("Error calling Claude API: %v", err)
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[Chat API] Claude API error: %d - %s", resp.StatusCode, string(bodyBytes))
		fallback := fmt.Sprintf("Claude API error: %d", resp.StatusCode)
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[Chat API] Failed to decode Claude response: %v", err)
		fallback := "Failed to parse Claude response"
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}

	if len(result.Content) == 0 {
		_, _ = io.WriteString(w, "No response from Claude")
		flusher.Flush()
		return nil
	}

	responseText := result.Content[0].Text
	_, err = io.WriteString(w, responseText)
	if err != nil {
		return err
	}

	flusher.Flush()
	return nil
}

// getModelForTier maps LLM tier to model name for routing display
func getModelForTier(tier llm.ModelTier) string {
	switch tier {
	case llm.TierHaiku:
		return "gpt-4o-mini" // Standard tier for quick tasks
	case llm.TierSonnet:
		return "gpt-4o" // Advanced tier for balanced tasks
	case llm.TierOpus:
		return "claude-3-5-sonnet" // Expert tier for complex tasks
	default:
		return "gpt-4o-mini" // Default to standard
	}
}
