package assistant

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestNewRAGEngine(t *testing.T) {
	embClient := NewEmbeddingsClient("http://localhost:11434", "nomic-embed-text")
	vectorStore := NewVectorStore()
	ollamaClient := NewOllamaClient("http://localhost:11434", "mistral")
	kb := NewKnowledgeBase()

	ragEngine := NewRAGEngine(embClient, vectorStore, ollamaClient, kb)

	if ragEngine == nil {
		t.Fatal("NewRAGEngine returned nil")
	}

	// RAG engine is not ready until it has indexed documents
	if ragEngine.IsReady() {
		t.Error("RAG engine should not be ready with empty vector store")
	}

	// Add a document to make it ready
	ragEngine.vectorStore.Index(Document{
		ID:      "test",
		Content: "test",
		Source:  "test.md",
		Vector:  []float32{0.1},
	})

	if !ragEngine.IsReady() {
		t.Error("RAG engine should be ready after indexing document")
	}
}

func TestDefaultRAGConfig(t *testing.T) {
	config := DefaultRAGConfig()

	if config.TopK != 5 {
		t.Errorf("Expected TopK=5, got %d", config.TopK)
	}

	if config.Threshold != 0.3 {
		t.Errorf("Expected Threshold=0.3, got %f", config.Threshold)
	}

	if !config.IncludeKnowledge {
		t.Error("Expected IncludeKnowledge=true")
	}

	if !config.FallbackToKB {
		t.Error("Expected FallbackToKB=true")
	}
}

func TestRAGEngine_IsReady(t *testing.T) {
	tests := []struct {
		name          string
		setupRAG      func() *RAGEngine
		expectedReady bool
	}{
		{
			"nil components",
			func() *RAGEngine {
				return NewRAGEngine(nil, nil, nil, nil)
			},
			false,
		},
		{
			"empty vector store",
			func() *RAGEngine {
				return NewRAGEngine(
					NewEmbeddingsClient("", ""),
					NewVectorStore(),
					NewOllamaClient("", ""),
					NewKnowledgeBase(),
				)
			},
			false,
		},
		{
			"vector store with data",
			func() *RAGEngine {
				vs := NewVectorStore()
				vs.Index(Document{
					ID:      "test",
					Content: "test",
					Source:  "test.md",
					Vector:  []float32{0.1},
				})
				return NewRAGEngine(
					NewEmbeddingsClient("", ""),
					vs,
					NewOllamaClient("", ""),
					NewKnowledgeBase(),
				)
			},
			true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rag := tt.setupRAG()
			if rag.IsReady() != tt.expectedReady {
				t.Errorf("Expected IsReady()=%v, got %v", tt.expectedReady, rag.IsReady())
			}
		})
	}
}

func TestRAGEngine_GetStats(t *testing.T) {
	ragEngine := NewRAGEngine(
		NewEmbeddingsClient("", ""),
		NewVectorStore(),
		NewOllamaClient("", ""),
		NewKnowledgeBase(),
	)

	// Add test documents
	docs := []Document{
		{
			ID:      "doc1_chunk_0",
			Content: "This is test content with some length",
			Source:  "test1.md",
			Vector:  []float32{0.1, 0.2},
		},
		{
			ID:      "doc1_chunk_1",
			Content: "More test content here",
			Source:  "test1.md",
			Vector:  []float32{0.3, 0.4},
		},
		{
			ID:      "doc2_chunk_0",
			Content: "Different file content",
			Source:  "test2.md",
			Vector:  []float32{0.5, 0.6},
		},
	}

	for _, doc := range docs {
		ragEngine.vectorStore.Index(doc)
	}

	stats := ragEngine.GetStats()

	if files, ok := stats["indexed_files"].(int); !ok || files != 2 {
		t.Errorf("Expected 2 indexed files, got %v", stats["indexed_files"])
	}

	if chunks, ok := stats["total_chunks"].(int); !ok || chunks != 3 {
		t.Errorf("Expected 3 total chunks, got %v", stats["total_chunks"])
	}

	if avgSize, ok := stats["average_chunk_size"].(int); !ok || avgSize == 0 {
		t.Error("Expected non-zero average chunk size")
	}
}

func TestRAGEngine_BuildKnowledgeBasePrompt(t *testing.T) {
	kb := NewKnowledgeBase()
	ragEngine := NewRAGEngine(nil, nil, nil, kb)

	prompt := ragEngine.buildKnowledgeBasePrompt("test question")

	if !strings.Contains(prompt, "Forge Assistant") {
		t.Error("Prompt should contain Forge Assistant reference")
	}

	if !strings.Contains(prompt, "CORE FEATURES") {
		t.Error("Prompt should contain features section")
	}
}

func TestRAGEngine_Health(t *testing.T) {
	ragEngine := NewRAGEngine(
		NewEmbeddingsClient("", ""),
		NewVectorStore(),
		NewOllamaClient("", ""),
		NewKnowledgeBase(),
	)

	ctx := context.Background()
	health := ragEngine.Health(ctx)

	if _, ok := health["embeddings"]; !ok {
		t.Error("Health should include embeddings status")
	}

	if _, ok := health["vectorstore"]; !ok {
		t.Error("Health should include vectorstore status")
	}

	if _, ok := health["ollama"]; !ok {
		t.Error("Health should include ollama status")
	}

	if _, ok := health["ready"]; !ok {
		t.Error("Health should include ready status")
	}
}

func TestRAGEngine_SaveLoad(t *testing.T) {
	// Create RAG engine with data
	rag1 := NewRAGEngine(
		NewEmbeddingsClient("", ""),
		NewVectorStore(),
		NewOllamaClient("", ""),
		NewKnowledgeBase(),
	)

	doc := Document{
		ID:      "test",
		Content: "test content",
		Source:  "test.md",
		Vector:  []float32{0.1, 0.2},
		Metadata: map[string]string{"key": "value"},
	}

	rag1.vectorStore.Index(doc)

	// Save
	tmpfile := "/tmp/rag-test-index.json"
	err := rag1.SaveIndex(tmpfile)
	if err != nil {
		t.Fatalf("Failed to save index: %v", err)
	}

	// Create new RAG engine and load
	rag2 := NewRAGEngine(
		NewEmbeddingsClient("", ""),
		NewVectorStore(),
		NewOllamaClient("", ""),
		NewKnowledgeBase(),
	)

	err = rag2.LoadIndex(tmpfile)
	if err != nil {
		t.Fatalf("Failed to load index: %v", err)
	}

	if rag2.vectorStore.Count() != 1 {
		t.Errorf("Expected 1 document after load, got %d", rag2.vectorStore.Count())
	}

	loaded := rag2.vectorStore.GetDocument("test")
	if loaded == nil {
		t.Error("Document not found after load")
	}

	if loaded.Content != "test content" {
		t.Errorf("Expected content 'test content', got %s", loaded.Content)
	}

	// Cleanup
	_ = os.Remove(tmpfile)
}
