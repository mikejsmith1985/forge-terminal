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
 * Architecture decision: credentials are stored as two independent VaultEntry
 * records rather than a grouped type. This avoids any backend schema change and
 * keeps the inject logic simple — each env var is still injected individually.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Lock,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  X,
  Shield,
  CheckCircle,
  AlertCircle,
  KeyRound,
  User,
} from 'lucide-react'
import { useVault } from '../hooks/useVault'
import './VaultPanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) the success confirmation is shown after adding an entry. */
const SUCCESS_DISPLAY_MS = 3000

/** Identifies the single-value API token / key secret type. */
const SECRET_TYPE_API_TOKEN = 'apiToken'

/** Identifies the username + password credential secret type. */
const SECRET_TYPE_CREDENTIAL = 'credential'

/**
 * Derives an environment variable name from a human-readable secret name.
 * "OpenAI API Key" → "OPENAI_API_KEY"
 *
 * @param {string} secretName - The human-readable name to convert
 * @returns {string} The derived env var name
 */
const deriveEnvVarName = (secretName) =>
  secretName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a single vault entry card in the entry list.
 * Shows name, env var, auto-inject toggle, and a delete button.
 *
 * @param {{ entry: object, onDelete: Function, onToggleAutoInject: Function }} props
 */
function VaultEntryCard({ entry, onDelete, onToggleAutoInject }) {
  const handleDeleteClick = (clickEvent) => {
    // Stop propagation so the row click handler doesn't also fire
    clickEvent.stopPropagation()
    onDelete(entry)
  }

  const handleToggleClick = (clickEvent) => {
    clickEvent.stopPropagation()
    onToggleAutoInject(entry.id, !entry.shouldAutoInject)
  }

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
        description: description.trim(),
        shouldAutoInject,
      })
    } else {
      // Credential path — submit username and password as two independent entries
      if (!credentialName.trim() || !usernameEnvVar.trim() || !credentialUsername ||
          !passwordEnvVar.trim() || !credentialPassword) return

      const usernameWasStored = await onSubmit({
        secretName: `${credentialName.trim()} — Username`,
        envVarName: usernameEnvVar.trim(),
        secretValue: credentialUsername,
        description: description.trim(),
        shouldAutoInject,
      })
      const passwordWasStored = await onSubmit({
        secretName: `${credentialName.trim()} — Password`,
        envVarName: passwordEnvVar.trim(),
        secretValue: credentialPassword,
        description: description.trim(),
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
        setDescription('')
        setShouldAutoInject(true)
        setIsSuccess(false)
      }, SUCCESS_DISPLAY_MS)
    }
  }, [
    secretType, secretName, envVarName, secretValue,
    credentialName, credentialUsername, credentialPassword,
    usernameEnvVar, passwordEnvVar,
    description, shouldAutoInject, onSubmit,
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * VaultPanel — The primary Forge Vault UI.
 *
 * Renders as a full-screen overlay (z-index 1100, above Code Tutor at 1000).
 * On mount it loads both the vault status and the entries list.
 * Closing via the X button or pressing Escape calls onClose.
 *
 * @param {{ onClose: Function }} props
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
    removeEntry,
    toggleAutoInject,
    clearError,
  } = useVault()

  const [isAddFormVisible, setIsAddFormVisible] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [entryBeingDeleted, setEntryBeingDeleted] = useState(null)

  // Load data when panel opens
  useEffect(() => {
    if (!isOpen) return
    loadStatus()
    loadEntries()
  }, [isOpen, loadStatus, loadEntries])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (keyEvent) => {
      if (keyEvent.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** Opens the add form, deselecting any currently selected entry. */
  const handleAddClick = useCallback(() => {
    setIsAddFormVisible(true)
    setSelectedEntry(null)
  }, [])

  /** Selects an entry for detail view, hiding the add form. */
  const handleEntrySelect = useCallback((entry) => {
    setSelectedEntry(entry)
    setIsAddFormVisible(false)
  }, [])

  /**
   * Submits the new entry to the vault hook.
   * Returns true so the form can show its success state.
   *
   * @param {object} addRequest - The form data
   * @returns {Promise<boolean>}
   */
  const handleAddSubmit = useCallback(async (addRequest) => {
    const wasSuccessful = await addEntry(addRequest)
    if (wasSuccessful) {
      // Keep the form open so the user can add more secrets in a flow
    }
    return wasSuccessful
  }, [addEntry])

  /** Initiates the delete confirmation flow for an entry. */
  const handleDeleteRequest = useCallback((entry) => {
    setEntryBeingDeleted(entry)
  }, [])

  /** Executes the confirmed delete and clears state. */
  const handleDeleteConfirm = useCallback(async () => {
    if (!entryBeingDeleted) return
    await removeEntry(entryBeingDeleted.id)
    if (selectedEntry?.id === entryBeingDeleted.id) setSelectedEntry(null)
    setEntryBeingDeleted(null)
  }, [entryBeingDeleted, removeEntry, selectedEntry?.id])

  const isVaultSecured = status?.isOpen ?? false
  const entryCount = status?.entryCount ?? entries.length

  // Don't render anything when closed — no hidden DOM, no accidental event capture
  if (!isOpen) return null

  return (
    <div className="vault-panel" role="dialog" aria-modal="true" aria-label="Forge Vault">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="vp-header">
        <div className="vp-header-left">
          <Lock size={22} color="#58a6ff" />
          <div className="vp-header-title-group">
            <h1 className="vp-header-title">🔐 Forge Vault</h1>
            <p className="vp-header-subtitle">
              End-to-end encrypted · Protected by OS credential store
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
            aria-label="Close vault panel"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="vp-error-banner" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            onClick={clearError}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            aria-label="Dismiss error"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Two-Column Body ────────────────────────────────────────────────── */}
      <div className="vp-layout">
        {/* Left sidebar — entry list */}
        <aside className="vp-sidebar" aria-label="Stored secrets">
          <div className="vp-sidebar-header">
            <span className="vp-sidebar-count">
              {entryCount > 0 ? `${entryCount} secret${entryCount === 1 ? '' : 's'} stored` : 'No secrets yet'}
            </span>
          </div>

          <button className="vp-add-secret-btn" onClick={handleAddClick}>
            <Plus size={14} />
            Add Secret
          </button>

          {isLoading && entries.length === 0 && (
            <div style={{ color: '#8b949e', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
              <span className="vp-spinner" style={{ display: 'inline-block', marginRight: 6 }}>⟳</span>
              Loading…
            </div>
          )}

          {entries.map((entry) => (
            <VaultEntryCard
              key={entry.id}
              entry={entry}
              isSelected={selectedEntry?.id === entry.id}
              onSelect={handleEntrySelect}
              onDelete={handleDeleteRequest}
              onToggleAutoInject={toggleAutoInject}
            />
          ))}
        </aside>

        {/* Right content pane */}
        <main className="vp-content" aria-label="Vault detail pane">
          {isAddFormVisible ? (
            <AddSecretForm
              isAdding={isAdding}
              onSubmit={handleAddSubmit}
              onCancel={() => setIsAddFormVisible(false)}
            />
          ) : (
            <VaultEmptyState onAddClick={handleAddClick} />
          )}
        </main>
      </div>

      {/* ── Delete Confirmation Overlay ────────────────────────────────────── */}
      {entryBeingDeleted && (
        <DeleteConfirmDialog
          entryBeingDeleted={entryBeingDeleted}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setEntryBeingDeleted(null)}
        />
      )}
    </div>
  )
}

export default VaultPanel
