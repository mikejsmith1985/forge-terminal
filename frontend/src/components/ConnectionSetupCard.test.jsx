// ConnectionSetupCard.test.jsx — Unit tests for the v7.6.29 unified
// mobile-access setup card. Verifies fetch-on-mount, active-mode
// surfacing, "make default" POST wiring, and preference clearing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConnectionSetupCard from './ConnectionSetupCard'

const mockFetch = vi.fn()
global.fetch = mockFetch

const OPTIONS_RESPONSE = {
  active: 'named',
  preference: { mode: '' },
  options: [
    {
      mode: 'named',
      stage: 'healthy',
      detail: 'forge.example.com',
      url: 'https://forge.example.com',
      lastProbed: '2026-05-01T00:00:00Z',
      recoveryHint: '',
    },
    {
      mode: 'quick',
      stage: 'configured',
      detail: 'trycloudflare fallback',
      url: '',
      lastProbed: '',
      recoveryHint: '',
    },
    {
      mode: 'tailscale',
      stage: 'stopped',
      detail: 'tailscale not running',
      url: '',
      lastProbed: '',
      recoveryHint: '',
    },
    {
      mode: 'lan',
      stage: 'configured',
      detail: '192.168.1.10:8333',
      url: 'http://192.168.1.10:8333',
      lastProbed: '',
      recoveryHint: '',
    },
  ],
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('ConnectionSetupCard', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })
  afterEach(() => {})

  it('renders the active mode after fetching options', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(OPTIONS_RESPONSE))
    render(<ConnectionSetupCard />)

    // Loading state first.
    expect(screen.getByText(/scanning tunnels/i)).toBeInTheDocument()

    // Active mode surfaces.
    expect(await screen.findByText('Named Cloudflare Tunnel')).toBeInTheDocument()
    expect(screen.getByText('https://forge.example.com')).toBeInTheDocument()
    // "Other ways" toggle lists the remaining 3.
    expect(screen.getByText(/other ways to connect \(3\)/i)).toBeInTheDocument()
  })

  it('reveals the other modes when the expander is clicked', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(OPTIONS_RESPONSE))
    render(<ConnectionSetupCard />)

    const expander = await screen.findByText(/other ways to connect/i)
    fireEvent.click(expander)

    expect(screen.getByText('Quick Tunnel')).toBeInTheDocument()
    expect(screen.getByText('Tailscale Funnel')).toBeInTheDocument()
    expect(screen.getByText('Local Network')).toBeInTheDocument()
  })

  it('POSTs /api/tunnel/select when Make default is clicked', async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse(OPTIONS_RESPONSE))
      .mockReturnValueOnce(jsonResponse({ mode: 'lan' }))
      .mockReturnValueOnce(
        jsonResponse({
          ...OPTIONS_RESPONSE,
          preference: { mode: 'lan' },
        }),
      )

    render(<ConnectionSetupCard />)
    const expander = await screen.findByText(/other ways to connect/i)
    fireEvent.click(expander)

    const makeDefaultButtons = screen.getAllByRole('button', { name: /make default/i })
    // Quick (configured) + LAN (configured) both qualify; Tailscale is
    // stopped so its button is not rendered.
    expect(makeDefaultButtons.length).toBe(2)
    fireEvent.click(makeDefaultButtons[1]) // LAN

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tunnel/select',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ mode: 'lan' }),
        }),
      )
    })
  })

  it('surfaces an error banner when the API fails', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    )
    render(<ConnectionSetupCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 500/)
  })

  it('clears the preference when Clear preference is clicked', async () => {
    mockFetch
      .mockReturnValueOnce(
        jsonResponse({ ...OPTIONS_RESPONSE, preference: { mode: 'lan' } }),
      )
      .mockReturnValueOnce(jsonResponse({ mode: '' }))
      .mockReturnValueOnce(jsonResponse(OPTIONS_RESPONSE))

    render(<ConnectionSetupCard />)
    const clearBtn = await screen.findByText(/clear preference/i)
    fireEvent.click(clearBtn)

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]) => url === '/api/tunnel/select' && opts?.method === 'POST',
      )
      expect(call).toBeTruthy()
      expect(call[1].body).toBe(JSON.stringify({ mode: '' }))
    })
  })
})
