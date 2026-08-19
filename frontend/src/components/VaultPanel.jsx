/**
 * VaultPanel.jsx — Compact modal panel for the Forge Vault secret manager.
 *
 * Renders as a centered modal dialog (not full-screen) over a semi-transparent
 * backdrop. Supports two secret types:
 *   - API Token / Key: single value stored against one env var
 *   - Username & Password: stores two entries (username + password), each with
 *     its own env var, in a single form interaction
 *
 * Secret values are NEVER displayed — only metadata (names, env var names, flags).
 *
 * Architecture decision: credentials are still stored as independent VaultEntry
 * records so injection stays one-env-var-per-entry, but related username/password
 * entries share bundle metadata and are rendered together as one grouped card.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Lock,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Copy,
  X,
  Shield,
  CheckCircle,
  AlertCircle,
  KeyRound,
  Search,
  User,
} from 'lucide-react'
import { useVault } from '../hooks/useVault'
import { buildVaultDisplayItems } from './vaultEntryGrouping'
import { deriveEnvVarName, describeEnvVarNameAdvisory } from './envVarName'
import { detectSecretInDescription } from '../utils/secretDetector'
import './VaultPanel.css'

// EnvVarNameAdvisory renders an inline, non-blocking note when a variable name
// is not a plain POSIX identifier. Such a name is perfectly usable on Windows
// and through auto-inject, but POSIX shells cannot export it, so vault scripts
// substitute the underscore form there — this says so before the surprise, and
// offers the substitute as a one-click alternative.
function EnvVarNameAdvisory({ envVarName, onUseSuggestedName }) {
  const advisory = describeEnvVarNameAdvisory(envVarName)
  if (!advisory) {
    return null
  }
  return (
    <div className="vp-description-warning" role="status">
      <AlertCircle size={13} className="vp-description-warning-icon" />
      <span>
        {advisory.message}
        {advisory.suggestedName && (
          <button
            type="button"
            className="vp-inline-link-btn"
            onClick={() => onUseSuggestedName(advisory.suggestedName)}
          >
            Use {advisory.suggestedName}
          </button>
        )}
      </span>
    </div>
  )
}

// DescriptionSecretWarning renders an inline, non-blocking warning when the given
// description text appears to contain a secret. It nudges the user to store the
// value in the encrypted secret field instead of the plaintext description. The
// authoritative check also runs server-side on save (internal/vault/secretscan.go).
function DescriptionSecretWarning({ text }) {
  const { isSuspicious, reason } = detectSecretInDescription(text)
  if (!isSuspicious) {
    return null
  }
  return (
    <div className="vp-description-warning" role="alert">
      <AlertCircle size={13} className="vp-description-warning-icon" />
      <span>{reason} Store the value in the secret field above, not the description.</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) the success confirmation is shown after adding an entry. */
const SUCCESS_DISPLAY_MS = 3000

/** How long (ms) a revealed secret value stays visible before auto-hiding. */
const REVEAL_AUTO_HIDE_MS = 30000

/** Identifies the single-value API token / key secret type. */
const SECRET_TYPE_API_TOKEN = 'apiToken'

/** Identifies the username + password credential secret type. */
const SECRET_TYPE_CREDENTIAL = 'credential'
const SORT_MODE_COMMON = 'common'
const SORT_MODE_ALPHABETICAL = 'alphabetical'
const SORT_MODE_RECENT = 'recent'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a single vault entry card in the entry list.
 * Shows name, env var, auto-inject toggle, and action buttons for
 * revealing the secret value and copying it to the clipboard.
 *
 * Reveal state is local to the card — the decrypted value never enters
 * global or hook state, and auto-hides after REVEAL_AUTO_HIDE_MS milliseconds.
 *
 * @param {{ entry: object, onEdit: Function, onDelete: Function, onToggleAutoInject: Function, onReveal: Function }} props
 */
function VaultEntryCard({ entry, onEdit, onDelete, onToggleAutoInject, onReveal }) {
  const [revealedValue, setRevealedValue]   = useState(null)
  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isCopied, setIsCopied]             = useState(false)
  const [isRevealing, setIsRevealing]       = useState(false)
  // Separate loading state for the copy-without-reveal path so the Reveal
  // button's spinner is not affected when the user just wants a silent copy.
  const [isCopyFetching, setIsCopyFetching] = useState(false)
  const autoHideTimerRef = useRef(null)

  // Cancel the auto-hide timer on unmount so there are no dangling state updates.
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
    }
  }, [])

  /** (Re)starts the 30-second timer that hides the revealed value. */
  const startAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
    autoHideTimerRef.current = setTimeout(() => {
      setRevealedValue(null)
      setIsValueVisible(false)
    }, REVEAL_AUTO_HIDE_MS)
  }, [])

  const handleEditClick = (clickEvent) => {
    clickEvent.stopPropagation()
    onEdit(entry)
  }

  const handleDeleteClick = (clickEvent) => {
    clickEvent.stopPropagation()
    onDelete(entry)
  }

  const handleToggleClick = (clickEvent) => {
    clickEvent.stopPropagation()
    onToggleAutoInject(entry.id, !entry.shouldAutoInject)
  }

  /** Fetches the secret value on first click; hides it on subsequent clicks. */
  const handleRevealClick = useCallback(async (clickEvent) => {
    clickEvent.stopPropagation()

    if (revealedValue !== null) {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
      setRevealedValue(null)
      setIsValueVisible(false)
      return
    }

    setIsRevealing(true)
    const fetchedValue = await onReveal(entry.id)
    setIsRevealing(false)

    if (fetchedValue !== null) {
      setRevealedValue(fetchedValue)
      setIsValueVisible(false) // Start masked; user opts in to show plaintext
      startAutoHideTimer()
    }
  }, [revealedValue, onReveal, entry.id, startAutoHideTimer])

  /**
   * Copies the secret value to the clipboard without requiring the user to
   * reveal it first. If the value is already in memory (post-reveal), it copies
   * directly. Otherwise it fetches silently — the value never appears in the UI.
   */
  const handleCopyClick = useCallback(async (clickEvent) => {
    clickEvent.stopPropagation()

    // Fast path: value already in memory from a prior reveal.
    if (revealedValue !== null) {
      try {
        await navigator.clipboard.writeText(revealedValue)
        setIsCopied(true)
        startAutoHideTimer()
        setTimeout(() => setIsCopied(false), 2000)
      } catch (copyErr) {
        console.error('[Vault] clipboard write failed:', copyErr)
      }
      return
    }

    // Silent fetch path: retrieve the value purely for clipboard — don't
    // update revealedValue so nothing is displayed in the card.
    setIsCopyFetching(true)
    const fetchedValue = await onReveal(entry.id)
    setIsCopyFetching(false)

    if (fetchedValue === null) return

    try {
      await navigator.clipboard.writeText(fetchedValue)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (copyErr) {
      console.error('[Vault] clipboard write failed:', copyErr)
    }
  }, [revealedValue, onReveal, entry.id, startAutoHideTimer])

  const handleVisibilityToggle = useCallback((clickEvent) => {
    clickEvent.stopPropagation()
    setIsValueVisible((prev) => !prev)
    startAutoHideTimer()
  }, [startAutoHideTimer])

  const isRevealed = revealedValue !== null

  return (
    <div className="vp-entry-card" role="listitem">
      <div className="vp-entry-card-header">
        <div className="vp-entry-name-row">
          <KeyRound size={14} color="#8b949e" />
          <span className="vp-entry-name">{entry.secretName}</span>
        </div>
        <div className="vp-entry-card-actions">
          {entry.shouldAutoInject && (
            <span className="vp-auto-inject-badge">Auto · Active</span>
          )}
          <button
            className="vp-edit-btn"
            onClick={handleEditClick}
            title="Edit secret"
            aria-label={`Edit ${entry.secretName}`}
          >
            <Pencil size={13} />
          </button>
          <button
            className="vp-delete-btn"
            onClick={handleDeleteClick}
            title="Delete secret"
            aria-label={`Delete ${entry.secretName}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="vp-entry-env-var">${entry.envVarName}</div>
      {entry.url && (
        <a className="vp-entry-url" href={entry.url} target="_blank" rel="noreferrer" title={entry.url}>
          {entry.url}
        </a>
      )}
      {entry.descriptionWarning && (
        <div
          className="vp-entry-warning"
          title={`${entry.descriptionWarning} Rotate this credential and remove the secret from its description.`}
        >
          <AlertCircle size={12} className="vp-entry-warning-icon" />
          <span>Possible secret in description — rotate &amp; remove</span>
        </div>
      )}

      {/* Auto-inject toggle pill */}
      <button
        className="vp-auto-inject-toggle"
        onClick={handleToggleClick}
        title="Toggle auto-inject for new terminal sessions"
        aria-label={`Auto-inject ${entry.shouldAutoInject ? 'on' : 'off'} for ${entry.secretName}`}
      >
        <div className={`vp-toggle-track${entry.shouldAutoInject ? ' is-active' : ''}`}>
          <div className="vp-toggle-thumb" />
        </div>
        <span className="vp-toggle-label">
          {entry.shouldAutoInject ? 'Auto-inject on' : 'Auto-inject off'}
        </span>
      </button>

      {/* Reveal / Copy action row.
          Copy is always visible so the user can silently copy without ever
          seeing the value. Reveal is kept for the rare case where the raw
          value must be inspected. */}
      <div className="vp-entry-reveal-actions">
        <button
          className={`vp-reveal-btn${isRevealed ? ' is-active' : ''}`}
          onClick={handleRevealClick}
          disabled={isRevealing}
          aria-label={isRevealed ? `Hide value for ${entry.secretName}` : `Reveal value for ${entry.secretName}`}
        >
          {isRevealing ? (
            <span className="vp-spinner">⟳</span>
          ) : isRevealed ? (
            <><EyeOff size={12} /> Hide</>
          ) : (
            <><Eye size={12} /> Reveal</>
          )}
        </button>

        <button
          className={`vp-copy-btn${isCopied ? ' is-copied' : ''}`}
          onClick={handleCopyClick}
          disabled={isCopyFetching}
          aria-label={isCopied ? 'Copied!' : `Copy value for ${entry.secretName}`}
        >
          {isCopyFetching ? (
            <span className="vp-spinner">⟳</span>
          ) : isCopied ? (
            <><CheckCircle size={12} /> Copied!</>
          ) : (
            <><Copy size={12} /> Copy</>
          )}
        </button>
      </div>

      {/* Revealed value — only rendered while active */}
      {isRevealed && (
        <div className="vp-entry-reveal-row">
          <div className="vp-reveal-value-wrapper">
            <input
              className="vp-reveal-value"
              type={isValueVisible ? 'text' : 'password'}
              value={revealedValue}
              readOnly
              aria-label={`Secret value for ${entry.secretName}`}
            />
            <button
              className="vp-eye-toggle"
              onClick={handleVisibilityToggle}
              aria-label={isValueVisible ? 'Mask value' : 'Show value in plaintext'}
            >
              {isValueVisible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="vp-reveal-auto-hide-hint">Auto-hides in 30s</p>
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline empty state shown inside the entry list when no secrets are stored.
 * Intentionally has NO button — the toolbar "Add Secret" button is the single call-to-action.
 */
function VaultEmptyState() {
  return (
    <div className="vp-empty-state">
      <div className="vp-empty-state-icon">
        <Lock size={36} />
      </div>
      <p className="vp-empty-state-text">No secrets stored yet.</p>
      <p className="vp-empty-state-subtext">
        Forge auto-injects them into every new terminal session — your agents never see the raw values.
      </p>
    </div>
  )
}

/**
 * Groups username/password entries into one visual card while preserving
 * independent entry actions underneath.
 */
function VaultCredentialBundleCard({
  bundleItem,
  onEdit,
  onDelete,
  onToggleAutoInject,
  onReveal,
}) {
  const bundledEntries = [bundleItem.usernameEntry, bundleItem.passwordEntry].filter(Boolean)

  return (
    <div className="vp-bundle-card" role="listitem">
      <div className="vp-bundle-header">
        <div className="vp-entry-name-row">
          <User size={14} color="#8b949e" />
          <span className="vp-entry-name">{bundleItem.title}</span>
        </div>
        {bundleItem.url && (
          <a
            className="vp-bundle-url"
            href={bundleItem.url}
            target="_blank"
            rel="noreferrer"
            title={bundleItem.url}
          >
            {bundleItem.url}
          </a>
        )}
      </div>

      <div className="vp-bundle-entries">
        {bundledEntries.map((entry) => (
          <VaultEntryCard
            key={entry.id}
            entry={entry}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleAutoInject={onToggleAutoInject}
            onReveal={onReveal}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Delete confirmation dialog shown as a modal overlay.
 * Requires explicit confirmation before the entry is removed.
 *
 * @param {{ entryBeingDeleted: object, onConfirm: Function, onCancel: Function }} props
 */
function DeleteConfirmDialog({ entryBeingDeleted, onConfirm, onCancel }) {
  return (
    <div className="vp-confirm-overlay" role="dialog" aria-modal="true">
      <div className="vp-confirm-dialog">
        <h3 className="vp-confirm-title">Delete "{entryBeingDeleted.secretName}"?</h3>
        <p className="vp-confirm-message">
          This will permanently remove the secret and its encrypted value from the vault.
          Any sessions that relied on auto-inject will stop receiving it immediately.
        </p>
        <div className="vp-confirm-actions">
          <button className="vp-btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="vp-btn-danger" onClick={onConfirm}>Delete Forever</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The "Add Secret" form, rendered as a modal overlay above the main vault panel.
 *
 * Supports two modes selected via a type tab:
 *   - API Token / Key: one name, one env var, one secret value
 *   - Username & Password: one credential name that auto-derives two env vars
 *     (e.g. "GitHub" → GITHUB_USERNAME + GITHUB_PASSWORD), submitted as two
 *     separate vault entries so each can be toggled or deleted independently.
 *
 * Handles its own local form state; calls onSubmit with each AddEntryRequest.
 *
 * @param {{ isAdding: boolean, onSubmit: Function, onCancel: Function }} props
 */
function AddSecretForm({ isAdding, onSubmit, onCancel }) {
  const [secretType, setSecretType] = useState(SECRET_TYPE_API_TOKEN)

  // API token fields
  const [secretName, setSecretName]   = useState('')
  const [envVarName, setEnvVarName]   = useState('')
  const [secretValue, setSecretValue] = useState('')

  // Credential fields (username + password stored as two entries)
  const [credentialName, setCredentialName]         = useState('')
  const [credentialUsername, setCredentialUsername] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [usernameEnvVar, setUsernameEnvVar]         = useState('')
  const [passwordEnvVar, setPasswordEnvVar]         = useState('')

  // Shared fields
  const [associatedUrl, setAssociatedUrl] = useState('')
  const [description, setDescription]       = useState('')
  const [shouldAutoInject, setShouldAutoInject] = useState(true)

  // Visibility toggles — separate states so username and password reveal independently
  const [isTokenVisible, setIsTokenVisible]       = useState(false)
  const [isUsernameVisible, setIsUsernameVisible] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isSuccess, setIsSuccess]                 = useState(false)

  /** Switches between API token and credential types, hiding reveal state. */
  const handleTypeChange = useCallback((newType) => {
    setSecretType(newType)
    // Reset visibility when switching modes to avoid confusion
    setIsTokenVisible(false)
    setIsUsernameVisible(false)
    setIsPasswordVisible(false)
  }, [])

  /** Keep the API token env var name in sync as the user types. */
  const handleSecretNameChange = (changeEvent) => {
    const inputValue = changeEvent.target.value
    setSecretName(inputValue)
    setEnvVarName(deriveEnvVarName(inputValue))
  }

  /** Auto-derive both env var names as the user types the credential name. */
  const handleCredentialNameChange = (changeEvent) => {
    const inputValue = changeEvent.target.value
    setCredentialName(inputValue)
    const baseName = deriveEnvVarName(inputValue)
    setUsernameEnvVar(baseName ? `${baseName}_USERNAME` : '')
    setPasswordEnvVar(baseName ? `${baseName}_PASSWORD` : '')
  }

  /**
   * Validates and submits the form.
   * For credential type, calls onSubmit twice (username then password) so each
   * becomes an independent vault entry that can be toggled or deleted separately.
   * Clears sensitive values from memory immediately on success.
   */
  const handleFormSubmit = useCallback(async (submitEvent) => {
    submitEvent.preventDefault()

    let wasSuccessful = false

    if (secretType === SECRET_TYPE_API_TOKEN) {
      if (!secretName.trim() || !envVarName.trim() || !secretValue) return
      wasSuccessful = await onSubmit({
        secretName: secretName.trim(),
        envVarName: envVarName.trim(),
        secretValue,
        url: associatedUrl.trim(),
        description: description.trim(),
        shouldAutoInject,
      })
    } else {
      // Credential path — submit username and password as two independent entries
      if (!credentialName.trim() || !usernameEnvVar.trim() || !credentialUsername ||
          !passwordEnvVar.trim() || !credentialPassword) return

      const credentialBundleId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

      const usernameWasStored = await onSubmit({
        secretName: `${credentialName.trim()} — Username`,
        envVarName: usernameEnvVar.trim(),
        secretValue: credentialUsername,
        url: associatedUrl.trim(),
        description: description.trim(),
        bundleId: credentialBundleId,
        bundleType: 'username',
        shouldAutoInject,
      })
      const passwordWasStored = await onSubmit({
        secretName: `${credentialName.trim()} — Password`,
        envVarName: passwordEnvVar.trim(),
        secretValue: credentialPassword,
        url: associatedUrl.trim(),
        description: description.trim(),
        bundleId: credentialBundleId,
        bundleType: 'password',
        shouldAutoInject,
      })
      wasSuccessful = usernameWasStored && passwordWasStored
    }

    if (wasSuccessful) {
      // Clear sensitive values from component memory immediately after storage
      setSecretValue('')
      setCredentialUsername('')
      setCredentialPassword('')
      setIsTokenVisible(false)
      setIsUsernameVisible(false)
      setIsPasswordVisible(false)
      setIsSuccess(true)
      // Reset the rest of the form after the success flash fades
      setTimeout(() => {
        setSecretName('')
        setEnvVarName('')
        setCredentialName('')
        setUsernameEnvVar('')
        setPasswordEnvVar('')
        setAssociatedUrl('')
        setDescription('')
        setShouldAutoInject(true)
        setIsSuccess(false)
      }, SUCCESS_DISPLAY_MS)
    }
  }, [
    secretType, secretName, envVarName, secretValue,
    credentialName, credentialUsername, credentialPassword,
    usernameEnvVar, passwordEnvVar,
    associatedUrl, description, shouldAutoInject, onSubmit,
  ])

  const isApiTokenSubmittable =
    secretName.trim() && envVarName.trim() && secretValue && !isAdding

  const isCredentialSubmittable =
    credentialName.trim() && usernameEnvVar.trim() && credentialUsername &&
    passwordEnvVar.trim() && credentialPassword && !isAdding

  const isFormSubmittable = secretType === SECRET_TYPE_API_TOKEN
    ? isApiTokenSubmittable
    : isCredentialSubmittable

  return (
    <div className="vp-add-modal-overlay" role="dialog" aria-modal="true" aria-label="Add secret">
      <form className="vp-add-modal" onSubmit={handleFormSubmit} autoComplete="off">

        {/* Form header */}
        <div className="vp-add-modal-header">
          <h3 className="vp-form-title">
            {secretType === SECRET_TYPE_API_TOKEN ? 'Store API Token / Key' : 'Store Credential'}
          </h3>
          <button
            type="button"
            className="vp-close-btn"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {isSuccess && (
          <div className="vp-success-flash">
            <CheckCircle size={15} />
            {secretType === SECRET_TYPE_API_TOKEN
              ? 'Secret stored securely!'
              : 'Credential stored securely! (2 entries added)'}
          </div>
        )}

        {/* Secret type selector tabs */}
        <div className="vp-type-selector" role="tablist" aria-label="Secret type">
          <button
            type="button"
            role="tab"
            aria-selected={secretType === SECRET_TYPE_API_TOKEN}
            className={`vp-type-btn${secretType === SECRET_TYPE_API_TOKEN ? ' is-active' : ''}`}
            onClick={() => handleTypeChange(SECRET_TYPE_API_TOKEN)}
          >
            <KeyRound size={13} />
            API Token / Key
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={secretType === SECRET_TYPE_CREDENTIAL}
            className={`vp-type-btn${secretType === SECRET_TYPE_CREDENTIAL ? ' is-active' : ''}`}
            onClick={() => handleTypeChange(SECRET_TYPE_CREDENTIAL)}
          >
            <User size={13} />
            Username &amp; Password
          </button>
        </div>

        {/* ── API Token fields ───────────────────────────────────────────── */}
        {secretType === SECRET_TYPE_API_TOKEN && (
          <>
            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-secret-name">Secret Name</label>
              <input
                id="vault-secret-name"
                className="vp-form-input"
                type="text"
                value={secretName}
                onChange={handleSecretNameChange}
                placeholder="OpenAI API Key"
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-env-var">Environment Variable</label>
              <input
                id="vault-env-var"
                className="vp-form-input"
                type="text"
                value={envVarName}
                onChange={(changeEvent) => setEnvVarName(changeEvent.target.value.toUpperCase())}
                placeholder="OPENAI_API_KEY"
                autoComplete="off"
              />
              <EnvVarNameAdvisory envVarName={envVarName} onUseSuggestedName={setEnvVarName} />
            </div>

            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-token-value">Value</label>
              <div className="vp-password-wrapper">
                <input
                  id="vault-token-value"
                  className="vp-form-input"
                  type={isTokenVisible ? 'text' : 'password'}
                  value={secretValue}
                  onChange={(changeEvent) => setSecretValue(changeEvent.target.value)}
                  placeholder="Paste your token here"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="vp-eye-toggle"
                  onClick={() => setIsTokenVisible((prev) => !prev)}
                  aria-label={isTokenVisible ? 'Hide value' : 'Show value'}
                >
                  {isTokenVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Credential fields (username + password) ────────────────────── */}
        {secretType === SECRET_TYPE_CREDENTIAL && (
          <>
            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-credential-name">Credential Name</label>
              <input
                id="vault-credential-name"
                className="vp-form-input"
                type="text"
                value={credentialName}
                onChange={handleCredentialNameChange}
                placeholder="GitHub Account"
                autoFocus
                autoComplete="off"
              />
            </div>

            {/* Username with inline env var hint below */}
            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-username">Username</label>
              <div className="vp-password-wrapper">
                <input
                  id="vault-username"
                  className="vp-form-input"
                  type={isUsernameVisible ? 'text' : 'password'}
                  value={credentialUsername}
                  onChange={(changeEvent) => setCredentialUsername(changeEvent.target.value)}
                  placeholder="your@email.com or username"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="vp-eye-toggle"
                  onClick={() => setIsUsernameVisible((prev) => !prev)}
                  aria-label={isUsernameVisible ? 'Hide username' : 'Show username'}
                >
                  {isUsernameVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Editable env var name sits below the value input */}
              <input
                className="vp-form-input vp-env-var-input"
                type="text"
                value={usernameEnvVar}
                onChange={(changeEvent) => setUsernameEnvVar(changeEvent.target.value.toUpperCase())}
                placeholder="MY_SERVICE_USERNAME"
                autoComplete="off"
                aria-label="Username environment variable name"
              />
            </div>

            {/* Password with inline env var hint below */}
            <div className="vp-form-field">
              <label className="vp-form-label" htmlFor="vault-password">Password</label>
              <div className="vp-password-wrapper">
                <input
                  id="vault-password"
                  className="vp-form-input"
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={credentialPassword}
                  onChange={(changeEvent) => setCredentialPassword(changeEvent.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="vp-eye-toggle"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                >
                  {isPasswordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input
                className="vp-form-input vp-env-var-input"
                type="text"
                value={passwordEnvVar}
                onChange={(changeEvent) => setPasswordEnvVar(changeEvent.target.value.toUpperCase())}
                placeholder="MY_SERVICE_PASSWORD"
                autoComplete="off"
                aria-label="Password environment variable name"
              />
            </div>
          </>
        )}

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-associated-url">
            Associated URL <span>(optional)</span>
          </label>
          <input
            id="vault-associated-url"
            className="vp-form-input"
            type="url"
            value={associatedUrl}
            onChange={(changeEvent) => setAssociatedUrl(changeEvent.target.value)}
            placeholder="https://service.example.com/login"
            autoComplete="off"
          />
        </div>

        {/* Description — shared by both types */}
        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="vault-description"
            className="vp-form-textarea"
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            placeholder="Used for code generation tasks"
          />
          <DescriptionSecretWarning text={description} />
        </div>

        {/* Auto-inject toggle */}
        <div
          className="vp-form-toggle-row"
          onClick={() => setShouldAutoInject((prev) => !prev)}
          role="checkbox"
          aria-checked={shouldAutoInject}
          tabIndex={0}
          onKeyDown={(keyEvent) => keyEvent.key === ' ' && setShouldAutoInject((prev) => !prev)}
        >
          <span className="vp-form-toggle-label">Auto-inject into new sessions</span>
          <div className={`vp-toggle-track${shouldAutoInject ? ' is-active' : ''}`}>
            <div className="vp-toggle-thumb" />
          </div>
        </div>

        {/* Security note */}
        <div className="vp-security-note">
          <Shield size={14} className="vp-security-note-icon" />
          <span>
            {secretType === SECRET_TYPE_API_TOKEN
              ? 'Your value is encrypted immediately. Forge never transmits it to any AI model.'
              : 'Both values are encrypted separately. Forge never transmits them to any AI model.'}
          </span>
        </div>

        {/* Submit / Cancel */}
        <div className="vp-form-actions">
          <button
            type="submit"
            className="vp-btn-primary"
            disabled={!isFormSubmittable}
            style={{ flex: 1 }}
          >
            {isAdding ? (
              <>
                <span className="vp-spinner">⟳</span>
                Storing…
              </>
            ) : (
              <>
                <Lock size={14} />
                {secretType === SECRET_TYPE_API_TOKEN ? 'Store Securely 🔐' : 'Store Credential 🔐'}
              </>
            )}
          </button>
          <button type="button" className="vp-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Edit form for modifying an existing vault entry.
 * Pre-populates metadata fields from the entry being edited.
 * Secret value field starts empty — only sent if the user enters a new value.
 *
 * @param {{ entryToEdit: object, isLoading: boolean, onSubmit: Function, onCancel: Function }} props
 */
function EditSecretForm({ entryToEdit, isLoading, onSubmit, onCancel }) {
  const [secretName, setSecretName]   = useState(entryToEdit.secretName)
  const [envVarName, setEnvVarName]   = useState(entryToEdit.envVarName)
  const [secretValue, setSecretValue] = useState('')
  const [associatedUrl, setAssociatedUrl] = useState(entryToEdit.url || '')
  const [description, setDescription] = useState(entryToEdit.description || '')
  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleFormSubmit = useCallback(async (submitEvent) => {
    submitEvent.preventDefault()
    if (!secretName.trim()) return

    // Build the update payload — only include fields that actually changed.
    const fieldsToUpdate = {}
    if (secretName.trim() !== entryToEdit.secretName) {
      fieldsToUpdate.secretName = secretName.trim()
    }
    if (envVarName.trim() !== entryToEdit.envVarName) {
      fieldsToUpdate.envVarName = envVarName.trim()
    }
    if (secretValue) {
      fieldsToUpdate.secretValue = secretValue
    }
    if (associatedUrl.trim() !== (entryToEdit.url || '')) {
      fieldsToUpdate.url = associatedUrl.trim()
    }
    if (description.trim() !== (entryToEdit.description || '')) {
      fieldsToUpdate.description = description.trim()
    }

    // Nothing changed — close the form
    if (Object.keys(fieldsToUpdate).length === 0) {
      onCancel()
      return
    }

    const wasSuccessful = await onSubmit(entryToEdit.id, fieldsToUpdate)
    if (wasSuccessful) {
      setSecretValue('')
      setIsValueVisible(false)
      setIsSuccess(true)
      setTimeout(() => {
        setIsSuccess(false)
        onCancel()
      }, SUCCESS_DISPLAY_MS)
    }
  }, [secretName, envVarName, secretValue, associatedUrl, description, entryToEdit, onSubmit, onCancel])

  const isFormSubmittable = secretName.trim() && !isLoading

  return (
    <div className="vp-add-modal-overlay" role="dialog" aria-modal="true" aria-label="Edit secret">
      <form className="vp-add-modal" onSubmit={handleFormSubmit} autoComplete="off">
        <div className="vp-add-modal-header">
          <h3 className="vp-form-title">Edit Secret</h3>
          <button
            type="button"
            className="vp-close-btn"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {isSuccess && (
          <div className="vp-success-flash">
            <CheckCircle size={15} />
            Secret updated successfully!
          </div>
        )}

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-edit-name">Secret Name</label>
          <input
            id="vault-edit-name"
            className="vp-form-input"
            type="text"
            value={secretName}
            onChange={(changeEvent) => setSecretName(changeEvent.target.value)}
            autoFocus
            autoComplete="off"
          />
        </div>

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-edit-env-var">Environment Variable</label>
          <input
            id="vault-edit-env-var"
            className="vp-form-input"
            type="text"
            value={envVarName}
            onChange={(changeEvent) => setEnvVarName(changeEvent.target.value.toUpperCase())}
            autoComplete="off"
          />
          <EnvVarNameAdvisory envVarName={envVarName} onUseSuggestedName={setEnvVarName} />
        </div>

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-edit-value">
            New Value <span>(leave empty to keep current)</span>
          </label>
          <div className="vp-password-wrapper">
            <input
              id="vault-edit-value"
              className="vp-form-input"
              type={isValueVisible ? 'text' : 'password'}
              value={secretValue}
              onChange={(changeEvent) => setSecretValue(changeEvent.target.value)}
              placeholder="Enter new value to change"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="vp-eye-toggle"
              onClick={() => setIsValueVisible((prev) => !prev)}
              aria-label={isValueVisible ? 'Hide value' : 'Show value'}
            >
              {isValueVisible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-edit-url">
            Associated URL <span>(optional)</span>
          </label>
          <input
            id="vault-edit-url"
            className="vp-form-input"
            type="url"
            value={associatedUrl}
            onChange={(changeEvent) => setAssociatedUrl(changeEvent.target.value)}
            placeholder="https://service.example.com/login"
            autoComplete="off"
          />
        </div>

        <div className="vp-form-field">
          <label className="vp-form-label" htmlFor="vault-edit-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="vault-edit-description"
            className="vp-form-textarea"
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            placeholder="Used for code generation tasks"
          />
          <DescriptionSecretWarning text={description} />
        </div>

        <div className="vp-form-actions">
          <button
            type="submit"
            className="vp-btn-primary"
            disabled={!isFormSubmittable}
            style={{ flex: 1 }}
          >
            {isLoading ? (
              <>
                <span className="vp-spinner">⟳</span>
                Saving…
              </>
            ) : (
              <>
                <Pencil size={14} />
                Save Changes
              </>
            )}
          </button>
          <button type="button" className="vp-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * VaultPanel — Forge Vault secret manager rendered as a compact centered modal.
 *
 * Replaced the old full-screen two-column layout with a single focused dialog
 * so the panel doesn't dominate the screen when secrets are already stored.
 * The "Add Secret" form floats as its own modal overlay above this dialog,
 * keeping the entry list visible behind it.
 *
 * @param {{ isOpen: boolean, onClose: Function, onToast: Function }} props
 */
export function VaultPanel({ isOpen, onClose, onToast }) {
  const {
    entries,
    status,
    isLoading,
    isAdding,
    error,
    loadEntries,
    loadStatus,
    addEntry,
    updateEntry,
    removeEntry,
    toggleAutoInject,
    revealEntry,
    clearError,
  } = useVault()

  const [isAddFormVisible, setIsAddFormVisible] = useState(false)
  const [entryBeingDeleted, setEntryBeingDeleted] = useState(null)
  const [entryBeingEdited, setEntryBeingEdited] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortMode, setSortMode] = useState(SORT_MODE_COMMON)

  // Load data whenever the panel is opened
  useEffect(() => {
    if (!isOpen) return
    loadStatus()
    loadEntries()
  }, [isOpen, loadStatus, loadEntries])

  // Escape closes the add form first; if no form is open, closes the panel
  useEffect(() => {
    const handleKeyDown = (keyEvent) => {
      if (keyEvent.key !== 'Escape') return
      if (isAddFormVisible) {
        setIsAddFormVisible(false)
      } else if (entryBeingEdited) {
        setEntryBeingEdited(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAddFormVisible, entryBeingEdited, onClose])

  /** Passes each AddEntryRequest to the vault hook and returns success status. */
  const handleAddSubmit = useCallback(async (addRequest) => {
    return addEntry(addRequest)
  }, [addEntry])

  /** Opens the edit form pre-populated with the selected entry's data. */
  const handleEditRequest = useCallback((entry) => {
    setEntryBeingEdited(entry)
  }, [])

  /** Forwards the edit form submission to the vault hook's updateEntry. */
  const handleEditSubmit = useCallback(async (entryId, fieldsToUpdate) => {
    return updateEntry(entryId, fieldsToUpdate)
  }, [updateEntry])

  /** Starts the delete confirmation flow for the given entry. */
  const handleDeleteRequest = useCallback((entry) => {
    setEntryBeingDeleted(entry)
  }, [])

  /** Confirms and executes the pending delete, then clears confirmation state. */
  const handleDeleteConfirm = useCallback(async () => {
    if (!entryBeingDeleted) return
    await removeEntry(entryBeingDeleted.id)
    setEntryBeingDeleted(null)
  }, [entryBeingDeleted, removeEntry])

  const isVaultSecured = status?.isOpen ?? false
  const entryCount = status?.entryCount ?? entries.length
  const displayItems = useMemo(
    () => buildVaultDisplayItems(entries, searchTerm, sortMode),
    [entries, searchTerm, sortMode]
  )

  // Render nothing when closed — avoids hidden DOM and accidental event capture
  if (!isOpen) return null

  return (
    // Backdrop — clicking it closes the panel
    <div
      className="vault-panel-backdrop"
      onClick={onClose}
      aria-hidden="true"
    >
      {/* Dialog — stop clicks from bubbling to the backdrop */}
      <div
        className="vault-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Forge Vault"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="vp-header">
          <div className="vp-header-left">
            <Lock size={18} color="#58a6ff" />
            <div className="vp-header-title-group">
              <h1 className="vp-header-title">🔐 Forge Vault</h1>
              <p className="vp-header-subtitle">
                End-to-end encrypted · OS credential store
              </p>
            </div>
          </div>

          <div className="vp-header-right">
            {isVaultSecured && (
              <div className="vp-secured-badge" aria-label="Vault is secured">
                <div className="vp-secured-dot" />
                Secured
              </div>
            )}
            <button
              className="vp-close-btn"
              onClick={onClose}
              aria-label="Close vault"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* ── Error Banner ────────────────────────────────────────────────── */}
        {error && (
          <div className="vp-error-banner" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button
              className="vp-error-dismiss"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="vp-toolbar">
          <span className="vp-toolbar-count">
            {entryCount > 0
              ? `${entryCount} secret${entryCount === 1 ? '' : 's'} stored`
              : 'No secrets yet'}
          </span>
          <div className="vp-toolbar-controls">
            <label className="vp-search-box" htmlFor="vault-search">
              <Search size={13} />
              <input
                id="vault-search"
                className="vp-search-input"
                type="text"
                value={searchTerm}
                onChange={(changeEvent) => setSearchTerm(changeEvent.target.value)}
                placeholder="Search by name, env var, or URL"
                autoComplete="off"
              />
            </label>
            <select
              className="vp-sort-select"
              value={sortMode}
              onChange={(changeEvent) => setSortMode(changeEvent.target.value)}
              aria-label="Sort vault entries"
            >
              <option value={SORT_MODE_COMMON}>Commonly used</option>
              <option value={SORT_MODE_ALPHABETICAL}>Alphabetical</option>
              <option value={SORT_MODE_RECENT}>Recently added</option>
            </select>
          </div>
          <button
            className="vp-btn-primary vp-btn-sm"
            onClick={() => setIsAddFormVisible(true)}
          >
            <Plus size={13} />
            Add Secret
          </button>
        </div>

        {/* ── Entry List ──────────────────────────────────────────────────── */}
        <div className="vp-entry-list" role="list" aria-label="Stored secrets">
          {isLoading && displayItems.length === 0 && (
            <div className="vp-loading-row">
              <span className="vp-spinner">⟳</span>
              Loading…
            </div>
          )}

          {!isLoading && displayItems.length === 0 && <VaultEmptyState />}

          {displayItems.map((displayItem) =>
            displayItem.type === 'bundle' ? (
              <VaultCredentialBundleCard
                key={displayItem.key}
                bundleItem={displayItem}
                onEdit={handleEditRequest}
                onDelete={handleDeleteRequest}
                onToggleAutoInject={toggleAutoInject}
                onReveal={revealEntry}
              />
            ) : (
              <VaultEntryCard
                key={displayItem.entry.id}
                entry={displayItem.entry}
                onEdit={handleEditRequest}
                onDelete={handleDeleteRequest}
                onToggleAutoInject={toggleAutoInject}
                onReveal={revealEntry}
              />
            )
          )}
        </div>

        {/* ── Add Secret Modal ────────────────────────────────────────────── */}
        {isAddFormVisible && (
          <AddSecretForm
            isAdding={isAdding}
            onSubmit={handleAddSubmit}
            onCancel={() => setIsAddFormVisible(false)}
          />
        )}

        {/* ── Edit Secret Modal ─────────────────────────────────────────── */}
        {entryBeingEdited && (
          <EditSecretForm
            entryToEdit={entryBeingEdited}
            isLoading={isLoading}
            onSubmit={handleEditSubmit}
            onCancel={() => setEntryBeingEdited(null)}
          />
        )}

        {/* ── Delete Confirmation ─────────────────────────────────────────── */}
        {entryBeingDeleted && (
          <DeleteConfirmDialog
            entryBeingDeleted={entryBeingDeleted}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setEntryBeingDeleted(null)}
          />
        )}
      </div>
    </div>
  )
}

export default VaultPanel
