---
name: github-issue-images
description: Auto-fetches and displays images from GitHub issues when user requests them. Activates on keywords like "screenshot", "image", "picture" + "issue" or "gh issue".
---

# GitHub Issue Images Skill

**Auto-activates when**: User mentions viewing/checking/fetching images or screenshots from GitHub issues

## Problem Statement

Users frequently ask to view images/screenshots from GitHub issues (e.g., "check the screenshot from issue #5"). Copilot incorrectly claims it cannot fetch these images, even though:
- GitHub issue images are publicly accessible at `user-images.githubusercontent.com`
- Images can be downloaded with PowerShell and viewed with the `view` tool

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

### Step 3: Download and View Each Image
**CRITICAL**: The `web_fetch` tool CANNOT handle images (returns "Content type image/png cannot be simplified to markdown"). You MUST download images to a temp file first, then use `view`.

For each image URL found:
```powershell
# Download to temp file
Invoke-WebRequest -Uri "<IMAGE_URL>" -OutFile "$env:TEMP\issue-image-<N>.png"
```

Then use the `view` tool on the downloaded file:
```
view path: C:\Users\mikej\AppData\Local\Temp\issue-image-1.png
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
3. Download each image with `Invoke-WebRequest -Uri "<URL>" -OutFile "$env:TEMP\issue-image-N.png"`
4. Call `view` on each downloaded file
5. Describe the images

### WRONG Response (Never Do This)
❌ "I can see the issue but can't fetch the screenshot directly"
❌ "I don't have access to external images"
❌ Suggesting manual workarounds without trying to fetch first

## Critical Rules

1. **NEVER USE `web_fetch` FOR IMAGES** - It cannot parse image content types and will fail
2. **Download first, then `view`** - Use PowerShell's `Invoke-WebRequest` to download, then `view` tool to display
3. **GitHub CDN is PUBLIC** - No authentication required for user-images.githubusercontent.com
4. **Be proactive** - Don't wait for the user to ask twice

## Tool Priority

1. `github-mcp-server-issue_read` - Get issue details
2. `powershell` with `Invoke-WebRequest` - Download image to temp file
3. `view` - Display the downloaded image (supports PNG, JPG, GIF, etc.)

**NEVER use `web_fetch` for images** - it only works for HTML pages.

## Success Criteria

✅ User asks about GitHub issue image → Copilot fetches and describes it
✅ No false claims about inability to access public images
✅ Proactive and helpful without manual workarounds
