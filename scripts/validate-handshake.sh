#!/bin/bash
# Validate Forge Handshake Document
# Checks if handshake document is up-to-date with codebase

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDSHAKE="$ROOT_DIR/FORGE_HANDSHAKE.md"

echo "🔍 Validating Forge Handshake Document..."

# Check if handshake exists
if [ ! -f "$HANDSHAKE" ]; then
    echo "❌ FORGE_HANDSHAKE.md not found!"
    echo "   Run: make handshake-doc"
    exit 1
fi

# Get current version from code
CURRENT_VERSION=$(grep 'var Version = ' "$ROOT_DIR/internal/updater/updater.go" | sed 's/.*"\(.*\)"/\1/')
DOC_VERSION=$(grep '^\*\*Version\*\*:' "$HANDSHAKE" | sed 's/.*: \(.*\)/\1/' | tr -d ' ')

echo "📦 Current Version: $CURRENT_VERSION"
echo "📄 Document Version: $DOC_VERSION"

# Check if versions match
if [ "$CURRENT_VERSION" != "$DOC_VERSION" ]; then
    echo "❌ Version mismatch!"
    echo "   Document version ($DOC_VERSION) doesn't match code version ($CURRENT_VERSION)"
    echo "   Run: make handshake-doc"
    exit 1
fi

# Count API endpoints in code
API_COUNT_CODE=$(grep -c 'http.HandleFunc("/' "$ROOT_DIR/cmd/forge/main.go")
API_COUNT_DOC=$(grep -c '^- `/.*`$' "$HANDSHAKE")

echo "🔌 API Endpoints in code: $API_COUNT_CODE"
echo "🔌 API Endpoints in docs: $API_COUNT_DOC"

if [ "$API_COUNT_CODE" != "$API_COUNT_DOC" ]; then
    echo "⚠️  API endpoint count mismatch!"
    echo "   Code has $API_COUNT_CODE endpoints, document has $API_COUNT_DOC"
    echo "   Run: make handshake-doc"
    exit 1
fi

# Count components
COMPONENT_COUNT=$(find "$ROOT_DIR/frontend/src/components" -name "*.jsx" 2>/dev/null | wc -l)
DOC_COMPONENT_COUNT=$(grep 'UI Components' "$HANDSHAKE" | grep -o '[0-9]\+' | head -1)

echo "🎨 Components in code: $COMPONENT_COUNT"
echo "🎨 Components in docs: $DOC_COMPONENT_COUNT"

if [ "$COMPONENT_COUNT" != "$DOC_COMPONENT_COUNT" ]; then
    echo "⚠️  Component count mismatch!"
    echo "   Code has $COMPONENT_COUNT components, document has $DOC_COMPONENT_COUNT"
    echo "   Run: make handshake-doc"
    exit 1
fi

# Check document age
DOC_DATE=$(grep '^\*\*Last Updated\*\*:' "$HANDSHAKE" | sed 's/.*: \(.*\)/\1/' | tr -d ' ')
DOC_TIMESTAMP=$(date -d "${DOC_DATE}" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S.%3NZ" "${DOC_DATE}" +%s 2>/dev/null)
NOW=$(date +%s)
AGE_DAYS=$(( (NOW - DOC_TIMESTAMP) / 86400 ))

echo "📅 Document age: $AGE_DAYS days"

if [ "$AGE_DAYS" -gt 7 ]; then
    echo "⚠️  Document is over 7 days old!"
    echo "   Consider regenerating: make handshake-doc"
fi

echo ""
echo "✅ Handshake document validation passed!"
echo "   Version: $CURRENT_VERSION"
echo "   APIs: $API_COUNT_DOC"
echo "   Components: $DOC_COMPONENT_COUNT"
echo "   Age: $AGE_DAYS days"
