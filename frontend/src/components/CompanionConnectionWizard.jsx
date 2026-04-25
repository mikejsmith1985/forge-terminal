// CompanionConnectionWizard.jsx — single-flow connection setup for the
// Forge Companion PWA.
//
// Step 1 ALWAYS asks the user to pick exactly ONE connection method:
//
//   • Named Cloudflare Tunnel  (persistent — recommended)
//   • Cloudflare Quick Tunnel  (per-session, zero setup)
//   • Tailscale                (per-session, uses your Tailscale identity)
//
// Subsequent steps are rendered ONLY for the chosen method, so the user
// never sees instructions for two competing methods at once.  The final
// step always shows a QR code that encodes the same companion deep-link
// regardless of which method is in play.
//
// The user's choice is persisted to ~/.forge/companion/preference.json
// via /api/companion/preference so the wizard reopens on the same step
// next time and the rest of the companion card can show "what they
// expect to see".
//
// The wizard does NOT replace the Connection Setup advanced card — that
// remains available under "Advanced settings" for users who want to see
// every available mode (including LAN) at once.

import React, { useEffect, useState, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import {
  Cloud,
  Wifi,
  Globe,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import NamedTunnelSetupCard from './NamedTunnelSetupCard'
import './CompanionConnectionWizard.css'

// ── Constants ────────────────────────────────────────────────────────────────

// METHODS is the canonical list of connection methods shown in step 1.
// Keep "named" first — it is the recommended option.
const METHODS = [
  {
    id:        'named',
    label:     'Named Cloudflare Tunnel',
    tagline:   'Persistent — recommended for daily use',
    Icon:      Cloud,
    detail:    'Get a stable URL that always points to this PC. Best for daily phone use.',
  },
  {
    id:        'quick',
    label:     'Cloudflare Quick Tunnel',
    tagline:   'Per-session — no setup needed',
    Icon:      Globe,
    detail:    'A throwaway URL that lasts as long as Forge is running. URL changes on every restart.',
  },
  {
    id:        'tailscale',
    label:     'Tailscale',
    tagline:   'Per-session — uses your Tailscale identity',
    Icon:      Wifi,
    detail:    'Reach this PC over your Tailscale tailnet. Requires Tailscale installed on both devices.',
  },
]

// COPY_RESET_DELAY_MS controls how long the "Copied" affordance stays visible.
const COPY_RESET_DELAY_MS = 1800

// ── Main Component ───────────────────────────────────────────────────────────

/**
 * CompanionConnectionWizard — guided, single-method connection flow.
 *
 * Props:
 *   mobileToken    — the bearer token the QR code embeds (string)
 *   companionHost  — host the companion PWA is served from (string)
 *   onMethodChange — optional callback fired when the user changes method
 */
export default function CompanionConnectionWizard({
  mobileToken,
  companionHost,
  onMethodChange,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  // selectedMethod is one of METHODS[*].id, or '' until the user (or
  // server-side preference) picks one.
  const [selectedMethod, setSelectedMethod] = useState('')

  // currentStepIndex starts at 0 (method picker).  Subsequent indices map
  // to the per-method instruction steps.  We cap at the QR step.
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  // tunnelUrl is the URL the phone will hit.  Sourced live from
  // /api/tunnel/options for the active method.
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [tunnelStage, setTunnelStage] = useState('absent')
  const [tunnelDetail, setTunnelDetail] = useState('')

  const [isPreferenceLoading, setIsPreferenceLoading] = useState(true)
  const [hasCopiedLink, setHasCopiedLink] = useState(false)

  // ── Initial load: read persisted preference + auto-detect default ────────
  useEffect(() => {
    let cancelled = false

    async function loadPreference() {
      try {
        const response = await fetch('/api/companion/preference')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (cancelled) return
        // Use the explicit pref when set; otherwise fall back to the
        // server's recommended default ("named") so a brand-new user
        // still lands on a sensible step-1 selection.
        const initialMethod = data.method || data.methodResolved || 'named'
        setSelectedMethod(initialMethod)
        // If the user already had a preference saved, skip step 1 and
        // jump straight to the per-method instructions.
        if (data.method) setCurrentStepIndex(1)
      } catch {
        // Fail closed: stay on step 1 with no preselection.
      } finally {
        if (!cancelled) setIsPreferenceLoading(false)
      }
    }

    loadPreference()
    return () => { cancelled = true }
  }, [])

  // ── Live tunnel status ─────────────────────────────────────────────────────
  // Poll /api/tunnel/options every 6s while the wizard is open so the
  // "Waiting for tunnel…" copy resolves to a real URL the moment the
  // backend has one.
  useEffect(() => {
    if (!selectedMethod) return
    let cancelled = false

    async function refreshTunnel() {
      try {
        const response = await fetch('/api/tunnel/options')
        if (!response.ok) return
        const data = await response.json()
        const option = (data.options || []).find(o => o.mode === selectedMethod)
        if (cancelled || !option) return
        setTunnelUrl(option.url || '')
        setTunnelStage(option.stage || 'absent')
        setTunnelDetail(option.detail || '')
      } catch {
        // Best-effort polling; ignore transient errors.
      }
    }

    refreshTunnel()
    const intervalId = setInterval(refreshTunnel, 6000)
    return () => { cancelled = true; clearInterval(intervalId) }
  }, [selectedMethod])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const persistMethod = useCallback(async (method) => {
    try {
      await fetch('/api/companion/preference', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ method }),
      })
      onMethodChange?.(method)
    } catch {
      // The wizard still works without persistence — the user just won't
      // land on the same method next time.
    }
  }, [onMethodChange])

  const handleSelectMethod = useCallback((method) => {
    setSelectedMethod(method)
    setCurrentStepIndex(1)
    persistMethod(method)
  }, [persistMethod])

  const handleChangeMethod = useCallback(() => {
    setCurrentStepIndex(0)
  }, [])

  const handleNextStep = useCallback(() => {
    setCurrentStepIndex(idx => idx + 1)
  }, [])

  const handlePrevStep = useCallback(() => {
    setCurrentStepIndex(idx => Math.max(0, idx - 1))
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isPreferenceLoading) {
    return (
      <div className="ccw-loading">
        <Loader2 size={16} className="ccw-spin" /> Loading connection settings…
      </div>
    )
  }

  // Step 1 — method picker (always shown when index === 0)
  if (currentStepIndex === 0) {
    return (
      <MethodPicker
        currentMethod={selectedMethod}
        onSelect={handleSelectMethod}
      />
    )
  }

  // Steps 2-N — render only the chosen method's flow.
  const stepProps = {
    currentStepIndex,
    onPrevStep:        handlePrevStep,
    onNextStep:        handleNextStep,
    onChangeMethod:    handleChangeMethod,
    mobileToken,
    companionHost,
    tunnelUrl,
    tunnelStage,
    tunnelDetail,
    hasCopiedLink,
    setHasCopiedLink,
  }

  switch (selectedMethod) {
    case 'named':     return <NamedFlow     {...stepProps} />
    case 'quick':     return <QuickFlow     {...stepProps} />
    case 'tailscale': return <TailscaleFlow {...stepProps} />
    default:
      return <MethodPicker currentMethod="" onSelect={handleSelectMethod} />
  }
}

// ── Step 1: Method Picker ─────────────────────────────────────────────────────

/**
 * MethodPicker — the only step that shows multiple connection options.
 *
 * After the user clicks one card, every subsequent step shows ONLY that
 * method's instructions.  This is what the requirement "never display
 * multiple connection types at the same time" enforces.
 */
const MethodPicker = ({ currentMethod, onSelect }) => (
  <div className="ccw-root">
    <header className="ccw-header">
      <span className="ccw-step-pill">Step 1 of many</span>
      <h3 className="ccw-title">How should your phone reach this PC?</h3>
      <p className="ccw-lead">
        Pick one. The next steps will only show what you need for that
        choice — nothing extra.
      </p>
    </header>

    <ul className="ccw-method-list">
      {METHODS.map(({ id, label, tagline, detail, Icon }) => {
        const isSelected = currentMethod === id
        return (
          <li key={id}>
            <button
              type="button"
              className={`ccw-method-card ${isSelected ? 'ccw-method-card-selected' : ''}`}
              onClick={() => onSelect(id)}
            >
              <Icon size={22} className="ccw-method-icon" />
              <div className="ccw-method-text">
                <div className="ccw-method-label-row">
                  <strong>{label}</strong>
                  {isSelected && <Check size={14} className="ccw-method-check" />}
                </div>
                <span className="ccw-method-tagline">{tagline}</span>
                <p className="ccw-method-detail">{detail}</p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  </div>
)

// ── Per-Method Flows ─────────────────────────────────────────────────────────

/**
 * NamedFlow — three steps after picking Named Cloudflare Tunnel:
 *   2. Run the embedded Named Tunnel wizard until it reports Healthy.
 *   3. Confirm the tunnel URL detected by the backend.
 *   4. Scan the QR code from the phone.
 */
const NamedFlow = ({
  currentStepIndex,
  onPrevStep,
  onNextStep,
  onChangeMethod,
  mobileToken,
  companionHost,
  tunnelUrl,
  tunnelStage,
  tunnelDetail,
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const totalSteps = 4

  if (currentStepIndex === 1) {
    return (
      <StepShell
        stepNumber={2}
        totalSteps={totalSteps}
        title="Set up your Named Cloudflare Tunnel"
        helpText="Click the buttons below in order. Forge will install cloudflared, walk you through Cloudflare login, and create a stable URL. This is a one-time step — you'll never have to do it again."
        onPrev={onChangeMethod}
        prevLabel="Change method"
        onNext={onNextStep}
        nextLabel="Tunnel is healthy"
        nextDisabled={tunnelStage !== 'healthy'}
      >
        <NamedTunnelSetupCard embedded={true} />
        {tunnelStage !== 'healthy' && (
          <p className="ccw-hint">
            <Loader2 size={12} className="ccw-spin" /> Waiting for the
            tunnel to report "healthy" before you continue…
          </p>
        )}
      </StepShell>
    )
  }

  if (currentStepIndex === 2) {
    return (
      <StepShell
        stepNumber={3}
        totalSteps={totalSteps}
        title="Confirm your URL"
        helpText="This is the address your phone will use. Forge filled it in for you from the tunnel above."
        onPrev={onPrevStep}
        onNext={onNextStep}
        nextLabel="Show QR code"
      >
        <UrlDisplay url={tunnelUrl} stage={tunnelStage} detail={tunnelDetail} />
      </StepShell>
    )
  }

  return (
    <StepShell
      stepNumber={4}
      totalSteps={totalSteps}
      title="Scan with your phone"
      helpText="Open your phone camera and point it at this code. Tap the link that pops up — that's it."
      onPrev={onPrevStep}
      onChangeMethod={onChangeMethod}
    >
      <QrPanel
        mobileToken={mobileToken}
        companionHost={companionHost}
        tunnelUrl={tunnelUrl}
        hasCopiedLink={hasCopiedLink}
        setHasCopiedLink={setHasCopiedLink}
      />
    </StepShell>
  )
}

/**
 * QuickFlow — three steps after picking Cloudflare Quick Tunnel.
 *   2. Wait for cloudflared to mint a URL.
 *   3. Confirm URL.
 *   4. QR scan.
 */
const QuickFlow = ({
  currentStepIndex,
  onPrevStep,
  onNextStep,
  onChangeMethod,
  mobileToken,
  companionHost,
  tunnelUrl,
  tunnelStage,
  tunnelDetail,
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const totalSteps = 4

  if (currentStepIndex === 1) {
    return (
      <StepShell
        stepNumber={2}
        totalSteps={totalSteps}
        title="Wait for your throwaway URL"
        helpText="Forge will start a Cloudflare Quick Tunnel and grab a URL for you. This usually takes 5-10 seconds. You don't have to do anything — just wait for the green check below."
        onPrev={onChangeMethod}
        prevLabel="Change method"
        onNext={onNextStep}
        nextLabel="URL is ready"
        nextDisabled={tunnelStage !== 'healthy'}
      >
        <QuickTunnelStatus stage={tunnelStage} detail={tunnelDetail} url={tunnelUrl} />
      </StepShell>
    )
  }

  if (currentStepIndex === 2) {
    return (
      <StepShell
        stepNumber={3}
        totalSteps={totalSteps}
        title="Confirm your URL"
        helpText="Quick tunnel URLs change every time Forge restarts — that's normal. Use this URL for now."
        onPrev={onPrevStep}
        onNext={onNextStep}
        nextLabel="Show QR code"
      >
        <UrlDisplay url={tunnelUrl} stage={tunnelStage} detail={tunnelDetail} />
      </StepShell>
    )
  }

  return (
    <StepShell
      stepNumber={4}
      totalSteps={totalSteps}
      title="Scan with your phone"
      helpText="Open your phone camera and point it at this code. Tap the link that pops up to connect."
      onPrev={onPrevStep}
      onChangeMethod={onChangeMethod}
    >
      <QrPanel
        mobileToken={mobileToken}
        companionHost={companionHost}
        tunnelUrl={tunnelUrl}
        hasCopiedLink={hasCopiedLink}
        setHasCopiedLink={setHasCopiedLink}
      />
    </StepShell>
  )
}

/**
 * TailscaleFlow — three steps after picking Tailscale.
 *   2. Verify Tailscale is installed and signed in.
 *   3. Confirm the MagicDNS URL.
 *   4. QR scan.
 */
const TailscaleFlow = ({
  currentStepIndex,
  onPrevStep,
  onNextStep,
  onChangeMethod,
  mobileToken,
  companionHost,
  tunnelUrl,
  tunnelStage,
  tunnelDetail,
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const totalSteps = 4

  if (currentStepIndex === 1) {
    const isReady = tunnelStage === 'configured' || tunnelStage === 'healthy'
    return (
      <StepShell
        stepNumber={2}
        totalSteps={totalSteps}
        title="Make sure Tailscale is signed in"
        helpText="Tailscale is a free, private network you install once. Open the Tailscale app on this PC and sign in with your account. When you see your tailnet name appear below, you're ready."
        onPrev={onChangeMethod}
        prevLabel="Change method"
        onNext={onNextStep}
        nextLabel="I'm signed in"
        nextDisabled={!isReady}
      >
        <TailscaleStatus stage={tunnelStage} detail={tunnelDetail} url={tunnelUrl} />
      </StepShell>
    )
  }

  if (currentStepIndex === 2) {
    return (
      <StepShell
        stepNumber={3}
        totalSteps={totalSteps}
        title="Confirm your URL"
        helpText="This is your PC's name on your private Tailscale network. Your phone reaches it directly — no public internet involved."
        onPrev={onPrevStep}
        onNext={onNextStep}
        nextLabel="Show QR code"
      >
        <UrlDisplay url={tunnelUrl} stage={tunnelStage} detail={tunnelDetail} />
      </StepShell>
    )
  }

  return (
    <StepShell
      stepNumber={4}
      totalSteps={totalSteps}
      title="Scan with your phone"
      helpText="Make sure your phone is also signed into Tailscale, then scan this code with your camera."
      onPrev={onPrevStep}
      onChangeMethod={onChangeMethod}
    >
      <QrPanel
        mobileToken={mobileToken}
        companionHost={companionHost}
        tunnelUrl={tunnelUrl}
        hasCopiedLink={hasCopiedLink}
        setHasCopiedLink={setHasCopiedLink}
      />
    </StepShell>
  )
}

// ── Shared step chrome ───────────────────────────────────────────────────────

/**
 * StepShell — common header / footer for every per-method step.
 *
 * Always renders Prev (or "Change method") and Next buttons so the user
 * can move forward or step back without hunting for controls.
 */
const StepShell = ({
  stepNumber,
  totalSteps,
  title,
  helpText,
  children,
  onPrev,
  prevLabel = 'Back',
  onNext,
  nextLabel,
  nextDisabled,
  onChangeMethod,
}) => (
  <div className="ccw-root">
    <header className="ccw-header">
      <span className="ccw-step-pill">Step {stepNumber} of {totalSteps}</span>
      <h3 className="ccw-title">{title}</h3>
      <p className="ccw-lead">{helpText}</p>
    </header>
    <div className="ccw-step-body">{children}</div>
    <footer className="ccw-footer">
      {onPrev && (
        <button type="button" className="ccw-btn ccw-btn-ghost" onClick={onPrev}>
          <ChevronLeft size={14} /> {prevLabel}
        </button>
      )}
      <div className="ccw-footer-spacer" />
      {onChangeMethod && (
        <button type="button" className="ccw-btn ccw-btn-ghost" onClick={onChangeMethod}>
          <RefreshCw size={12} /> Change method
        </button>
      )}
      {onNext && (
        <button
          type="button"
          className="ccw-btn ccw-btn-primary"
          onClick={onNext}
          disabled={nextDisabled}
        >
          {nextLabel || 'Next'} <ChevronRight size={14} />
        </button>
      )}
    </footer>
  </div>
)

// ── Reusable widgets ─────────────────────────────────────────────────────────

const UrlDisplay = ({ url, stage, detail }) => {
  if (!url) {
    return (
      <div className="ccw-url-card ccw-url-card-pending">
        <Loader2 size={14} className="ccw-spin" /> Waiting for a URL…
      </div>
    )
  }
  return (
    <div className="ccw-url-card">
      <div className="ccw-url-row">
        <a href={url} target="_blank" rel="noreferrer" className="ccw-url-link">
          {url} <ExternalLink size={12} />
        </a>
        <span className={`ccw-stage ccw-stage-${stage}`}>{stage}</span>
      </div>
      {detail && <p className="ccw-url-detail">{detail}</p>}
    </div>
  )
}

const QuickTunnelStatus = ({ stage, detail, url }) => {
  if (stage === 'absent') {
    return (
      <div className="ccw-status ccw-status-warn">
        <AlertTriangle size={14} />
        <div>
          <strong>cloudflared not installed.</strong>
          <p>Use the Connection Setup card under Advanced settings to install it.</p>
        </div>
      </div>
    )
  }
  if (stage === 'healthy' && url) {
    return (
      <div className="ccw-status ccw-status-ok">
        <Check size={14} />
        <div><strong>Quick tunnel is up.</strong> Your URL is ready below.</div>
      </div>
    )
  }
  return (
    <div className="ccw-status ccw-status-pending">
      <Loader2 size={14} className="ccw-spin" />
      <div>
        <strong>Starting your Quick Tunnel…</strong>
        <p>{detail || 'This usually takes 5-10 seconds.'}</p>
      </div>
    </div>
  )
}

const TailscaleStatus = ({ stage, detail, url }) => {
  if (stage === 'absent') {
    return (
      <div className="ccw-status ccw-status-warn">
        <AlertTriangle size={14} />
        <div>
          <strong>Tailscale isn't running.</strong>
          <p>{detail || 'Open the Tailscale app on this PC and sign in.'}</p>
          <a
            className="ccw-link"
            href="https://tailscale.com/download"
            target="_blank"
            rel="noreferrer"
          >
            Download Tailscale <ExternalLink size={12} />
          </a>
        </div>
      </div>
    )
  }
  return (
    <div className="ccw-status ccw-status-ok">
      <Check size={14} />
      <div>
        <strong>Tailscale is signed in.</strong>
        {url && <p className="ccw-muted">{url}</p>}
      </div>
    </div>
  )
}

const QrPanel = ({
  mobileToken,
  companionHost,
  tunnelUrl,
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const canvasRef = useRef(null)
  const [renderError, setRenderError] = useState(null)
  const deepLink = buildCompanionDeepLink(companionHost, tunnelUrl, mobileToken)

  useEffect(() => {
    if (!canvasRef.current || !deepLink) return
    setRenderError(null)
    QRCode.toCanvas(canvasRef.current, deepLink, {
      width:                240,
      margin:               1,
      color:                { dark: '#e6edf3', light: '#0d1117' },
      errorCorrectionLevel: 'M',
    }).catch(err => setRenderError(err?.message || String(err)))
  }, [deepLink])

  const copyLink = useCallback(async () => {
    if (!deepLink) return
    await navigator.clipboard.writeText(deepLink)
    setHasCopiedLink(true)
    setTimeout(() => setHasCopiedLink(false), COPY_RESET_DELAY_MS)
  }, [deepLink, setHasCopiedLink])

  if (!deepLink) {
    return (
      <div className="ccw-qr-pending">
        <Loader2 size={14} className="ccw-spin" />
        Waiting for a URL before we can build the QR code…
      </div>
    )
  }

  return (
    <div className="ccw-qr-panel">
      {renderError ? (
        <div className="ccw-qr-error">QR unavailable: {renderError}</div>
      ) : (
        <canvas ref={canvasRef} className="ccw-qr-canvas" />
      )}
      <button type="button" className="ccw-btn ccw-btn-ghost" onClick={copyLink}>
        {hasCopiedLink
          ? <><Check size={14} /> Copied</>
          : <><Copy size={14} /> Copy link instead</>
        }
      </button>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * buildCompanionDeepLink — assemble the deep-link the QR code encodes.
 *
 * Format: `<companionHost>?host=<encodedTunnelUrl>&token=<mobileToken>`.
 * Returns an empty string when any input is missing so callers can render
 * a "waiting" state instead of a broken QR.
 */
function buildCompanionDeepLink(companionHost, tunnelUrl, mobileToken) {
  if (!companionHost || !tunnelUrl || !mobileToken) return ''
  const base = companionHost.endsWith('/') ? companionHost : `${companionHost}/`
  const encodedHost  = encodeURIComponent(tunnelUrl)
  const encodedToken = encodeURIComponent(mobileToken)
  return `${base}?host=${encodedHost}&token=${encodedToken}`
}
