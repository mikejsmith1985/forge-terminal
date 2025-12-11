package assistant

import (
	"strings"
	"testing"
)

func TestChunkDocument(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		chunkSize int
		expectMin int
	}{
		{
			"empty content",
			"",
			512,
			0,
		},
		{
			"single paragraph",
			"This is a test paragraph.",
			512,
			1,
		},
		{
			"long content",
			strings.Repeat("This is a sentence. ", 50),
			512,
			1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chunks := ChunkDocument(tt.content, tt.chunkSize)

			if len(chunks) < tt.expectMin {
				t.Errorf("Expected at least %d chunks, got %d", tt.expectMin, len(chunks))
			}

			// Verify each chunk is non-empty
			for i, chunk := range chunks {
				if strings.TrimSpace(chunk) == "" {
					t.Errorf("Chunk %d is empty", i)
				}
			}
		})
	}
}

func TestChunkDocument_PreservesSemantic(t *testing.T) {
	content := `# Header 1

This is the first paragraph about features.

## Subheader

This is another paragraph with important information.

And this is a follow-up paragraph.`

	chunks := ChunkDocument(content, 512)

	// With large chunk size, should combine most paragraphs
	if len(chunks) < 1 {
		t.Errorf("Expected at least 1 chunk, got %d", len(chunks))
	}

	// Each chunk should contain non-empty content
	for i, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			t.Errorf("Chunk %d is empty", i)
		}
	}
}

func TestNewIndexer(t *testing.T) {
	embeddingsClient := NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text")
	vectorStore := NewVectorStore()

	indexer := NewIndexer(embeddingsClient, vectorStore)

	if indexer == nil {
		t.Fatal("NewIndexer returned nil")
	}

	if indexer.embeddingsClient == nil {
		t.Error("EmbeddingsClient not set")
	}

	if indexer.vectorStore == nil {
		t.Error("VectorStore not set")
	}
}

func TestIndexerStats(t *testing.T) {
	indexer := NewIndexer(
		NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text"),
		NewVectorStore(),
	)

	// Add some test documents
	docs := []Document{
		{
			ID:      "doc1_chunk_0",
			Content: "This is a test document.",
			Source:  "test.md",
			Vector:  []float32{0.1, 0.2},
			Metadata: map[string]string{"chunk_index": "0"},
		},
		{
			ID:      "doc1_chunk_1",
			Content: "This is another chunk.",
			Source:  "test.md",
			Vector:  []float32{0.3, 0.4},
			Metadata: map[string]string{"chunk_index": "1"},
		},
		{
			ID:      "doc2_chunk_0",
			Content: "Different document.",
			Source:  "other.md",
			Vector:  []float32{0.5, 0.6},
			Metadata: map[string]string{"chunk_index": "0"},
		},
	}

	for _, doc := range docs {
		indexer.vectorStore.Index(doc)
	}

	stats := indexer.GetStats()

	if stats.TotalFiles != 2 {
		t.Errorf("Expected 2 files, got %d", stats.TotalFiles)
	}

	if stats.TotalChunks != 3 {
		t.Errorf("Expected 3 chunks, got %d", stats.TotalChunks)
	}

	if stats.AverageChunkSize == 0 {
		t.Error("Expected non-zero average chunk size")
	}
}

func TestChunkDocument_LargeContent(t *testing.T) {
	// Create large content that definitely needs chunking
	largePara := strings.Repeat("This is a sentence about Forge Terminal features. ", 200)
	content := largePara + "\n\n" + largePara + "\n\n" + largePara

	chunks := ChunkDocument(content, 512)

	if len(chunks) < 2 {
		t.Errorf("Large content should produce multiple chunks, got %d", len(chunks))
	}

	// Verify total content is preserved
	combined := strings.Join(chunks, "\n\n")
	// Remove extra whitespace for comparison
	combined = strings.Join(strings.Fields(combined), " ")
	original := strings.Join(strings.Fields(content), " ")

	if combined != original {
		t.Error("Content not preserved during chunking")
	}
}

func TestChunkDocument_WhitespaceHandling(t *testing.T) {
	// Content with irregular whitespace
	content := `First paragraph.


   

Second paragraph.

  Third paragraph.  `

	chunks := ChunkDocument(content, 512)

	// With large chunk size, should combine everything
	if len(chunks) < 1 {
		t.Errorf("Expected at least 1 chunk, got %d", len(chunks))
	}

	// All chunks should have non-empty trimmed content
	for i, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			t.Errorf("Chunk %d is empty after trimming", i)
		}
	}
}

func TestChunkDocument_VerySmallChunkSize(t *testing.T) {
	content := "First paragraph.\n\nSecond paragraph."

	// With very small chunk size, should create many chunks
	chunks := ChunkDocument(content, 10)

	if len(chunks) == 0 {
		t.Error("Expected chunks with small chunk size")
	}

	// Each chunk should still be non-empty
	for i, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			t.Errorf("Chunk %d is empty", i)
		}
	}
}
