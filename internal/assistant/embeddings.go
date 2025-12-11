// Package assistant provides embeddings functionality for RAG.
package assistant

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// EmbeddingsClient handles communication with Ollama embeddings API.
type EmbeddingsClient struct {
	baseURL string
	model   string
	client  *http.Client
}

// EmbeddingsRequest represents a request to Ollama embeddings API.
type EmbeddingsRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

// EmbeddingsResponse represents a response from Ollama embeddings API.
type EmbeddingsResponse struct {
	Embedding []float32 `json:"embedding"`
}

// NewEmbeddingsClient creates a new Ollama embeddings client.
func NewEmbeddingsClient(baseURL, model string) *EmbeddingsClient {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		model = "nomic-embed-text" // Default embedding model
	}

	return &EmbeddingsClient{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// Embed converts text to a vector embedding.
func (c *EmbeddingsClient) Embed(ctx context.Context, text string) ([]float32, error) {
	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	req := EmbeddingsRequest{
		Model:  c.model,
		Prompt: text,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		log.Printf("[Embeddings] Ollama unavailable, using hash-based fallback")
		return nil, fmt.Errorf("ollama unavailable")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[Embeddings] Ollama error: %s, using hash-based fallback", string(bodyBytes))
		return nil, fmt.Errorf("ollama error: %s", string(bodyBytes))
	}

	var embResp EmbeddingsResponse
	if err := json.NewDecoder(resp.Body).Decode(&embResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(embResp.Embedding) == 0 {
		return nil, fmt.Errorf("received empty embedding from Ollama")
	}

	return embResp.Embedding, nil
}

// MockEmbed creates a deterministic embedding using MD5 hash for testing/fallback.
// This allows RAG to work without Ollama embeddings service.
func (c *EmbeddingsClient) MockEmbed(text string) []float32 {
	// Create a deterministic 384-dim vector from text hash
	hash := md5.Sum([]byte(text))
	
	// Start with 384 dims (typical for nomic-embed-text)
	dims := 384
	vector := make([]float32, dims)
	
	// Use hash bytes to seed deterministic values
	for i := 0; i < dims; i++ {
		// Mix hash with index
		bytesNeeded := make([]byte, 8)
		binary.LittleEndian.PutUint32(bytesNeeded, uint32(i))
		copy(bytesNeeded[4:], hash[:4])
		
		// Create float from hash
		hashByte := hash[i%len(hash)]
		vector[i] = (float32(hashByte) - 128.0) / 256.0
	}
	
	return vector
}

// mockEmbed (deprecated) - use MockEmbed instead
func (c *EmbeddingsClient) mockEmbed(text string) []float32 {
	return c.MockEmbed(text)
}

// EmbedBatch converts multiple texts to vector embeddings.
func (c *EmbeddingsClient) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, fmt.Errorf("texts cannot be empty")
	}

	results := make([][]float32, len(texts))

	for i, text := range texts {
		embedding, err := c.Embed(ctx, text)
		if err != nil {
			return nil, fmt.Errorf("failed to embed text %d: %w", i, err)
		}
		results[i] = embedding
	}

	return results, nil
}

// IsAvailable checks if Ollama embeddings are available.
func (c *EmbeddingsClient) IsAvailable(ctx context.Context) bool {
	// Try to embed a test string
	_, err := c.Embed(ctx, "test")
	return err == nil
}

// EnsureModelAvailable ensures the embedding model is pulled and available.
// Returns true if model is ready, false if using hash-based fallback.
func (c *EmbeddingsClient) EnsureModelAvailable(ctx context.Context) bool {
	// Quick test to see if model works
	testEmbed, err := c.Embed(ctx, "test")
	if err == nil && len(testEmbed) > 0 {
		log.Printf("[Embeddings] Model %s is available", c.model)
		return true
	}

	// Model not available, try to pull it
	log.Printf("[Embeddings] Attempting to pull model %s...", c.model)
	pullReq := struct {
		Name string `json:"name"`
	}{Name: c.model}

	body, _ := json.Marshal(pullReq)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/pull", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Embeddings] Failed to create pull request: %v", err)
		return false
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		log.Printf("[Embeddings] Failed to pull model: %v", err)
		return false
	}
	defer resp.Body.Close()

	// Read response to completion (pull is streaming)
	_, _ = io.ReadAll(resp.Body)

	// Test again after pull
	testEmbed, err = c.Embed(ctx, "test")
	if err == nil && len(testEmbed) > 0 {
		log.Printf("[Embeddings] Model %s is now available", c.model)
		return true
	}

	log.Printf("[Embeddings] Model pull completed but embeddings still unavailable")
	return false
}

// GetDimensions returns the vector dimension of embeddings.
func (c *EmbeddingsClient) GetDimensions(ctx context.Context) (int, error) {
	embedding, err := c.Embed(ctx, "dimension test")
	if err != nil {
		return 0, err
	}
	return len(embedding), nil
}
