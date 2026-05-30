/**
 * secretDetector.js — client-side heuristic that warns when a user pastes a
 * secret into a non-secret field (the vault entry Description).
 *
 * This mirrors the authoritative Go detector (internal/vault/secretscan.go) so the
 * UI can warn AS THE USER TYPES, before any request is made. The backend still runs
 * the same check on save. Like the Go version it is advisory only: it never blocks
 * input, and false positives are acceptable because the consequence is a dismissible
 * warning nudging the user to store the value in the secret field instead.
 */

// Shortest whitespace-delimited run treated as a candidate high-entropy secret.
const MIN_SECRET_TOKEN_LENGTH = 24

// Shannon-entropy threshold (bits per character) for a base64/hex-shaped token.
const MIN_SECRET_ENTROPY_BITS_PER_CHAR = 3.5

// A few characters must follow a known prefix so a bare mention is not flagged.
const MIN_CHARS_AFTER_PREFIX = 3

// Well-known credential prefixes — kept in sync with secretscan.go.
const SECRET_KEY_PREFIXES = [
  'sk-', 'ghp_', 'gho_', 'github_pat_', 'xoxb-', 'xoxp-', 'AKIA', 'AIza',
]

// URL query-parameter names that carry a password or secret value.
const SUSPICIOUS_QUERY_KEYS = [
  'password', 'passwd', 'pwd', 'user_password', 'secret', 'token', 'api_key', 'apikey',
]

/**
 * Inspects text for secret material.
 *
 * @param {string} text - the description text to scan
 * @returns {{ isSuspicious: boolean, reason: string }}
 */
export function detectSecretInDescription(text) {
  const trimmedText = (text || '').trim()
  if (trimmedText === '') {
    return { isSuspicious: false, reason: '' }
  }

  // A PEM private key block is unambiguous.
  if (trimmedText.includes('-----BEGIN') && trimmedText.includes('PRIVATE KEY')) {
    return { isSuspicious: true, reason: 'This looks like a private key.' }
  }

  const tokens = trimmedText.split(/\s+/)

  // A URL carrying credentials (userinfo or a password query parameter).
  const urlReason = scanUrlCredentials(tokens)
  if (urlReason) {
    return { isSuspicious: true, reason: urlReason }
  }

  // Token-level checks: known key prefixes, then high-entropy blobs.
  for (const token of tokens) {
    for (const prefix of SECRET_KEY_PREFIXES) {
      if (token.startsWith(prefix) && token.length > prefix.length + MIN_CHARS_AFTER_PREFIX) {
        return { isSuspicious: true, reason: 'This looks like an API key or token.' }
      }
    }
    if (looksLikeHighEntropySecret(token)) {
      return { isSuspicious: true, reason: 'This looks like a high-entropy secret (key or token).' }
    }
  }

  return { isSuspicious: false, reason: '' }
}

// scanUrlCredentials returns a reason string when any token is a URL embedding
// credentials, or '' when none do.
function scanUrlCredentials(tokens) {
  for (const token of tokens) {
    if (!token.includes('://')) {
      continue
    }
    let parsedUrl
    try {
      parsedUrl = new URL(token)
    } catch {
      continue
    }
    if (parsedUrl.username || parsedUrl.password) {
      return 'This looks like a login URL with embedded credentials.'
    }
    for (const key of SUSPICIOUS_QUERY_KEYS) {
      if (parsedUrl.searchParams.get(key)) {
        return 'This looks like a password embedded in a URL.'
      }
    }
  }
  return ''
}

// looksLikeHighEntropySecret reports whether token is a long, base64/hex-shaped run
// with high Shannon entropy — the shape of a random API key or token.
function looksLikeHighEntropySecret(token) {
  if (token.length < MIN_SECRET_TOKEN_LENGTH) {
    return false
  }
  if (!isBase64OrHexAlphabet(token)) {
    return false
  }
  return shannonEntropyBitsPerChar(token) > MIN_SECRET_ENTROPY_BITS_PER_CHAR
}

// isBase64OrHexAlphabet reports whether every character is in [A-Za-z0-9+/=_-], so
// URLs and prose (with other punctuation) are excluded.
function isBase64OrHexAlphabet(token) {
  return /^[A-Za-z0-9+/=_-]+$/.test(token)
}

// shannonEntropyBitsPerChar returns the Shannon entropy of token in bits per
// character — a measure of randomness.
function shannonEntropyBitsPerChar(token) {
  if (token === '') {
    return 0
  }
  const characterFrequency = new Map()
  for (const char of token) {
    characterFrequency.set(char, (characterFrequency.get(char) || 0) + 1)
  }

  const tokenLength = token.length
  let entropy = 0
  for (const count of characterFrequency.values()) {
    const probability = count / tokenLength
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

export default { detectSecretInDescription }
