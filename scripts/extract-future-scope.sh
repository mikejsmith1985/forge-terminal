#!/bin/bash

# extract-future-scope.sh
# Extracts "future scope" ideas from session document frontmatter
# Usage: ./scripts/extract-future-scope.sh

DOCS_DIR="docs/sessions"

echo "Extracting future scope ideas from session frontmatter..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Find specific doc with future_scope
FILE="docs/sessions/2025-12-09-issue30-phase5-future-scope-capture.md"

if [[ -f "$FILE" ]]; then
  echo "✓ Extracting from: $FILE"
  echo ""
  
  # Parse the YAML array manually
  # future_scope: [
  #   "idea1",
  #   "idea2"
  # ]
  
  awk '/^future_scope:/{flag=1; next} /^\]/{if(flag) flag=0; next} flag' "$FILE" | \
    grep -oP '"\K[^"]+' | \
    while read -r idea; do
      if [[ ! -z "$idea" ]] && [[ ! "$idea" =~ ^[[:space:]]*$ ]]; then
        echo "  • $idea"
      fi
    done
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✓ Future scope extraction complete"
  echo "  • Ready for prioritization in docs/FUTURE_SCOPE.md"
else
  echo "❌ Could not find session doc: $FILE"
fi
