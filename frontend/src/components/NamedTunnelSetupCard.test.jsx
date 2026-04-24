// NamedTunnelSetupCard.test.jsx — Unit tests for the v7.6.31 Named
// Cloudflare Tunnel setup wizard UI.  Exercises the wizard-state-driven
// render paths (install → login → create → ready) and the fetch wiring
// that connects each step to its backend endpoint under /api/tunnel/setup/*.
//
// Rendering contract (keep in sync with NamedTunnelSetupCard.jsx):
//   * `{ installed:false }`     → shows "Install cloudflared" primary button
//   * `{ installed:true, loggedIn:false }`
//                                → shows "Log in to Cloudflare" button
//   * After POST /login         → surfaces the returned `authURL` so the
//                                 user can paste it into any browser
//   * `{ loggedIn:true, created:false }`
//                                → renders zone dropdown + subdomain input
//                                  → "Create tunnel" POSTs the hostname
//   * `{ created:true, config:{hostname} }`
//                                → shows the final hostname + Reconfigure

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import NamedTunnelSetupCard from './NamedTunnelSetupCard'

const mockFetch = vi.fn()
global.fetch = mockFetch

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
}

// Convenience factory so each test can tweak only the relevant fields
// without restating every property.
function wizardState(overrides = {}) {
  return {
    installed: false,
    loggedIn: false,
    created: false,
    config: null,
    lastError: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('NamedTunnelSetupCard', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the Install step when cloudflared is not installed', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(wizardState()))
    render(<NamedTunnelSetupCard />)
    expect(
      await screen.findByRole('button', { name: /install cloudflared/i }),
    ).toBeInTheDocument()
  })

  it('POSTs /install when the Install button is clicked', async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse(wizardState()))
      .mockReturnValueOnce(
        jsonResponse({ status: 'installed', path: '/home/me/.forge/bin/cloudflared' }),
      )
      .mockReturnValueOnce(jsonResponse(wizardState({ installed: true })))

    render(<NamedTunnelSetupCard />)
    const btn = await screen.findByRole('button', { name: /install cloudflared/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tunnel/setup/install',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows Log in button after install completes', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(wizardState({ installed: true })))
    render(<NamedTunnelSetupCard />)
    expect(
      await screen.findByRole('button', { name: /log in to cloudflare/i }),
    ).toBeInTheDocument()
  })

  it('surfaces the auth URL after POST /login returns running+authURL', async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse(wizardState({ installed: true })))
      .mockReturnValueOnce(
        jsonResponse({
          status: 'running',
          authURL: 'https://dash.cloudflare.com/argotunnel?callback=xxx',
        }),
      )
      // The polling timer fires at least once; return still-running.
      .mockReturnValue(
        jsonResponse({
          status: 'running',
          authURL: 'https://dash.cloudflare.com/argotunnel?callback=xxx',
        }),
      )

    render(<NamedTunnelSetupCard />)
    const btn = await screen.findByRole('button', { name: /log in to cloudflare/i })
    fireEvent.click(btn)

    const authLink = await screen.findByRole('link', { name: /open cloudflare/i })
    expect(authLink).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/argotunnel?callback=xxx',
    )
  })

  it('renders zone picker + Create button when logged in but not yet created', async () => {
    mockFetch
      .mockReturnValueOnce(
        jsonResponse(wizardState({ installed: true, loggedIn: true })),
      )
      .mockReturnValueOnce(
        jsonResponse({ zones: [{ id: 'z1', name: 'example.com' }] }),
      )

    render(<NamedTunnelSetupCard />)
    expect(await screen.findByText('example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /create tunnel/i }),
    ).toBeInTheDocument()
  })

  it('POSTs /create with hostname = subdomain.zone when Create is clicked', async () => {
    mockFetch
      .mockReturnValueOnce(
        jsonResponse(wizardState({ installed: true, loggedIn: true })),
      )
      .mockReturnValueOnce(
        jsonResponse({ zones: [{ id: 'z1', name: 'example.com' }] }),
      )
      .mockReturnValueOnce(
        jsonResponse({
          status: 'created',
          config: {
            hostname: 'forge.example.com',
            tunnelID: 'abc-123',
            credentialsPath: '/x/y.json',
            configPath: '/x/config.yml',
          },
        }),
      )
      // Refresh status after create.
      .mockReturnValue(
        jsonResponse(
          wizardState({
            installed: true,
            loggedIn: true,
            created: true,
            config: { hostname: 'forge.example.com' },
          }),
        ),
      )

    render(<NamedTunnelSetupCard />)

    const sub = await screen.findByLabelText(/subdomain/i)
    fireEvent.change(sub, { target: { value: 'forge' } })

    fireEvent.click(screen.getByRole('button', { name: /create tunnel/i }))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]) => url === '/api/tunnel/setup/create' && opts?.method === 'POST',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse(call[1].body)
      expect(body.hostname).toBe('forge.example.com')
      expect(typeof body.localPort).toBe('number')
    })
  })

  it('shows the final hostname and a Reconfigure button when created=true', async () => {
    mockFetch.mockReturnValueOnce(
      jsonResponse(
        wizardState({
          installed: true,
          loggedIn: true,
          created: true,
          config: { hostname: 'forge.example.com' },
        }),
      ),
    )
    render(<NamedTunnelSetupCard />)
    expect(await screen.findByText(/forge\.example\.com/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reconfigure/i }),
    ).toBeInTheDocument()
  })

  it('surfaces an error banner when /status fails', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    )
    render(<NamedTunnelSetupCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 500/i)
  })
})
