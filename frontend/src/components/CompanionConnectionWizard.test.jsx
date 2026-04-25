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

    // Step 2 for Quick should be visible — Named/Tailscale step copy must NOT be.
    await waitFor(() => {
      expect(screen.getByText(/throwaway URL/i)).toBeInTheDocument()
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
})
