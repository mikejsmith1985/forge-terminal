/**
 * VaultPanel.jsx — Full-screen overlay for the Forge Vault secret manager.
 *
 * Provides a two-column layout: a sidebar listing all vault entries on the left,
 * and a right pane that shows either an empty state, the add-secret form, or
 * a selected entry's details. Secret values are NEVER displayed — only metadata.
 *
 * Design goal: feel like a first-class security panel (like 1Password or Bitwarden),
 * not a settings drawer. Full-screen, dark, and focused.
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
} from 'lucide-react'
import { useVault } from '../hooks/useVault'
import './VaultPanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) the success confirmation is shown after adding an entry. */
const SUCCESS_DISPLAY_MS = 3000

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
 * Renders a single vault entry card in the sidebar list.
 * Shows name, env var, auto-inject toggle, and a delete button.
 *
 * @param {{ entry: object, isSelected: boolean, onSelect: Function, onDelete: Function, onToggleAutoInject: Function }} props
 */
function VaultEntryCard({ entry, isSelected, onSelect, onDelete, onToggleAutoInject }) {
  const handleDeleteClick = (clickEvent) => {
    // Stop propagation so the card's onSelect doesn't also fire
    clickEvent.stopPropagation()
    onDelete(entry)
  }

  const handleToggleClick = (clickEvent) => {
    clickEvent.stopPropagation()
    onToggleAutoInject(entry.id, !entry.shouldAutoInject)
  }

  return (
    <div
      className={`vp-entry-card${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(keyEvent) => keyEvent.key === 'Enter' && onSelect(entry)}
      aria-label={`Select entry ${entry.secretName}`}
    >
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
 * The "empty state" shown in the right pane when no entry is selected
 * and the add form is not open.
 *
 * @param {{ onAddClick: Function }} props
 */
function VaultEmptyState({ onAddClick }) {
  return (
    <div className="vp-empty-state">
      <div className="vp-empty-state-icon">
        <Lock size={64} />
      </div>
      <h3 className="vp-empty-state-title">Your secrets live here, encrypted.</h3>
      <p className="vp-empty-state-description">
        Forge auto-injects them into every new terminal session — your agents never see the raw values.
      </p>
      <button className="vp-btn-primary" onClick={onAddClick}>
        <Plus size={15} />
        Add Your First Secret
      </button>
    </div>
  )
}

/**
 * Delete confirmation dialog shown as a modal overlay.
 * Requires the user to explicitly confirm before the entry is removed.
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
 * The "Add Secret" form rendered in the right content pane.
 * Handles its own local form state; calls onSubmit with the completed request object.
 *
 * @param {{ isAdding: boolean, onSubmit: Function, onCancel: Function }} props
 */
function AddSecretForm({ isAdding, onSubmit, onCancel }) {
  const [secretName, setSecretName] = useState('')
  const [envVarName, setEnvVarName] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [description, setDescription] = useState('')
  const [shouldAutoInject, setShouldAutoInject] = useState(true)
  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  /** Keep envVarName in sync as the user types the secret name. */
  const handleSecretNameChange = (changeEvent) => {
    const inputValue = changeEvent.target.value
    setSecretName(inputValue)
    setEnvVarName(deriveEnvVarName(inputValue))
  }

  /**
   * Validates, submits, and resets the form on success.
   * Clears the secret value immediately after submission for security.
   */
  const handleFormSubmit = useCallback(async (submitEvent) => {
    submitEvent.preventDefault()
    if (!secretName.trim() || !envVarName.trim() || !secretValue) return

    const wasSuccessful = await onSubmit({
      secretName: secretName.trim(),
      envVarName: envVarName.trim(),
      secretValue,
      description: description.trim(),
      shouldAutoInject,
    })

    if (wasSuccessful) {
      // Clear the sensitive value from memory immediately
      setSecretValue('')
      setIsValueVisible(false)
      setIsSuccess(true)
      // Reset the rest of the form after the success flash fades
      setTimeout(() => {
        setSecretName('')
        setEnvVarName('')
        setDescription('')
        setShouldAutoInject(true)
        setIsSuccess(false)
      }, SUCCESS_DISPLAY_MS)
    }
  }, [secretName, envVarName, secretValue, description, shouldAutoInject, onSubmit])

  const isFormSubmittable = secretName.trim() && envVarName.trim() && secretValue && !isAdding

  return (
    <form className="vp-form" onSubmit={handleFormSubmit} autoComplete="off">
      <div>
        <h3 className="vp-form-title">Store New Secret</h3>
      </div>

      {isSuccess && (
        <div className="vp-success-flash">
          <CheckCircle size={15} />
          Secret stored securely!
        </div>
      )}

      {/* Secret Name */}
      <div className="vp-form-field">
        <label className="vp-form-label" htmlFor="vault-secret-name">
          Secret Name
        </label>
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

      {/* Environment Variable */}
      <div className="vp-form-field">
        <label className="vp-form-label" htmlFor="vault-env-var">
          Environment Variable
        </label>
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

      {/* Secret Value — password input with show/hide toggle */}
      <div className="vp-form-field">
        <label className="vp-form-label" htmlFor="vault-secret-value">
          Value
        </label>
        <div className="vp-password-wrapper">
          <input
            id="vault-secret-value"
            className="vp-form-input"
            type={isValueVisible ? 'text' : 'password'}
            value={secretValue}
            onChange={(changeEvent) => setSecretValue(changeEvent.target.value)}
            placeholder="Paste your token here"
            autoComplete="new-password"
          />
          <button
            type="button"
            className="vp-eye-toggle"
            onClick={() => setIsValueVisible((prev) => !prev)}
            title={isValueVisible ? 'Hide value' : 'Show value'}
            aria-label={isValueVisible ? 'Hide secret value' : 'Show secret value'}
          >
            {isValueVisible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Description (optional) */}
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
          Your value is encrypted immediately. Forge never transmits it to any AI model.
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="submit"
          className="vp-btn-primary"
          disabled={!isFormSubmittable}
          style={{ flex: 1 }}
        >
          {isAdding ? (
            <>
              <span className="vp-spinner" style={{ display: 'inline-block' }}>⟳</span>
              Storing…
            </>
          ) : (
            <>
              <Lock size={14} />
              Store Securely 🔐
            </>
          )}
        </button>
        <button type="button" className="vp-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
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
export function VaultPanel({ onClose }) {
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

  // Load data on mount
  useEffect(() => {
    loadStatus()
    loadEntries()
  }, [loadStatus, loadEntries])

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
