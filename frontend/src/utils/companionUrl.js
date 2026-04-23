// companionUrl.js — Pure URL helpers for the Forge Companion PWA.
//
// Centralises all URL normalisation, stale-detection, and deep-link
// construction so CompanionAccessCard.jsx stays focused on UI concerns
// and every URL rule is exercised by unit tests before it ships.

// ── Constants ─────────────────────────────────────────────────────────────────

// URLs hosted externally in older versions of Forge Terminal.
// Any user who still has one of these in localStorage is silently migrated.
const LEGACY_COMPANION_HOST_URLS = new Set([
  'https://forge-companion-1b3.pages.dev/',
  'https://mikejsmith1985.github.io/forge-companion/',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * normalizeHttpUrl — ensures a URL string has an http or https scheme.
 *
 * Mobile browsers (Safari in particular) reject protocol-less URLs, so any
 * value without a scheme is treated as plain http.  If the value already has
 * a scheme it is returned unchanged.  Falsy input returns an empty string.
 *
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function normalizeHttpUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return 'http://' + url
}

/**
 * getDefaultCompanionHost — derives the companion PWA base URL from the Forge
 * server URL.
 *
 * The companion is embedded in the Forge binary at /companion/, so the QR code
 * base MUST use the same URL the phone uses to reach Forge — never localhost.
 *
 * @param {string} forgeUrl - URL the phone uses to reach Forge (protocol optional)
 * @returns {string} e.g. "http://100.127.39.102:3005/companion/"
 */
export function getDefaultCompanionHost(forgeUrl) {
  return normalizeHttpUrl(forgeUrl).replace(/\/$/, '') + '/companion/'
}

/**
 * isStaleCompanionHost — returns true when a stored companionHost value should
 * be discarded and replaced with a freshly derived default.
 *
 * Stale conditions:
 *  - null / empty string
 *  - legacy external Pages URL (pre-v7.6.16)
 *  - localhost or loopback (unreachable from a phone)
 *  - protocol-less URL (Safari rejects these — the v7.6.17 regression)
 *
 * @param {string|null|undefined} storedHost
 * @returns {boolean}
 */
export function isStaleCompanionHost(storedHost) {
  if (!storedHost) return true
  if (LEGACY_COMPANION_HOST_URLS.has(storedHost)) return true
  if (/^https?:\/\/localhost(:\d+)?/i.test(storedHost)) return true
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?/.test(storedHost)) return true
  // A URL without a scheme is stale — mobile browsers cannot open it
  if (!/^https?:\/\//i.test(storedHost)) return true
  return false
}

/**
 * isPrivateNetworkForgeUrl — returns true when the forge URL contains a
 * private-network or CGNAT IP that is only reachable from devices on the
 * same LAN or VPN (Tailscale, WireGuard, etc.).
 *
 * Covered ranges (all RFC-defined private / shared address spaces):
 *   RFC 1918 — 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   IANA shared — 100.64.0.0/10  (Tailscale occupies 100.64–100.127)
 *   Link-local  — 169.254.0.0/16
 *
 * Unlike isPhoneUnreachableForgeUrl, these URLs CAN work when both devices
 * are on the same VPN/LAN.  Call sites should warn the user rather than
 * hide the QR entirely.
 *
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isPrivateNetworkForgeUrl(url) {
  if (!url) return false
  try {
    const { hostname } = new URL(normalizeHttpUrl(url))
    const parts = hostname.split('.').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) return false
    const [a, b] = parts
    if (a === 10) return true                             // RFC 1918 class A
    if (a === 172 && b >= 16 && b <= 31) return true     // RFC 1918 class B
    if (a === 192 && b === 168) return true               // RFC 1918 class C
    if (a === 100 && b >= 64 && b <= 127) return true    // Tailscale / IANA shared
    if (a === 169 && b === 254) return true               // link-local
    return false
  } catch {
    return false
  }
}

/**
 * isPhoneUnreachableForgeUrl — returns true when the hostname in forgeUrl
 * is a loopback address (localhost, 127.0.0.1, ::1) that a phone cannot reach.
 *
 * Used to suppress QR code generation and the Copy Link button so users
 * are not presented with a deep link that will never open on their device.
 *
 * @param {string|null|undefined} forgeUrl
 * @returns {boolean}
 */
export function isPhoneUnreachableForgeUrl(forgeUrl) {
  if (!forgeUrl) return true
  try {
    const { hostname } = new URL(normalizeHttpUrl(forgeUrl))
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return true
  }
}

/**
 * buildDeepLink — assembles the companion PWA deep-link URL.
 *
 * Format: <companionHost>#forge=<forgeUrl>&token=<mobileToken>
 *
 * The companion PWA reads this fragment on load (readAndClearDeepLink) to
 * auto-populate and initiate a connection.  The base URL is normalised to
 * always carry an http/https scheme so mobile browsers can open the link.
 *
 * @param {string} companionHost - Base URL of the companion PWA (protocol optional)
 * @param {string} forgeUrl      - Forge server URL the phone will use for API calls
 * @param {string} mobileToken   - One-time auth token
 * @returns {string} Full deep-link URL
 */
export function buildDeepLink(companionHost, forgeUrl, mobileToken) {
  // Localhost values cannot be reached by a phone — fall back to forgeUrl.
  const isLocalhostHost =
    !companionHost ||
    /^https?:\/\/localhost(:\d+)?/i.test(companionHost) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?/.test(companionHost)

  // Derive a safe fallback base from forgeUrl (also normalised for protocol).
  const derivedBase = normalizeHttpUrl((forgeUrl || '').replace(/\/$/, '')) + '/companion/'

  // Normalise the stored host so protocol-less values (e.g., stale localStorage)
  // become valid absolute URLs before they are embedded in the QR code.
  const normalizedHost = normalizeHttpUrl(companionHost).replace(/#.*$/, '')

  const base = isLocalhostHost ? derivedBase : normalizedHost

  if (!forgeUrl || !mobileToken) return base

  const fragment = new URLSearchParams({ forge: forgeUrl, token: mobileToken }).toString()
  return `${base}#${fragment}`
}
