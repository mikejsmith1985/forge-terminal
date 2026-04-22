// MCPDiscoveryCard.jsx — Browse and install external MCP servers.
//
// Forge's own MCP server exposes a curated set of tools (environment_detect,
// environment_run, workflow_status, …) — that's what MCPSetupCard is for.
//
// This card is the other half of the picture: a catalog of popular third-party
// MCP servers the user can add to their AI client (Copilot CLI, VS Code, Claude
// Code) alongside Forge. Each entry ships with a one-click config snippet so
// users who have never touched MCP before can get started with a copy+paste.
//
// No backend required — this is a static, curated list rendered client-side.

import React, { useState, useCallback } from 'react'
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Info,
  Search,
  BookOpen,
} from 'lucide-react'
import './MCPDiscoveryCard.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const COPY_RESET_DELAY_MS = 2000

// Tab identifiers for the per-server config snippet switcher.
const CONFIG_TAB_COPILOT = 'copilot'
const CONFIG_TAB_VSCODE  = 'vscode'
const CONFIG_TAB_CLAUDE  = 'claude'

const CONFIG_TABS = [
  { tabId: CONFIG_TAB_COPILOT, tabLabel: 'Copilot CLI' },
  { tabId: CONFIG_TAB_VSCODE,  tabLabel: 'VS Code'     },
  { tabId: CONFIG_TAB_CLAUDE,  tabLabel: 'Claude Code' },
]

// ── Curated MCP Server Catalog ────────────────────────────────────────────────
//
// Each entry describes a popular, actively-maintained MCP server. The config
// snippets are provided for each supported AI client so users can copy+paste
// without reading the upstream docs. When a client does not support a server
// natively, the `configs` object omits that tab and the UI hides it.
//
// Adding new servers: add an object to this array. The shape is:
//   id:          short ID used in React keys
//   name:        display name
//   category:    grouping tag shown in the chip
//   description: one-sentence summary
//   docsUrl:     link to upstream documentation
//   configs:     { copilot?, vscode?, claude? } stringified config snippets

const MCP_CATALOG = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    category: 'Core',
    description: 'Read, write, and search local files within a sandboxed root directory.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    configs: {
      copilot: `copilot mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /your/allowed/path`,
      vscode: JSON.stringify({
        servers: {
          filesystem: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/your/allowed/path'],
          },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/your/allowed/path'],
          },
        },
      }, null, 2),
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'DevOps',
    description: 'Browse repos, read issues and PRs, search code, and run Actions — all through GitHub\'s official MCP server.',
    docsUrl: 'https://github.com/github/github-mcp-server',
    configs: {
      copilot: `copilot mcp add github-mcp-server -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server`,
      vscode: JSON.stringify({
        servers: {
          github: {
            type: 'stdio',
            command: 'docker',
            args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<your PAT>' },
          },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          github: {
            command: 'docker',
            args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<your PAT>' },
          },
        },
      }, null, 2),
    },
  },
  {
    id: 'fetch',
    name: 'Fetch',
    category: 'Web',
    description: 'Retrieve the contents of any URL and convert it to Markdown. Great for reading docs on demand.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    configs: {
      copilot: `copilot mcp add fetch -- uvx mcp-server-fetch`,
      vscode: JSON.stringify({
        servers: {
          fetch: { type: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          fetch: { command: 'uvx', args: ['mcp-server-fetch'] },
        },
      }, null, 2),
    },
  },
  {
    id: 'memory',
    name: 'Memory',
    category: 'Agent',
    description: 'Persistent knowledge graph memory. The model can recall facts across sessions.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    configs: {
      copilot: `copilot mcp add memory -- npx -y @modelcontextprotocol/server-memory`,
      vscode: JSON.stringify({
        servers: {
          memory: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          memory: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
        },
      }, null, 2),
    },
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: 'Testing',
    description: 'Drive a real browser from your AI client — navigate, click, screenshot, scrape.',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    configs: {
      copilot: `copilot mcp add playwright -- npx -y @playwright/mcp@latest`,
      vscode: JSON.stringify({
        servers: {
          playwright: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
        },
      }, null, 2),
    },
  },
  {
    id: 'time',
    name: 'Time',
    category: 'Utility',
    description: 'Timezone-aware clock and date conversion. Small but surprisingly useful.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time',
    configs: {
      copilot: `copilot mcp add time -- uvx mcp-server-time`,
      vscode: JSON.stringify({
        servers: {
          time: { type: 'stdio', command: 'uvx', args: ['mcp-server-time'] },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          time: { command: 'uvx', args: ['mcp-server-time'] },
        },
      }, null, 2),
    },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'Data',
    description: 'Run read-only SQL against a PostgreSQL database with schema introspection.',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    configs: {
      copilot: `copilot mcp add postgres -- npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb`,
      vscode: JSON.stringify({
        servers: {
          postgres: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
          },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          postgres: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
          },
        },
      }, null, 2),
    },
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    category: 'Web',
    description: 'Web search via the Brave Search API (free tier available with API key).',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    configs: {
      copilot: `copilot mcp add brave-search -- npx -y @modelcontextprotocol/server-brave-search`,
      vscode: JSON.stringify({
        servers: {
          'brave-search': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: { BRAVE_API_KEY: '<your key>' },
          },
        },
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          'brave-search': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: { BRAVE_API_KEY: '<your key>' },
          },
        },
      }, null, 2),
    },
  },
]

const OFFICIAL_REGISTRY_URL = 'https://github.com/modelcontextprotocol/servers'
const MCP_PROTOCOL_URL = 'https://modelcontextprotocol.io/'

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * MCPDiscoveryCard — browse third-party MCP servers, learn the protocol, and
 * copy install snippets without leaving Forge.
 */
const MCPDiscoveryCard = () => {
  const [isExpanded, setIsExpanded]       = useState(false)
  const [isLearnOpen, setIsLearnOpen]     = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [activeTab, setActiveTab]         = useState(CONFIG_TAB_COPILOT)
  const [copiedServerId, setCopiedServerId] = useState(null)

  const toggleExpanded = useCallback(() => {
    setIsExpanded(previous => !previous)
  }, [])

  const handleTabChange = useCallback(selectedTabId => {
    setActiveTab(selectedTabId)
  }, [])

  const filteredCatalog = filterCatalog(MCP_CATALOG, searchQuery)

  async function copyServerConfig(serverId, configText) {
    await navigator.clipboard.writeText(configText)
    setCopiedServerId(serverId)
    setTimeout(() => setCopiedServerId(null), COPY_RESET_DELAY_MS)
  }

  return (
    <div className="mcp-discovery-card">
      <div className="mdc-header" onClick={toggleExpanded}>
        <div className="mdc-header-left">
          <Boxes size={18} className="mdc-icon" />
          <div className="mdc-header-info">
            <span className="mdc-title">MCP Discovery</span>
            <span className="mdc-subtitle">
              Browse {MCP_CATALOG.length} servers · Copy configs
            </span>
          </div>
        </div>
        <div className="mdc-header-right">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isExpanded && (
        <div className="mdc-body">
          <LearnSection
            isOpen={isLearnOpen}
            onToggle={() => setIsLearnOpen(p => !p)}
          />

          <div className="mdc-search-row">
            <Search size={14} className="mdc-search-icon" />
            <input
              className="mdc-search"
              type="text"
              placeholder="Filter servers by name, category, or description…"
              value={searchQuery}
              onChange={evt => setSearchQuery(evt.target.value)}
            />
          </div>

          <TabSwitcher
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />

          <div className="mdc-catalog">
            {filteredCatalog.length === 0 ? (
              <div className="mdc-empty">No servers match &ldquo;{searchQuery}&rdquo;.</div>
            ) : filteredCatalog.map(server => (
              <ServerEntry
                key={server.id}
                server={server}
                activeTab={activeTab}
                isCopied={copiedServerId === server.id}
                onCopy={() => copyServerConfig(server.id, server.configs[activeTab] || '')}
              />
            ))}
          </div>

          <div className="mdc-footer">
            <a
              className="mdc-link"
              href={OFFICIAL_REGISTRY_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse the full MCP server registry <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * LearnSection — a collapsible explainer for users new to MCP.
 */
const LearnSection = ({ isOpen, onToggle }) => (
  <div className="mdc-learn">
    <button className="mdc-learn-header" onClick={onToggle}>
      <BookOpen size={14} />
      <span>What is MCP?</span>
      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
    {isOpen && (
      <div className="mdc-learn-body">
        <p>
          <strong>MCP (Model Context Protocol)</strong> is an open standard that
          lets AI assistants like Copilot CLI, Claude Code, and VS Code talk to
          external tools in a uniform way.
        </p>
        <p>
          Instead of asking your AI to paste shell commands, an MCP server exposes
          real capabilities — <em>read this file</em>, <em>run this build</em>,
          <em> search the web</em> — that the AI can invoke directly, see the
          results, and reason about.
        </p>
        <p>
          Forge is itself an MCP server (see the <strong>Adaptive Build
          Environments</strong> card). This catalog lets you add more MCP servers
          alongside Forge for things Forge does not handle — GitHub, web search,
          browser automation, memory, and more.
        </p>
        <a
          className="mdc-link"
          href={MCP_PROTOCOL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the MCP specification <ExternalLink size={12} />
        </a>
      </div>
    )}
  </div>
)

/**
 * TabSwitcher — picks which AI client's config snippet the catalog shows.
 */
const TabSwitcher = ({ activeTab, onTabChange }) => (
  <div className="mdc-tabs" role="tablist">
    {CONFIG_TABS.map(tab => (
      <button
        key={tab.tabId}
        role="tab"
        aria-selected={activeTab === tab.tabId}
        className={`mdc-tab ${activeTab === tab.tabId ? 'mdc-tab-active' : ''}`}
        onClick={() => onTabChange(tab.tabId)}
      >
        {tab.tabLabel}
      </button>
    ))}
  </div>
)

/**
 * ServerEntry — one row in the catalog. Header with name + category, body with
 * the description, docs link, and copy-config button.
 */
const ServerEntry = ({ server, activeTab, isCopied, onCopy }) => {
  const configText = server.configs[activeTab] || ''
  const hasConfig = configText.length > 0

  return (
    <div className="mdc-server">
      <div className="mdc-server-head">
        <div className="mdc-server-title-row">
          <span className="mdc-server-name">{server.name}</span>
          <span className="mdc-server-category">{server.category}</span>
        </div>
        <a
          className="mdc-docs-btn"
          href={server.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open upstream documentation"
        >
          <ExternalLink size={12} />
        </a>
      </div>
      <p className="mdc-server-desc">{server.description}</p>
      {hasConfig ? (
        <div className="mdc-config-row">
          <code className="mdc-config-snippet">{configText}</code>
          <button
            className="mdc-btn"
            onClick={onCopy}
            title={`Copy ${server.name} config for ${activeTab}`}
          >
            {isCopied
              ? <><Check size={12} /> Copied</>
              : <><Copy size={12} /> Copy</>
            }
          </button>
        </div>
      ) : (
        <div className="mdc-config-unsupported">
          <Info size={12} />
          No preset config for this client yet — see docs.
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * filterCatalog — case-insensitive substring match over name/category/description.
 */
function filterCatalog(catalog, rawQuery) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return catalog
  return catalog.filter(server => (
    server.name.toLowerCase().includes(query) ||
    server.category.toLowerCase().includes(query) ||
    server.description.toLowerCase().includes(query)
  ))
}

export default MCPDiscoveryCard
