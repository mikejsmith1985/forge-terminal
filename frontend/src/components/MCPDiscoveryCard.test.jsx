// MCPDiscoveryCard.test.jsx — Unit tests for the curated MCP server catalog card.
// Verifies that Forge Vault now appears as a first-party discovery entry.

import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MCPDiscoveryCard from './MCPDiscoveryCard'

describe('MCPDiscoveryCard — Forge Vault entry', () => {
  it('shows Forge Vault as a curated catalog entry', () => {
    render(<MCPDiscoveryCard />)

    fireEvent.click(screen.getByText('MCP Discovery'))

    expect(screen.getByText('Forge Vault')).toBeInTheDocument()
    expect(screen.getByText(/mcp-forge-vault\/index\.js/i)).toBeInTheDocument()
  })
})
