package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewOllamaClient(t *testing.T) {
	tests := []struct {
		name        string
		baseURL     string
		model       string
		wantBaseURL string
		wantModel   string
	}{
		{
			name:        "with custom values",
			baseURL:     "http://localhost:12345",
			model:       "llama2",
			wantBaseURL: "http://localhost:12345",
			wantModel:   "llama2",
		},
		{
			name:        "with defaults",
			baseURL:     "",
			model:       "",
			wantBaseURL: "http://localhost:11434",
			wantModel:   "mistral:7b-instruct",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewOllamaClient(tt.baseURL, tt.model)
			if client.baseURL != tt.wantBaseURL {
				t.Errorf("baseURL = %v, want %v", client.baseURL, tt.wantBaseURL)
			}
			if client.model != tt.wantModel {
				t.Errorf("model = %v, want %v", client.model, tt.wantModel)
			}
		})
	}
}

func TestOllamaClient_IsAvailable(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		want       bool
	}{
		{
			name:       "available",
			statusCode: http.StatusOK,
			want:       true,
		},
		{
			name:       "unavailable",
			statusCode: http.StatusServiceUnavailable,
			want:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/tags" {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				w.WriteHeader(tt.statusCode)
				json.NewEncoder(w).Encode(OllamaTagsResponse{})
			}))
			defer server.Close()

			client := NewOllamaClient(server.URL, "test-model")
			ctx := context.Background()

			got := client.IsAvailable(ctx)
			if got != tt.want {
				t.Errorf("IsAvailable() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOllamaClient_GetModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		resp := OllamaTagsResponse{
			Models: []struct {
				Name       string `json:"name"`
				Size       int64  `json:"size"`
				ModifiedAt string `json:"modified_at"`
			}{
				{Name: "llama2", Size: 1024, ModifiedAt: "2023-01-01"},
				{Name: "codellama:7b", Size: 2048, ModifiedAt: "2023-01-02"},
			},
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL, "test-model")
	ctx := context.Background()

	models, err := client.GetModels(ctx)
	if err != nil {
		t.Fatalf("GetModels() error = %v", err)
	}

	if len(models) != 2 {
		t.Errorf("GetModels() returned %d models, want 2", len(models))
	}

	if models[0].Name != "llama2" {
		t.Errorf("models[0].Name = %v, want llama2", models[0].Name)
	}
}

func TestOllamaClient_Chat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		var req OllamaChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("failed to decode request: %v", err)
		}

		if req.Model != "test-model" {
			t.Errorf("model = %v, want test-model", req.Model)
		}

		resp := OllamaChatResponse{
			Model: "test-model",
			Message: OllamaMessage{
				Role:    "assistant",
				Content: "Hello! I can help with that.",
			},
			Done: true,
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL, "test-model")
	ctx := context.Background()

	messages := []OllamaMessage{
		{Role: "user", Content: "Hello"},
	}

	response, err := client.Chat(ctx, messages)
	if err != nil {
		t.Fatalf("Chat() error = %v", err)
	}

	expected := "Hello! I can help with that."
	if response != expected {
		t.Errorf("Chat() = %v, want %v", response, expected)
	}
}

func TestBuildSystemPrompt(t *testing.T) {
	prompt := BuildSystemPrompt()
	if prompt == "" {
		t.Error("BuildSystemPrompt() returned empty string")
	}

	// Check for key phrases
	if !contains(prompt, "Forge Assistant") && !contains(prompt, "terminal assistant") {
		t.Error("system prompt should mention 'Forge Assistant' or 'terminal assistant'")
	}
	if !contains(prompt, "command") {
		t.Error("system prompt should mention 'command'")
	}
}

func TestBuildContextPrompt(t *testing.T) {
	ctx := &TerminalContext{
		WorkingDirectory: "/home/user/project",
		RecentCommands:   []string{"ls -la", "git status"},
		RecentOutput:     "On branch main",
		SessionID:        "test-session",
	}

	messages := BuildContextPrompt(ctx, "How do I commit?")

	if len(messages) != 3 {
		t.Errorf("BuildContextPrompt() returned %d messages, want 3", len(messages))
	}

	// Check system prompt
	if messages[0].Role != "system" {
		t.Errorf("first message role = %v, want system", messages[0].Role)
	}

	// Check context
	if messages[1].Role != "system" {
		t.Errorf("second message role = %v, want system", messages[1].Role)
	}
	if !contains(messages[1].Content, "/home/user/project") {
		t.Error("context should include working directory")
	}

	// Check user message
	if messages[2].Role != "user" {
		t.Errorf("third message role = %v, want user", messages[2].Role)
	}
	if messages[2].Content != "How do I commit?" {
		t.Errorf("user message = %v, want 'How do I commit?'", messages[2].Content)
	}
}

func TestBuildContextPrompt_NoContext(t *testing.T) {
	messages := BuildContextPrompt(nil, "Hello")

	if len(messages) != 2 {
		t.Errorf("BuildContextPrompt() with nil context returned %d messages, want 2", len(messages))
	}

	// Should have system prompt and user message only
	if messages[0].Role != "system" {
		t.Errorf("first message role = %v, want system", messages[0].Role)
	}
	if messages[1].Role != "user" {
		t.Errorf("second message role = %v, want user", messages[1].Role)
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && len(s) >= len(substr) && 
		(s == substr || findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
