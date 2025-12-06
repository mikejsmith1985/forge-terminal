#!/bin/bash
# Quick sync script - Download handshake from latest GitHub release

REPO_OWNER="mikejsmith1985"
REPO_NAME="forge-terminal"

echo "🔄 Syncing handshake from latest GitHub release..."

# Get latest version
echo "📦 Fetching latest release..."
VERSION=$(curl -s "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest" | \
    grep '"tag_name"' | \
    sed -E 's/.*"tag_name": "([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
    echo "❌ Failed to fetch latest release"
    echo "   Falling back to local generation..."
    make handshake-doc
    exit $?
fi

echo "📦 Latest version: $VERSION"

# Download handshake
HANDSHAKE_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/download/$VERSION/FORGE_HANDSHAKE.md"
echo "📥 Downloading from: $HANDSHAKE_URL"

if curl -L -f "$HANDSHAKE_URL" -o "FORGE_HANDSHAKE.md.tmp" 2>/dev/null; then
    mv "FORGE_HANDSHAKE.md.tmp" "FORGE_HANDSHAKE.md"
    echo "✅ Handshake synchronized to $VERSION"
    echo "📄 Location: ./FORGE_HANDSHAKE.md"
    
    # Show summary
    echo ""
    echo "📊 Summary:"
    grep "^**Version**:" FORGE_HANDSHAKE.md
    grep "^**Last Updated**:" FORGE_HANDSHAKE.md
    echo ""
    
    exit 0
else
    echo "⚠️  Handshake not found in release assets"
    echo "   Generating locally instead..."
    make handshake-doc
    exit $?
fi
