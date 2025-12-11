#!/bin/bash

#
# Initialize RAG System with Forge Documentation
# Indexes all markdown files from docs/ directory
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$PROJECT_DIR/docs"
API_BASE="http://localhost:8333/api"

echo "🚀 RAG Initialization - Indexing Forge Documentation"
echo "===================================================="
echo ""

# Check if Forge is running
echo "Checking Forge API..."
if ! curl -s "$API_BASE/assistant/status" > /dev/null 2>&1; then
    echo "❌ Forge API not responding at $API_BASE"
    echo "   Start Forge with: ./forge --port 8333"
    exit 1
fi

echo "✅ Forge API is running"
echo ""

# Check documentation directory
if [ ! -d "$DOCS_DIR" ]; then
    echo "⚠️  Documentation directory not found: $DOCS_DIR"
    echo "   Creating basic docs structure..."
    mkdir -p "$DOCS_DIR/user"
    mkdir -p "$DOCS_DIR/developer"
fi

# Count markdown files
MD_COUNT=$(find "$DOCS_DIR" -name "*.md" 2>/dev/null | wc -l)
echo "📄 Found $MD_COUNT markdown files in docs/"
echo ""

# Initialize RAG
echo "Initializing RAG system..."
RESPONSE=$(curl -s -X POST "$API_BASE/assistant/rag/initialize" \
    -H "Content-Type: application/json" \
    -d "{\"doc_path\": \"$DOCS_DIR\"}" 2>/dev/null || echo "{}")

if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
    SUCCESS=$(echo "$RESPONSE" | jq '.success // false' 2>/dev/null)
    if [ "$SUCCESS" = "true" ]; then
        CHUNKS=$(echo "$RESPONSE" | jq '.chunks_indexed // 0' 2>/dev/null)
        FILES=$(echo "$RESPONSE" | jq '.files_indexed // 0' 2>/dev/null)
        echo "✅ RAG System Initialized"
        echo "   - Files indexed: $FILES"
        echo "   - Chunks created: $CHUNKS"
    else
        ERROR=$(echo "$RESPONSE" | jq '.error // "Unknown error"' 2>/dev/null)
        echo "⚠️  RAG initialization returned error: $ERROR"
    fi
else
    echo "⚠️  Could not parse RAG initialization response"
    echo "   Response: $RESPONSE"
fi

echo ""
echo "Next steps:"
echo "1. Run baseline test: bash scripts/test-rag-baseline.sh"
echo "2. Run RAG test: bash scripts/test-rag-with-embeddings.sh"
echo "3. Compare results to measure improvement"
