---
name: github-issue-images
description: Auto-fetches and displays images from GitHub issues when user requests them. Activates on keywords like "screenshot", "image", "picture" + "issue" or "gh issue".
---

# GitHub Issue Images Skill

**Auto-activates when**: User mentions viewing/checking/fetching images or screenshots from GitHub issues

## Problem Statement

Users frequently ask to view images/screenshots from GitHub issues (e.g., "check the screenshot from issue #5"). Copilot incorrectly claims it cannot fetch these images, even though:
- GitHub issue images are publicly accessible at `user-images.githubusercontent.com`
- The tools exist to fetch and display them (`web_fetch`, `view`)

## Skill Directive

When a user asks to view/check/fetch images from a GitHub issue:

### Step 1: Fetch the Issue
```
Use github-mcp-server-issue_read with method: "get"
```

### Step 2: Extract Image URLs
Parse the issue body for image URLs matching:
- `https://user-images.githubusercontent.com/*`
- `https://github.com/*/assets/*`
- `![]()` markdown syntax
- `<img src="">` HTML syntax

### Step 3: Fetch Each Image
For each image URL found:
```
Use web_fetch with the image URL
```

**Note**: GitHub issue images are PUBLIC and do NOT require authentication. They are served from CDN URLs that are accessible to anyone.

### Step 4: Display Results
- Confirm how many images were found
- Describe each image's content
- If user needs the actual image file, suggest using `scripts/fetch-issue-images.sh <issue_number>`

## Examples

### User Request
> "check screenshot from gh issue #5"

### Correct Response Pattern
1. Call `github-mcp-server-issue_read` (method: "get", issue_number: 5)
2. Parse body for image URLs
3. Call `web_fetch` on each image URL found
4. Describe the images

### WRONG Response (Never Do This)
❌ "I can see the issue but can't fetch the screenshot directly"
❌ "I don't have access to external images"
❌ Suggesting manual workarounds without trying to fetch first

## Critical Rules

1. **ALWAYS TRY TO FETCH FIRST** - Never claim you can't access GitHub issue images without attempting
2. **GitHub CDN is PUBLIC** - No authentication required for user-images.githubusercontent.com
3. **Use web_fetch for images** - It's designed for this exact purpose
4. **Be proactive** - Don't wait for the user to ask twice

## Tool Priority

1. `github-mcp-server-issue_read` - Get issue details
2. `web_fetch` - Fetch image content (works with githubusercontent.com)
3. `view` - If image is already downloaded locally

## Success Criteria

✅ User asks about GitHub issue image → Copilot fetches and describes it
✅ No false claims about inability to access public images
✅ Proactive and helpful without manual workarounds
