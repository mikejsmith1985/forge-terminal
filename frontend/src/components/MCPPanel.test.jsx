// MCPPanel.test.jsx — Unit tests for the MCP Dashboard sidebar card.
//
// These tests mock the useMCPStatus hook to isolate rendering behavior
// from network calls. Each test verifies a distinct UI state.
import { render, screen, fireEvent } from '@testing-library/react'
import MCPPanel from './MCPPanel'

// Mock the useMCPStatus hook to control component state in isolation
const mockRefresh = vi.fn()
const mockCopyToken = vi.fn()

let mockHookReturn = {
  serverStatus: null,
  tasks: [],
  isLoading: true,
  error: null,
  refresh: mockRefresh,
  copyToken: mockCopyToken,
}

vi.mock('../hooks/useMCPStatus', () => ({
  useMCPStatus: () => mockHookReturn,
}))

describe('MCPPanel', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockCopyToken.mockClear()
  })

  it('renders loading state with skeleton UI', () => {
    mockHookReturn = {
      serverStatus: null,
      tasks: [],
      isLoading: true,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    expect(screen.getByText('MCP Server')).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders enabled state with tool count and task count', () => {
    mockHookReturn = {
      serverStatus: {
        enabled: true,
        tokenHint: 'abc12345…wxyz',
        endpoint: '/api/mcp',
        protocol: 'MCP 2024-11-05 (JSON-RPC 2.0)',
        tools: ['terminal_sessions', 'terminal_execute', 'file_read'],
        taskCount: 2,
      },
      tasks: [
        { id: '1', type: 'bug-report', status: 'pending', source: 'eztest', submittedAt: new Date().toISOString() },
        { id: '2', type: 'code-fix', status: 'done', source: 'copilot', submittedAt: new Date().toISOString() },
      ],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    expect(screen.getByText('MCP Server')).toBeInTheDocument()
    expect(screen.getByText(/3 tools · 2 tasks/)).toBeInTheDocument()
  })

  it('renders disabled state when server is off', () => {
    mockHookReturn = {
      serverStatus: { enabled: false, tools: [], taskCount: 0 },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows error banner when error is set', () => {
    mockHookReturn = {
      serverStatus: { enabled: true, tools: ['file_read'], taskCount: 0 },
      tasks: [],
      isLoading: false,
      error: 'MCP status fetch failed: network error',
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    expect(screen.getByText(/MCP status fetch failed/)).toBeInTheDocument()
  })

  it('expands body when header is clicked', () => {
    mockHookReturn = {
      serverStatus: {
        enabled: true,
        tokenHint: 'abc12345…wxyz',
        endpoint: '/api/mcp',
        protocol: 'MCP 2024-11-05',
        tools: ['file_read'],
        taskCount: 0,
      },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)

    // Body should not be visible initially
    expect(screen.queryByText('Connection')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('MCP Server'))

    // Body content should now be visible
    expect(screen.getByText('Connection')).toBeInTheDocument()
    expect(screen.getByText(/Available Tools/)).toBeInTheDocument()
    expect(screen.getByText('Quick Connect')).toBeInTheDocument()
  })

  it('shows empty task state message when no tasks exist', () => {
    mockHookReturn = {
      serverStatus: {
        enabled: true,
        tokenHint: 'abc12345…wxyz',
        endpoint: '/api/mcp',
        protocol: 'MCP 2024-11-05',
        tools: ['file_read'],
        taskCount: 0,
      },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('MCP Server'))

    expect(screen.getByText(/No tasks submitted yet/)).toBeInTheDocument()
  })

  it('shows disabled body with forge.toml hint when server is disabled', () => {
    mockHookReturn = {
      serverStatus: { enabled: false, tools: [], taskCount: 0 },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('MCP Server'))

    expect(screen.getByText(/MCP server is disabled/)).toBeInTheDocument()
    expect(screen.getByText(/forge.toml/)).toBeInTheDocument()
  })

  it('renders config tab buttons for all supported AI tools', () => {
    mockHookReturn = {
      serverStatus: {
        enabled: true,
        tokenHint: 'abc12345…wxyz',
        endpoint: '/api/mcp',
        protocol: 'MCP 2024-11-05',
        tools: ['file_read'],
        taskCount: 0,
      },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('MCP Server'))

    // Original three clients
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('VS Code')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()

    // Newly added clients
    expect(screen.getByText('Gemini')).toBeInTheDocument()
    expect(screen.getByText('Windsurf')).toBeInTheDocument()
    expect(screen.getByText('Cline')).toBeInTheDocument()
  })

  it('shows "What is MCP?" section that expands with explainer content', () => {
    mockHookReturn = {
      serverStatus: {
        enabled: true,
        tokenHint: 'abc12345…wxyz',
        endpoint: '/api/mcp',
        protocol: 'MCP 2024-11-05',
        tools: ['file_read'],
        taskCount: 0,
      },
      tasks: [],
      isLoading: false,
      error: null,
      refresh: mockRefresh,
      copyToken: mockCopyToken,
    }

    render(<MCPPanel onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('MCP Server'))

    // Explainer header should be visible in collapsed state
    expect(screen.getByText('What is MCP?')).toBeInTheDocument()

    // Explainer body should NOT be visible until toggled
    expect(screen.queryByText(/drive-through window/)).not.toBeInTheDocument()

    // Click the expand button to show the explainer
    fireEvent.click(screen.getByTitle('Show explanation'))

    // Definition paragraph should now be visible
    expect(screen.getByText(/drive-through window/)).toBeInTheDocument()

    // Benefits section should be visible
    expect(screen.getByText(/Why does this make Forge better/)).toBeInTheDocument()
    expect(screen.getByText(/Your AI tools get superpowers/)).toBeInTheDocument()
    expect(screen.getByText(/One terminal, many brains/)).toBeInTheDocument()
    expect(screen.getByText(/You stay in control/)).toBeInTheDocument()
    expect(screen.getByText(/No extra setup per project/)).toBeInTheDocument()

    // Copilot-first guidance should be explicit
    expect(screen.getByText(/Why add Gemini .* already use Copilot/i)).toBeInTheDocument()
    expect(screen.getByText(/Different models, different strengths/i)).toBeInTheDocument()
    expect(screen.getByText(/Before: Copilot only/i)).toBeInTheDocument()
    expect(screen.getByText(/After: Copilot \+ Gemini through Forge/i)).toBeInTheDocument()
    expect(screen.getByText(/When not to bother/i)).toBeInTheDocument()

    // 4-step setup guide should be visible
    expect(screen.getByText(/How to connect/)).toBeInTheDocument()
  })
})
