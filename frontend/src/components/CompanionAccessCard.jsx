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
  Wifi,
  Globe,
  Settings,
  Loader2,
  Radio,
  Square,
} from 'lucide-react'
import './CompanionAccessCard.css'
import {
  getDefaultCompanionHost,
  isStaleCompanionHost,
  buildDeepLink,
} from '../utils/companionUrl.js'

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

  // ── Cloudflare tunnel state ────────────────────────────────────────────────

  // Tracks the live state of the cloudflared subprocess managed by the Go backend.
  const [tunnelStatus, setTunnelStatus] = useState({ running: false, url: '', error: '' })
  // True while we are waiting for cloudflared to print its HTTPS URL.
  const [isTunnelLaunching, setIsTunnelLaunching] = useState(false)
  // Error from the start call itself (distinct from a running error).
  const [tunnelStartError, setTunnelStartError] = useState('')

  // Apply a tunnel URL to the Step 2 input, sync the companion host, and
  // persist both values to localStorage synchronously so no async storage-event
  // timers are left pending in the fake-timer environment used by tests.
  function applyTunnelUrl(url) {
    setTunnelUrl(url)
    localStorage.setItem(STORAGE_TUNNEL_URL, url)
    // Compute new host from the current closure value — safe here because this
    // function is only ever called once per async boundary (not in tight loops).
    const newHost = isStaleCompanionHost(companionHost) ? getDefaultCompanionHost(url) : companionHost
    setCompanionHost(newHost)
    localStorage.setItem(STORAGE_COMPANION_HOST, newHost)
  }

  // Poll /api/tunnel/status every 1.5 s while the tunnel is launching.
  // Stops as soon as a URL is returned or a non-empty error appears.
  useEffect(() => {
    if (!isTunnelLaunching) return

    // Track attempt count in a closure variable so we can stop polling after
    // a finite number of tries — prevents test infinite loops and bounds real
    // wait time to ~MAX_POLL_ATTEMPTS × 1.5s.
    const MAX_POLL_ATTEMPTS = 40
    let attemptCount = 0

    const intervalId = setInterval(async () => {
      if (attemptCount >= MAX_POLL_ATTEMPTS) {
        // cloudflared hasn't printed a URL yet — stop polling but keep the
        // loading indicator so the user can see the tunnel is still starting.
        clearInterval(intervalId)
        return
      }
      attemptCount++
      try {
        const res = await fetch('/api/tunnel/status')
        if (!res.ok) return
        const data = await res.json()
        setTunnelStatus(data)
        if (data.url) {
          applyTunnelUrl(data.url)
          setIsTunnelLaunching(false)
          clearInterval(intervalId)
        } else if (data.error) {
          setTunnelStartError(data.error)
          setIsTunnelLaunching(false)
          clearInterval(intervalId)
        }
      } catch {
        // Network error — retry on next tick
      }
    }, 1500)

    return () => clearInterval(intervalId)
  }, [isTunnelLaunching]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the card is expanded, check whether a tunnel was already running
  // (e.g. from a previous session) and pre-fill Step 2 if so.
  // No setTimeout — the fetch runs as a pure microtask chain so it completes
  // within the act() boundary of renderExpanded() in tests, making waitFor
  // resolve on its first synchronous check rather than hanging.
  useEffect(() => {
    if (!isExpanded) return

    let cancelled = false

    void (async () => {
      try {
        const res = await fetch('/api/tunnel/status')
        if (!res.ok || cancelled) return

        const data = await res.json()
        if (cancelled) return

        setTunnelStatus(data)
        if (data.url) applyTunnelUrl(data.url)
      } catch {
        // Non-critical — proceed without tunnel pre-fill
      }
    })()

    return () => { cancelled = true }
  }, [isExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function launchTunnel() {
    setTunnelStartError('')
    setIsTunnelLaunching(true)
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setTunnelStartError(data.error || 'Failed to start tunnel')
        setIsTunnelLaunching(false)
        return
      }
      // If the backend already has a URL (e.g. named tunnel), use it immediately.
      if (data.url) {
        applyTunnelUrl(data.url)
        setTunnelStatus(data)
        setIsTunnelLaunching(false)
      }
      // Otherwise polling (useEffect above) will detect the URL when cloudflared prints it.
    } catch (err) {
      setTunnelStartError(err.message || 'Network error')
      setIsTunnelLaunching(false)
    }
  }

  async function stopTunnel() {
    try {
      await fetch('/api/tunnel/stop', { method: 'POST' })
      setTunnelStatus({ running: false, url: '', error: '' })
      setIsTunnelLaunching(false)
      setTunnelStartError('')
    } catch {
      // Ignore — the tunnel process may already be gone
    }
  }

  // Persist input fields so the user does not retype them every session.
  // NOTE: these are intentionally direct synchronous writes rather than
  // useEffect hooks, which would schedule jsdom storage-event timers that
  // interfere with @testing-library's waitFor drain step under fake timers.
  // Each site that changes tunnelUrl or companionHost is responsible for
  // persisting its own write (see applyTunnelUrl, handleTunnelUrlChange, and
  // the inline companionHost onChange below).

  // When the user edits the Forge URL, keep companionHost in sync unless it has
  // been manually overridden to a custom value. This ensures the QR code base
  // URL always matches the URL the phone will actually use to reach Forge.
  const handleTunnelUrlChange = useCallback((newUrl) => {
    const isAutoValue =
      companionHost === getDefaultCompanionHost(tunnelUrl) || isStaleCompanionHost(companionHost)
    const newHost = isAutoValue ? getDefaultCompanionHost(newUrl) : companionHost
    setCompanionHost(newHost)
    setTunnelUrl(newUrl)
    localStorage.setItem(STORAGE_TUNNEL_URL, newUrl)
    localStorage.setItem(STORAGE_COMPANION_HOST, newHost)
  }, [tunnelUrl, companionHost])

  // Fetch current mobile settings on mount so the header badge is accurate.
  useEffect(() => {
    refreshSettings()
  }, [])

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
                  tunnelStatus={tunnelStatus}
                  isTunnelLaunching={isTunnelLaunching}
                  tunnelStartError={tunnelStartError}
                  onLaunchTunnel={launchTunnel}
                  onStopTunnel={stopTunnel}
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
 * CloudflareTunnelHint — interactive hint inside the Cloudflare connection card.
 *
 * Replaces the manual "run this command" instruction with a one-click
 * Launch Tunnel button. Forge starts cloudflared on the backend and polls
 * for the public HTTPS URL, then auto-fills Step 2 when ready.
 */
const CloudflareTunnelHint = ({
  isTunnelRunning,
  isTunnelLaunching,
  tunnelStartError,
  isTunnelNotFound,
  tunnelUrl,
  onLaunch,
  onStop,
}) => {
  if (isTunnelLaunching) {
    return (
      <span className="cac-tunnel-launching">
        <Loader2 size={14} className="cac-spinner" aria-label="Launching tunnel" />
        Starting tunnel… this takes about 10–20 seconds.
      </span>
    )
  }

  if (isTunnelRunning && tunnelUrl) {
    return (
      <span className="cac-tunnel-active">
        <Radio size={14} className="cac-tunnel-active-icon" />
        Tunnel active: <code className="cac-tunnel-url">{tunnelUrl}</code>
        <button
          className="cac-btn cac-btn-ghost cac-btn-stop"
          onClick={onStop}
          aria-label="Stop tunnel"
        >
          <Square size={12} /> Stop Tunnel
        </button>
      </span>
    )
  }

  return (
    <>
      <button
        className="cac-btn cac-btn-primary cac-tunnel-launch-btn"
        onClick={onLaunch}
        aria-label="Launch Tunnel"
      >
        Launch Tunnel
      </button>
      {tunnelStartError && (
        <span className="cac-tunnel-error">
          {isTunnelNotFound
            ? <>cloudflared not found. <a
                href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                target="_blank"
                rel="noopener noreferrer"
                className="cac-inline-link"
              >Download cloudflared ↗</a></>
            : tunnelStartError
          }
        </span>
      )}
    </>
  )
}

/**
 * EnabledView — guided step-by-step connection flow.
 *
 * The user flow is intentionally simple:
 *   Step 1 — Pick how to expose Forge (Tailscale IP or Cloudflare Tunnel)
 *   Step 2 — Confirm / edit the URL that was pre-filled
 *   Step 3 — Scan the QR code and tap Connect
 *
 * Advanced options (PWA host override, raw token copy) are collapsed by default
 * so they don't clutter the main flow for first-time users.
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
  tunnelStatus,
  isTunnelLaunching,
  tunnelStartError,
  onLaunchTunnel,
  onStopTunnel,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const deepLink = buildDeepLink(companionHost, tunnelUrl, settings?.mobile_token || '')

  // Whether cloudflared appears to be missing on this machine.
  const isTunnelNotFound = tunnelStartError?.toLowerCase().includes('not found') ||
    tunnelStartError?.toLowerCase().includes('cloudflared')
  const isTunnelRunning = tunnelStatus?.running || Boolean(tunnelStatus?.url)

  return (
    <>
      {/* ── Step 1: Connection method ───────────────────────────────────── */}
      <div className="cac-section">
        <div className="cac-step-header">
          <span className="cac-step-number">1</span>
          <span className="cac-step-title">How is your phone reaching this PC?</span>
        </div>
        <div className="cac-method-cards">
          <ConnectionMethodCard
            icon={<Wifi size={16} />}
            title="Tailscale"
            description="Both devices on the same tailnet"
            hint={
              <>
                Open the Tailscale app on this PC and copy your machine IP —{' '}
                it looks like <code>100.x.x.x</code>.{' '}
                Then use <code>http://100.x.x.x:3005</code> below.
              </>
            }
          />
          <ConnectionMethodCard
            icon={<Globe size={16} />}
            title="No Tailscale"
            description="Free public tunnel via Cloudflare"
            hint={
              <CloudflareTunnelHint
                isTunnelRunning={isTunnelRunning}
                isTunnelLaunching={isTunnelLaunching}
                tunnelStartError={tunnelStartError}
                isTunnelNotFound={isTunnelNotFound}
                tunnelUrl={tunnelStatus?.url}
                onLaunch={onLaunchTunnel}
                onStop={onStopTunnel}
              />
            }
          />
        </div>
      </div>

      {/* ── Step 2: Paste the URL ───────────────────────────────────────── */}
      <div className="cac-section">
        <div className="cac-step-header">
          <span className="cac-step-number">2</span>
          <span className="cac-step-title">Paste your Forge URL here</span>
        </div>
        <input
          className="cac-input"
          type="text"
          value={tunnelUrl}
          onChange={evt => setTunnelUrl(evt.target.value)}
          placeholder="Forge URL — e.g. http://100.x.x.x:3005 or https://xyz.trycloudflare.com"
        />
      </div>

      {/* ── Step 3: QR code ────────────────────────────────────────────── */}
      <div className="cac-section">
        <div className="cac-step-header">
          <span className="cac-step-number">3</span>
          <span className="cac-step-title">Scan with your phone — then tap Connect</span>
        </div>
        <QRBlock deepLink={deepLink} />
      </div>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="cac-actions">
        <button
          className="cac-btn cac-btn-secondary"
          onClick={onCopyLink}
          title="Copy the deep-link URL to send to your phone another way"
        >
          {hasCopiedLink
            ? <><Check size={14} /> Copied</>
            : <><Copy size={14} /> Copy Link</>
          }
        </button>
        <button
          className="cac-btn cac-btn-danger"
          onClick={onDisable}
          disabled={isTogglePending}
        >
          {isTogglePending ? 'Disabling…' : 'Disable'}
        </button>
      </div>

      {/* ── Advanced (collapsed by default) ────────────────────────────── */}
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
          <div className="cac-section">
            <label className="cac-label">Companion PWA host</label>
            <input
              className="cac-input"
              type="text"
              value={companionHost}
              onChange={evt => {
                  setCompanionHost(evt.target.value)
                  localStorage.setItem(STORAGE_COMPANION_HOST, evt.target.value)
                }}
              placeholder="https://your-companion-host/"
            />
            <p className="cac-hint">
              Auto-set from your Forge URL above. Only change this if you host
              the companion PWA at a custom location outside of Forge.
            </p>
          </div>

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
 * ConnectionMethodCard — one of two option cards shown in Step 1 of the
 * enabled view. Purely informational — shows the user what each tunnel path
 * looks like so they know which URL to paste in Step 2.
 */
const ConnectionMethodCard = ({ icon, title, description, hint }) => (
  <div className="cac-method-card">
    <div className="cac-method-card-header">
      <span className="cac-method-icon">{icon}</span>
      <div>
        <strong className="cac-method-title">{title}</strong>
        <span className="cac-method-desc">{description}</span>
      </div>
    </div>
    <p className="cac-method-hint">{hint}</p>
  </div>
)

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
