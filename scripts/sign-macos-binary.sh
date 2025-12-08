#!/bin/bash
#
# Sign a local macOS binary during development
# Usage: ./scripts/sign-macos-binary.sh <binary-path> [identity]
#
# The identity can be:
# - A certificate name from your keychain
# - A certificate SHA-1 hash
# - "-" to use the ad-hoc signing (for development only)
#

set -e

BINARY=${1:-.}
IDENTITY=${2:--}  # Default to ad-hoc signing

if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found: $BINARY"
    exit 1
fi

echo "🔐 Signing $BINARY with identity: $IDENTITY"
/usr/bin/codesign --force --options runtime -s "$IDENTITY" "$BINARY"

echo "✓ Code signature applied"

# Verify signature
echo "🔍 Verifying signature..."
codesign -v "$BINARY"

echo "✓ Signature verified"
echo ""
echo "Note: Ad-hoc signing (identity: -) is for development only."
echo "For distribution, use a proper Apple Developer ID certificate."
