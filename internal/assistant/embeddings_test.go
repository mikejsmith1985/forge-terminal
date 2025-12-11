package assistant

import (
	"context"
	"encoding/json"
	"testing"
)

func TestNewEmbeddingsClient(t *testing.T) {
	client := NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text")

	if client == nil {
		t.Fatal("NewEmbeddingsClient returned nil")
	}

	if client.baseURL != "http://localhost:11434" {
		t.Errorf("Expected baseURL http://localhost:11434, got %s", client.baseURL)
	}

	if client.model != "nomic-embed-text" {
		t.Errorf("Expected model nomic-embed-text, got %s", client.model)
	}
}

func TestNewEmbeddingsClientDefaults(t *testing.T) {
	client := NewEmbeddingsClient("", "")

	if client.baseURL != "http://localhost:11434" {
		t.Errorf("Expected default baseURL http://localhost:11434, got %s", client.baseURL)
	}

	if client.model != "nomic-embed-text" {
		t.Errorf("Expected default model nomic-embed-text, got %s", client.model)
	}
}

func TestEmbedValidatesInput(t *testing.T) {
	client := NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text")
	ctx := context.Background()

	_, err := client.Embed(ctx, "")
	if err == nil {
		t.Error("Expected error for empty text, got nil")
	}
}

func TestEmbedBatchValidatesInput(t *testing.T) {
	client := NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text")
	ctx := context.Background()

	_, err := client.EmbedBatch(ctx, []string{})
	if err == nil {
		t.Error("Expected error for empty texts, got nil")
	}
}

// Note: Full integration tests for Embed() require running Ollama
// These would be:
// - TestEmbed_Success (requires Ollama running)
// - TestEmbedBatch_Success (requires Ollama running)
// - TestIsAvailable (requires Ollama running)
// - TestGetDimensions (requires Ollama running)

// For now, we test the validation and structure
func TestEmbeddingsResponseStructure(t *testing.T) {
	// Verify the response type can be marshaled/unmarshaled
	resp := EmbeddingsResponse{
		Embedding: []float32{0.1, 0.2, 0.3},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Errorf("Failed to marshal EmbeddingsResponse: %v", err)
	}

	var unmarshaled EmbeddingsResponse
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Errorf("Failed to unmarshal EmbeddingsResponse: %v", err)
	}

	if len(unmarshaled.Embedding) != 3 {
		t.Errorf("Expected 3 values, got %d", len(unmarshaled.Embedding))
	}
}

func TestEmbeddingsRequestStructure(t *testing.T) {
	req := EmbeddingsRequest{
		Model:  "nomic-embed-text",
		Prompt: "test prompt",
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Errorf("Failed to marshal EmbeddingsRequest: %v", err)
	}

	var unmarshaled EmbeddingsRequest
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Errorf("Failed to unmarshal EmbeddingsRequest: %v", err)
	}

	if unmarshaled.Model != "nomic-embed-text" {
		t.Errorf("Expected model nomic-embed-text, got %s", unmarshaled.Model)
	}

	if unmarshaled.Prompt != "test prompt" {
		t.Errorf("Expected prompt 'test prompt', got %s", unmarshaled.Prompt)
	}
}
