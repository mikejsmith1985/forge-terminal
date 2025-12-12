// Package assistant provides RAG (Retrieval Augmented Generation) functionality.
package assistant

import (
	"context"
	"fmt"
	"log"
	"strings"
)

// RAGEngine combines embeddings, vector search, and chat for RAG-based responses.
type RAGEngine struct {
	embeddingsClient *EmbeddingsClient
	vectorStore      *VectorStore
	ollamaClient     *OllamaClient
	knowledgeBase    *KnowledgeBase
}

// RAGConfig holds configuration for the RAG engine.
type RAGConfig struct {
	TopK              int     // Number of documents to retrieve
	Threshold         float32 // Similarity threshold
	IncludeKnowledge  bool    // Include knowledge base in prompt
	MaxContextLength  int     // Maximum context to inject
	FallbackToKB      bool    // Fall back to KB if RAG unavailable
}

// DefaultRAGConfig returns sensible defaults.
func DefaultRAGConfig() RAGConfig {
	return RAGConfig{
		TopK:             5,
		Threshold:        0.3,
		IncludeKnowledge: true,
		MaxContextLength: 4000,
		FallbackToKB:     true,
	}
}

// NewRAGEngine creates a new RAG engine.
func NewRAGEngine(
	embeddingsClient *EmbeddingsClient,
	vectorStore *VectorStore,
	ollamaClient *OllamaClient,
	knowledgeBase *KnowledgeBase,
) *RAGEngine {
	return &RAGEngine{
		embeddingsClient: embeddingsClient,
		vectorStore:      vectorStore,
		ollamaClient:     ollamaClient,
		knowledgeBase:    knowledgeBase,
	}
}

// ContextualChat sends a question with RAG-retrieved context.
func (r *RAGEngine) ContextualChat(
	ctx context.Context,
	userMessage string,
	config RAGConfig,
) (*ChatResponse, error) {
	if userMessage == "" {
		return nil, fmt.Errorf("user message cannot be empty")
	}

	// Build enhanced prompt with RAG context
	prompt, err := r.buildEnhancedPrompt(ctx, userMessage, config)
	if err != nil {
		log.Printf("[RAG] Error building enhanced prompt: %v", err)
		if !config.FallbackToKB {
			return nil, err
		}
		// Fall back to knowledge base only
		prompt = r.buildKnowledgeBasePrompt(userMessage)
	}

	// Parse messages from prompt
	messages := []OllamaMessage{
		{
			Role:    "system",
			Content: prompt,
		},
		{
			Role:    "user",
			Content: userMessage,
		},
	}

	// Send to Ollama
	response, err := r.ollamaClient.Chat(ctx, messages)
	if err != nil {
		return nil, fmt.Errorf("ollama chat failed: %w", err)
	}

	return &ChatResponse{
		Message: response,
	}, nil
}

// buildEnhancedPrompt builds a prompt with RAG context.
func (r *RAGEngine) buildEnhancedPrompt(
	ctx context.Context,
	userMessage string,
	config RAGConfig,
) (string, error) {
	var prompt strings.Builder

	// Start with knowledge base
	if config.IncludeKnowledge && r.knowledgeBase != nil {
		prompt.WriteString(r.knowledgeBase.GetSystemPrompt())
	}

	// Try to add RAG context
	if r.vectorStore != nil && r.vectorStore.Count() > 0 {
		ragContext, err := r.retrieveContext(ctx, userMessage, config)
		if err != nil {
			log.Printf("[RAG] Warning: Failed to retrieve context: %v", err)
			// Don't fail, just use knowledge base
		} else if ragContext != "" {
			prompt.WriteString("\n\n# RELEVANT DOCUMENTATION\n\n")
			prompt.WriteString(ragContext)
		}
	}

	return prompt.String(), nil
}

// buildKnowledgeBasePrompt builds a prompt with only knowledge base (fallback).
func (r *RAGEngine) buildKnowledgeBasePrompt(userMessage string) string {
	if r.knowledgeBase == nil {
		return fmt.Sprintf("You are a helpful assistant.\n\nUser: %s", userMessage)
	}
	return r.knowledgeBase.GetSystemPrompt()
}

// retrieveContext retrieves relevant documents from the vector store.
func (r *RAGEngine) retrieveContext(
	ctx context.Context,
	userMessage string,
	config RAGConfig,
) (string, error) {
	if r.vectorStore == nil || r.vectorStore.Count() == 0 {
		return "", nil
	}

	// Embed the user message
	queryVector, err := r.embeddingsClient.Embed(ctx, userMessage)
	if err != nil {
		return "", fmt.Errorf("failed to embed query: %w", err)
	}

	// Search for relevant documents
	results, err := r.vectorStore.Search(queryVector, config.TopK)
	if err != nil {
		return "", fmt.Errorf("failed to search vector store: %w", err)
	}

	if len(results) == 0 {
		return "", nil
	}

	// Build context string
	var context strings.Builder
	currentLength := 0

	for i, result := range results {
		if currentLength >= config.MaxContextLength {
			break
		}

		// Format the document with source and similarity
		doc := fmt.Sprintf("[%d] From %s (relevance: %.1f%%)\n%s\n\n",
			i+1,
			result.Document.Source,
			result.Similarity*100,
			result.Document.Content,
		)

		currentLength += len(doc)
		context.WriteString(doc)
	}

	return context.String(), nil
}

// IndexDocuments indexes documents from a file system path.
// DEPRECATED: Use IndexAllContent for comprehensive indexing.
func (r *RAGEngine) IndexDocuments(ctx context.Context, docPath string) error {
	if r.embeddingsClient == nil || r.vectorStore == nil {
		return fmt.Errorf("RAG engine not fully initialized")
	}

	indexer := NewIndexer(r.embeddingsClient, r.vectorStore)

	log.Printf("[RAG] Starting document indexing from %s", docPath)
	err := indexer.IndexDocuments(ctx, docPath)
	if err != nil {
		return fmt.Errorf("failed to index documents: %w", err)
	}

	stats := indexer.GetStats()
	log.Printf("[RAG] Indexing complete: %d files, %d chunks, avg size %d bytes",
		stats.TotalFiles,
		stats.TotalChunks,
		stats.AverageChunkSize,
	)

	return nil
}

// IndexAllContent indexes entire codebase including docs, code, configs, and optionally gitignored content.
func (r *RAGEngine) IndexAllContent(ctx context.Context, rootPath string, includeGitignored bool) error {
	if r.embeddingsClient == nil || r.vectorStore == nil {
		return fmt.Errorf("RAG engine not fully initialized")
	}

	indexer := NewIndexer(r.embeddingsClient, r.vectorStore)

	log.Printf("[RAG] Starting comprehensive indexing from %s (includeGitignored=%v)", rootPath, includeGitignored)
	err := indexer.IndexAllContent(ctx, rootPath, includeGitignored)
	if err != nil {
		return fmt.Errorf("failed to index all content: %w", err)
	}

	stats := indexer.GetStats()
	log.Printf("[RAG] Comprehensive indexing complete: %d files, %d chunks, avg size %d bytes",
		stats.TotalFiles,
		stats.TotalChunks,
		stats.AverageChunkSize,
	)

	return nil
}

// SaveIndex persists the vector store to disk.
func (r *RAGEngine) SaveIndex(path string) error {
	if r.vectorStore == nil {
		return fmt.Errorf("vector store not initialized")
	}

	log.Printf("[RAG] Saving index to %s", path)
	return r.vectorStore.Save(path)
}

// LoadIndex loads the vector store from disk.
func (r *RAGEngine) LoadIndex(path string) error {
	if r.vectorStore == nil {
		return fmt.Errorf("vector store not initialized")
	}

	log.Printf("[RAG] Loading index from %s", path)
	return r.vectorStore.Load(path)
}

// GetStats returns statistics about the indexed documents.
func (r *RAGEngine) GetStats() map[string]interface{} {
	if r.vectorStore == nil {
		return map[string]interface{}{"error": "vector store not initialized"}
	}

	docs := r.vectorStore.ListDocuments()
	sources := r.vectorStore.GetSources()

	totalChars := 0
	for _, doc := range docs {
		totalChars += len(doc.Content)
	}

	avgChunkSize := 0
	if len(docs) > 0 {
		avgChunkSize = totalChars / len(docs)
	}

	return map[string]interface{}{
		"indexed_files":      len(sources),
		"total_chunks":       len(docs),
		"total_characters":   totalChars,
		"average_chunk_size": avgChunkSize,
		"threshold":          r.vectorStore.threshold,
	}
}

// IsReady checks if the RAG engine is ready to use.
func (r *RAGEngine) IsReady() bool {
	return r.embeddingsClient != nil &&
		r.vectorStore != nil &&
		r.ollamaClient != nil &&
		r.vectorStore.Count() > 0
}

// EnsureEmbeddingsAvailable ensures the embedding model is available.
// Returns true if model is ready, false if using fallback.
func (r *RAGEngine) EnsureEmbeddingsAvailable(ctx context.Context) bool {
	if r.embeddingsClient == nil {
		log.Printf("[RAG] Embeddings client not initialized")
		return false
	}
	log.Printf("[RAG] Ensuring embeddings model is available...")
	result := r.embeddingsClient.EnsureModelAvailable(ctx)
	log.Printf("[RAG] Embeddings availability check complete: %v", result)
	return result
}

// Health checks the status of all RAG components.
func (r *RAGEngine) Health(ctx context.Context) map[string]interface{} {
	health := map[string]interface{}{
		"embeddings": false,
		"vectorstore": false,
		"ollama": false,
		"ready": false,
	}

	if r.embeddingsClient != nil {
		health["embeddings"] = r.embeddingsClient.IsAvailable(ctx)
	}

	if r.vectorStore != nil {
		health["vectorstore"] = r.vectorStore.Count() > 0
	}

	if r.ollamaClient != nil {
		health["ollama"] = r.ollamaClient.IsAvailable(ctx)
	}

	// Ready if embeddings, vector store has data, and ollama available
	health["ready"] = health["embeddings"].(bool) &&
		health["vectorstore"].(bool) &&
		health["ollama"].(bool)

	return health
}
