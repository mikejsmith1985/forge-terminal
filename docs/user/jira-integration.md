# Jira Integration Guide

Connect Forge Terminal to your Jira account so you can create, view, and update tickets without leaving the terminal.

---

## Requirements

- A Jira account — either **Jira Cloud** (e.g. `yourcompany.atlassian.net`) or a self-hosted **Jira Server / Data Center**
- For **Jira Cloud**: your account email and an API token
- For **Jira Server**: a Personal Access Token (PAT)

---

## Step 1 — Get Your Credentials

### Jira Cloud

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Give it a name (e.g. `Forge Terminal`) and click **Create**
4. Copy the token — you will only see it once

### Jira Server / Data Center

1. Log in to your Jira instance
2. Click your profile avatar → **Profile**
3. Go to **Personal Access Tokens** → **Create token**
4. Give it a name, set an expiry if required, click **Create**
5. Copy the token

---

## Step 2 — Connect Forge Terminal to Jira

1. Open Forge Terminal
2. Click the **⚙ Settings** button in the toolbar
3. Select the **🎟 Jira** tab
4. Fill in the fields:

| Field | What to enter |
|---|---|
| **Jira URL** | Your Jira root URL, e.g. `https://yourcompany.atlassian.net` |
| **Email** | Your Jira account email *(Cloud only — leave blank for Server)* |
| **API Token / PAT** | The token you copied in Step 1 |
| **Default Project Key** | Optional. The short project code shown before ticket numbers, e.g. `PROJ` |

> **Auth type is detected automatically.** If your URL contains `atlassian.net`, Forge uses Cloud auth (email + token). Any other URL uses Server auth (PAT only).

5. Click **Test Connection**
   - You should see: *"Connected — X project(s) accessible"*
   - If you see an error, double-check your URL and token

6. Click **Save Jira Settings**

---

## Step 3 — Link a Ticket to a Tab

Each terminal tab can be associated with one Jira ticket. Once linked, the ticket key appears as a blue badge on the tab.

### Option A — Link an existing ticket

1. Click the **🎟** (Jira) button in the toolbar, or use the **🎟 Jira: Link Ticket** command card
2. In the **Find Ticket** tab, type the ticket key (e.g. `PROJ-123`) or search by text
3. Click the ticket in the results to link it to the current tab

### Option B — Create a new ticket and link it

1. Click the **🎟** Jira button in the toolbar
2. Switch to the **Create Ticket** tab
3. Fill in:
   - **Summary** (required) — the ticket title
   - **Description** (optional)
   - **Issue Type** — Bug, Task, Story, or Epic
   - **Priority** — Highest, High, Medium, Low, or Lowest
4. Click **Create & Link to Tab**

The new ticket is created in Jira and automatically linked to the current tab.

### Option C — Type a ticket key in the terminal

If you paste or type a Jira ticket key anywhere in the terminal (e.g. when running a command that references `PROJ-123`), a **Smart HUD** will appear at the bottom of the screen. Click **🔗 Link to Tab** to link it immediately.

---

## Step 4 — Working With a Linked Ticket

Once a ticket is linked, open the **Jira side panel** by clicking the **🎟** button in the toolbar. The panel has three tabs:

### Ticket tab

Shows the full details of the linked ticket:

- **Status**, **Priority**, **Issue Type**, **Assignee**
- **Suggested branch name** — click 📋 to copy it to your clipboard
- **Suggested PR title** — click 📋 to copy it to your clipboard
- **Move to** — transition buttons to update the ticket status (e.g. move from *To Do* → *In Progress*)
- **Add Comment** — type a comment and click **Add Comment** to post it to Jira

### Search tab

Search for any ticket in your Jira instance. Click a result to link it to the current tab.

### Create tab

Create a new ticket directly from the panel (same as Option B above).

---

## Branch Names and PR Titles

Forge automatically generates a branch name and PR title from the linked ticket. The defaults are:

| Item | Default format | Example |
|---|---|---|
| **Branch name** | `{type}/{key}-{slug}` | `fix/proj-123-button-not-responding` |
| **PR title** | `{key}: {summary}` | `PROJ-123: Button not responding on mobile` |

The `{type}` maps from the Jira issue type:
- Bug → `fix`
- Task or Sub-task → `task`
- Epic → `epic`
- Everything else → `feature`

### Customising the templates

In **Settings → 🎟 Jira**, scroll to the template fields:

| Variable | Replaced with |
|---|---|
| `{{key}}` | Ticket key in uppercase, e.g. `PROJ-123` |
| `{{type}}` | Derived type — `fix`, `task`, `epic`, or `feature` |
| `{{slug}}` | Ticket summary, lowercased and hyphenated (max 40 chars) |
| `{{summary}}` | Full ticket summary text |

Example custom branch template: `feature/{{key}}-{{slug}}`

---

## Command Cards

Four command cards are available in the **Jira** category for quick access:

| Card | What it does |
|---|---|
| 🎟 **Jira: Link Ticket** | Opens the modal to search and link a ticket |
| 🎟 **Jira: Create Ticket** | Opens the modal on the Create tab |
| 🌿 **Jira: Copy Branch Name** | Copies the suggested branch name to clipboard |
| 📋 **Jira: Copy PR Title** | Copies the suggested PR title to clipboard |

To use a command card, open the command card panel and click the card, or drag it into the terminal.

---

## UI Surfaces

You can control which Jira UI elements are visible in **Settings → 🎟 Jira**:

| Toggle | What it controls |
|---|---|
| **Sidebar Panel** | The 🎟 panel with Ticket / Search / Create tabs |
| **Quick Modal** | The floating modal opened via toolbar button or command card |
| **Smart HUD** | The overlay that appears when a Jira key is detected in terminal output |

---

## Troubleshooting

**"Test Connection" fails**
- Make sure the URL has no trailing slash and no `/webhook` or other path appended
- For Cloud: confirm the email matches the account that owns the token
- For Server: confirm the PAT has not expired

**No suggested branch or PR title**
- Make sure a ticket is linked to the tab (blue badge should appear on the tab)
- Check that the ticket was fetched successfully (open the Ticket tab in the side panel)

**Ticket badge not showing on tab**
- Re-link the ticket using the Search tab
- Reload Forge Terminal if the badge still does not appear

**Transitions / "Move to" buttons not appearing**
- Your Jira workflow may not allow transitions from the current status
- Check the ticket status in Jira directly to confirm available transitions
