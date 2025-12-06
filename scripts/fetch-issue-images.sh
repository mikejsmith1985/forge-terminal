#!/bin/bash
# =============================================================================
# fetch-issue-images.sh
# =============================================================================
# Downloads images from GitHub issues for local viewing/debugging.
# Images are stored with metadata for auto-cleanup after 7 days.
#
# Usage:
#   ./scripts/fetch-issue-images.sh <issue_number>
#   ./scripts/fetch-issue-images.sh 16
#   ./scripts/fetch-issue-images.sh --cleanup   # Remove images older than 7 days
#   ./scripts/fetch-issue-images.sh --list      # List all downloaded images
#
# Requirements:
#   - gh CLI (GitHub CLI) authenticated
#   - curl
#   - jq
# =============================================================================

set -e

# Configuration
REPO="mikejsmith1985/forge-terminal"
IMAGE_DIR="$(dirname "$0")/../issue-images"
RETENTION_DAYS=7

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure image directory exists
mkdir -p "$IMAGE_DIR"

# Function to display usage
usage() {
    echo "Usage: $0 <issue_number|--cleanup|--list>"
    echo ""
    echo "Commands:"
    echo "  <number>    Download images from issue #<number>"
    echo "  --cleanup   Remove images older than $RETENTION_DAYS days"
    echo "  --list      List all downloaded issue images"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 16           # Download images from issue #16"
    echo "  $0 --cleanup    # Clean up old images"
    exit 1
}

# Function to cleanup old images
cleanup_old_images() {
    echo -e "${BLUE}Cleaning up images older than $RETENTION_DAYS days...${NC}"
    
    local count=0
    local deleted=0
    
    # Find and delete old image files
    while IFS= read -r -d '' file; do
        count=$((count + 1))
        if [[ -f "$file" ]]; then
            rm -f "$file"
            deleted=$((deleted + 1))
            echo -e "  ${RED}Deleted:${NC} $(basename "$file")"
        fi
    done < <(find "$IMAGE_DIR" -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.webp" -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    # Also clean up empty issue directories
    find "$IMAGE_DIR" -type d -empty -delete 2>/dev/null || true
    
    # Clean up orphaned metadata files
    for meta in "$IMAGE_DIR"/issue-*/metadata.json; do
        if [[ -f "$meta" ]]; then
            local dir=$(dirname "$meta")
            local images=$(find "$dir" -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.webp" \) 2>/dev/null | wc -l)
            if [[ $images -eq 0 ]]; then
                rm -rf "$dir"
                echo -e "  ${RED}Removed empty directory:${NC} $(basename "$dir")"
            fi
        fi
    done
    
    if [[ $deleted -eq 0 ]]; then
        echo -e "${GREEN}No old images to clean up.${NC}"
    else
        echo -e "${GREEN}Cleaned up $deleted images.${NC}"
    fi
}

# Function to list downloaded images
list_images() {
    echo -e "${BLUE}Downloaded issue images:${NC}"
    echo ""
    
    local found=0
    for dir in "$IMAGE_DIR"/issue-*; do
        if [[ -d "$dir" ]]; then
            local issue_num=$(basename "$dir" | sed 's/issue-//')
            local meta="$dir/metadata.json"
            local age_info=""
            
            if [[ -f "$meta" ]]; then
                local fetched=$(jq -r '.fetched_at // "unknown"' "$meta" 2>/dev/null)
                if [[ "$fetched" != "unknown" && "$fetched" != "null" ]]; then
                    # Calculate days since fetch
                    local fetch_epoch=$(date -d "$fetched" +%s 2>/dev/null || echo "0")
                    local now_epoch=$(date +%s)
                    local days_old=$(( (now_epoch - fetch_epoch) / 86400 ))
                    local days_left=$(( RETENTION_DAYS - days_old ))
                    if [[ $days_left -le 0 ]]; then
                        age_info=" ${RED}(expired, will be cleaned)${NC}"
                    elif [[ $days_left -le 2 ]]; then
                        age_info=" ${YELLOW}($days_left days until cleanup)${NC}"
                    else
                        age_info=" ${GREEN}($days_left days until cleanup)${NC}"
                    fi
                fi
            fi
            
            echo -e "${YELLOW}Issue #$issue_num${NC}$age_info"
            
            for img in "$dir"/*; do
                if [[ -f "$img" ]] && [[ "$img" =~ \.(png|jpg|jpeg|gif|webp)$ ]]; then
                    found=$((found + 1))
                    local size=$(du -h "$img" 2>/dev/null | cut -f1)
                    echo "  - $(basename "$img") ($size)"
                fi
            done
            echo ""
        fi
    done
    
    if [[ $found -eq 0 ]]; then
        echo -e "${YELLOW}No images downloaded yet.${NC}"
        echo "Use: $0 <issue_number> to download images from an issue."
    else
        echo -e "${GREEN}Total: $found images${NC}"
    fi
}

# Function to extract image URLs from text (issue body + comments)
extract_image_urls() {
    local text="$1"
    # Match GitHub user-images, githubusercontent, and common image formats
    echo "$text" | grep -oE 'https://[^"<>[:space:])]+\.(png|jpg|jpeg|gif|webp)(\?[^"<>[:space:])]*)?' | sort -u
}

# Function to download images from an issue
download_issue_images() {
    local issue_num="$1"
    local issue_dir="$IMAGE_DIR/issue-$issue_num"
    
    echo -e "${BLUE}Fetching issue #$issue_num from $REPO...${NC}"
    
    # Check if gh is available
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: gh (GitHub CLI) is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Fetch issue body
    local issue_body
    issue_body=$(gh api "repos/$REPO/issues/$issue_num" --jq '.body // ""' 2>/dev/null) || {
        echo -e "${RED}Error: Failed to fetch issue #$issue_num. Check if issue exists and you have access.${NC}"
        exit 1
    }
    
    # Fetch issue title for metadata
    local issue_title
    issue_title=$(gh api "repos/$REPO/issues/$issue_num" --jq '.title // "Unknown"' 2>/dev/null)
    
    # Fetch comments
    local comments
    comments=$(gh api "repos/$REPO/issues/$issue_num/comments" --jq '.[].body // ""' 2>/dev/null) || comments=""
    
    # Combine all text
    local all_text="$issue_body"$'\n'"$comments"
    
    # Extract image URLs
    local urls
    urls=$(extract_image_urls "$all_text")
    
    if [[ -z "$urls" ]]; then
        echo -e "${YELLOW}No images found in issue #$issue_num${NC}"
        exit 0
    fi
    
    # Create issue directory
    mkdir -p "$issue_dir"
    
    # Save metadata
    cat > "$issue_dir/metadata.json" << EOF
{
  "issue_number": $issue_num,
  "issue_title": $(echo "$issue_title" | jq -Rs .),
  "repo": "$REPO",
  "fetched_at": "$(date -Iseconds)",
  "retention_days": $RETENTION_DAYS,
  "expires_at": "$(date -d "+$RETENTION_DAYS days" -Iseconds)"
}
EOF
    
    echo -e "${GREEN}Found images in issue #$issue_num:${NC}"
    
    local count=0
    while IFS= read -r url; do
        if [[ -n "$url" ]]; then
            count=$((count + 1))
            # Generate filename from URL or use sequential naming
            local filename
            filename=$(basename "$url" | sed 's/\?.*//' | head -c 100)
            
            # Ensure unique filename
            if [[ -f "$issue_dir/$filename" ]]; then
                local base="${filename%.*}"
                local ext="${filename##*.}"
                filename="${base}_${count}.${ext}"
            fi
            
            echo -e "  ${BLUE}Downloading:${NC} $filename"
            
            # Download with curl, follow redirects
            if curl -sL -o "$issue_dir/$filename" "$url" 2>/dev/null; then
                local size=$(du -h "$issue_dir/$filename" 2>/dev/null | cut -f1)
                echo -e "    ${GREEN}✓${NC} Saved ($size)"
            else
                echo -e "    ${RED}✗${NC} Failed to download"
                rm -f "$issue_dir/$filename"
            fi
        fi
    done <<< "$urls"
    
    echo ""
    echo -e "${GREEN}Downloaded $count images to:${NC} $issue_dir"
    echo -e "${YELLOW}Images will be auto-deleted after $RETENTION_DAYS days.${NC}"
    echo ""
    echo "To view images:"
    echo "  ls -la $issue_dir/"
}

# Main script
case "${1:-}" in
    --cleanup|-c)
        cleanup_old_images
        ;;
    --list|-l)
        list_images
        ;;
    --help|-h)
        usage
        ;;
    "")
        usage
        ;;
    *)
        # Validate it's a number
        if ! [[ "$1" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}Error: '$1' is not a valid issue number${NC}"
            usage
        fi
        download_issue_images "$1"
        ;;
esac
