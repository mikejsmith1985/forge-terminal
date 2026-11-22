// CompanionAccessCard.test.jsx — proves mobile access is offered as a free switch, not a paid upgrade.
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import CompanionAccessCard from './CompanionAccessCard'

const DISABLED_SETTINGS = { mobile_access_enabled: false, mobile_token: '', token_path: '' }

// stubDisabledMobileSettings answers every fetch the card makes as if mobile access is off.
function stubDisabledMobileSettings() {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => DISABLED_SETTINGS }))
}

describe('CompanionAccessCard without a license', () => {
  beforeEach(() => {
    localStorage.clear()
    stubDisabledMobileSettings()
  })

  it('offers a plain enable switch with no upgrade or paid wording', async () => {
    render(<CompanionAccessCard />)
    fireEvent.click(screen.getByText('Forge Companion'))

    await waitFor(() => expect(screen.getByText('Enable Mobile Access')).toBeTruthy())
    expect(screen.queryByText(/upgrade/i)).toBeNull()
    expect(screen.queryByText(/paid/i)).toBeNull()
    expect(screen.queryByText(/subscription/i)).toBeNull()
  })
})
