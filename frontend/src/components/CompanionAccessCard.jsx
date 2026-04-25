// CompanionAccessCard.jsx — Desktop sidebar card for the Forge Companion PWA.
//
// Gates the mobile companion feature behind the `mobile_access` license flag
// and, when entitled, surfaces everything a user needs to connect their phone:
// a QR-code deep link (forgeUrl + mobileToken), copy-to-clipboard helpers,
// a guided step-by-step connection flow, and a disable/revoke button.
//
// Backend contract:
//   GET  /api/mobile/settings  → { mobile_access_enabled, mobile_token, token_path }
//   POST /api/mobile/settings  → { enabled: bool }
//
// License gating is ultimately enforced server-side (the /api/mobile/* endpoints
// return 403 when the feature flag is off). This card only provides UI for the
// common cases — entitled-and-enabled, entitled-but-disabled, and not-entitled.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import {
  Smartphone,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Info,
  Cloud,
  Settings,
} from 'lucide-react'
import './CompanionAccessCard.css'
import {
  getDefaultCompanionHost,
  isStaleCompanionHost,
  buildDeepLink,
} from '../utils/companionUrl.js'
import NamedTunnelSetupCard from './NamedTunnelSetupCard'
import ConnectionSetupCard from './ConnectionSetupCard'
import CompanionConnectionWizard from './CompanionConnectionWizard'

// ── Constants ─────────────────────────────────────────────────────────────────

const COPY_RESET_DELAY_MS = 2000
const UPGRADE_URL = 'https://rootlevellabs.tech/upgrade'
const COMPANION_DOCS_URL = 'https://github.com/mikejsmith1985/forge-terminal/tree/main/forge-companion'

// localStorage keys used to remember the user's tunnel URL and companion host.
const STORAGE_TUNNEL_URL = 'forge.companion.tunnelUrl'
const STORAGE_COMPANION_HOST = 'forge.companion.hostUrl'

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * CompanionAccessCard — sidebar card for the Forge Companion mobile PWA.
 *
 * Three rendering paths based on the license/feature state:
 *   1. Not entitled — show upgrade CTA
 *   2. Entitled but disabled — show "Enable" toggle + explainer
 *   3. Enabled — show QR + token + instructions + disable button
 */
const CompanionAccessCard = () => {
  const [isExpanded, setIsExpanded]         = useState(false)
  const [settings, setSettings]             = useState(null) // { mobile_access_enabled, mobile_token, token_path }
  const [isLoading, setIsLoading]           = useState(true)
  const [isTogglePending, setIsTogglePending] = useState(false)
  const [hasCopiedToken, setHasCopiedToken]   = useState(false)
  const [hasCopiedLink, setHasCopiedLink]     = useState(false)

  const [tunnelUrl, setTunnelUrl] = useState(
    () => localStorage.getItem(STORAGE_TUNNEL_URL) || window.location.origin
  )
  const [companionHost, setCompanionHost] = useState(() => {
    const storedTunnelUrl = localStorage.getItem(STORAGE_TUNNEL_URL) || window.location.origin
    const storedHost = localStorage.getItem(STORAGE_COMPANION_HOST)
    // Migrate any stale value — legacy URLs, localhost, and protocol-less URLs
    // are all replaced so the QR code always generates a phone-reachable link.
    return isStaleCompanionHost(storedHost)
      ? getDefaultCompanionHost(storedTunnelUrl)
      : storedHost
  })

  // Persist input fields so the user does not retype them every session.
  useEffect(() => { localStorage.setItem(STORAGE_TUNNEL_URL, tunnelUrl) }, [tunnelUrl])
  useEffect(() => { localStorage.setItem(STORAGE_COMPANION_HOST, companionHost) }, [companionHost])

  // When the user edits the Forge URL, keep companionHost in sync unless it has
  // been manually overridden to a custom value. This ensures the QR code base
  // URL always matches the URL the phone will actually use to reach Forge.
  const handleTunnelUrlChange = useCallback((newUrl) => {
    setCompanionHost(prevHost => {
      // Re-sync companionHost only if it hasn't been manually overridden.
      // A stale host (localhost, protocol-less, legacy URL) is always replaced.
      const isAutoValue =
        prevHost === getDefaultCompanionHost(tunnelUrl) || isStaleCompanionHost(prevHost)
      return isAutoValue ? getDefaultCompanionHost(newUrl) : prevHost
    })
    setTunnelUrl(newUrl)
  }, [tunnelUrl])

  // Fetch current mobile settings on mount so the header badge is accurate.
  // Also attempt to auto-detect the active tunnel URL so the QR code points
  // to a reachable address without the user having to paste it manually.
  useEffect(() => {
    refreshSettings()
    autoDetectTunnelUrl()
  }, [])

  /**
   * autoDetectTunnelUrl — queries /api/tunnel/options on mount and fills
   * tunnelUrl + companionHost from the active named tunnel URL.  Only runs
   * when the stored tunnelUrl is still a localhost value (the factory default)
   * so it never overwrites a URL the user has intentionally entered.
   */
  async function autoDetectTunnelUrl() {
    const currentTunnelUrl = localStorage.getItem(STORAGE_TUNNEL_URL) || window.location.origin
    const isUsingLocalhost = /localhost|127\.0\.0\.1/.test(currentTunnelUrl)
    if (!isUsingLocalhost) return

    try {
      const response = await fetch('/api/tunnel/options')
      if (!response.ok) return
      const tunnelData = await response.json()
      // Prefer the named tunnel URL; fall back to whatever mode is active.
      const namedOption  = tunnelData.options?.find(opt => opt.mode === 'named' && opt.url)
      const activeOption = tunnelData.options?.find(opt => opt.mode === tunnelData.active && opt.url)
      const detectedUrl  = namedOption?.url || activeOption?.url
      if (!detectedUrl) return
      setTunnelUrl(detectedUrl)
      setCompanionHost(getDefaultCompanionHost(detectedUrl))
    } catch {
      // Best-effort — user can paste the URL manually if detection fails.
    }
  }

  async function refreshSettings() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/mobile/settings')
      if (!response.ok) {
        setSettings({ mobile_access_enabled: false, mobile_token: '', token_path: '' })
        return
      }
      const data = await response.json()
      setSettings(data)
    } catch {
      setSettings({ mobile_access_enabled: false, mobile_token: '', token_path: '' })
    } finally {
      setIsLoading(false)
    }
  }

  const toggleExpanded = useCallback(() => {
    setIsExpanded(previous => !previous)
  }, [])

  async function toggleEnabled(nextEnabled) {
    setIsTogglePending(true)
    try {
      const response = await fetch('/api/mobile/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      })
      if (!response.ok) {
        console.error('[Companion] toggle failed:', response.status)
        return
      }
      await refreshSettings()
    } finally {
      setIsTogglePending(false)
    }
  }

  async function copyToken() {
    if (!settings?.mobile_token) return
    await navigator.clipboard.writeText(settings.mobile_token)
    setHasCopiedToken(true)
    setTimeout(() => setHasCopiedToken(false), COPY_RESET_DELAY_MS)
  }

  async function copyDeepLink() {
    const deepLink = buildDeepLink(companionHost, tunnelUrl, settings?.mobile_token || '')
    await navigator.clipboard.writeText(deepLink)
    setHasCopiedLink(true)
    setTimeout(() => setHasCopiedLink(false), COPY_RESET_DELAY_MS)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isEnabled = settings?.mobile_access_enabled ?? false

  const badge = isLoading
    ? <span className="cac-badge cac-badge-loading">●</span>
    : isEnabled
      ? <span className="cac-badge cac-badge-active">● Enabled</span>
      : <span className="cac-badge cac-badge-inactive">○ Disabled</span>

  return (
    <div className="companion-access-card">
      <div className="cac-header" onClick={toggleExpanded}>
        <div className="cac-header-left">
          <Smartphone size={18} className="cac-icon" />
          <div className="cac-header-info">
            <span className="cac-title">Forge Companion</span>
            <span className="cac-subtitle">
              Mobile access · {isEnabled ? 'QR ready' : 'Paid add-on'}
            </span>
          </div>
        </div>
        <div className="cac-header-right">
          {badge}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isExpanded && (
        <div className="cac-body">
          {isLoading
            ? <div className="cac-loading">Loading…</div>
            : isEnabled
              ? <EnabledView
                  settings={settings}
                  tunnelUrl={tunnelUrl}
                  setTunnelUrl={handleTunnelUrlChange}
                  companionHost={companionHost}
                  setCompanionHost={setCompanionHost}
                  hasCopiedToken={hasCopiedToken}
                  hasCopiedLink={hasCopiedLink}
                  onCopyToken={copyToken}
                  onCopyLink={copyDeepLink}
                  onDisable={() => toggleEnabled(false)}
                  isTogglePending={isTogglePending}
                />
              : <DisabledView
                  onEnable={() => toggleEnabled(true)}
                  isTogglePending={isTogglePending}
                />
          }
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * DisabledView — rendered when mobile_access is off.
 *
 * Two calls to action: "Enable" (for users already entitled, the server accepts
 * the toggle) and "Upgrade" (for users who need to subscribe first). We cannot
 * cheaply tell the two cases apart client-side, so we surface both paths and
 * let the server reject the enable if the license does not permit it.
 */
const DisabledView = ({ onEnable, isTogglePending }) => (
  <>
    <div className="cac-section">
      <div className="cac-lead">
        <Lock size={16} />
        <div>
          <strong>Mobile access is a paid add-on.</strong>
          <p className="cac-muted">
            View and drive your Forge terminal sessions from your phone via a
            lightweight PWA. Requires an active Forge Companion subscription.
          </p>
        </div>
      </div>
    </div>

    <div className="cac-actions">
      <button
        className="cac-btn cac-btn-primary"
        onClick={onEnable}
        disabled={isTogglePending}
        title="Enable if your license includes Forge Companion"
      >
        {isTogglePending ? 'Enabling…' : 'Enable Mobile Access'}
      </button>
      <a
        className="cac-btn cac-btn-secondary"
        href={UPGRADE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Upgrade <ExternalLink size={14} />
      </a>
    </div>

    <InstructionsBlock />
  </>
)

/**
 * EnabledView — the main body rendered when mobile access is on.
 *
 * Flow:
 *   1. Cloudflare Tunnel — embedded NamedTunnelSetupCard drives setup or
 *      shows "Your tunnel is live" when already configured.
 *   2. Forge URL — auto-detected from the active tunnel; editable override.
 *   3. QR code — encodes the companion deep-link; scan with iPhone to connect.
 *
 * Advanced settings (connection mode switcher, PWA host override, raw token)
 * are collapsed so they don't clutter the primary flow.
 */
const EnabledView = ({
  settings,
  tunnelUrl,
  setTunnelUrl,
  companionHost,
  setCompanionHost,
  hasCopiedToken,
  hasCopiedLink,
  onCopyToken,
  onCopyLink,
  onDisable,
  isTogglePending,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const deepLink = buildDeepLink(companionHost, tunnelUrl, settings?.mobile_token || '')

  return (
    <>
      {/* ── Guided connection wizard ────────────────────────────────
       * The wizard owns method selection, per-method instructions,
       * and the final QR code.  It always shows exactly one method
       * at a time and persists the user's choice server-side. */}
      <div className="cac-section">
        <CompanionConnectionWizard
          mobileToken={settings?.mobile_token || ''}
          companionHost={companionHost}
        />
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="cac-actions">
        <button
          className="cac-btn cac-btn-danger"
          onClick={onDisable}
          disabled={isTogglePending}
        >
          {isTogglePending ? 'Disabling…' : 'Disable'}
        </button>
      </div>

      {/* ── Advanced (collapsed by default) ─────────────────────────── */}
      <button
        className="cac-advanced-toggle"
        onClick={() => setIsAdvancedOpen(prev => !prev)}
      >
        <Settings size={12} />
        {isAdvancedOpen ? 'Hide advanced' : 'Advanced settings'}
        {isAdvancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isAdvancedOpen && (
        <div className="cac-advanced-body">
          {/* Connection mode switcher — view all tunnel options */}
          <div className="cac-section">
            <label className="cac-label">Connection mode</label>
            <ConnectionSetupCard embedded={true} />
          </div>

          {/* Companion PWA host override */}
          <div className="cac-section">
            <label className="cac-label">Companion PWA host</label>
            <input
              className="cac-input"
              type="text"
              value={companionHost}
              onChange={evt => setCompanionHost(evt.target.value)}
              placeholder="https://your-companion-host/"
            />
            <p className="cac-hint">
              Auto-set from your Forge URL above. Only change this if you host
              the companion PWA at a custom location outside of Forge.
            </p>
          </div>

          {/* Raw mobile token */}
          <div className="cac-section">
            <label className="cac-label">Mobile token</label>
            <div className="cac-token-row">
              <code className="cac-token">{maskToken(settings?.mobile_token)}</code>
              <button
                className="cac-btn cac-btn-ghost"
                onClick={onCopyToken}
                title="Copy full token to clipboard"
              >
                {hasCopiedToken
                  ? <><Check size={14} /> Copied</>
                  : <><Copy size={14} /> Copy</>
                }
              </button>
            </div>
            <p className="cac-hint">
              Stored at <code>{settings?.token_path || '~/.forge/mobile-token'}</code>
            </p>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * QRBlock — renders the deep-link URL as a QR code canvas.
 *
 * Redraws whenever the deep link changes. If QR generation fails (for example,
 * the URL is too long for the error-correction level), a textual fallback is
 * shown instead of a broken image.
 */
const QRBlock = ({ deepLink }) => {
  const canvasRef = useRef(null)
  const [renderError, setRenderError] = useState(null)

  useEffect(() => {
    if (!canvasRef.current || !deepLink) return
    setRenderError(null)
    QRCode.toCanvas(canvasRef.current, deepLink, {
      width: 220,
      margin: 1,
      color: { dark: '#e6edf3', light: '#0d1117' },
      errorCorrectionLevel: 'M',
    }).catch(renderErr => {
      setRenderError(renderErr?.message || String(renderErr))
    })
  }, [deepLink])

  return (
    <div className="cac-section cac-qr-section">
      <label className="cac-label">Scan with your phone</label>
      {renderError
        ? <div className="cac-qr-error">QR unavailable: {renderError}</div>
        : <canvas ref={canvasRef} className="cac-qr" />
      }
    </div>
  )
}

/**
 * InstructionsBlock — compact teaser shown on the disabled screen so users
 * know what to expect before they click Enable.
 *
 * The enabled screen now has inline step cards, so this block is only used
 * when mobile access is off.
 */
const InstructionsBlock = () => (
  <div className="cac-section cac-instructions">
    <h4>
      <Info size={14} /> What you'll need
    </h4>
    <ol>
      <li>A way to reach this PC from your phone — Tailscale IP or a free Cloudflare tunnel</li>
      <li>Enable mobile access on this card</li>
      <li>Scan the QR code that appears — done!</li>
    </ol>
    <a
      className="cac-docs-link"
      href={COMPANION_DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Full setup guide <ExternalLink size={12} />
    </a>
  </div>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildDeepLink, getDefaultCompanionHost, isStaleCompanionHost, and
// normalizeHttpUrl live in ../utils/companionUrl.js so they can be unit-tested
// independently of React.  Do not duplicate them here.

/**
 * maskToken — shows only the first 8 characters of the token, then "…".
 * Copies still work through the copy button, which writes the full token.
 */
function maskToken(fullToken) {
  if (!fullToken) return '—'
  if (fullToken.length <= 8) return fullToken
  return `${fullToken.slice(0, 8)}…`
}

export default CompanionAccessCard
