#!/bin/bash

# Cleanup old session documentation
# Removes session docs older than specified days

DAYS_OLD=${1:-30}
SESSION_DIR="docs/sessions"
ARCHIVE_DIR="docs/sessions/archive"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Session Documentation Cleanup                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

if [ ! -d "$SESSION_DIR" ]; then
    echo "❌ Session directory not found: $SESSION_DIR"
    exit 1
fi

# Find files older than N days (excluding archive directory)
echo "🔍 Looking for session docs older than $DAYS_OLD days..."
echo ""

OLD_FILES=$(find "$SESSION_DIR" -type f -name "*.md" -mtime +$DAYS_OLD -not -path "*/archive/*")
COUNT=$(echo "$OLD_FILES" | grep -c "\.md" || echo "0")

if [ "$COUNT" -eq 0 ]; then
    echo "✅ No old session docs found. Repository is clean!"
    exit 0
fi

echo "Found $COUNT old session document(s):"
echo "$OLD_FILES"
echo ""

read -p "Move these to archive? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p "$ARCHIVE_DIR"
    
    echo ""
    echo "📦 Moving files to archive..."
    
    while IFS= read -r file; do
        if [ -n "$file" ] && [ -f "$file" ]; then
            filename=$(basename "$file")
            mv "$file" "$ARCHIVE_DIR/$filename"
            echo "  ✓ Moved: $filename"
        fi
    done <<< "$OLD_FILES"
    
    echo ""
    echo "✅ Cleanup complete!"
    echo "   Archived: $COUNT files"
    echo "   Location: $ARCHIVE_DIR"
else
    echo ""
    echo "❌ Cleanup cancelled."
fi
