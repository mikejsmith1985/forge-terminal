// MCPPanel.jsx — Sidebar card for the Forge Terminal MCP server dashboard.
//
// Shows connection status, registered tools, task queue, and generates
// one-click config snippets for Claude Desktop, VS Code, and Cursor.
// Lives in the "Cards" sidebar view alongside CommandCards and DirectoryCard.
import React, { useState, useCallback, useMemo } from 'react'
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Server,
  Copy,
  Check,
  Wrench,
  ClipboardList,
  Plug,
  Circle,
} from 'lucide-react'
import { useMCPStatus } from '../hooks/useMCPStatus'
import './MCPPanel.css'

// ── Tool icon mapping — gives each tool category a visual identity ──────────

const TOOL_CATEGORY_ICONS = {
  terminal: '🖥️',
  file: '📁',
  task: '📋',
  workflow: '⚙️',
}

/** Returns an emoji icon based on the tool name prefix. */
const getToolIcon = (toolName) => {
  if (toolName.startsWith('terminal_')) return TOOL_CATEGORY_ICONS.terminal
  if (toolName.startsWith('file_')) return TOOL_CATEGORY_ICONS.file
  if (toolName.startsWith('task_')) return TOOL_CATEGORY_ICONS.task
  if (toolName.startsWith('workflow_')) return TOOL_CATEGORY_ICONS.workflow
  return '🔧'
}

// ── Task status badge colors ────────────────────────────────────────────────

const TASK_STATUS_CLASS = {
  pending: 'mcp-badge-pending',
  running: 'mcp-badge-running',
  done: 'mcp-badge-done',
  failed: 'mcp-badge-failed',
}

// ── Config snippet generators ───────────────────────────────────────────────

/**
 * Builds ready-to-paste MCP client configuration JSON for popular AI tools.
 * Each returns a prettified JSON string the user can copy into their config.
 */
const generateConfigSnippets = (baseUrl) => {
  const endpoint = `${baseUrl}/api/mcp`

  return {
    claudeDesktop: JSON.stringify({
      mcpServers: {
        'forge-terminal': {
          url: endpoint,
          transport: 'streamable-http',
          headers: {
            Authorization: 'Bearer <paste-token-here>',
          },
        },
      },
    }, null, 2),

    vscodeCopilot: JSON.stringify({
      servers: {
        'forge-terminal': {
          type: 'http',
          url: endpoint,
          headers: {
            Authorization: 'Bearer <paste-token-here>',
          },
        },
      },
    }, null, 2),

    cursor: JSON.stringify({
      mcpServers: {
        'forge-terminal': {
          url: endpoint,
          headers: {
            Authorization: 'Bearer <paste-token-here>',
          },
        },
      },
    }, null, 2),
  }
}

// ── Component ───────────────────────────────────────────────────────────────

const MCPPanel = ({ onToast }) => {
  const { serverStatus, tasks, isLoading, error, refresh, copyToken } = useMCPStatus()

  const [isExpanded, setIsExpanded] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState('claudeDesktop')
  const [isTokenCopied, setIsTokenCopied] = useState(false)
  const [isConfigCopied, setIsConfigCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Derive the base URL from the current window location so the config
  // snippet works regardless of which port Forge starts on.
  const baseUrl = useMemo(() => {
    return `${window.location.protocol}//${window.location.host}`
  }, [])

  const configSnippets = useMemo(() => generateConfigSnippets(baseUrl), [baseUrl])

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleCopyToken = useCallback(async () => {
    const isSuccess = await copyToken()
    if (isSuccess) {
      setIsTokenCopied(true)
      if (onToast) onToast('MCP token copied to clipboard', 'success', 3000)
      setTimeout(() => setIsTokenCopied(false), 2000)
    }
  }, [copyToken, onToast])

  const handleCopyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(configSnippets[activeConfigTab])
      setIsConfigCopied(true)
      if (onToast) onToast('Config snippet copied to clipboard', 'success', 3000)
      setTimeout(() => setIsConfigCopied(false), 2000)
    } catch {
      if (onToast) onToast('Failed to copy to clipboard', 'error', 3000)
    }
  }, [configSnippets, activeConfigTab, onToast])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await refresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [refresh])

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mcp-panel mcp-panel-loading">
        <div className="mcp-header">
          <div className="mcp-header-left">
            <Server size={18} className="mcp-server-icon" />
            <div className="mcp-header-info">
              <span className="mcp-title">MCP Server</span>
              <span className="mcp-subtitle">Loading…</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Derived state ───────────────────────────────────────────────────────

  const isEnabled = serverStatus?.enabled ?? false
  const toolCount = serverStatus?.tools?.length ?? 0
  const taskCount = tasks.length

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={`mcp-panel ${isEnabled ? 'mcp-panel-enabled' : 'mcp-panel-disabled'}`}>
      {/* Collapsible Header */}
      <div className="mcp-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="mcp-header-left">
          <Server size={18} className="mcp-server-icon" />
          <div className="mcp-header-info">
            <span className="mcp-title">MCP Server</span>
            <span className="mcp-subtitle">
              {isEnabled
                ? `${toolCount} tools · ${taskCount} task${taskCount !== 1 ? 's' : ''}`
                : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="mcp-header-right">
          <span className={`mcp-status-dot ${isEnabled ? 'mcp-status-active' : 'mcp-status-inactive'}`}>
            <Circle size={8} fill="currentColor" />
          </span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mcp-error-banner">
          {error}
        </div>
      )}

      {/* Expanded Body */}
      {isExpanded && (
        <div className="mcp-body">
          {isEnabled ? (
            <>
              {/* ── Connection Info Section ─────────────────────────────── */}
              <div className="mcp-section">
                <div className="mcp-section-header">
                  <Plug size={14} />
                  <span>Connection</span>
                  <button
                    className="mcp-refresh-btn"
                    onClick={(event) => { event.stopPropagation(); handleRefresh() }}
                    title="Refresh status"
                  >
                    <RefreshCw size={12} className={isRefreshing ? 'mcp-spin' : ''} />
                  </button>
                </div>
                <div className="mcp-info-grid">
                  <div className="mcp-info-row">
                    <span className="mcp-info-label">Endpoint</span>
                    <code className="mcp-info-value">{baseUrl}/api/mcp</code>
                  </div>
                  <div className="mcp-info-row">
                    <span className="mcp-info-label">Protocol</span>
                    <span className="mcp-info-value">{serverStatus?.protocol || 'MCP'}</span>
                  </div>
                  <div className="mcp-info-row">
                    <span className="mcp-info-label">Token</span>
                    <div className="mcp-token-row">
                      <code className="mcp-info-value mcp-token-hint">
                        {serverStatus?.tokenHint || '****'}
                      </code>
                      <button
                        className="mcp-copy-btn"
                        onClick={(event) => { event.stopPropagation(); handleCopyToken() }}
                        title="Copy full token"
                      >
                        {isTokenCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Tools Section ───────────────────────────────────────── */}
              <div className="mcp-section">
                <div className="mcp-section-header">
                  <Wrench size={14} />
                  <span>Available Tools ({toolCount})</span>
                </div>
                <div className="mcp-tool-list">
                  {(serverStatus?.tools || []).sort().map((toolName) => (
                    <div key={toolName} className="mcp-tool-item">
                      <span className="mcp-tool-icon">{getToolIcon(toolName)}</span>
                      <span className="mcp-tool-name">{toolName}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Task Queue Section ──────────────────────────────────── */}
              <div className="mcp-section">
                <div className="mcp-section-header">
                  <ClipboardList size={14} />
                  <span>Task Queue ({taskCount})</span>
                </div>
                {taskCount === 0 ? (
                  <div className="mcp-empty-state">
                    No tasks submitted yet. External MCP clients can submit tasks
                    via the <code>task_submit</code> tool.
                  </div>
                ) : (
                  <div className="mcp-task-list">
                    {tasks
                      .sort((taskA, taskB) => new Date(taskB.submittedAt) - new Date(taskA.submittedAt))
                      .slice(0, 10)
                      .map((task) => (
                        <div key={task.id} className="mcp-task-item">
                          <div className="mcp-task-header-row">
                            <span className="mcp-task-type">{task.type}</span>
                            <span className={`mcp-badge ${TASK_STATUS_CLASS[task.status] || ''}`}>
                              {task.status}
                            </span>
                          </div>
                          <div className="mcp-task-meta">
                            {task.source && <span className="mcp-task-source">from {task.source}</span>}
                            <span className="mcp-task-time">
                              {new Date(task.submittedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* ── Config Snippets Section ─────────────────────────────── */}
              <div className="mcp-section">
                <div className="mcp-section-header">
                  <Plug size={14} />
                  <span>Quick Connect</span>
                </div>
                <div className="mcp-config-tabs">
                  <button
                    className={`mcp-config-tab ${activeConfigTab === 'claudeDesktop' ? 'active' : ''}`}
                    onClick={(event) => { event.stopPropagation(); setActiveConfigTab('claudeDesktop') }}
                  >
                    Claude
                  </button>
                  <button
                    className={`mcp-config-tab ${activeConfigTab === 'vscodeCopilot' ? 'active' : ''}`}
                    onClick={(event) => { event.stopPropagation(); setActiveConfigTab('vscodeCopilot') }}
                  >
                    VS Code
                  </button>
                  <button
                    className={`mcp-config-tab ${activeConfigTab === 'cursor' ? 'active' : ''}`}
                    onClick={(event) => { event.stopPropagation(); setActiveConfigTab('cursor') }}
                  >
                    Cursor
                  </button>
                </div>
                <div className="mcp-config-snippet-wrapper">
                  <pre className="mcp-config-snippet">
                    {configSnippets[activeConfigTab]}
                  </pre>
                  <button
                    className="mcp-copy-config-btn"
                    onClick={(event) => { event.stopPropagation(); handleCopyConfig() }}
                    title="Copy config to clipboard"
                  >
                    {isConfigCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="mcp-config-hint">
                  Replace <code>&lt;paste-token-here&gt;</code> with the copied token above.
                </p>
              </div>
            </>
          ) : (
            /* ── Disabled state ──────────────────────────────────────── */
            <div className="mcp-disabled-body">
              <p className="mcp-disabled-message">
                MCP server is disabled. Enable it in <code>forge.toml</code>:
              </p>
              <pre className="mcp-config-snippet mcp-config-enable">
{`[mcp]
enabled = true`}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MCPPanel
