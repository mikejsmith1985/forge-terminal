#!/bin/bash

# add-session-frontmatter.sh
# Adds YAML frontmatter to session documents that don't have it yet
# Usage: ./scripts/add-session-frontmatter.sh [--dry-run]

set -e

DOCS_DIR="docs/sessions"
DRY_RUN=false
COUNT=0
SKIP_COUNT=0

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE - No files will be modified"
  echo ""
fi

echo "Adding YAML frontmatter to session documents..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Find all .md files in sessions, excluding archive
while IFS= read -r file; do
  # Skip if already has frontmatter (starts with ---)
  if head -1 "$file" | grep -q "^---"; then
    SKIP_COUNT=$((SKIP_COUNT + 1))
    continue
  fi
  
  # Extract date from filename (YYYY-MM-DD format)
  filename=$(basename "$file")
  if [[ $filename =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    date="${BASH_REMATCH[1]}"
  else
    date="1970-01-01"
  fi
  
  # Extract topic from filename (everything after date, before .md)
  topic=$(echo "$filename" | sed 's/^[0-9-]*-//;s/\.md$//' | tr '_' '-')
  
  # Limit topic to max 50 chars
  if [[ ${#topic} -gt 50 ]]; then
    topic="${topic:0:50}"
  fi
  
  # Create frontmatter
  frontmatter="---
date: $date
topic: $topic
status: active
related_issues: []
related_commits: []
future_scope: []
---
"
  
  if [ "$DRY_RUN" = true ]; then
    echo "Would add frontmatter to: $file"
    echo "  date: $date"
    echo "  topic: $topic"
  else
    # Create temp file with frontmatter + original content
    tmpfile="${file}.tmp"
    echo -e "$frontmatter" > "$tmpfile"
    cat "$file" >> "$tmpfile"
    mv "$tmpfile" "$file"
    echo "✓ Added frontmatter to: $(basename "$file")"
  fi
  
  COUNT=$((COUNT + 1))
done < <(find "$DOCS_DIR" -name "*.md" -type f ! -path "*/archive/*" | sort)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Added frontmatter to: $COUNT files"
echo "  Skipped (already has): $SKIP_COUNT files"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "ℹ️  Run without --dry-run to actually modify files:"
  echo "   ./scripts/add-session-frontmatter.sh"
fi
