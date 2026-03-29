# Release Manager Workspace Awareness

## Overview
Enhanced the Release Manager card to support managing external projects. It now detects the active project based on the terminal's current directory or allows manual selection via a new configuration UI.

## Changes

### Backend
- **New Endpoint**: `POST /api/git/version`
  - Retrieves the latest git tag from a specified directory.
  - Returns `v0.0.0` if no tags are found or if not a git repository.

### Frontend
- **Project Configuration**: 
  - Added a "Settings" (gear icon) to the Release Manager card.
  - Users can add/remove managed projects (Name + Path).
  - Configurations are saved to `localStorage`.
- **Context Awareness**: 
  - The card receives the current working directory (`cwd`) from the active terminal tab.
  - **Auto-detect**: If enabled (default), automatically switches context to a managed project if the terminal is inside its directory.
- **Dynamic Commands**: 
  - When acting on an external project, the generated release command automatically prepends `cd "C:\Path\To\Project"` to ensure the command runs in the correct context regardless of the terminal's current location.

## Usage
1. Open the Release Manager card.
2. Click the **Settings** (gear) icon.
3. Add your projects:
   - Name: `Jira Automation`
   - Path: `c:\projectswin\jira-automation`
4. Ensure "Auto-detect from Workspace" is checked.
5. Navigate to your project directory in the terminal.
6. The card will automatically update to show "Release Manager: Jira Automation" and display that project's version.
