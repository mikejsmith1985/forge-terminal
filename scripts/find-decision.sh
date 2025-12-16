#!/bin/bash

# find-decision.sh
# Search for decisions in session documentation by keyword
# Usage: ./scripts/find-decision.sh "keyword"

set -e

DOCS_DIR="docs/sessions"
INDEX_FILE="$DOCS_DIR/INDEX.md"
DECISION_LOG="$DOCS_DIR/DECISION_LOG.md"

if [[ -z "$1" ]]; then
  echo "Find decisions in session documentation"
  echo ""
  echo "Usage: ./scripts/find-decision.sh <keyword>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/find-decision.sh \"model selector\""
  echo "  ./scripts/find-decision.sh \"assistant\""
  echo "  ./scripts/find-decision.sh \"logging\""
  echo ""
  exit 0
fi

QUERY="$1"
echo "🔍 Searching for decisions matching: \"$QUERY\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Search in INDEX.md (title and file names)
FOUND=0

# Search Decision Log first (best results)
if grep -qi "$QUERY" "$DECISION_LOG" 2>/dev/null; then
  echo "📖 Found in DECISION_LOG.md:"
  echo ""
  
  grep -A 6 "^###" "$DECISION_LOG" | while IFS= read -r line; do
    if echo "$line" | grep -qi "$QUERY"; then
      # Print context: heading + next 5 lines
      echo "$line"
      # Get next lines
      in_block=1
      counter=0
      while IFS= read -r next_line && [[ $counter -lt 5 ]]; do
        if [[ "$next_line" =~ ^### ]]; then
          break
        fi
        echo "$next_line"
        counter=$((counter + 1))
      done
      echo ""
    fi
  done < <(grep -A 6 "^###" "$DECISION_LOG")
  
  FOUND=1
fi

# Search in INDEX.md (by topic or title)
if grep -qi "^### .*$QUERY" "$INDEX_FILE" 2>/dev/null; then
  if [[ $FOUND -eq 1 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  fi
  
  echo "📋 Found in INDEX.md (by topic):"
  echo ""
  
  grep -i "^### .*$QUERY" "$INDEX_FILE" | while read -r line; do
    topic=$(echo "$line" | sed 's/^### //')
    echo "  Topic: $topic"
    echo ""
    
    # Find all entries under this topic
    in_section=0
    while IFS= read -r table_line; do
      if [[ "$table_line" =~ ^\| ]]; then
        if [[ $in_section -eq 0 ]]; then
          in_section=1
          continue
        fi
        
        # Extract filename and status
        filename=$(echo "$table_line" | awk -F'|' '{print $3}' | sed 's/\[//;s/\].*//' | xargs)
        status=$(echo "$table_line" | awk -F'|' '{print $4}' | xargs)
        title=$(echo "$table_line" | awk -F'|' '{print $5}' | xargs)
        
        if [[ ! -z "$filename" ]]; then
          echo "    • $filename - $status"
          echo "      $title"
          echo ""
        fi
      fi
    done < "$INDEX_FILE"
  done
  
  FOUND=1
fi

# Search in session doc titles
if find "$DOCS_DIR" -maxdepth 2 -name "*.md" -type f ! -path "*/archive/*" -exec grep -l "^# .*$QUERY" {} \; 2>/dev/null | grep -q .; then
  if [[ $FOUND -eq 1 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  fi
  
  echo "📄 Found in session document titles:"
  echo ""
  
  find "$DOCS_DIR" -maxdepth 2 -name "*.md" -type f ! -path "*/archive/*" -exec grep -l "^# .*$QUERY" {} \; 2>/dev/null | while read -r file; do
    title=$(grep "^#" "$file" | head -1 | sed 's/^# //')
    relpath=$(echo "$file" | sed "s|$DOCS_DIR/||")
    topic=$(grep "^topic:" "$file" 2>/dev/null | awk '{print $2}' | tr -d "'\"")
    
    echo "  • $relpath"
    echo "    Title: $title"
    echo "    Topic: $topic"
    echo ""
  done
  
  FOUND=1
fi

# No results
if [[ $FOUND -eq 0 ]]; then
  echo "❌ No decisions found matching \"$QUERY\""
  echo ""
  echo "Try:"
  echo "  ./scripts/find-decision.sh \"topic-name\""
  echo "  grep -ri \"$QUERY\" docs/sessions/"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Tips:"
echo "  • Click session links to see full context"
echo "  • Check related issues for problem description"
echo "  • Check related commits for implementation"
echo "  • Update status field to track migration"
