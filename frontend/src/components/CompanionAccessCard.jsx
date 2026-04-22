// CompanionAccessCard.jsx — Desktop sidebar card for the Forge Companion PWA.
//
// Gates the mobile companion feature behind the `mobile_access` license flag
// and, when entitled, surfaces everything a user needs to connect their phone:
// a QR-code deep link (forgeUrl + mobileToken), copy-to-clipboard helpers,
// step-by-step instructions, and a disable/revoke button.
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
  RefreshCw,
  Info,
} from 'lucide-react'
import './CompanionAccessCard.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const COPY_RESET_DELAY_MS = 2000
const UPGRADE_URL = 'https://rootlevellabs.tech/upgrade'
const COMPANION_DOCS_URL = 'https://github.com/mikejsmith1985/forge-terminal/tree/main/forge-companion'

// Default host for the companion PWA — deployed to Cloudflare Pages.
// Users can override this field if they self-host the companion.
const DEFAULT_COMPANION_HOST = 'https://forge-companion-1b3.pages.dev/'

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

  const [tunnelUrl, setTunnelUrl]           = useState(
    () => localStorage.getItem(STORAGE_TUNNEL_URL) || window.location.origin
  )
  const [companionHost, setCompanionHost]   = useState(
    () => localStorage.getItem(STORAGE_COMPANION_HOST) || DEFAULT_COMPANION_HOST
  )

  // Persist input fields so the user does not retype them every session.
  useEffect(() => { localStorage.setItem(STORAGE_TUNNEL_URL, tunnelUrl) }, [tunnelUrl])
  useEffect(() => { localStorage.setItem(STORAGE_COMPANION_HOST, companionHost) }, [companionHost])

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
                  setTunnelUrl={setTunnelUrl}
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

    <InstructionsBlock compact />
  </>
)

/**
 * EnabledView — QR code + token + instructions + disable button.
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
  const deepLink = buildDeepLink(companionHost, tunnelUrl, settings?.mobile_token || '')

  return (
    <>
      <div className="cac-section">
        <label className="cac-label">Your public Forge URL</label>
        <input
          className="cac-input"
          type="text"
          value={tunnelUrl}
          onChange={evt => setTunnelUrl(evt.target.value)}
          placeholder="https://xyz.trycloudflare.com"
        />
        <p className="cac-hint">
          <Info size={12} />{' '}
          <strong>Tailscale users:</strong> use your PC's Tailscale IP —{' '}
          <code>http://100.x.x.x:3005</code>. Your phone must be on the same tailnet.{' '}
          No Tailscale? Run <code>cloudflared tunnel --url http://localhost:3005</code> for a free public link.
        </p>
      </div>

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
          <Info size={12} /> The URL where the Forge Companion PWA is served.
          You can self-host from the <code>forge-companion/</code> directory or
          use the default hosted build.
        </p>
      </div>

      <QRBlock deepLink={deepLink} />

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

      <div className="cac-actions">
        <button
          className="cac-btn cac-btn-secondary"
          onClick={onCopyLink}
          title="Copy deep-link URL"
        >
          {hasCopiedLink
            ? <><Check size={14} /> Copied</>
            : <><Copy size={14} /> Copy Deep Link</>
          }
        </button>
        <button
          className="cac-btn cac-btn-danger"
          onClick={onDisable}
          disabled={isTogglePending}
        >
          {isTogglePending ? 'Disabling…' : 'Disable Mobile Access'}
        </button>
      </div>

      <InstructionsBlock />
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
 * InstructionsBlock — simple numbered walkthrough for the user.
 *
 * compact=true  → shown on the disabled screen (steps to get started)
 * compact=false → shown on the enabled screen (steps to connect a phone)
 *
 * Tailscale is presented as the easiest path (zero extra software if already
 * installed). Cloudflare Tunnel is offered as the no-Tailscale alternative.
 */
const InstructionsBlock = ({ compact }) => (
  <div className="cac-section cac-instructions">
    <h4>
      <Info size={14} /> How to connect your phone
    </h4>
    <ol>
      {compact ? (
        <>
          <li>
            <strong>Get a link your phone can use to reach this PC.</strong>
            <ul style={{ marginTop: '6px', paddingLeft: '16px' }}>
              <li>
                <strong>Have Tailscale?</strong> Open the Tailscale app on your
                PC and copy your machine's IP or hostname — it looks like{' '}
                <code>http://100.x.x.x:3005</code>.
              </li>
              <li>
                <strong>No Tailscale?</strong> Run{' '}
                <code>cloudflared tunnel --url http://localhost:3005</code> — it
                gives you a free link like{' '}
                <code>https://abc123.trycloudflare.com</code>.{' '}
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer">
                  Download cloudflared ↗
                </a>
              </li>
            </ul>
          </li>
          <li>
            <strong>Enable mobile access</strong> by clicking <strong>Enable Mobile Access</strong> on this card.
          </li>
          <li>
            <strong>Paste your link</strong> into the "Your public Forge URL" box.
          </li>
          <li>
            <strong>Scan the QR code</strong> with your phone camera.
          </li>
          <li>
            <strong>Tap Connect</strong> — you're in! 🎉
          </li>
        </>
      ) : (
        <>
          <li>
            <strong>Your phone needs a link to reach this PC.</strong>
            <ul style={{ marginTop: '6px', paddingLeft: '16px' }}>
              <li>
                <strong>Tailscale (easiest if you have it):</strong> Both devices
                must be on your tailnet. Find your PC's Tailscale IP in the
                Tailscale app (looks like <code>100.x.x.x</code>) and use{' '}
                <code>http://100.x.x.x:3005</code> as the URL.
              </li>
              <li>
                <strong>Cloudflare Tunnel (no Tailscale needed):</strong> Run{' '}
                <code>cloudflared tunnel --url http://localhost:3005</code> and
                copy the link it prints.{' '}
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer">
                  Download cloudflared ↗
                </a>
              </li>
            </ul>
          </li>
          <li>
            <strong>Paste that link</strong> into the "Your public Forge URL" box above.
          </li>
          <li>
            <strong>Scan the QR code</strong> below with your phone camera.
            It opens Forge Companion automatically.
          </li>
          <li>
            <strong>Tap Connect</strong> — your sessions appear instantly. 🎉
          </li>
        </>
      )}
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

/**
 * buildDeepLink — assembles the <host>#forge=<url>&token=<tok> URL that the
 * companion PWA reads on load (see forge-companion/index.html:readAndClearDeepLink).
 *
 * If any part is missing, returns the host unchanged so the QR still renders
 * something scannable rather than an empty canvas.
 */
function buildDeepLink(companionHost, forgeUrl, mobileToken) {
  const trimmedHost = (companionHost || '').replace(/#.*$/, '')
  if (!forgeUrl || !mobileToken) return trimmedHost

  const fragment = new URLSearchParams({
    forge: forgeUrl,
    token: mobileToken,
  }).toString()

  return `${trimmedHost}#${fragment}`
}

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
