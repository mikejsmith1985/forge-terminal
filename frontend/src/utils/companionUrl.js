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
 * buildDeepLink — assembles the companion PWA deep-link URL.
 *
 * Format: <companionHost>#forge=<forgeUrl>&token=<mobileToken>[&local=<localUrl>]
 *
 * The companion PWA reads this fragment on load (readAndClearDeepLink) to
 * auto-populate and initiate a connection.  The base URL is normalised to
 * always carry an http/https scheme so mobile browsers can open the link.
 *
 * The optional `localUrl` is the LAN address (e.g. "http://192.168.1.42:3005").
 * When present the companion will fall back to it if the primary tunnel URL
 * becomes unreachable, allowing transparent reconnection on the home network.
 *
 * @param {string} companionHost - Base URL of the companion PWA (protocol optional)
 * @param {string} forgeUrl      - Forge server URL the phone will use for API calls
 * @param {string} mobileToken   - One-time auth token
 * @param {string} [localUrl]    - Optional LAN fallback URL
 * @returns {string} Full deep-link URL
 */
export function buildDeepLink(companionHost, forgeUrl, mobileToken, localUrl = '') {
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

  // Normalize forgeUrl so protocol-less values (e.g. "forge.example.com")
  // become valid absolute URLs before being embedded in the QR fragment.
  // Named cloudflare tunnels are always https, but defensive normalization
  // ensures the Companion PWA can parse the forge= param on any device.
  const normalizedForgeUrl = normalizeHttpUrl(forgeUrl)
  const params = { forge: normalizedForgeUrl, token: mobileToken }
  if (localUrl) params.local = normalizeHttpUrl(localUrl)
  const fragment = new URLSearchParams(params).toString()
  return `${base}#${fragment}`
}
