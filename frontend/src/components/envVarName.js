/**
 * envVarName.js — Shell naming rules for vault entry variable names.
 *
 * A vault entry name eventually becomes a shell variable. The operating system
 * accepts any name, which is why auto-inject works with anything the user types.
 * Shells are fussier, and only in one direction: POSIX shells (`sh`, `bash`)
 * cannot export a name that is not a plain identifier, so `RESEND-API-KEY` has
 * no representation there at all. PowerShell handles any name, provided the
 * generated script uses the braced ${env:NAME} form — which it now does.
 *
 * These helpers mirror the Go rules in internal/vault/envvarname.go so the form
 * warns the user at the point of naming rather than at the point of failure.
 */

/** Matches a name POSIX `export` accepts: letter or underscore, then word chars. */
const POSIX_ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Reports whether a name can be exported by a POSIX shell.
 *
 * @param {string} candidateName - The environment variable name to check
 * @returns {boolean} True when the name is a valid POSIX identifier
 */
export const isPosixEnvVarName = (candidateName) =>
  POSIX_ENV_VAR_NAME_PATTERN.test(candidateName || '')

/**
 * Derives an environment variable name from a human-readable secret name.
 * "OpenAI API Key" → "OPENAI_API_KEY", "1Password Token" → "_1PASSWORD_TOKEN".
 *
 * A leading digit is prefixed rather than dropped, because no shell accepts a
 * name that starts with one.
 *
 * @param {string} secretName - The human-readable name to convert
 * @returns {string} A valid POSIX identifier, or an empty string if nothing is usable
 */
export const deriveEnvVarName = (secretName) => {
  const upperCasedName = (secretName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!upperCasedName) return ''
  return /^[0-9]/.test(upperCasedName) ? `_${upperCasedName}` : upperCasedName
}

/**
 * Builds the non-blocking advisory shown under the environment variable field.
 *
 * Returns null when the name needs no comment. The advisory never blocks saving:
 * hyphenated names work on Windows and through auto-inject everywhere, so this
 * is guidance about POSIX portability, not a validation error.
 *
 * @param {string} envVarName - The name currently typed into the form
 * @returns {{ message: string, suggestedName: string } | null} Advisory, or null
 */
export const describeEnvVarNameAdvisory = (envVarName) => {
  const trimmedName = (envVarName || '').trim()
  if (!trimmedName || isPosixEnvVarName(trimmedName)) return null

  const suggestedName = deriveEnvVarName(trimmedName)
  if (!suggestedName) {
    return {
      message: `"${trimmedName}" has no usable characters for a shell variable name. Use letters, digits, and underscores.`,
      suggestedName: '',
    }
  }

  return {
    message: `Works on Windows and via auto-inject. POSIX shells cannot export this name, so scripts will use ${suggestedName} there instead.`,
    suggestedName,
  }
}
