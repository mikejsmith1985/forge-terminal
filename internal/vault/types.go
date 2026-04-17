// Package vault provides AES-256-GCM encrypted secret storage for Forge Terminal.
//
// Secrets (API tokens, credentials) are stored in an encrypted file at
// ~/.forge/vault/vault.enc. The encryption key is protected by the OS
// credential store: Windows DPAPI ties it to the current Windows user account;
// on Unix systems strict file permissions (0600) restrict access.
//
// Design principle: secret values are never included in list or status API
// responses, never written to logs or WebSocket messages, and never passed to
// any LLM context. The one exception is the on-demand reveal endpoint
// (GET /api/vault/entries/value) — this returns a single decrypted value only
// when the user explicitly requests it, and every call is logged for auditability.
package vault

import "time"

// CurrentVaultFileVersion is the schema version embedded in vault.enc.
// Bump this when the on-disk format changes incompatibly.
const CurrentVaultFileVersion = 1

// VaultEntry is the public, API-safe representation of a stored secret.
// It intentionally omits the secret value — use GetAutoInjectEnv for
// controlled access when building PTY environment overlays.
type VaultEntry struct {
	ID               string     `json:"id"`
	SecretName       string     `json:"secretName"`       // Human label, e.g. "OpenAI API Key"
	EnvVarName       string     `json:"envVarName"`       // Shell variable, e.g. "OPENAI_API_KEY"
	Description      string     `json:"description"`
	ShouldAutoInject bool       `json:"shouldAutoInject"` // Inject into every new PTY session
	CreatedAt        time.Time  `json:"createdAt"`
	LastUsedAt       *time.Time `json:"lastUsedAt,omitempty"`
}

// AddEntryRequest is the body of POST /api/vault/entries.
// SecretValue is accepted here and immediately encrypted — it is never stored
// in plaintext on disk and never returned through any API response.
type AddEntryRequest struct {
	SecretName       string `json:"secretName"`
	EnvVarName       string `json:"envVarName"`
	SecretValue      string `json:"secretValue"`
	Description      string `json:"description"`
	ShouldAutoInject bool   `json:"shouldAutoInject"`
}

// UpdateEntryRequest is the body of PUT /api/vault/entries.
// All fields are optional — only non-empty fields are applied to the existing entry.
// This lets callers update just the secret value without touching the name or env var,
// or rename an entry without re-entering the secret.
type UpdateEntryRequest struct {
	ID          string `json:"id"`
	SecretName  string `json:"secretName,omitempty"`
	EnvVarName  string `json:"envVarName,omitempty"`
	SecretValue string `json:"secretValue,omitempty"`
	Description string `json:"description,omitempty"`
}

// AutoInjectToggleRequest is the body of POST /api/vault/auto-inject.
type AutoInjectToggleRequest struct {
	ID               string `json:"id"`
	ShouldAutoInject bool   `json:"shouldAutoInject"`
}

// InjectRequest is the body of POST /api/vault/inject.
// The caller specifies which entry IDs to inject into the current session.
type InjectRequest struct {
	EntryIDs []string `json:"entryIds"`
}

// InjectResult is returned by POST /api/vault/inject.
// ScriptPath is the path to a temporary PowerShell script that sets the
// environment variables. The frontend sources this script in the PTY terminal.
// The script self-deletes after running so values are never persisted to shell
// history or left on disk beyond the sourcing window.
type InjectResult struct {
	ScriptPath   string `json:"scriptPath"`
	InjectedCount int   `json:"injectedCount"`
}

// VaultStatus is returned by GET /api/vault/status.
type VaultStatus struct {
	IsOpen          bool   `json:"isOpen"`
	EntryCount      int    `json:"entryCount"`
	AutoInjectCount int    `json:"autoInjectCount"`
	VaultPath       string `json:"vaultPath"`
}

// RevealValueResponse is returned by GET /api/vault/entries/value.
// It exposes the decrypted secret value for a single entry on explicit
// user request. This type is intentionally separate from VaultEntry to make
// it clear that returning a value is a deliberate, audited act.
type RevealValueResponse struct {
	Value string `json:"value"`
}

// ── Internal disk types — never serialized to the API ────────────────────────

// diskContents is the plaintext JSON structure that is AES-256-GCM encrypted
// before being written to vault.enc. It must never exist unencrypted on disk.
type diskContents struct {
	Version int         `json:"version"`
	Entries []diskEntry `json:"entries"`
}

// diskEntry holds all data for a stored secret, including the plaintext value
// that lives inside the AES-GCM encryption envelope.
type diskEntry struct {
	ID               string     `json:"id"`
	SecretName       string     `json:"secretName"`
	EnvVarName       string     `json:"envVarName"`
	SecretValue      string     `json:"secretValue"` // plaintext inside the encrypted blob
	Description      string     `json:"description"`
	ShouldAutoInject bool       `json:"shouldAutoInject"`
	CreatedAt        time.Time  `json:"createdAt"`
	LastUsedAt       *time.Time `json:"lastUsedAt,omitempty"`
}
