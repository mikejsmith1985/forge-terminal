#!/bin/bash

# generate-session-index.sh
# Generates INDEX.md from session doc frontmatter
# Run this after modifying session docs or their status

set -e

DOCS_DIR="docs/sessions"
INDEX_FILE="$DOCS_DIR/INDEX.md"
TIMESTAMP=$(date)

echo "Generating session index..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start INDEX.md
cat > "$INDEX_FILE" << 'EOF'
# Session Documents Index

Auto-generated index of all session documents organized by topic.

**Status Legend**:
- 🔵 **ACTIVE** - Currently in progress
- 🟡 **REVIEW_FOR_MIGRATION** - Pending review before cleanup
- 🟢 **MIGRATED** - Content moved to permanent docs
- ⚪ **ARCHIVED** - Kept for historical reference
- ⚫ **DELETED** - No longer tracked

---

## By Topic

EOF

# Get unique topics
TOPICS=$(find "$DOCS_DIR" -maxdepth 2 -name "*.md" -type f ! -path "*/archive/*" -exec grep "^topic:" {} \; 2>/dev/null | awk '{print $2}' | tr -d "'\"" | sort | uniq)

# Build index by topic
for topic in $TOPICS; do
  echo "### $topic" >> "$INDEX_FILE"
  echo "" >> "$INDEX_FILE"
  echo "| Date | File | Status | Title |" >> "$INDEX_FILE"
  echo "|------|------|--------|-------|" >> "$INDEX_FILE"
  
  # Find all docs with this topic
  find "$DOCS_DIR" -maxdepth 2 -name "*.md" -type f ! -path "*/archive/*" | while read -r file; do
    file_topic=$(grep "^topic:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
    
    if [[ "$file_topic" == "$topic" ]]; then
      date=$(grep "^date:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
      status=$(grep "^status:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
      
      case "$status" in
        active) status_emoji="🔵" ;;
        review_for_migration) status_emoji="🟡" ;;
        migrated) status_emoji="🟢" ;;
        archived) status_emoji="⚪" ;;
        deleted) status_emoji="⚫" ;;
        *) status_emoji="❓" ;;
      esac
      
      title=$(grep "^#" "$file" 2>/dev/null | head -1 | sed 's/^# //' | tr -d '`')
      filename=$(basename "$file")
      relpath=$(echo "$file" | sed "s|$DOCS_DIR/||")
      
      # Handle directories
      if [[ -d "$file" ]]; then
        echo "| $date | [$relpath/](../$relpath/) | $status_emoji $status | $title |" >> "$INDEX_FILE"
      else
        echo "| $date | [$filename]($relpath) | $status_emoji $status | $title |" >> "$INDEX_FILE"
      fi
    fi
  done
  
  echo "" >> "$INDEX_FILE"
done

echo "✓ Generated INDEX.md"
echo "  • $INDEX_FILE ($(wc -l < "$INDEX_FILE") lines)"
