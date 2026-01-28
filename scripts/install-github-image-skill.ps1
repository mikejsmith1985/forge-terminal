#!/usr/bin/env pwsh
# install-github-image-skill.ps1
# Installs the GitHub Issue Images skill to a target repository
#
# Usage:
#   .\scripts\install-github-image-skill.ps1 -TargetRepo "C:\Projects\my-repo"
#   .\scripts\install-github-image-skill.ps1 -TargetRepo "C:\Projects\my-repo" -Force

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetRepo,
    
    [switch]$Force
)

$skillContent = @'
---
name: github-issue-images
description: Auto-fetches and displays images from GitHub issues when user requests them. Activates on keywords like "screenshot", "image", "picture" + "issue" or "gh issue".
---

# GitHub Issue Images Skill

**Auto-activates when**: User mentions viewing/checking/fetching images or screenshots from GitHub issues

## Skill Directive

When a user asks to view/check/fetch images from a GitHub issue:

### Step 1: Fetch the Issue
Use `github-mcp-server-issue_read` with method: "get" to get issue details.

### Step 2: Extract Image URLs
Parse the issue body for image URLs matching:
- `https://user-images.githubusercontent.com/*`
- `https://github.com/*/assets/*`
- `![]()` markdown image syntax
- `<img src="">` HTML syntax

### Step 3: Fetch Each Image
For each image URL found, use `web_fetch` with the image URL.

**CRITICAL**: GitHub issue images are PUBLIC and do NOT require authentication. They are served from CDN URLs accessible to anyone.

### Step 4: Display Results
Describe each image's content to the user.

## Critical Rules

1. **ALWAYS TRY TO FETCH FIRST** - Never claim you can't access GitHub issue images without attempting
2. **GitHub CDN is PUBLIC** - No authentication required for user-images.githubusercontent.com
3. **Use web_fetch for images** - It works with githubusercontent.com URLs
4. **Parse the issue body** - Image URLs are in the body text, extract them with regex

## WRONG Response (Never Do This)
❌ "I can see the issue but not the screenshot URLs directly"
❌ "I can't fetch the screenshot"
❌ "I don't have access to external images"

## CORRECT Response Pattern
1. Call `github-mcp-server-issue_read` (method: "get", issue_number: N)
2. Parse response body for URLs matching `https://user-images.githubusercontent.com/...`
3. Call `web_fetch` on each image URL
4. Describe what you see in the images
'@

# Validate target repo exists
if (-not (Test-Path $TargetRepo)) {
    Write-Error "Target repository does not exist: $TargetRepo"
    exit 1
}

# Check if it's a git repo
if (-not (Test-Path (Join-Path $TargetRepo ".git"))) {
    Write-Warning "Target path is not a git repository: $TargetRepo"
    if (-not $Force) {
        Write-Error "Use -Force to install anyway"
        exit 1
    }
}

# Create .github/skills/github-issue-images directory
$skillDir = Join-Path $TargetRepo ".github\skills\github-issue-images"
if (-not (Test-Path $skillDir)) {
    New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
    Write-Host "Created directory: $skillDir" -ForegroundColor Green
}

# Write the skill file
$skillFile = Join-Path $skillDir "SKILL.md"
if ((Test-Path $skillFile) -and -not $Force) {
    Write-Warning "Skill already exists at: $skillFile"
    Write-Host "Use -Force to overwrite"
    exit 0
}

$skillContent | Out-File -FilePath $skillFile -Encoding utf8 -Force
Write-Host "✓ Installed GitHub Issue Images skill to: $skillFile" -ForegroundColor Green
Write-Host ""
Write-Host "The skill will activate when you ask about images/screenshots from GitHub issues." -ForegroundColor Cyan
