#!/bin/bash

# Forge Terminal Comprehensive Indexing Script
# Indexes ENTIRE codebase: docs, Go code, JS/React, configs, scripts, and optionally gitignored content
# Usage:
#   ./scripts/index-full-codebase.sh                  # Index everything except gitignored
#   ./scripts/index-full-codebase.sh --with-gitignored # Include .forge/, docs/sessions/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INDEX_DIR="$PROJECT_ROOT/test-data/vector-index"
STATS_FILE="$PROJECT_ROOT/test-results/indexing-stats.json"

mkdir -p "$INDEX_DIR"
mkdir -p "$(dirname "$STATS_FILE")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
INCLUDE_GITIGNORED=false
if [ "$1" = "--with-gitignored" ]; then
  INCLUDE_GITIGNORED=true
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Forge Terminal - Comprehensive Codebase Indexing${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Project Root:${NC} $PROJECT_ROOT"
echo -e "${CYAN}Index Output:${NC} $INDEX_DIR"
echo -e "${CYAN}Include Gitignored:${NC} $INCLUDE_GITIGNORED"
echo ""

# Check if Ollama is running (needed for embeddings)
echo -e "${YELLOW}Checking if Ollama is running...${NC}"
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo -e "${RED}❌ Ollama is not running${NC}"
  echo ""
  echo "Ollama is required for generating embeddings."
  echo "Start Ollama with: ollama serve"
  exit 1
fi
echo -e "${GREEN}✓ Ollama is running${NC}"
echo ""

# Build forge if needed
echo -e "${YELLOW}Building Forge Terminal...${NC}"
if [ ! -f "$PROJECT_ROOT/forge" ]; then
  cd "$PROJECT_ROOT"
  make build || go build -o forge ./cmd/forge
fi
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Create temporary Go program to call IndexAllContent
echo -e "${YELLOW}Creating indexing program...${NC}"
TEMP_DIR=$(mktemp -d)
cat > "$TEMP_DIR/main.go" << 'GOPROG'
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant"
)

func main() {
	rootPath := flag.String("root", ".", "Root path to index")
	includeGitignored := flag.Bool("gitignored", false, "Include gitignored content")
	outputStats := flag.String("stats", "", "Output stats JSON file")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Create embeddings client
	embClient := assistant.NewEmbeddingsClient("http://localhost:11434")

	// Create vector store
	vectorStore := assistant.NewVectorStore()

	// Create indexer
	indexer := assistant.NewIndexer(embClient, vectorStore)

	log.Printf("Starting comprehensive indexing...")
	log.Printf("Root: %s", *rootPath)
	log.Printf("Include gitignored: %v", *includeGitignored)

	start := time.Now()
	ctx := context.Background()

	// Index all content
	err := indexer.IndexAllContent(ctx, *rootPath, *includeGitignored)
	if err != nil {
		log.Fatalf("Indexing failed: %v", err)
	}

	duration := time.Since(start)

	// Get stats
	stats := indexer.GetStats()

	log.Printf("Indexing complete!")
	log.Printf("  Files: %d", stats.TotalFiles)
	log.Printf("  Chunks: %d", stats.TotalChunks)
	log.Printf("  Avg Chunk Size: %d bytes", stats.AverageChunkSize)
	log.Printf("  Duration: %v", duration)

	// Save stats if requested
	if *outputStats != "" {
		statsJSON := map[string]interface{}{
			"timestamp":         time.Now().Format(time.RFC3339),
			"total_files":       stats.TotalFiles,
			"total_chunks":      stats.TotalChunks,
			"average_chunk_size": stats.AverageChunkSize,
			"duration_seconds":  duration.Seconds(),
			"include_gitignored": *includeGitignored,
		}

		data, err := json.MarshalIndent(statsJSON, "", "  ")
		if err != nil {
			log.Printf("Warning: Failed to marshal stats: %v", err)
		} else {
			if err := os.WriteFile(*outputStats, data, 0644); err != nil {
				log.Printf("Warning: Failed to write stats: %v", err)
			} else {
				log.Printf("Stats saved to: %s", *outputStats)
			}
		}
	}

	fmt.Println("✓ Indexing successful")
}
GOPROG

# Copy go.mod to temp dir
cp "$PROJECT_ROOT/go.mod" "$TEMP_DIR/"
cp "$PROJECT_ROOT/go.sum" "$TEMP_DIR/"

echo -e "${GREEN}✓ Indexing program created${NC}"
echo ""

# Run indexing
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Starting Indexing Process...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}This will index:${NC}"
echo "  • Documentation (*.md)"
echo "  • Go source code (*.go)"
echo "  • JavaScript/TypeScript (*.js, *.jsx, *.ts, *.tsx)"
echo "  • Configuration files (*.json, *.yaml, Makefile)"
echo "  • Shell scripts (*.sh)"
echo "  • Build files (go.mod, package.json)"
if [ "$INCLUDE_GITIGNORED" = true ]; then
  echo "  • Gitignored content (docs/sessions/, .forge/)"
fi
echo ""
echo -e "${YELLOW}This may take several minutes...${NC}"
echo ""

START_TIME=$(date +%s)

cd "$TEMP_DIR"
if [ "$INCLUDE_GITIGNORED" = true ]; then
  go run main.go -root="$PROJECT_ROOT" -gitignored=true -stats="$STATS_FILE"
else
  go run main.go -root="$PROJECT_ROOT" -gitignored=false -stats="$STATS_FILE"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Indexing Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Display stats
if [ -f "$STATS_FILE" ]; then
  echo -e "${CYAN}Statistics:${NC}"
  TOTAL_FILES=$(jq -r '.total_files' "$STATS_FILE")
  TOTAL_CHUNKS=$(jq -r '.total_chunks' "$STATS_FILE")
  AVG_SIZE=$(jq -r '.average_chunk_size' "$STATS_FILE")
  
  echo -e "  Files Indexed:      ${YELLOW}$TOTAL_FILES${NC}"
  echo -e "  Document Chunks:    ${YELLOW}$TOTAL_CHUNKS${NC}"
  echo -e "  Avg Chunk Size:     ${YELLOW}$AVG_SIZE bytes${NC}"
  echo -e "  Duration:           ${YELLOW}${DURATION}s${NC}"
  echo ""
  echo -e "${GREEN}✓${NC} Stats saved to: $STATS_FILE"
fi

echo ""
echo -e "${GREEN}✅ Comprehensive indexing successful!${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Run tests with the new index:"
echo "     ./scripts/test-model-comparison.sh mistral:7b-instruct"
echo ""
echo "  2. Compare accuracy against previous baseline:"
echo "     ./scripts/test-model-comparison.sh --compare-last-two"
echo ""

exit 0
