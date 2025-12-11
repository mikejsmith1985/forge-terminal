// Package assistant provides document indexing for RAG.
package assistant

import (
	"context"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"strings"
)

// Indexer builds vector indexes from documents.
type Indexer struct {
	embeddingsClient *EmbeddingsClient
	vectorStore      *VectorStore
}

// NewIndexer creates a new document indexer.
func NewIndexer(embeddingsClient *EmbeddingsClient, vectorStore *VectorStore) *Indexer {
	return &Indexer{
		embeddingsClient: embeddingsClient,
		vectorStore:      vectorStore,
	}
}

// IndexDocuments indexes all markdown documents from a directory.
func (idx *Indexer) IndexDocuments(ctx context.Context, docPath string) error {
	if docPath == "" {
		return fmt.Errorf("document path cannot be empty")
	}

	// Find all markdown files
	files, err := filepath.Glob(filepath.Join(docPath, "**", "*.md"))
	if err != nil {
		return fmt.Errorf("failed to find markdown files: %w", err)
	}

	if len(files) == 0 {
		return fmt.Errorf("no markdown files found in %s", docPath)
	}

	log.Printf("[Indexer] Found %d markdown files to index", len(files))

	totalDocuments := 0

	for _, file := range files {
		// Read file
		content, err := ioutil.ReadFile(file)
		if err != nil {
			log.Printf("[Indexer] Warning: Failed to read %s: %v", file, err)
			continue
		}

		// Get relative path for source
		relPath, err := filepath.Rel(docPath, file)
		if err != nil {
			relPath = file
		}

		// Chunk the document
		chunks := ChunkDocument(string(content), 512)

		if len(chunks) == 0 {
			log.Printf("[Indexer] Warning: No chunks from %s", file)
			continue
		}

		log.Printf("[Indexer] Indexing %s (%d chunks)", relPath, len(chunks))

		// Embed and index each chunk
		for i, chunk := range chunks {
			// Embed
			vector, err := idx.embeddingsClient.Embed(ctx, chunk)
			if err != nil {
				// Use fallback embedding
				log.Printf("[Indexer] Real embeddings unavailable for chunk %d, using hash-based fallback", i)
				vector = idx.embeddingsClient.mockEmbed(chunk)
			}

			// Create document
			doc := Document{
				ID:      fmt.Sprintf("%s_chunk_%d", relPath, i),
				Content: chunk,
				Source:  relPath,
				Vector:  vector,
				Metadata: map[string]string{
					"chunk_index": fmt.Sprintf("%d", i),
					"total_chunks": fmt.Sprintf("%d", len(chunks)),
				},
			}

			// Index
			if err := idx.vectorStore.Index(doc); err != nil {
				log.Printf("[Indexer] Warning: Failed to index chunk: %v", err)
				continue
			}

			totalDocuments++
		}
	}

	log.Printf("[Indexer] Successfully indexed %d document chunks", totalDocuments)

	return nil
}

// ChunkDocument splits text into chunks of approximately chunkSize tokens.
// Preserves semantic boundaries by splitting on paragraphs and sentences.
func ChunkDocument(content string, chunkSize int) []string {
	if content == "" {
		return []string{}
	}

	// Split on double newlines (paragraphs) first
	paragraphs := strings.Split(content, "\n\n")

	var chunks []string
	var currentChunk strings.Builder

	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}

		// Rough token estimate (1 token ≈ 4 chars)
		currentSize := currentChunk.Len()
		paraSize := len(para)
		currentTokens := currentSize / 4
		paraTokens := paraSize / 4

		// If adding this paragraph exceeds chunk size AND we have something, start new
		if currentSize > 0 && (currentTokens+paraTokens) > chunkSize {
			chunk := currentChunk.String()
			if strings.TrimSpace(chunk) != "" {
				chunks = append(chunks, chunk)
			}
			currentChunk.Reset()
		}

		// Add paragraph to current chunk
		if currentChunk.Len() > 0 {
			currentChunk.WriteString("\n\n")
		}
		currentChunk.WriteString(para)
	}

	// Add remaining chunk
	if currentChunk.Len() > 0 {
		chunk := currentChunk.String()
		if strings.TrimSpace(chunk) != "" {
			chunks = append(chunks, chunk)
		}
	}

	// If no chunks were created but we have content, return it as a single chunk
	if len(chunks) == 0 && strings.TrimSpace(content) != "" {
		chunks = append(chunks, strings.TrimSpace(content))
	}

	return chunks
}

// IndexerStats holds statistics about indexing.
type IndexerStats struct {
	TotalFiles      int
	TotalChunks     int
	TotalVectors    int
	AverageChunkSize int
}

// GetStats returns statistics about indexed documents.
func (idx *Indexer) GetStats() IndexerStats {
	docs := idx.vectorStore.ListDocuments()

	stats := IndexerStats{
		TotalChunks: len(docs),
	}

	// Calculate unique files
	sources := idx.vectorStore.GetSources()
	stats.TotalFiles = len(sources)

	// Calculate average chunk size
	if len(docs) > 0 {
		totalSize := 0
		for _, doc := range docs {
			totalSize += len(doc.Content)
		}
		stats.AverageChunkSize = totalSize / len(docs)
	}

	return stats
}
