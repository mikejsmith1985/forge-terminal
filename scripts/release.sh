#!/bin/bash
#
# Forge Terminal Release Script
# Automates commit, version bump, and release creation
#
# Usage:
#   ./scripts/release.sh [version-type]
#
# Version types:
#   patch (default) - Bug fixes, small changes (1.9.6 -> 1.9.7)
#   minor           - New features, non-breaking (1.9.7 -> 1.10.0)
#   major           - Breaking changes (1.9.7 -> 2.0.0)
#   custom          - Prompt for custom version
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          Forge Terminal Release Script                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}📝 Uncommitted changes detected${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Continue with release? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Release cancelled${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Working directory clean${NC}"
fi

# Get current version from git tags
CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
CURRENT_VERSION=${CURRENT_VERSION#v}  # Remove 'v' prefix

echo -e "${BLUE}Current version: ${CYAN}v${CURRENT_VERSION}${NC}"
echo ""

# Parse version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Get version type
VERSION_TYPE=${1:-patch}

case "$VERSION_TYPE" in
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
        ;;
    custom)
        read -p "Enter new version (without 'v' prefix): " NEW_VERSION
        if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo -e "${RED}Error: Invalid version format. Use X.Y.Z${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
        echo "Valid types: patch, minor, major, custom"
        exit 1
        ;;
esac

echo -e "${GREEN}New version: ${CYAN}v${NEW_VERSION}${NC}"
echo ""

# Generate commit summary using git
echo -e "${YELLOW}📊 Analyzing changes...${NC}"
CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null || git diff --name-only HEAD 2>/dev/null || echo "")
NUM_FILES=$(echo "$CHANGED_FILES" | grep -c '^' || echo "0")

if [ "$NUM_FILES" -eq 0 ]; then
    echo -e "${RED}Error: No changes to commit${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found ${NUM_FILES} changed files${NC}"
echo ""

# Show changed files
echo -e "${BLUE}Changed files:${NC}"
echo "$CHANGED_FILES" | while read -r file; do
    if [ -n "$file" ]; then
        echo -e "  ${CYAN}•${NC} $file"
    fi
done
echo ""

# Generate AI-friendly commit context
echo -e "${YELLOW}🤖 Generating release notes...${NC}"

# Get git diff summary
DIFF_STAT=$(git diff --stat HEAD 2>/dev/null || git diff --cached --stat 2>/dev/null || echo "No changes")
DIFF_SUMMARY=$(git diff --shortstat HEAD 2>/dev/null || git diff --cached --shortstat 2>/dev/null || echo "")

# Check for fix documentation
FIX_DOCS=$(find . -maxdepth 1 -name "FIXES_ISSUE_*.md" -o -name "FIXES_*.md" | sort | tail -1)

# Build context for Copilot/Claude
CONTEXT_FILE=$(mktemp)
cat > "$CONTEXT_FILE" << EOF
Generate concise release notes for version v${NEW_VERSION} based on the following changes:

## Changed Files (${NUM_FILES} files):
${CHANGED_FILES}

## Diff Summary:
${DIFF_SUMMARY}

## Diff Statistics:
${DIFF_STAT}

EOF

if [ -n "$FIX_DOCS" ] && [ -f "$FIX_DOCS" ]; then
    echo "## Fix Documentation:" >> "$CONTEXT_FILE"
    head -100 "$FIX_DOCS" >> "$CONTEXT_FILE"
    echo "" >> "$CONTEXT_FILE"
fi

cat >> "$CONTEXT_FILE" << 'EOF'

Please provide:
1. A SHORT commit message (50 chars max, starts with verb)
2. A detailed commit body (bullet points, max 10 lines)
3. Release tag annotation (for GitHub release, max 15 lines)

Format your response as:
COMMIT_TITLE: <title>
COMMIT_BODY:
<body>
TAG_MESSAGE:
<message>
EOF

echo -e "${GREEN}✓ Context prepared${NC}"
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Copy the following prompt to Copilot/Claude:${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
cat "$CONTEXT_FILE"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Offer to continue manually or with AI output
echo -e "${YELLOW}Options:${NC}"
echo "  1. Copy context above, get AI response, paste back here"
echo "  2. Enter commit message manually"
echo "  3. Cancel"
echo ""
read -p "Choose option (1/2/3): " -n 1 -r OPTION
echo ""

case "$OPTION" in
    1)
        echo ""
        echo -e "${YELLOW}Paste the AI-generated response below (Ctrl+D when done):${NC}"
        AI_RESPONSE=$(cat)
        
        # Parse AI response
        COMMIT_TITLE=$(echo "$AI_RESPONSE" | grep "COMMIT_TITLE:" | sed 's/COMMIT_TITLE: *//')
        COMMIT_BODY=$(echo "$AI_RESPONSE" | sed -n '/COMMIT_BODY:/,/TAG_MESSAGE:/p' | sed '1d;$d' | sed 's/^[[:space:]]*//')
        TAG_MESSAGE=$(echo "$AI_RESPONSE" | sed -n '/TAG_MESSAGE:/,$p' | sed '1d' | sed 's/^[[:space:]]*//')
        ;;
    2)
        read -p "Enter commit title: " COMMIT_TITLE
        echo "Enter commit body (Ctrl+D when done):"
        COMMIT_BODY=$(cat)
        echo "Enter tag message (Ctrl+D when done):"
        TAG_MESSAGE=$(cat)
        ;;
    3)
        echo -e "${RED}Release cancelled${NC}"
        rm -f "$CONTEXT_FILE"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        rm -f "$CONTEXT_FILE"
        exit 1
        ;;
esac

rm -f "$CONTEXT_FILE"

# Validate we have messages
if [ -z "$COMMIT_TITLE" ]; then
    echo -e "${RED}Error: No commit title provided${NC}"
    exit 1
fi

# Show what we're about to do
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Release Summary:${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Version:${NC} v${CURRENT_VERSION} → ${GREEN}v${NEW_VERSION}${NC}"
echo -e "${BLUE}Commit Title:${NC} $COMMIT_TITLE"
echo ""
echo -e "${BLUE}Commit Body:${NC}"
echo "$COMMIT_BODY"
echo ""
echo -e "${BLUE}Tag Message:${NC}"
echo "$TAG_MESSAGE"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

read -p "Proceed with release? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Release cancelled${NC}"
    exit 1
fi

# Execute release
echo ""
echo -e "${YELLOW}🚀 Creating release...${NC}"

# Add files
echo -e "${CYAN}[1/5]${NC} Staging changes..."
git add -A

# Commit
echo -e "${CYAN}[2/5]${NC} Committing..."
FULL_COMMIT_MSG="$COMMIT_TITLE

$COMMIT_BODY"
git commit -m "$FULL_COMMIT_MSG"

# Push commit
echo -e "${CYAN}[3/5]${NC} Pushing commit..."
git push origin main

# Create tag
echo -e "${CYAN}[4/5]${NC} Creating tag v${NEW_VERSION}..."
TAG_FULL_MSG="v${NEW_VERSION}

$TAG_MESSAGE"
git tag -a "v${NEW_VERSION}" -m "$TAG_FULL_MSG"

# Push tag
echo -e "${CYAN}[5/5]${NC} Pushing tag..."
git push origin "v${NEW_VERSION}"

echo ""
echo -e "${GREEN}✓ Release v${NEW_VERSION} created successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  • GitHub Actions will build release binaries"
echo -e "  • GitHub release will be created automatically"
echo -e "  • Monitor: ${CYAN}https://github.com/mikejsmith1985/forge-terminal/actions${NC}"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"
