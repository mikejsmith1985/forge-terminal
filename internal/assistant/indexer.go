// Package assistant provides document indexing for RAG.
package assistant

import (
	"context"
	"fmt"
	"io/ioutil"
	"log"
	"os"
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
// DEPRECATED: Use IndexAllContent for comprehensive indexing.
func (idx *Indexer) IndexDocuments(ctx context.Context, docPath string) error {
	return idx.indexByPattern(ctx, docPath, []string{"*.md"}, "markdown")
}

// IndexAllContent indexes documentation, code, configs, and other content.
func (idx *Indexer) IndexAllContent(ctx context.Context, rootPath string, includeGitignored bool) error {
	if rootPath == "" {
		return fmt.Errorf("root path cannot be empty")
	}

	log.Printf("[Indexer] Starting comprehensive indexing from %s", rootPath)
	log.Printf("[Indexer] Include gitignored: %v", includeGitignored)

	totalDocuments := 0
	
	// Index categories
	categories := []struct {
		patterns []string
		name     string
		paths    []string
	}{
		{
			patterns: []string{"*.md"},
			name:     "documentation",
			paths:    []string{"docs", ".", "README.md"},
		},
		{
			patterns: []string{"*.go"},
			name:     "go-source",
			paths:    []string{"cmd", "internal"},
		},
		{
			patterns: []string{"*.js", "*.jsx", "*.ts", "*.tsx"},
			name:     "javascript-source",
			paths:    []string{"frontend/src", "frontend/tests"},
		},
		{
			patterns: []string{"*.json", "*.yaml", "*.yml"},
			name:     "config-files",
			paths:    []string{".", "frontend", "scripts"},
		},
		{
			patterns: []string{"*.sh"},
			name:     "shell-scripts",
			paths:    []string{"scripts", "."},
		},
		{
			patterns: []string{"Makefile", "go.mod", "go.sum", "package.json", "package-lock.json"},
			name:     "build-files",
			paths:    []string{"."},
		},
	}

	for _, cat := range categories {
		log.Printf("[Indexer] Indexing %s...", cat.name)
		for _, searchPath := range cat.paths {
			fullPath := filepath.Join(rootPath, searchPath)
			if _, err := os.Stat(fullPath); os.IsNotExist(err) {
				continue
			}
			count, err := idx.indexPath(ctx, rootPath, fullPath, cat.patterns, includeGitignored)
			if err != nil {
				log.Printf("[Indexer] Warning: Failed to index %s in %s: %v", cat.name, searchPath, err)
				continue
			}
			totalDocuments += count
		}
	}

	// Optionally index gitignored content
	if includeGitignored {
		log.Printf("[Indexer] Indexing gitignored content...")
		gitignored := []struct {
			patterns []string
			name     string
			path     string
		}{
			{
				patterns: []string{"*.md"},
				name:     "session-docs",
				path:     "docs/sessions",
			},
			{
				patterns: []string{"*.json"},
				name:     "forge-configs",
				path:     ".forge",
			},
		}

		for _, gi := range gitignored {
			fullPath := filepath.Join(rootPath, gi.path)
			if _, err := os.Stat(fullPath); os.IsNotExist(err) {
				continue
			}
			count, err := idx.indexPath(ctx, rootPath, fullPath, gi.patterns, true)
			if err != nil {
				log.Printf("[Indexer] Warning: Failed to index %s: %v", gi.name, err)
				continue
			}
			totalDocuments += count
		}
	}

	log.Printf("[Indexer] Successfully indexed %d total document chunks", totalDocuments)

	return nil
}

// indexPath indexes files matching patterns in a specific path
func (idx *Indexer) indexPath(ctx context.Context, rootPath, searchPath string, patterns []string, includeGitignored bool) (int, error) {
	totalDocuments := 0

	err := filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		if info.IsDir() {
			// Skip common directories that shouldn't be indexed
			base := filepath.Base(path)
			if !includeGitignored && (base == "node_modules" || base == "vendor" || base == ".git" || base == "dist" || base == "build") {
				return filepath.SkipDir
			}
			return nil
		}

		// Check if file matches any pattern
		matched := false
		for _, pattern := range patterns {
			if pattern == filepath.Base(path) {
				matched = true
				break
			}
			if m, _ := filepath.Match(pattern, filepath.Base(path)); m {
				matched = true
				break
			}
		}

		if !matched {
			return nil
		}

		// Skip test binaries and compiled artifacts
		if strings.HasSuffix(path, ".test") || strings.HasSuffix(path, ".out") {
			return nil
		}

		// Read file
		content, err := ioutil.ReadFile(path)
		if err != nil {
			log.Printf("[Indexer] Warning: Failed to read %s: %v", path, err)
			return nil
		}

		// Skip binary files
		if isBinary(content) {
			return nil
		}

		// Get relative path for source
		relPath, err := filepath.Rel(rootPath, path)
		if err != nil {
			relPath = path
		}

		// Determine chunk size based on file type
		chunkSize := 512
		if strings.HasSuffix(path, ".go") || strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".ts") {
			chunkSize = 1024 // Larger chunks for code
		}

		// Chunk the document
		chunks := ChunkDocument(string(content), chunkSize)

		if len(chunks) == 0 {
			return nil
		}

		// Embed and index each chunk
		for i, chunk := range chunks {
			// Embed
			vector, err := idx.embeddingsClient.Embed(ctx, chunk)
			if err != nil {
				vector = idx.embeddingsClient.mockEmbed(chunk)
			}

			// Determine file type for metadata
			fileType := getFileType(path)

			// Create document
			doc := Document{
				ID:      fmt.Sprintf("%s_chunk_%d", relPath, i),
				Content: chunk,
				Source:  relPath,
				Vector:  vector,
				Metadata: map[string]string{
					"chunk_index":  fmt.Sprintf("%d", i),
					"total_chunks": fmt.Sprintf("%d", len(chunks)),
					"file_type":    fileType,
				},
			}

			// Index
			if err := idx.vectorStore.Index(doc); err != nil {
				log.Printf("[Indexer] Warning: Failed to index chunk: %v", err)
				return nil
			}

			totalDocuments++
		}

		return nil
	})

	return totalDocuments, err
}

// indexByPattern is a helper for legacy IndexDocuments
func (idx *Indexer) indexByPattern(ctx context.Context, docPath string, patterns []string, category string) error {
	count, err := idx.indexPath(ctx, docPath, docPath, patterns, false)
	if err != nil {
		return err
	}
	log.Printf("[Indexer] Indexed %d chunks from %s", count, category)
	return nil
}

// isBinary checks if content appears to be binary
func isBinary(content []byte) bool {
	if len(content) == 0 {
		return false
	}
	// Check first 512 bytes for null bytes
	checkLen := 512
	if len(content) < checkLen {
		checkLen = len(content)
	}
	for i := 0; i < checkLen; i++ {
		if content[i] == 0 {
			return true
		}
	}
	return false
}

// getFileType returns the file type category
func getFileType(path string) string {
	switch {
	case strings.HasSuffix(path, ".md"):
		return "documentation"
	case strings.HasSuffix(path, ".go"):
		return "go-code"
	case strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".jsx"):
		return "javascript-code"
	case strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".tsx"):
		return "typescript-code"
	case strings.HasSuffix(path, ".json"):
		return "json-config"
	case strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml"):
		return "yaml-config"
	case strings.HasSuffix(path, ".sh"):
		return "shell-script"
	case filepath.Base(path) == "Makefile":
		return "makefile"
	case filepath.Base(path) == "go.mod" || filepath.Base(path) == "go.sum":
		return "go-module"
	case filepath.Base(path) == "package.json" || filepath.Base(path) == "package-lock.json":
		return "npm-package"
	default:
		return "other"
	}
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
