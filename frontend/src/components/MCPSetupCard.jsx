// MCPSetupCard.jsx — Command-panel card for the Adaptive Build Environments MCP feature.
// Gives users a visual walkthrough of their MCP server status, token location, AI client
// connection guides, and the full list of registered MCP tools.

import React, { useState, useEffect, useCallback } from 'react'
import { Cpu, ChevronDown, ChevronUp, Copy, Check, Zap, Terminal, Info } from 'lucide-react'
import './MCPSetupCard.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_PATH = '~/.forge/mcp-token'
const COPY_RESET_DELAY_MS = 2000

// Tab identifiers for the "Connect your AI tool" section.
const CLIENT_TAB_COPILOT = 'copilot'
const CLIENT_TAB_VSCODE = 'vscode'
const CLIENT_TAB_CLAUDE = 'claude'

// Ordered list of tabs rendered in the switcher bar.
const CLIENT_TABS = [
  { tabId: CLIENT_TAB_COPILOT, tabLabel: 'Copilot CLI' },
  { tabId: CLIENT_TAB_VSCODE,  tabLabel: 'VS Code'     },
  { tabId: CLIENT_TAB_CLAUDE,  tabLabel: 'Claude Code' },
]

// These two tools are sorted to the top of the tool list and highlighted with a star.
const FEATURED_TOOL_NAMES = ['environment_detect', 'environment_run']

// Short descriptions shown only for the featured (Adaptive Build Environment) tools.
const FEATURED_TOOL_DESCRIPTIONS = {
  environment_detect: 'Probe WSL2 & Docker availability before choosing a strategy',
  environment_run:    'Run builds in native, WSL2, or Docker — auto-selects on Windows',
}

// Config snippets copied to clipboard from the VS Code and Claude tabs.
const VSCODE_CONFIG_JSON = JSON.stringify(
  {
    servers: {
      forge: {
        type: 'http',
        url: 'http://localhost:3005/api/mcp',
        headers: { Authorization: 'Bearer <paste your token>' },
      },
    },
  },
  null,
  2
)

// Claude Code connects via a local Node process rather than an HTTP endpoint.
const CLAUDE_CONFIG_JSON = JSON.stringify(
  {
    mcpServers: {
      forge: {
        command: 'node',
        args: ['<path-to-forge>/mcp-forge-vault/index.js'],
      },
    },
  },
  null,
  2
)

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * MCPSetupCard — Sidebar card for the Adaptive Build Environments MCP feature.
 *
 * Shows a collapsed header (always visible) and an expanded body with:
 * - Live MCP server status fetched from GET /api/mcp/ui-status
 * - Token path and a one-click copy button
 * - Connection instructions for Copilot CLI, VS Code, and Claude Code
 * - A callout explaining when to use environment_run on Windows
 * - The full list of registered tools with environment_detect / environment_run highlighted
 *
 * No props required — the card is self-contained and fetches its own data.
 */
const MCPSetupCard = () => {
  const [isExpanded, setIsExpanded]           = useState(false)
  const [mcpStatus, setMcpStatus]             = useState(null)   // null = still loading
  const [isFetchingStatus, setIsFetchingStatus] = useState(true)
  const [activeClientTab, setActiveClientTab] = useState(CLIENT_TAB_COPILOT)
  const [hasCopiedToken, setHasCopiedToken]   = useState(false)
  const [hasCopiedConfig, setHasCopiedConfig] = useState(false)

  // Fetch MCP status once on mount so the header badge is accurate immediately.
  useEffect(() => {
    fetchStatus()
  }, [])

  async function fetchStatus() {
    setIsFetchingStatus(true)
    try {
      const response = await fetch('/api/mcp/ui-status')
      const data = await response.json()
      setMcpStatus(data)
    } catch {
      // Fallback so the card still renders when the backend is unreachable
      // (e.g. during frontend-only dev mode).
      setMcpStatus({ is_enabled: false, active_tools: [], tool_count: 0, token_path: DEFAULT_TOKEN_PATH })
    } finally {
      setIsFetchingStatus(false)
    }
  }

  const toggleExpanded = useCallback(() => {
    setIsExpanded(previousIsExpanded => !previousIsExpanded)
  }, [])

  const handleTabChange = useCallback((selectedTabId) => {
    setActiveClientTab(selectedTabId)
  }, [])

  async function copyTokenPath() {
    await navigator.clipboard.writeText(mcpStatus?.token_path || DEFAULT_TOKEN_PATH)
    setHasCopiedToken(true)
    setTimeout(() => setHasCopiedToken(false), COPY_RESET_DELAY_MS)
  }

  async function copyClientConfig() {
    // Only VS Code and Claude tabs have config JSON to copy; Copilot CLI is auto-connected.
    const configText = activeClientTab === CLIENT_TAB_VSCODE ? VSCODE_CONFIG_JSON : CLAUDE_CONFIG_JSON
    await navigator.clipboard.writeText(configText)
    setHasCopiedConfig(true)
    setTimeout(() => setHasCopiedConfig(false), COPY_RESET_DELAY_MS)
  }

  const toolCount = mcpStatus?.tool_count ?? 0
  const isEnabled = mcpStatus?.is_enabled ?? false
  const activeBadge = isEnabled
    ? <span className="msc-badge msc-badge-active">● Active</span>
    : <span className="msc-badge msc-badge-inactive">○ Inactive</span>

  return (
    <div className="mcp-setup-card">
      {/* Collapsed header — always visible; clicking toggles the body */}
      <div className="msc-header" onClick={toggleExpanded}>
        <div className="msc-header-left">
          <Cpu size={18} className="msc-icon" />
          <div className="msc-header-info">
            <span className="msc-title">Adaptive Build Environments</span>
            <span className="msc-subtitle">
              {isFetchingStatus ? 'Loading…' : `${toolCount} tools · Auto Environment`}
            </span>
          </div>
        </div>
        <div className="msc-header-right">
          {!isFetchingStatus && activeBadge}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded body — conditionally rendered when the user clicks the header */}
      {isExpanded && (
        <div className="msc-body">
          <StatusRow isEnabled={isEnabled} toolCount={toolCount} />

          <TokenSection
            tokenPath={mcpStatus?.token_path || DEFAULT_TOKEN_PATH}
            hasCopiedToken={hasCopiedToken}
            onCopy={copyTokenPath}
          />

          <ClientTabSection
            activeClientTab={activeClientTab}
            onTabChange={handleTabChange}
            hasCopiedConfig={hasCopiedConfig}
            onCopyConfig={copyClientConfig}
          />

          <BuildCallout />

          <ToolsList activeTools={mcpStatus?.active_tools || []} />
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * StatusRow — Single line summarising enabled state and registered tool count.
 *
 * @param {Object}  props
 * @param {boolean} props.isEnabled  - Whether the MCP server is active
 * @param {number}  props.toolCount  - Number of tools currently registered
 */
function StatusRow({ isEnabled, toolCount }) {
  return (
    <div className="msc-status-row">
      <Zap
        size={13}
        className={`msc-status-icon ${isEnabled ? 'msc-status-icon-active' : 'msc-status-icon-inactive'}`}
      />
      <span className="msc-status-text">
        {isEnabled
          ? `Active · ${toolCount} tools registered`
          : 'Inactive · MCP server is not running'
        }
      </span>
    </div>
  )
}

/**
 * TokenSection — Shows the on-disk MCP token path with a one-click copy button.
 * The token is needed when connecting VS Code or other HTTP-based MCP clients.
 *
 * @param {Object}   props
 * @param {string}   props.tokenPath       - Filesystem path to the MCP token file
 * @param {boolean}  props.hasCopiedToken  - True for 2 s after a successful copy (shows checkmark)
 * @param {Function} props.onCopy          - Callback that writes the token path to the clipboard
 */
function TokenSection({ tokenPath, hasCopiedToken, onCopy }) {
  return (
    <div className="msc-section">
      <span className="msc-section-label">MCP Token</span>
      <div className="msc-token-row">
        <code className="msc-token-path">{tokenPath}</code>
        <button
          className="msc-copy-btn"
          onClick={onCopy}
          title="Copy token path to clipboard"
          aria-label="Copy token path"
        >
          {hasCopiedToken ? <Check size={13} /> : <Copy size={13} />}
          {hasCopiedToken ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * ClientTabSection — Tab switcher + connection instructions for each supported AI client.
 * Tabs: Copilot CLI (auto-connected), VS Code (HTTP JSON config), Claude Code (Node config).
 *
 * @param {Object}   props
 * @param {string}   props.activeClientTab  - Currently selected tab ID constant
 * @param {Function} props.onTabChange      - Callback receiving the selected tab ID
 * @param {boolean}  props.hasCopiedConfig  - True for 2 s after a successful config copy
 * @param {Function} props.onCopyConfig     - Callback that copies the active tab's config JSON
 */
function ClientTabSection({ activeClientTab, onTabChange, hasCopiedConfig, onCopyConfig }) {
  return (
    <div className="msc-section">
      <span className="msc-section-label">Connect your AI tool</span>
      <div className="msc-tab-bar">
        {CLIENT_TABS.map(({ tabId, tabLabel }) => (
          <button
            key={tabId}
            className={`msc-tab ${activeClientTab === tabId ? 'msc-tab-active' : ''}`}
            onClick={() => onTabChange(tabId)}
          >
            {tabLabel}
          </button>
        ))}
      </div>
      <ClientTabContent
        activeClientTab={activeClientTab}
        hasCopiedConfig={hasCopiedConfig}
        onCopyConfig={onCopyConfig}
      />
    </div>
  )
}

/**
 * ClientTabContent — Renders the instruction body for the currently selected client tab.
 *
 * @param {Object}   props
 * @param {string}   props.activeClientTab  - Currently selected tab ID constant
 * @param {boolean}  props.hasCopiedConfig  - Controls copy button icon/label
 * @param {Function} props.onCopyConfig     - Copies the active config JSON to clipboard
 */
function ClientTabContent({ activeClientTab, hasCopiedConfig, onCopyConfig }) {
  if (activeClientTab === CLIENT_TAB_COPILOT) {
    return (
      <div className="msc-tab-content">
        <p className="msc-tab-intro msc-tab-already-connected">
          <Terminal size={13} /> Already connected.
        </p>
        <p className="msc-tab-description">
          Forge MCP tools are available in this terminal session automatically.
          Use <code>environment_run</code> to run builds in WSL2 or Docker.
        </p>
      </div>
    )
  }

  if (activeClientTab === CLIENT_TAB_VSCODE) {
    return (
      <div className="msc-tab-content">
        <p className="msc-tab-description">
          Add to your workspace <code>.vscode/mcp.json</code>:
        </p>
        <div className="msc-code-block">
          <pre>{VSCODE_CONFIG_JSON}</pre>
          <CopyConfigButton hasCopied={hasCopiedConfig} onCopy={onCopyConfig} />
        </div>
      </div>
    )
  }

  // Claude Code tab — connects via a local Node process
  return (
    <div className="msc-tab-content">
      <p className="msc-tab-description">
        Add to <code>~/.claude/claude_desktop_config.json</code>:
      </p>
      <div className="msc-code-block">
        <pre>{CLAUDE_CONFIG_JSON}</pre>
        <CopyConfigButton hasCopied={hasCopiedConfig} onCopy={onCopyConfig} />
      </div>
    </div>
  )
}

/**
 * CopyConfigButton — Small overlay button inside a code block that copies the config JSON.
 *
 * @param {Object}   props
 * @param {boolean}  props.hasCopied - True for 2 s after a successful copy
 * @param {Function} props.onCopy    - Callback that performs the clipboard write
 */
function CopyConfigButton({ hasCopied, onCopy }) {
  return (
    <button
      className="msc-code-copy-btn"
      onClick={onCopy}
      title="Copy config to clipboard"
      aria-label="Copy configuration JSON"
    >
      {hasCopied ? <Check size={12} /> : <Copy size={12} />}
      {hasCopied ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * BuildCallout — Teal-accented tip box explaining when to reach for environment_run.
 * Shown whenever the card is expanded, regardless of MCP enabled state.
 */
function BuildCallout() {
  return (
    <div className="msc-callout">
      <Info size={14} className="msc-callout-icon" />
      <div className="msc-callout-body">
        <strong className="msc-callout-title">💡 Hitting Windows build issues?</strong>
        <p className="msc-callout-text">
          When npm build, OpenNext, or Turbopack fails on Windows, ask your agent:
        </p>
        <code className="msc-callout-quote">
          "Use environment_run with auto strategy to build this"
        </code>
        <p className="msc-callout-text">
          Forge will pick WSL2 or Docker automatically.
        </p>
      </div>
    </div>
  )
}

/**
 * ToolsList — Compact list of all registered MCP tools.
 * The two Adaptive Build Environment tools are sorted first and highlighted with ★.
 *
 * @param {Object}   props
 * @param {string[]} props.activeTools - Tool names returned by GET /api/mcp/ui-status
 */
function ToolsList({ activeTools }) {
  if (activeTools.length === 0) return null

  // Featured tools appear first so they stand out; the rest follow in their original order.
  const featuredTools  = FEATURED_TOOL_NAMES.filter(toolName => activeTools.includes(toolName))
  const remainingTools = activeTools.filter(toolName => !FEATURED_TOOL_NAMES.includes(toolName))
  const orderedTools   = [...featuredTools, ...remainingTools]

  return (
    <div className="msc-section">
      <span className="msc-section-label">Active tools</span>
      <ul className="msc-tools-list">
        {orderedTools.map(toolName => {
          const isFeatured    = FEATURED_TOOL_NAMES.includes(toolName)
          const toolDescription = FEATURED_TOOL_DESCRIPTIONS[toolName]
          return (
            <li key={toolName} className={`msc-tool-item ${isFeatured ? 'msc-tool-item-featured' : ''}`}>
              <span className="msc-tool-name">{toolName}</span>
              {isFeatured && (
                <span className="msc-tool-star" title="Adaptive Build Environment tool">★</span>
              )}
              {toolDescription && (
                <span className="msc-tool-description">{toolDescription}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default MCPSetupCard
