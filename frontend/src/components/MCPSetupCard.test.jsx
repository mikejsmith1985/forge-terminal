// MCPSetupCard.test.jsx — Unit tests for the Adaptive Build Environments sidebar card.
// Verifies rendering, state transitions, tab switching, and clipboard interactions.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MCPSetupCard from './MCPSetupCard'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockClipboardWriteText = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWriteText },
  writable: true,
})

// Default API response representing an active MCP server with ten tools.
const ACTIVE_MCP_STATUS_RESPONSE = {
  is_enabled: true,
  active_tools: [
    'environment_detect',
    'environment_run',
    'environment_jobs',
    'environment_read_job',
    'file_read',
    'file_write',
    'file_list',
    'task_submit',
    'terminal_execute',
    'terminal_read',
    'terminal_sessions',
    'workflow_status',
  ],
  tool_count: 12,
  token_path: '/Users/mike/.forge/mcp-token',
}

beforeEach(() => {
  mockFetch.mockReset()
  mockClipboardWriteText.mockReset()
})

// ── Collapsed State ───────────────────────────────────────────────────────────

describe('MCPSetupCard — collapsed header', () => {
  it('renders the card title', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    expect(screen.getByText('Adaptive Build Environments')).toBeInTheDocument()
  })

  it('shows Loading… subtitle while fetching', () => {
    // Never resolve so the fetch stays in flight
    mockFetch.mockReturnValueOnce(new Promise(() => {}))
    render(<MCPSetupCard />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows tool count in subtitle after fetching', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => expect(screen.getByText('12 tools · Auto Environment')).toBeInTheDocument())
  })

  it('shows Active badge when MCP is enabled', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => expect(screen.getByText('● Active')).toBeInTheDocument())
  })

  it('shows Inactive badge when MCP is disabled', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ...ACTIVE_MCP_STATUS_RESPONSE, is_enabled: false }),
    })
    render(<MCPSetupCard />)
    await waitFor(() => expect(screen.getByText('○ Inactive')).toBeInTheDocument())
  })

  it('falls back to default status on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))
    render(<MCPSetupCard />)
    // Tool count 0 comes from the error fallback object
    await waitFor(() => expect(screen.getByText('0 tools · Auto Environment')).toBeInTheDocument())
  })
})

// ── Expand / Collapse ─────────────────────────────────────────────────────────

describe('MCPSetupCard — expand / collapse', () => {
  it('does not render body by default', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    expect(screen.queryByText('MCP Token')).not.toBeInTheDocument()
  })

  it('shows body after clicking the header', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))

    fireEvent.click(screen.getByText('Adaptive Build Environments'))
    expect(screen.getByText('MCP Token')).toBeInTheDocument()
  })

  it('hides body again after a second header click', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))

    const header = screen.getByText('Adaptive Build Environments')
    fireEvent.click(header)
    expect(screen.getByText('MCP Token')).toBeInTheDocument()

    fireEvent.click(header)
    expect(screen.queryByText('MCP Token')).not.toBeInTheDocument()
  })
})

// ── Status Row ────────────────────────────────────────────────────────────────

describe('MCPSetupCard — status row', () => {
  async function openCard(statusResponse) {
    mockFetch.mockResolvedValueOnce({ json: async () => statusResponse })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText(`${statusResponse.tool_count} tools · Auto Environment`))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
  }

  it('shows active message when enabled', async () => {
    await openCard(ACTIVE_MCP_STATUS_RESPONSE)
    expect(screen.getByText('Active · 12 tools registered')).toBeInTheDocument()
  })

  it('shows inactive message when disabled', async () => {
    await openCard({ ...ACTIVE_MCP_STATUS_RESPONSE, is_enabled: false, tool_count: 0 })
    expect(screen.getByText('Inactive · MCP server is not running')).toBeInTheDocument()
  })
})

// ── Token Section ─────────────────────────────────────────────────────────────

describe('MCPSetupCard — token section', () => {
  beforeEach(async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
  })

  it('displays the token path returned by the API', () => {
    expect(screen.getByText('/Users/mike/.forge/mcp-token')).toBeInTheDocument()
  })

  it('copies the token path when Copy is clicked', async () => {
    mockClipboardWriteText.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: /copy token path/i }))
    await waitFor(() => expect(mockClipboardWriteText).toHaveBeenCalledWith('/Users/mike/.forge/mcp-token'))
  })

  it('shows Copied label after successful copy', async () => {
    mockClipboardWriteText.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: /copy token path/i }))
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument())
  })
})

// ── Client Tab Switching ──────────────────────────────────────────────────────

describe('MCPSetupCard — client tabs', () => {
  beforeEach(async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
  })

  it('defaults to the Copilot CLI tab', () => {
    expect(screen.getByText('Already connected.')).toBeInTheDocument()
  })

  it('renders Copilot CLI guidance text', () => {
    expect(screen.getByText(/available in this terminal session automatically/i)).toBeInTheDocument()
  })

  it('switches to VS Code tab and shows config JSON', () => {
    fireEvent.click(screen.getByRole('button', { name: 'VS Code' }))
    expect(screen.getByText(/Add to your workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/localhost:3005\/api\/mcp/i)).toBeInTheDocument()
  })

  it('switches to Claude Code tab and shows config JSON', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    expect(screen.getByText(/claude_desktop_config\.json/i)).toBeInTheDocument()
    expect(screen.getByText(/mcp-forge-vault\/index\.js/i)).toBeInTheDocument()
  })

  it('shows Copy button on VS Code tab', () => {
    fireEvent.click(screen.getByRole('button', { name: 'VS Code' }))
    expect(screen.getByRole('button', { name: /copy configuration json/i })).toBeInTheDocument()
  })

  it('copies VS Code config JSON when Copy is clicked', async () => {
    mockClipboardWriteText.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'VS Code' }))
    fireEvent.click(screen.getByRole('button', { name: /copy configuration json/i }))
    await waitFor(() =>
      expect(mockClipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('localhost:3005'))
    )
  })
})

// ── Build Callout ─────────────────────────────────────────────────────────────

describe('MCPSetupCard — build callout', () => {
  it('shows the Windows build callout when expanded', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
    expect(screen.getByText(/Hitting Windows build issues/i)).toBeInTheDocument()
  })

  it('shows the environment_run agent prompt quote', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
    expect(screen.getByText(/environment_run with auto strategy/i)).toBeInTheDocument()
  })
})

// ── Tools List ────────────────────────────────────────────────────────────────

describe('MCPSetupCard — tools list', () => {
  beforeEach(async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ACTIVE_MCP_STATUS_RESPONSE })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('12 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
  })

  it('renders all active tools', () => {
    // environment_run also appears in the Copilot tab description, so use getAllByText
    expect(screen.getByText('environment_detect')).toBeInTheDocument()
    expect(screen.getAllByText('environment_run').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('environment_jobs')).toBeInTheDocument()
    expect(screen.getByText('environment_read_job')).toBeInTheDocument()
    expect(screen.getByText('file_read')).toBeInTheDocument()
  })

  it('shows star icons for featured tools', () => {
    const stars = screen.getAllByTitle('Adaptive Build Environment tool')
    expect(stars).toHaveLength(4)
  })

  it('shows description for environment_detect', () => {
    expect(screen.getByText(/Probe WSL2 & Docker availability/i)).toBeInTheDocument()
  })

  it('shows description for environment_run', () => {
    expect(screen.getByText(/Run builds in native, WSL2, or Docker/i)).toBeInTheDocument()
  })

  it('shows description for environment job recovery tools', () => {
    expect(screen.getByText(/recovered after session resume/i)).toBeInTheDocument()
    expect(screen.getByText(/persisted log output/i)).toBeInTheDocument()
  })
})

// Tested in isolation (no beforeEach shared card) so queryByText has no prior DOM noise.
describe('MCPSetupCard — tools list (empty state)', () => {
  it('hides the Active tools section when no tools are registered', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ...ACTIVE_MCP_STATUS_RESPONSE, active_tools: [], tool_count: 0 }),
    })
    render(<MCPSetupCard />)
    await waitFor(() => screen.getByText('0 tools · Auto Environment'))
    fireEvent.click(screen.getByText('Adaptive Build Environments'))
    expect(screen.queryByText('Active tools')).not.toBeInTheDocument()
  })
})
