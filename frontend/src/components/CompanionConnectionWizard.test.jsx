// CompanionConnectionWizard.test.jsx — verifies the wizard renders the
// step-1 method picker, persists the user's choice via the preference
// API, and never displays two methods at once.
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CompanionConnectionWizard from './CompanionConnectionWizard'

// fetchMock returns canned responses for the two endpoints the wizard
// hits.  Tests reset the mock and assert on the calls captured here.
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
  // Default: no saved preference, no tunnel options.
  fetchMock.mockImplementation((url) => {
    if (url === '/api/companion/preference') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ method: '', methodResolved: 'named' }),
      })
    }
    if (url === '/api/tunnel/options') {
      return Promise.resolve({ ok: true, json: async () => ({ options: [] }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
})

describe('CompanionConnectionWizard', () => {
  it('renders all three method options on step 1 (and no others)', async () => {
    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    await waitFor(() => {
      expect(screen.getByText(/How should your phone reach this PC/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Named Cloudflare Tunnel/i)).toBeInTheDocument()
    expect(screen.getByText(/Cloudflare Quick Tunnel/i)).toBeInTheDocument()
    expect(screen.getByText(/^Tailscale$/i)).toBeInTheDocument()
  })

  it('persists the selected method and advances to step 2 (single method visible)', async () => {
    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    await waitFor(() => screen.getByText(/Cloudflare Quick Tunnel/i))
    fireEvent.click(screen.getByText(/Cloudflare Quick Tunnel/i))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, init]) =>
        url === '/api/companion/preference' && init?.method === 'POST',
      )
      expect(postCall, 'expected POST to preference endpoint').toBeTruthy()
      expect(JSON.parse(postCall[1].body)).toEqual({ method: 'quick' })
    })

    // Step 2 for Quick should be visible — check for the unique step heading.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Start your throwaway URL/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/Set up your Named Cloudflare Tunnel/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Make sure Tailscale is signed in/i)).not.toBeInTheDocument()
  })

  it('skips method picker when preference is already saved', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ method: 'tailscale', methodResolved: 'tailscale' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ options: [] }) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    await waitFor(() => {
      expect(screen.getByText(/Make sure Tailscale is signed in/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/How should your phone reach this PC/i)).not.toBeInTheDocument()
  })

  // ── Quick Tunnel action tests ──────────────────────────────────────────────

  it('shows Install cloudflared button when cloudflared stage is absent', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({ ok: true, json: async () => ({ method: 'quick' }) })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ options: [{ mode: 'quick', stage: 'absent', url: '', detail: '' }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    await waitFor(() => {
      expect(screen.getByText(/Install cloudflared/i)).toBeInTheDocument()
    })
    // The "Advanced settings" fallback copy must not appear.
    expect(screen.queryByText(/Advanced settings/i)).not.toBeInTheDocument()
  })

  it('shows Start Quick Tunnel button when cloudflared stage is configured', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({ ok: true, json: async () => ({ method: 'quick' }) })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ options: [{ mode: 'quick', stage: 'configured', url: '', detail: '' }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    await waitFor(() => {
      expect(screen.getByText(/Start Quick Tunnel/i)).toBeInTheDocument()
    })
  })

  it('calls /api/tunnel/setup/install when Install cloudflared is clicked', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({ ok: true, json: async () => ({ method: 'quick' }) })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ options: [{ mode: 'quick', stage: 'absent', url: '', detail: '' }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    const installBtn = await screen.findByText(/Install cloudflared/i)
    fireEvent.click(installBtn)

    await waitFor(() => {
      const installCall = fetchMock.mock.calls.find(([url, init]) =>
        url === '/api/tunnel/setup/install' && init?.method === 'POST',
      )
      expect(installCall, 'expected POST to /api/tunnel/setup/install').toBeTruthy()
    })
  })

  it('uses the Named Cloudflare Tunnel URL as companion host base when named method is active', async () => {
    // Regression guard: when Tailscale is also connected, the QR must still
    // encode the Cloudflare URL end-to-end — not silently switch to Tailscale.
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ method: 'named' }),
        })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            options: [
              { mode: 'named',     stage: 'healthy',    url: 'https://forge.rootlevellabs.tech' },
              { mode: 'tailscale', stage: 'configured', url: 'https://mikesdell.taila9144e.ts.net' },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <CompanionConnectionWizard
        mobileToken="testtoken"
        companionHost="https://forge.rootlevellabs.tech/companion/"
      />
    )

    // The QR panel with "Copy link instead" button appears in step 2 when tunnel is healthy
    const copyBtn = await screen.findByText(/Copy link instead/i, {}, { timeout: 3000 })
    fireEvent.click(copyBtn)

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled())
    const copiedUrl = writeTextMock.mock.calls[0][0]
    // Both the PWA load path and the forge= param must use the Cloudflare URL.
    expect(copiedUrl).toMatch(/^https:\/\/forge\.rootlevellabs\.tech\/companion\//)
    expect(copiedUrl).toContain('forge=https%3A%2F%2Fforge.rootlevellabs.tech')
    expect(copiedUrl).toContain('token=testtoken')
  })

  it('calls /api/tunnel/start when Start Quick Tunnel is clicked', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({ ok: true, json: async () => ({ method: 'quick' }) })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ options: [{ mode: 'quick', stage: 'configured', url: '', detail: '' }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    // findByRole finds only the <button> element, avoiding false matches on parent containers.
    const startBtn = await screen.findByRole('button', { name: /Start Quick Tunnel/i })
    fireEvent.click(startBtn)

    await waitFor(() => {
      const startCall = fetchMock.mock.calls.find(([url, init]) =>
        url === '/api/tunnel/start' && init?.method === 'POST',
      )
      expect(startCall, 'expected POST to /api/tunnel/start').toBeTruthy()
    })
  })

  it('shows an error banner when the start API returns a failure', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (url === '/api/companion/preference') {
        return Promise.resolve({ ok: true, json: async () => ({ method: 'quick' }) })
      }
      if (url === '/api/tunnel/options') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ options: [{ mode: 'quick', stage: 'configured', url: '', detail: '' }] }),
        })
      }
      if (url === '/api/tunnel/start' && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'cloudflared process failed to start' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<CompanionConnectionWizard mobileToken="t" companionHost="https://x/" />)

    const startBtn = await screen.findByRole('button', { name: /Start Quick Tunnel/i })
    fireEvent.click(startBtn)

    // The error banner has role="alert" — wait for it to appear then check its text.
    const errorBanner = await screen.findByRole('alert')
    expect(errorBanner.textContent).toMatch(/cloudflared process failed to start/i)
  })
})
