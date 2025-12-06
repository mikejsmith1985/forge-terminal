#!/bin/bash
# Local Handshake Watcher - Poll GitHub for new releases and auto-generate handshake
# Run this in background: ./scripts/watch-releases.sh &

set -e

REPO_OWNER="mikejsmith1985"
REPO_NAME="forge-terminal"
CHECK_INTERVAL=300  # 5 minutes
STATE_FILE=".forge/last-release-check"

echo "🔍 Starting GitHub Release Watcher..."
echo "   Checking every $CHECK_INTERVAL seconds"
echo "   State file: $STATE_FILE"

# Create state directory
mkdir -p "$(dirname "$STATE_FILE")"

# Get last checked version
if [ -f "$STATE_FILE" ]; then
    LAST_VERSION=$(cat "$STATE_FILE")
else
    LAST_VERSION=""
fi

echo "📦 Last known version: ${LAST_VERSION:-none}"

while true; do
    # Fetch latest release from GitHub
    LATEST=$(curl -s "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest" | \
        grep -o '"tag_name": *"[^"]*"' | \
        sed 's/"tag_name": *"\([^"]*\)"/\1/' || echo "")
    
    if [ -z "$LATEST" ]; then
        echo "⚠️  Failed to fetch latest release"
        sleep "$CHECK_INTERVAL"
        continue
    fi
    
    echo "🔄 Latest release: $LATEST"
    
    # Check if new release
    if [ "$LATEST" != "$LAST_VERSION" ] && [ -n "$LAST_VERSION" ]; then
        echo "🎉 NEW RELEASE DETECTED: $LATEST"
        echo ""
        echo "📥 Downloading handshake document..."
        
        # Download handshake from release
        HANDSHAKE_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/download/$LATEST/FORGE_HANDSHAKE.md"
        
        if curl -L -f "$HANDSHAKE_URL" -o "FORGE_HANDSHAKE.md.downloaded" 2>/dev/null; then
            mv "FORGE_HANDSHAKE.md.downloaded" "FORGE_HANDSHAKE.md"
            echo "✅ Handshake document updated from release"
        else
            echo "⚠️  Release handshake not found, regenerating locally..."
            make handshake-doc
        fi
        
        # Validate
        make validate-handshake
        
        # Notification
        if command -v notify-send &> /dev/null; then
            notify-send "Forge Terminal Released" "Version $LATEST - Handshake updated"
        fi
        
        echo ""
        echo "✅ Handshake synchronized to $LATEST"
        echo "📄 Location: ./FORGE_HANDSHAKE.md"
        echo ""
    else
        echo "   No new releases"
    fi
    
    # Save current version
    echo "$LATEST" > "$STATE_FILE"
    
    # Wait for next check
    sleep "$CHECK_INTERVAL"
done
