// companionUrl.test.js — Unit tests for companion PWA URL helpers.
// These must pass before any QR-code deep-link change ships.
// TDD: write tests first → confirm RED → implement → confirm GREEN.

import { describe, it, expect } from 'vitest'
import {
  normalizeHttpUrl,
  getDefaultCompanionHost,
  isStaleCompanionHost,
  isPhoneUnreachableForgeUrl,
  buildDeepLink,
} from './companionUrl.js'

// ── normalizeHttpUrl ──────────────────────────────────────────────────────────

describe('normalizeHttpUrl', () => {
  it('leaves an http:// URL unchanged', () => {
    expect(normalizeHttpUrl('http://100.127.39.102:3005')).toBe('http://100.127.39.102:3005')
  })

  it('leaves an https:// URL unchanged', () => {
    expect(normalizeHttpUrl('https://abc123.trycloudflare.com')).toBe(
      'https://abc123.trycloudflare.com'
    )
  })

  it('prepends http:// to a bare IP:port URL (regression — the v7.6.17 bug)', () => {
    expect(normalizeHttpUrl('100.127.39.102:3005')).toBe('http://100.127.39.102:3005')
  })

  it('prepends http:// regardless of IP range or hostname pattern', () => {
    expect(normalizeHttpUrl('192.168.1.50:3005')).toBe('http://192.168.1.50:3005')
    expect(normalizeHttpUrl('10.0.0.1:3005')).toBe('http://10.0.0.1:3005')
    expect(normalizeHttpUrl('my-server.local:3005')).toBe('http://my-server.local:3005')
    expect(normalizeHttpUrl('forge.example.com:3005')).toBe('http://forge.example.com:3005')
  })

  it('returns empty string for null', () => {
    expect(normalizeHttpUrl(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(normalizeHttpUrl(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(normalizeHttpUrl('')).toBe('')
  })
})

// ── getDefaultCompanionHost ───────────────────────────────────────────────────

describe('getDefaultCompanionHost', () => {
  it('appends /companion/ to a URL that already has http scheme', () => {
    expect(getDefaultCompanionHost('http://100.127.39.102:3005')).toBe(
      'http://100.127.39.102:3005/companion/'
    )
  })

  it('appends /companion/ to a URL that already has https scheme', () => {
    expect(getDefaultCompanionHost('https://abc123.trycloudflare.com')).toBe(
      'https://abc123.trycloudflare.com/companion/'
    )
  })

  it('adds http:// AND appends /companion/ when forgeUrl has no scheme', () => {
    // This is the core bug: user stored tunnelUrl without protocol
    expect(getDefaultCompanionHost('100.127.39.102:3005')).toBe(
      'http://100.127.39.102:3005/companion/'
    )
  })

  it('strips trailing slash before appending /companion/', () => {
    expect(getDefaultCompanionHost('http://100.127.39.102:3005/')).toBe(
      'http://100.127.39.102:3005/companion/'
    )
  })

  it('handles a bare hostname without a port', () => {
    expect(getDefaultCompanionHost('http://my-forge.local')).toBe(
      'http://my-forge.local/companion/'
    )
  })
})

// ── isStaleCompanionHost ──────────────────────────────────────────────────────

describe('isStaleCompanionHost', () => {
  it('returns true for null', () => {
    expect(isStaleCompanionHost(null)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isStaleCompanionHost('')).toBe(true)
  })

  it('returns true for the legacy Cloudflare Pages URL', () => {
    expect(isStaleCompanionHost('https://forge-companion-1b3.pages.dev/')).toBe(true)
  })

  it('returns true for the legacy GitHub Pages URL', () => {
    expect(isStaleCompanionHost('https://mikejsmith1985.github.io/forge-companion/')).toBe(true)
  })

  it('returns true for http://localhost companion host', () => {
    expect(isStaleCompanionHost('http://localhost:3005/companion/')).toBe(true)
  })

  it('returns true for http://127.0.0.1 companion host', () => {
    expect(isStaleCompanionHost('http://127.0.0.1:3005/companion/')).toBe(true)
  })

  it('returns true for a protocol-less URL — the v7.6.17 regression', () => {
    // This is the exact value that was stored in localStorage and broke Safari
    expect(isStaleCompanionHost('100.127.39.102:3005/companion/')).toBe(true)
  })

  it('returns true for any protocol-less URL regardless of IP range or hostname', () => {
    expect(isStaleCompanionHost('192.168.1.50:3005/companion/')).toBe(true)
    expect(isStaleCompanionHost('10.0.0.1:3005/companion/')).toBe(true)
    expect(isStaleCompanionHost('my-server.local:3005/companion/')).toBe(true)
  })

  it('returns false for a valid http URL with a non-localhost host', () => {
    expect(isStaleCompanionHost('http://100.127.39.102:3005/companion/')).toBe(false)
  })

  it('returns false for a valid https Cloudflare tunnel URL', () => {
    expect(isStaleCompanionHost('https://abc123.trycloudflare.com/companion/')).toBe(false)
  })

  it('returns false for a LAN IP with http scheme', () => {
    expect(isStaleCompanionHost('http://192.168.1.50:3005/companion/')).toBe(false)
  })
})

// ── isPhoneUnreachableForgeUrl ────────────────────────────────────────────────

describe('isPhoneUnreachableForgeUrl', () => {
  it('returns true for null', () => {
    expect(isPhoneUnreachableForgeUrl(null)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isPhoneUnreachableForgeUrl('')).toBe(true)
  })

  it('returns true for http://localhost', () => {
    expect(isPhoneUnreachableForgeUrl('http://localhost:3005')).toBe(true)
  })

  it('returns true for http://127.0.0.1', () => {
    expect(isPhoneUnreachableForgeUrl('http://127.0.0.1:3005')).toBe(true)
  })

  it('returns true for ::1 (IPv6 loopback)', () => {
    expect(isPhoneUnreachableForgeUrl('http://::1:3005')).toBe(true)
  })

  it('returns true for a protocol-less localhost URL (normalised before parse)', () => {
    expect(isPhoneUnreachableForgeUrl('localhost:3005')).toBe(true)
  })

  it('returns false for a Tailscale IP', () => {
    expect(isPhoneUnreachableForgeUrl('http://100.127.39.102:3005')).toBe(false)
  })

  it('returns false for a LAN IP', () => {
    expect(isPhoneUnreachableForgeUrl('http://192.168.1.50:3005')).toBe(false)
  })

  it('returns false for a Cloudflare tunnel URL', () => {
    expect(isPhoneUnreachableForgeUrl('https://abc123.trycloudflare.com')).toBe(false)
  })

  it('returns false for a custom domain', () => {
    expect(isPhoneUnreachableForgeUrl('https://forge.mycompany.com')).toBe(false)
  })
})

// ── buildDeepLink ─────────────────────────────────────────────────────────────

describe('buildDeepLink', () => {
  const forgeUrl    = 'http://100.127.39.102:3005'
  const mobileToken = 'abc123securetoken'

  it('produces a valid https?:// deep-link with a well-formed companionHost', () => {
    const result = buildDeepLink('http://100.127.39.102:3005/companion/', forgeUrl, mobileToken)
    expect(result).toMatch(/^http:\/\//)
    expect(result).toContain('/companion/#')
    expect(result).toContain('forge=')
    expect(result).toContain(`token=${mobileToken}`)
  })

  it('adds http:// to a protocol-less companionHost — regression for v7.6.17', () => {
    // This was the exact broken case: Safari rejected the URL
    const result = buildDeepLink('100.127.39.102:3005/companion/', forgeUrl, mobileToken)
    expect(result).toMatch(/^http:\/\/100\.127\.39\.102:3005\/companion\/#/)
  })

  it('derives base from forgeUrl when companionHost is localhost', () => {
    const result = buildDeepLink('http://localhost:3005/companion/', forgeUrl, mobileToken)
    expect(result).toMatch(/^http:\/\/100\.127\.39\.102:3005\/companion\/#/)
  })

  it('derives base from forgeUrl when companionHost is 127.0.0.1', () => {
    const result = buildDeepLink('http://127.0.0.1:3005/companion/', forgeUrl, mobileToken)
    expect(result).toMatch(/^http:\/\/100\.127\.39\.102:3005\/companion\/#/)
  })

  it('URL-encodes the forge param in the fragment', () => {
    const result = buildDeepLink('http://100.127.39.102:3005/companion/', forgeUrl, mobileToken)
    expect(result).toContain(encodeURIComponent(forgeUrl))
  })

  it('returns just the base URL when forgeUrl is empty', () => {
    const result = buildDeepLink('http://100.127.39.102:3005/companion/', '', mobileToken)
    expect(result).not.toContain('#')
  })

  it('returns just the base URL when mobileToken is empty', () => {
    const result = buildDeepLink('http://100.127.39.102:3005/companion/', forgeUrl, '')
    expect(result).not.toContain('#')
  })

  it('works with an https Cloudflare tunnel as companionHost', () => {
    const result = buildDeepLink(
      'https://abc123.trycloudflare.com/companion/',
      'https://abc123.trycloudflare.com',
      mobileToken
    )
    expect(result).toMatch(/^https:\/\/abc123\.trycloudflare\.com\/companion\/#/)
    expect(result).toContain('forge=')
  })
})
