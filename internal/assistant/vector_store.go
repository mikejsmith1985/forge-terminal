// Package assistant provides vector storage and semantic search for RAG.
package assistant

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"math"
	"sort"
)

// Document represents a chunk of indexed text with its embedding.
type Document struct {
	ID       string             `json:"id"`
	Content  string             `json:"content"`
	Source   string             `json:"source"`     // e.g., "README.md", "docs/developer/features.md"
	Vector   []float32          `json:"vector"`     // Embedding vector
	Metadata map[string]string  `json:"metadata"`   // Additional metadata
}

// SearchResult represents a document with its similarity score.
type SearchResult struct {
	Document  *Document
	Similarity float32
}

// VectorStore manages document storage and semantic search.
type VectorStore struct {
	documents []Document
	threshold float32 // Cosine similarity threshold (0.0-1.0)
}

// NewVectorStore creates a new vector store.
func NewVectorStore() *VectorStore {
	return &VectorStore{
		documents: make([]Document, 0),
		threshold: 0.3, // Default threshold: 30% similarity
	}
}

// Index adds a document to the store.
func (vs *VectorStore) Index(doc Document) error {
	if doc.ID == "" {
		return fmt.Errorf("document ID cannot be empty")
	}

	if len(doc.Vector) == 0 {
		return fmt.Errorf("document vector cannot be empty")
	}

	if doc.Content == "" {
		return fmt.Errorf("document content cannot be empty")
	}

	// Check for duplicate ID
	for _, existing := range vs.documents {
		if existing.ID == doc.ID {
			return fmt.Errorf("document with ID %q already exists", doc.ID)
		}
	}

	vs.documents = append(vs.documents, doc)
	return nil
}

// Search finds documents semantically similar to the query vector.
// Returns top N documents sorted by similarity score (highest first).
func (vs *VectorStore) Search(queryVector []float32, limit int) ([]SearchResult, error) {
	if len(queryVector) == 0 {
		return nil, fmt.Errorf("query vector cannot be empty")
	}

	if limit <= 0 {
		return nil, fmt.Errorf("limit must be positive")
	}

	if len(vs.documents) == 0 {
		return []SearchResult{}, nil
	}

	// Validate vector dimensions match
	firstDim := len(vs.documents[0].Vector)
	if len(queryVector) != firstDim {
		return nil, fmt.Errorf("query vector dimension %d doesn't match store dimension %d",
			len(queryVector), firstDim)
	}

	// Calculate similarity for all documents
	results := make([]SearchResult, 0, len(vs.documents))

	for _, doc := range vs.documents {
		similarity := cosineSimilarity(queryVector, doc.Vector)

		// Only include documents above threshold
		if similarity >= vs.threshold {
			docCopy := doc // Create a copy
			results = append(results, SearchResult{
				Document:   &docCopy,
				Similarity: similarity,
			})
		}
	}

	// Sort by similarity (highest first)
	sort.Slice(results, func(i, j int) bool {
		return results[i].Similarity > results[j].Similarity
	})

	// Limit results
	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// GetDocument retrieves a document by ID.
func (vs *VectorStore) GetDocument(id string) *Document {
	for i, doc := range vs.documents {
		if doc.ID == id {
			return &vs.documents[i]
		}
	}
	return nil
}

// Count returns the number of documents in the store.
func (vs *VectorStore) Count() int {
	return len(vs.documents)
}

// Clear removes all documents from the store.
func (vs *VectorStore) Clear() error {
	vs.documents = make([]Document, 0)
	return nil
}

// SetThreshold sets the similarity threshold for search results.
func (vs *VectorStore) SetThreshold(threshold float32) error {
	if threshold < 0 || threshold > 1 {
		return fmt.Errorf("threshold must be between 0 and 1, got %f", threshold)
	}
	vs.threshold = threshold
	return nil
}

// Save persists the vector store to a JSON file.
func (vs *VectorStore) Save(path string) error {
	data, err := json.MarshalIndent(vs.documents, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal documents: %w", err)
	}

	err = ioutil.WriteFile(path, data, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// Load restores the vector store from a JSON file.
func (vs *VectorStore) Load(path string) error {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var docs []Document
	err = json.Unmarshal(data, &docs)
	if err != nil {
		return fmt.Errorf("failed to unmarshal documents: %w", err)
	}

	vs.documents = docs
	return nil
}

// cosineSimilarity calculates the cosine similarity between two vectors.
// Returns a value between -1 and 1, where 1 is identical vectors.
func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0
	}

	var dotProduct, normA, normB float32

	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	denominator := float32(math.Sqrt(float64(normA)) * math.Sqrt(float64(normB)))
	if denominator == 0 {
		return 0
	}

	return dotProduct / denominator
}

// ListDocuments returns all documents in the store.
func (vs *VectorStore) ListDocuments() []Document {
	result := make([]Document, len(vs.documents))
	copy(result, vs.documents)
	return result
}

// ListBySources returns documents filtered by source files.
func (vs *VectorStore) ListBySource(source string) []Document {
	var result []Document
	for _, doc := range vs.documents {
		if doc.Source == source {
			result = append(result, doc)
		}
	}
	return result
}

// GetSources returns all unique source files in the store.
func (vs *VectorStore) GetSources() []string {
	sourceMap := make(map[string]bool)
	for _, doc := range vs.documents {
		sourceMap[doc.Source] = true
	}

	sources := make([]string, 0, len(sourceMap))
	for source := range sourceMap {
		sources = append(sources, source)
	}
	return sources
}
