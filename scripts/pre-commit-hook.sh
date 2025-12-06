#!/bin/bash
# Git pre-commit hook to regenerate handshake document when version changes
# To enable: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Check if version files have changed
VERSION_FILES="internal/updater/updater.go frontend/package.json"
CHANGED_VERSION=false

for file in $VERSION_FILES; do
    if git diff --cached --name-only | grep -q "$file"; then
        CHANGED_VERSION=true
        break
    fi
done

# If version changed, regenerate handshake document
if [ "$CHANGED_VERSION" = true ]; then
    echo "🔄 Version file changed, regenerating handshake document..."
    ./scripts/generate-handshake.sh
    
    # Add the regenerated file to the commit
    git add FORGE_HANDSHAKE.md
    
    echo "✅ Handshake document updated and staged"
fi

exit 0
