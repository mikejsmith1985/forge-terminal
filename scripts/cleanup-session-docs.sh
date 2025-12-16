#!/bin/bash

# Enhanced cleanup script with migration workflow
# Removes session docs older than specified days with safety checks
# Usage: ./scripts/cleanup-session-docs.sh [--force] [DAYS]

set -e

DAYS_OLD=${1:-30}
FORCE=false
SESSION_DIR="docs/sessions"
ARCHIVE_DIR="docs/sessions/archive"
AUDIT_LOG="docs/sessions/CLEANUP_AUDIT.log"
MIGRATION_GUIDE="$SESSION_DIR/MIGRATION_GUIDE.md"

# Parse arguments
if [[ "$1" == "--force" ]]; then
  FORCE=true
  DAYS_OLD=${2:-30}
fi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Session Documentation Cleanup (Enhanced)                   ║"
echo "║     With Migration Workflow & Safety Checks                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ ! -d "$SESSION_DIR" ]; then
    echo "❌ Session directory not found: $SESSION_DIR"
    exit 1
fi

# Find files older than N days (excluding archive directory and meta files)
echo "🔍 Looking for session docs older than $DAYS_OLD days..."
echo ""

OLD_FILES=$(find "$SESSION_DIR" -maxdepth 1 -type f -name "*.md" -mtime +$DAYS_OLD \
  ! -name "INDEX.md" \
  ! -name "DECISION_LOG.md" \
  ! -name "MIGRATION_GUIDE.md" \
  ! -name "TOPICS.md" \
  ! -name "FRONTMATTER_TEMPLATE.md" \
  ! -path "*/archive/*" 2>/dev/null || true)

COUNT=$(echo "$OLD_FILES" | grep -c "\.md" || echo "0")

if [ "$COUNT" -eq 0 ]; then
    echo "✅ No old session docs found. Repository is clean!"
    exit 0
fi

echo "Found $COUNT old session document(s) for review:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$OLD_FILES" | while read -r file; do
  if [ -n "$file" ]; then
    filename=$(basename "$file")
    size=$(du -h "$file" | awk '{print $1}')
    date_modified=$(stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null || stat -c %y "$file" | cut -d' ' -f1)
    echo "  • $filename ($size, modified $date_modified)"
  fi
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FORCE" = false ]; then
  echo "⚠️  IMPORTANT: Before deletion, review the migration checklist:"
  echo "   See: $MIGRATION_GUIDE"
  echo ""
  echo "Ask yourself for each doc:"
  echo "  1. Contains architectural decision? → Migrate to docs/developer/"
  echo "  2. Contains feature documentation? → Migrate to docs/user/"
  echo "  3. Contains bug investigation? → Link from GitHub issue"
  echo "  4. Contains future ideas? → Extract to docs/FUTURE_SCOPE.md"
  echo ""
  read -p "Have you reviewed these docs for migration? (y/N): " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled. Review the docs first."
    exit 0
  fi
fi

# Create audit log entry
mkdir -p "$ARCHIVE_DIR"
{
  echo "CLEANUP AUDIT LOG"
  echo "Date: $(date)"
  echo "Docs older than: $DAYS_OLD days"
  echo "Count: $COUNT files"
  echo ""
  echo "Files deleted:"
  echo "$OLD_FILES"
  echo ""
  echo "Reviewed for migration: YES ($(date))"
} >> "$AUDIT_LOG"

echo "📦 Processing files..."
echo ""

MIGRATED=0
DELETED=0

while IFS= read -r file; do
  if [ -n "$file" ] && [ -f "$file" ]; then
    filename=$(basename "$file")
    
    # Check status from frontmatter
    status=$(grep "^status:" "$file" 2>/dev/null | head -1 | awk '{print $2}' | tr -d "'\"")
    
    if [[ "$status" == "migrated" || "$status" == "archived" ]]; then
      # Already migrated, safe to delete
      rm "$file"
      echo "✓ Deleted: $filename (status: $status)"
      DELETED=$((DELETED + 1))
    else
      # Still active - archive it instead of deleting
      mv "$file" "$ARCHIVE_DIR/$filename"
      echo "⚠️  Archived: $filename (status: $status, review for migration)"
      MIGRATED=$((MIGRATED + 1))
    fi
  fi
done <<< "$OLD_FILES"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cleanup complete!"
echo "   Deleted: $DELETED files (migrated/archived status)"
echo "   Archived: $MIGRATED files (active status, needs review)"
echo "   Location: $ARCHIVE_DIR"
echo "   Audit log: $AUDIT_LOG"
echo ""
echo "Next steps:"
echo "  1. Review archived files in: $ARCHIVE_DIR"
echo "  2. Migrate valuable content to permanent docs"
echo "  3. Update status in INDEX.md: ./scripts/generate-session-index.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
