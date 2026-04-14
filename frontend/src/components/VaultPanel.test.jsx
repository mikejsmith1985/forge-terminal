// VaultPanel.test.jsx — Unit tests for the Forge Vault modal panel.
//
// The VaultPanel self-manages vault state via useVault internally.
// Tests mock useVault to isolate rendering behavior from network calls.
// Each test verifies a distinct UI state: closed, loading, empty, and with entries.
import { render, screen } from '@testing-library/react'
import { VaultPanel } from './VaultPanel'

// ── Mock useVault so tests don't hit the network ─────────────────────────────

const mockLoadEntries = vi.fn()
const mockLoadStatus = vi.fn()
const mockAddEntry = vi.fn()
const mockRemoveEntry = vi.fn()
const mockToggleAutoInject = vi.fn()
const mockRevealEntry = vi.fn()
const mockClearError = vi.fn()

let mockVaultHookReturn = {
  entries: [],
  status: null,
  isLoading: false,
  isAdding: false,
  error: null,
  loadEntries: mockLoadEntries,
  loadStatus: mockLoadStatus,
  addEntry: mockAddEntry,
  removeEntry: mockRemoveEntry,
  toggleAutoInject: mockToggleAutoInject,
  revealEntry: mockRevealEntry,
  injectEntries: vi.fn(),
  clearError: mockClearError,
}

vi.mock('../hooks/useVault', () => ({
  useVault: () => mockVaultHookReturn,
}))

// ── Test helpers ─────────────────────────────────────────────────────────────

const noOpFn = () => {}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VaultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVaultHookReturn = {
      entries: [],
      status: null,
      isLoading: false,
      isAdding: false,
      error: null,
      loadEntries: mockLoadEntries,
      loadStatus: mockLoadStatus,
      addEntry: mockAddEntry,
      removeEntry: mockRemoveEntry,
      toggleAutoInject: mockToggleAutoInject,
      revealEntry: mockRevealEntry,
      injectEntries: vi.fn(),
      clearError: mockClearError,
    }
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <VaultPanel isOpen={false} onClose={noOpFn} onToast={noOpFn} />
    )
    // Panel renders null when closed — the container should be empty.
    expect(container.firstChild).toBeNull()
  })

  it('renders the Forge Vault title when isOpen is true', () => {
    render(<VaultPanel isOpen={true} onClose={noOpFn} onToast={noOpFn} />)
    expect(screen.getByText(/Forge Vault/i)).toBeInTheDocument()
  })

  it('loads entries and status when opened', () => {
    render(<VaultPanel isOpen={true} onClose={noOpFn} onToast={noOpFn} />)
    // useEffect triggers on mount when isOpen=true
    expect(mockLoadStatus).toHaveBeenCalledTimes(1)
    expect(mockLoadEntries).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no entries are stored', () => {
    mockVaultHookReturn.entries = []
    render(<VaultPanel isOpen={true} onClose={noOpFn} onToast={noOpFn} />)
    // The empty-state text should be visible when the entries list is empty.
    expect(screen.getByText(/No secrets stored yet/i)).toBeInTheDocument()
  })

  it('shows the vault entry name when entries exist', () => {
    mockVaultHookReturn.entries = [
      {
        id: 'entry-001',
        secretName: 'OpenAI API Key',
        envVarName: 'OPENAI_API_KEY',
        description: '',
        shouldAutoInject: true,
        createdAt: '2024-01-15T10:00:00Z',
      },
    ]
    render(<VaultPanel isOpen={true} onClose={noOpFn} onToast={noOpFn} />)
    expect(screen.getByText('OpenAI API Key')).toBeInTheDocument()
  })

  it('shows "Secured" badge when vault is open', () => {
    mockVaultHookReturn.status = { isOpen: true, entryCount: 1, autoInjectCount: 0, vaultPath: '' }
    render(<VaultPanel isOpen={true} onClose={noOpFn} onToast={noOpFn} />)
    expect(screen.getByText(/Secured/i)).toBeInTheDocument()
  })
})
