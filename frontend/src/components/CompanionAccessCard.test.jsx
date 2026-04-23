// CompanionAccessCard.test.jsx — tests for the Cloudflare tunnel integration
// in the Companion PWA card.  TDD: these tests are written first, confirmed
// RED, then the implementation is added to make them GREEN.
//
// Scope: tunnel launch/stop/status polling and Step-2 URL auto-population.
// Pure URL helpers are tested in companionUrl.test.js.

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import CompanionAccessCard from './CompanionAccessCard'

// ── Global fetch mock setup ───────────────────────────────────────────────────

// Returns a resolved fetch response with JSON body.
function mockFetchResponse(body, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

// Map of URL → handler function for the global fetch mock.
let fetchHandlers = {}

beforeEach(() => {
  vi.useFakeTimers()

  fetchHandlers = {
    '/api/mobile/settings': () =>
      mockFetchResponse({
        mobile_access_enabled: true,
        mobile_token: 'test-token-abc123',
        token_path: '~/.forge/mobile-token',
      }),
    '/api/tunnel/status': () =>
      mockFetchResponse({ running: false, url: '', error: '' }),
    '/api/tunnel/providers': () =>
      mockFetchResponse({
        tailscale: { available: false, reason: 'Tailscale is not installed' },
        cloudflare: { available: true },
        selected: 'cloudflare',
        explicit: false,
      }),
    '/api/tunnel/start': () =>
      mockFetchResponse({ running: true, url: '', error: '' }),
    '/api/tunnel/stop': () =>
      mockFetchResponse({ status: 'stopped' }),
  }

  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const handler = fetchHandlers[url]
      if (handler) return handler()
      return Promise.reject(new Error(`Unmocked fetch: ${url}`))
    })
  )

  // Stub clipboard so copy buttons don't throw
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })

  // Suppress QRCode canvas errors in jsdom
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderExpanded() {
  const utils = render(<CompanionAccessCard />)
  // Wait for settings to load
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  // Expand the card
  const header = utils.container.querySelector('.cac-header')
  fireEvent.click(header)
  // Wait for async state to settle
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  return utils
}

// ── Tests: launch button presence ────────────────────────────────────────────

describe('CompanionAccessCard — tunnel integration', () => {
  it('renders an Enable Remote Access button when no tunnel is running', async () => {
    await renderExpanded()
    expect(screen.getByRole('button', { name: /enable remote access/i })).toBeInTheDocument()
  })

  it('does NOT render a Stop button when no tunnel is running', async () => {
    await renderExpanded()
    expect(screen.queryByRole('button', { name: /^stop(\s|$)/i })).not.toBeInTheDocument()
  })

  // ── Tests: launching ───────────────────────────────────────────────────────

  it('calls POST /api/tunnel/start when Enable Remote Access is clicked', async () => {
    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /enable remote access/i }))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(fetch).toHaveBeenCalledWith('/api/tunnel/start', expect.objectContaining({ method: 'POST' }))
  })

  it('shows a launching/starting indicator after clicking Enable Remote Access', async () => {
    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /enable remote access/i }))
    await act(async () => { await vi.runAllTimersAsync() })
    // Both the Step 1 hint and the Step 2 QR-loading placeholder now show
    // "starting" text while the tunnel is warming up.
    expect(screen.getAllByText(/starting|launching/i).length).toBeGreaterThan(0)
  })

  // ── Tests: provider detection caption ──────────────────────────────────────

  it('shows the detected provider caption under the button', async () => {
    fetchHandlers['/api/tunnel/providers'] = () =>
      mockFetchResponse({
        tailscale: { available: true },
        cloudflare: { available: true },
        selected: 'tailscale',
        explicit: false,
      })
    await renderExpanded()
    expect(screen.getByText(/tailscale funnel/i)).toBeInTheDocument()
  })

  it('disables the button and shows install links when no provider is available', async () => {
    fetchHandlers['/api/tunnel/providers'] = () =>
      mockFetchResponse({
        tailscale: { available: false, reason: 'Tailscale is not installed' },
        cloudflare: { available: false, reason: 'cloudflared is not installed' },
        selected: '',
        explicit: false,
      })
    await renderExpanded()
    const btn = screen.getByRole('button', { name: /enable remote access/i })
    expect(btn).toBeDisabled()
    expect(screen.getByText(/no tunnel backend is installed/i)).toBeInTheDocument()
  })

  // ── Tests: URL auto-population ────────────────────────────────────────────

  it('auto-populates the manual URL input when tunnel status returns a URL', async () => {
    // The first status poll returns no URL; the second returns the tunnel URL.
    let statusCallCount = 0
    fetchHandlers['/api/tunnel/status'] = () => {
      statusCallCount++
      if (statusCallCount >= 2) {
        return mockFetchResponse({ running: true, url: 'https://abc123.trycloudflare.com', error: '' })
      }
      return mockFetchResponse({ running: true, url: '', error: '' })
    }

    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /enable remote access/i }))

    // Advance through polling intervals until URL appears
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    // The URL input lives in Advanced; open it to read the value.
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    const urlInput = screen.getByPlaceholderText(/100\.x\.x\.x|trycloudflare/i)
    expect(urlInput.value).toBe('https://abc123.trycloudflare.com')
  })

  it('auto-fills the URL on mount when a tunnel is already running', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://existing.trycloudflare.com', error: '' })

    await renderExpanded()

    await waitFor(() => {
      // Provider active line in Step 1 should show the URL immediately.
      expect(screen.getByText(/existing\.trycloudflare\.com/)).toBeInTheDocument()
    })
  })

  // ── Tests: stop tunnel ────────────────────────────────────────────────────

  it('renders a Stop button when tunnel is running', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://abc.trycloudflare.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByRole('button', { name: /stop tunnel/i })).toBeInTheDocument()
  })

  it('calls POST /api/tunnel/stop when Stop is clicked', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://abc.trycloudflare.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    fireEvent.click(screen.getByRole('button', { name: /stop tunnel/i }))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(fetch).toHaveBeenCalledWith('/api/tunnel/stop', expect.objectContaining({ method: 'POST' }))
  })

  // ── Tests: private network warning ──────────────────────────────────────

  it('shows a private-IP warning above the QR when URL is a Tailscale IP', async () => {
    // Pre-seed localStorage so the URL input starts with the Tailscale IP.
    localStorage.setItem('forge.companion.tunnelUrl', 'http://100.127.39.102:3005')

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByText(/private ip detected/i)).toBeInTheDocument()
  })

  it('shows a private-IP warning above the QR when URL is a LAN IP', async () => {
    localStorage.setItem('forge.companion.tunnelUrl', 'http://192.168.1.100:3005')

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByText(/private ip detected/i)).toBeInTheDocument()
  })

  it('does NOT show the private-IP warning when tunnel URL is a Cloudflare URL', async () => {
    localStorage.setItem('forge.companion.tunnelUrl', 'https://abc123.trycloudflare.com')

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.queryByText(/private ip detected/i)).not.toBeInTheDocument()
  })

  it('does NOT show the private-IP warning when URL is localhost (blocked at QR level)', async () => {
    // localhost triggers the "Enable remote access" warning, not the private-IP one.
    localStorage.setItem('forge.companion.tunnelUrl', 'http://localhost:3005')

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.queryByText(/private ip detected/i)).not.toBeInTheDocument()
  })

  // ── Tests: QR hidden while tunnel is launching ───────────────────────────

  it('hides the QR canvas and shows a "starting" message while the tunnel is launching', async () => {
    // Seed a Tailscale URL so a QR would normally render once launching is over.
    localStorage.setItem('forge.companion.tunnelUrl', 'http://100.127.39.102:3005')

    await renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /enable remote access/i }))
    await act(async () => { await vi.runAllTimersAsync() })

    // The QR canvas MUST NOT appear while the tunnel is starting — scanning it
    // now would give the phone the stale Tailscale IP which it can't reach.
    expect(document.querySelector('canvas')).toBeNull()

    // Step 2 must instead show a clear "wait" message so the user doesn't scan early.
    expect(screen.getByText(/qr code will appear/i)).toBeInTheDocument()
  })

  // ── Tests: tunnel provider label in the active-tunnel line ─────────────────

  it('shows "Tailscale active" when the tunnel URL is a ts.net domain', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://mikesdell.taila9144e.ts.net', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByText(/tailscale/i)).toBeInTheDocument()
    expect(screen.getByText(/active:/i)).toBeInTheDocument()
  })

  it('shows "Cloudflare" label when the tunnel URL is a trycloudflare.com domain', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://abc123.trycloudflare.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    // Match the strong element with provider label "Cloudflare" next to "active:"
    expect(screen.getAllByText(/cloudflare/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/active:/i)).toBeInTheDocument()
  })

  it('shows "Tunnel" label when the tunnel URL is a custom domain', async () => {
    fetchHandlers['/api/tunnel/status'] = () =>
      mockFetchResponse({ running: true, url: 'https://forge.example.com', error: '' })

    await renderExpanded()
    await act(async () => { await vi.runAllTimersAsync() })

    expect(screen.getByText('Tunnel')).toBeInTheDocument()
    expect(screen.getByText(/active:/i)).toBeInTheDocument()
  })

  // ── Tests: advanced collapsible ────────────────────────────────────────────

  it('hides the manual URL input by default and reveals it under Advanced', async () => {
    await renderExpanded()
    // Not visible in the main flow
    expect(screen.queryByPlaceholderText(/100\.x\.x\.x|trycloudflare/i)).not.toBeInTheDocument()
    // Open Advanced
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByPlaceholderText(/100\.x\.x\.x|trycloudflare/i)).toBeInTheDocument()
  })
})

