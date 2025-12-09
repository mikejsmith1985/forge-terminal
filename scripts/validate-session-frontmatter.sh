#!/bin/bash

# validate-session-frontmatter.sh
# Validates that all session docs have proper frontmatter
# Usage: ./scripts/validate-session-frontmatter.sh

DOCS_DIR="docs/sessions"
ERRORS=0
WARNINGS=0
SUCCESS=0

echo "Validating session document frontmatter..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check each session doc
find "$DOCS_DIR" -maxdepth 2 -name "*.md" -type f ! -path "*/archive/*" | while read -r file; do
  [[ -z "$file" ]] && continue
  
  filename=$(basename "$file")
  
  # Skip template and meta files
  if [[ "$filename" =~ ^(FRONTMATTER_|INDEX|DECISION|MIGRATION|TOPICS) ]]; then
    continue
  fi
  
  # Check if file starts with ---
  if ! head -1 "$file" | grep -q "^---"; then
    echo "❌ $filename - Missing frontmatter"
    continue
  fi
  
  # Extract fields
  date=$(grep "^date:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
  topic=$(grep "^topic:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
  status=$(grep "^status:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
  
  # Check required fields
  has_errors=0
  
  if [[ -z "$date" ]]; then
    echo "❌ $filename - Missing date field"
    has_errors=1
  elif ! [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    if [[ ! "$date" =~ ^1970 ]]; then
      echo "⚠️  $filename - Date extracted as: $date"
    fi
  fi
  
  if [[ -z "$topic" ]]; then
    echo "❌ $filename - Missing topic field"
    has_errors=1
  fi
  
  if [[ -z "$status" ]]; then
    echo "⚠️  $filename - Missing status field"
  elif ! [[ "$status" =~ ^(active|review_for_migration|archived|migrated|deleted)$ ]]; then
    echo "⚠️  $filename - Invalid status: '$status'"
  fi
  
  if [[ $has_errors -eq 0 ]]; then
    echo "✓ $filename"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Validation complete - Check output above for any errors"
