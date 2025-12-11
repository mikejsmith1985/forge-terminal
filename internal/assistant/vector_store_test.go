package assistant

import (
	"os"
	"testing"
)

func TestNewVectorStore(t *testing.T) {
	vs := NewVectorStore()

	if vs == nil {
		t.Fatal("NewVectorStore returned nil")
	}

	if vs.Count() != 0 {
		t.Errorf("Expected 0 documents, got %d", vs.Count())
	}

	if vs.threshold != 0.3 {
		t.Errorf("Expected threshold 0.3, got %f", vs.threshold)
	}
}

func TestVectorStore_Index(t *testing.T) {
	vs := NewVectorStore()

	doc := Document{
		ID:      "doc1",
		Content: "test content",
		Source:  "test.md",
		Vector:  []float32{0.1, 0.2, 0.3},
	}

	err := vs.Index(doc)
	if err != nil {
		t.Errorf("Failed to index document: %v", err)
	}

	if vs.Count() != 1 {
		t.Errorf("Expected 1 document, got %d", vs.Count())
	}
}

func TestVectorStore_IndexValidation(t *testing.T) {
	vs := NewVectorStore()

	tests := []struct {
		name    string
		doc     Document
		wantErr bool
	}{
		{
			"empty ID",
			Document{ID: "", Content: "test", Source: "test.md", Vector: []float32{0.1}},
			true,
		},
		{
			"empty content",
			Document{ID: "doc1", Content: "", Source: "test.md", Vector: []float32{0.1}},
			true,
		},
		{
			"empty vector",
			Document{ID: "doc1", Content: "test", Source: "test.md", Vector: []float32{}},
			true,
		},
		{
			"valid document",
			Document{ID: "doc1", Content: "test", Source: "test.md", Vector: []float32{0.1}},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := vs.Index(tt.doc)
			if (err != nil) != tt.wantErr {
				t.Errorf("Index() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestVectorStore_IndexDuplicateID(t *testing.T) {
	vs := NewVectorStore()

	doc1 := Document{
		ID:      "doc1",
		Content: "content1",
		Source:  "test.md",
		Vector:  []float32{0.1, 0.2},
	}

	doc2 := Document{
		ID:      "doc1", // Same ID
		Content: "content2",
		Source:  "test.md",
		Vector:  []float32{0.3, 0.4},
	}

	err := vs.Index(doc1)
	if err != nil {
		t.Fatalf("Failed to index first document: %v", err)
	}

	err = vs.Index(doc2)
	if err == nil {
		t.Error("Expected error for duplicate ID, got nil")
	}
}

func TestVectorStore_Search(t *testing.T) {
	vs := NewVectorStore()

	// Index some documents with normalized vectors for predictable similarity
	docs := []Document{
		{
			ID:      "doc1",
			Content: "The quick brown fox",
			Source:  "test.md",
			Vector:  []float32{1.0, 0.0, 0.0}, // Orthogonal to doc2
		},
		{
			ID:      "doc2",
			Content: "Something completely different",
			Source:  "test.md",
			Vector:  []float32{0.0, 1.0, 0.0}, // Orthogonal to query and doc1
		},
		{
			ID:      "doc3",
			Content: "Another quick brown fox",
			Source:  "test.md",
			Vector:  []float32{1.0, 0.0, 0.0}, // Same as doc1
		},
	}

	for _, doc := range docs {
		vs.Index(doc)
	}

	// Search with query identical to doc1 and doc3
	query := []float32{1.0, 0.0, 0.0}
	results, err := vs.Search(query, 2)

	if err != nil {
		t.Errorf("Search failed: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(results))
	}

	// Both doc1 and doc3 should have similarity 1.0
	if results[0].Similarity < 0.99 || results[1].Similarity < 0.99 {
		t.Errorf("Expected high similarity scores, got %f and %f", results[0].Similarity, results[1].Similarity)
	}
}

func TestVectorStore_SearchValidation(t *testing.T) {
	vs := NewVectorStore()

	tests := []struct {
		name    string
		query   []float32
		limit   int
		wantErr bool
	}{
		{"empty query", []float32{}, 1, true},
		{"zero limit", []float32{0.1}, 0, true},
		{"negative limit", []float32{0.1}, -1, true},
		{"valid query", []float32{0.1}, 1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := vs.Search(tt.query, tt.limit)
			if (err != nil) != tt.wantErr {
				t.Errorf("Search() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestVectorStore_GetDocument(t *testing.T) {
	vs := NewVectorStore()

	doc := Document{
		ID:      "doc1",
		Content: "test",
		Source:  "test.md",
		Vector:  []float32{0.1},
	}

	vs.Index(doc)

	retrieved := vs.GetDocument("doc1")
	if retrieved == nil {
		t.Fatal("Expected to find document, got nil")
	}

	if retrieved.ID != "doc1" {
		t.Errorf("Expected ID doc1, got %s", retrieved.ID)
	}

	notFound := vs.GetDocument("nonexistent")
	if notFound != nil {
		t.Error("Expected nil for nonexistent document")
	}
}

func TestVectorStore_SetThreshold(t *testing.T) {
	vs := NewVectorStore()

	tests := []struct {
		threshold float32
		wantErr   bool
	}{
		{-0.1, true},
		{0.0, false},
		{0.5, false},
		{1.0, false},
		{1.1, true},
	}

	for _, tt := range tests {
		err := vs.SetThreshold(tt.threshold)
		if (err != nil) != tt.wantErr {
			t.Errorf("SetThreshold(%f) error = %v, wantErr %v", tt.threshold, err, tt.wantErr)
		}
	}
}

func TestVectorStore_Clear(t *testing.T) {
	vs := NewVectorStore()

	doc := Document{
		ID:      "doc1",
		Content: "test",
		Source:  "test.md",
		Vector:  []float32{0.1},
	}

	vs.Index(doc)

	if vs.Count() != 1 {
		t.Errorf("Expected 1 document before clear, got %d", vs.Count())
	}

	vs.Clear()

	if vs.Count() != 0 {
		t.Errorf("Expected 0 documents after clear, got %d", vs.Count())
	}
}

func TestVectorStore_Persistence(t *testing.T) {
	// Create temp file
	tmpfile, err := os.CreateTemp("", "vectorstore-*.json")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	defer os.Remove(tmpfile.Name())

	// Create and save
	vs1 := NewVectorStore()
	doc := Document{
		ID:      "doc1",
		Content: "test content",
		Source:  "test.md",
		Vector:  []float32{0.1, 0.2, 0.3},
		Metadata: map[string]string{"key": "value"},
	}

	vs1.Index(doc)

	err = vs1.Save(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to save: %v", err)
	}

	// Load into new store
	vs2 := NewVectorStore()
	err = vs2.Load(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to load: %v", err)
	}

	if vs2.Count() != 1 {
		t.Errorf("Expected 1 document after load, got %d", vs2.Count())
	}

	loaded := vs2.GetDocument("doc1")
	if loaded == nil {
		t.Fatal("Document not found after load")
	}

	if loaded.Content != "test content" {
		t.Errorf("Expected content 'test content', got %s", loaded.Content)
	}
}

func TestVectorStore_ListBySource(t *testing.T) {
	vs := NewVectorStore()

	docs := []Document{
		{ID: "doc1", Content: "test1", Source: "file1.md", Vector: []float32{0.1}},
		{ID: "doc2", Content: "test2", Source: "file2.md", Vector: []float32{0.2}},
		{ID: "doc3", Content: "test3", Source: "file1.md", Vector: []float32{0.3}},
	}

	for _, doc := range docs {
		vs.Index(doc)
	}

	file1Docs := vs.ListBySource("file1.md")
	if len(file1Docs) != 2 {
		t.Errorf("Expected 2 documents for file1.md, got %d", len(file1Docs))
	}

	file2Docs := vs.ListBySource("file2.md")
	if len(file2Docs) != 1 {
		t.Errorf("Expected 1 document for file2.md, got %d", len(file2Docs))
	}
}

func TestVectorStore_GetSources(t *testing.T) {
	vs := NewVectorStore()

	docs := []Document{
		{ID: "doc1", Content: "test1", Source: "file1.md", Vector: []float32{0.1}},
		{ID: "doc2", Content: "test2", Source: "file2.md", Vector: []float32{0.2}},
		{ID: "doc3", Content: "test3", Source: "file1.md", Vector: []float32{0.3}},
	}

	for _, doc := range docs {
		vs.Index(doc)
	}

	sources := vs.GetSources()
	if len(sources) != 2 {
		t.Errorf("Expected 2 sources, got %d", len(sources))
	}

	// Check that both sources are present
	sourceMap := make(map[string]bool)
	for _, source := range sources {
		sourceMap[source] = true
	}

	if !sourceMap["file1.md"] || !sourceMap["file2.md"] {
		t.Error("Expected both file1.md and file2.md in sources")
	}
}

func TestCosineSimilarity(t *testing.T) {
	tests := []struct {
		name     string
		a, b     []float32
		minScore float32
		maxScore float32
	}{
		{
			"identical vectors",
			[]float32{1, 0, 0},
			[]float32{1, 0, 0},
			0.99, 1.0,
		},
		{
			"orthogonal vectors",
			[]float32{1, 0, 0},
			[]float32{0, 1, 0},
			-0.01, 0.01,
		},
		{
			"similar vectors (0.9, 0.1 vs 1, 0)",
			[]float32{1, 0, 0},
			[]float32{0.9, 0.1, 0},
			0.98, 1.0,
		},
		{
			"opposite vectors",
			[]float32{1, 0, 0},
			[]float32{-1, 0, 0},
			-1.01, -0.99,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cosineSimilarity(tt.a, tt.b)
			if result < tt.minScore || result > tt.maxScore {
				t.Errorf("cosineSimilarity(%v, %v) = %f, expected between %f and %f", 
					tt.a, tt.b, result, tt.minScore, tt.maxScore)
			}
		})
	}
}
