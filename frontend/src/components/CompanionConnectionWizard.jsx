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
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import NamedTunnelSetupCard from './NamedTunnelSetupCard'
import { buildDeepLink as buildCompanionDeepLink, getDefaultCompanionHost } from '../utils/companionUrl'
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
  localUrl = '',
  onMethodChange,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  // selectedMethod is one of METHODS[*].id, or '' until the user (or
  // server-side preference) picks one.
  const [selectedMethod, setSelectedMethod] = useState('')

  // currentStepIndex starts at 0 (method picker).  Subsequent indices map
  // to the per-method instruction steps.  We cap at the QR step.
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  // tunnelUrl is the URL the phone will hit (the forge server URL embedded
  // in the QR fragment as forge=…).  Sourced live from /api/tunnel/options
  // for the active method.
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [tunnelStage, setTunnelStage] = useState('absent')
  const [tunnelDetail, setTunnelDetail] = useState('')

  const [isPreferenceLoading, setIsPreferenceLoading] = useState(true)
  const [hasCopiedLink, setHasCopiedLink] = useState(false)

  // State for Quick Tunnel install/start actions.  Separate from the
  // tunnelStage state because these are user-triggered operations that
  // have their own loading and error lifecycle.
  const [isInstallingCloudflared, setIsInstallingCloudflared] = useState(false)
  const [isStartingQuickTunnel, setIsStartingQuickTunnel] = useState(false)
  const [quickTunnelActionError, setQuickTunnelActionError] = useState('')

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
  // refreshTunnel is a useCallback so install/start handlers can call it
  // directly for an immediate state update without waiting for the 6-second
  // polling interval.
  const refreshTunnel = useCallback(async () => {
    if (!selectedMethod) return
    try {
      const response = await fetch('/api/tunnel/options')
      if (!response.ok) return
      const data = await response.json()
      const option = (data.options || []).find(o => o.mode === selectedMethod)
      if (!option) return
      setTunnelUrl(option.url || '')
      setTunnelStage(option.stage || 'absent')
      setTunnelDetail(option.lastError || '')
    } catch {
      // Best-effort polling; ignore transient errors.
    }
  }, [selectedMethod])

  // Poll every 6 seconds while the wizard is open so "Waiting for tunnel…"
  // resolves to a real URL the moment the backend has one.
  useEffect(() => {
    if (!selectedMethod) return
    refreshTunnel()
    const intervalId = setInterval(refreshTunnel, 6000)
    return () => clearInterval(intervalId)
  }, [selectedMethod, refreshTunnel])

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
    // Reset Quick Tunnel action state so a new method choice starts clean.
    setQuickTunnelActionError('')
  }, [])

  const handleNextStep = useCallback(() => {
    setCurrentStepIndex(idx => idx + 1)
  }, [])

  const handlePrevStep = useCallback(() => {
    setCurrentStepIndex(idx => Math.max(0, idx - 1))
  }, [])

  // handleInstallCloudflared — downloads cloudflared via the backend installer.
  // On success, triggers an immediate tunnel status refresh so the UI
  // transitions from "absent" to "configured" without waiting 6 seconds.
  const handleInstallCloudflared = useCallback(async () => {
    setIsInstallingCloudflared(true)
    setQuickTunnelActionError('')
    try {
      const response = await fetch('/api/tunnel/setup/install', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setQuickTunnelActionError(data.error || `Install failed (HTTP ${response.status})`)
        return
      }
      // Refresh immediately so the UI shows "configured" before the next
      // 6-second poll fires.
      await refreshTunnel()
    } catch {
      setQuickTunnelActionError('Network error — check your connection and try again.')
    } finally {
      setIsInstallingCloudflared(false)
    }
  }, [refreshTunnel])

  // handleStartQuickTunnel — tells the backend to launch an ephemeral
  // Cloudflare tunnel.  POST /api/tunnel/start defaults to quick/ephemeral
  // mode when no named or tailscale tunnel is configured.
  //
  // After a successful start, we poll aggressively for 3 seconds so the UI
  // transitions from "configured" → "starting" before the button re-enables.
  const handleStartQuickTunnel = useCallback(async () => {
    setIsStartingQuickTunnel(true)
    setQuickTunnelActionError('')
    try {
      const response = await fetch('/api/tunnel/start', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setQuickTunnelActionError(data.error || `Start failed (HTTP ${response.status})`)
        return
      }
      // Three rapid polls give the supervisor time to write "starting" into
      // the ranker so the UI shows the tunnel-starting state before we
      // release the button spinner.
      await refreshTunnel()
      await new Promise(resolve => setTimeout(resolve, 1200))
      await refreshTunnel()
      await new Promise(resolve => setTimeout(resolve, 1200))
      await refreshTunnel()
    } catch {
      setQuickTunnelActionError('Network error — check your connection and try again.')
    } finally {
      setIsStartingQuickTunnel(false)
    }
  }, [refreshTunnel])

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
  //
  // The QR code must encode the URL for the method the user actually chose.
  // For Named Cloudflare Tunnel, derive the companion base from the tunnel
  // URL so both the PWA load path and the forge= fragment use the cloudflare
  // address — never a Tailscale address the user didn't select.
  const resolvedCompanionHost = (selectedMethod === 'named' && tunnelUrl)
    ? getDefaultCompanionHost(tunnelUrl)
    : companionHost

  const stepProps = {
    currentStepIndex,
    onPrevStep:              handlePrevStep,
    onNextStep:              handleNextStep,
    onChangeMethod:          handleChangeMethod,
    mobileToken,
    companionHost:           resolvedCompanionHost,
    tunnelUrl,
    localUrl,
    tunnelStage,
    tunnelDetail,
    hasCopiedLink,
    setHasCopiedLink,
    // Quick Tunnel action props — forwarded to QuickFlow only.
    onInstallCloudflared:    handleInstallCloudflared,
    onStartQuickTunnel:      handleStartQuickTunnel,
    isInstallingCloudflared,
    isStartingQuickTunnel,
    quickTunnelActionError,
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
  localUrl = '',
  tunnelStage,
  tunnelDetail,
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const totalSteps = 4

  if (currentStepIndex === 1) {
    const isStopped = tunnelStage === 'stopped'

    const handleRestartSupervisor = async () => {
      try {
        await fetch('/api/tunnel/setup/restart', { method: 'POST' })
      } catch { /* ignore — next poll will reflect new state */ }
    }

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
            {isStopped
              ? <AlertCircle size={12} style={{ flexShrink: 0, color: 'var(--error, #f87171)' }} />
              : <Loader2 size={12} className="ccw-spin" />
            }
            {' '}
            {isStopped ? (
              <>
                Tunnel supervisor stopped.{' '}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}
                  onClick={handleRestartSupervisor}
                >
                  Restart supervisor
                </button>
                {' '}or use <strong>Reconfigure</strong> above if setup needs to be redone.
              </>
            ) : (
              <>Waiting for the tunnel to report &ldquo;healthy&rdquo; before you continue&hellip;</>
            )}
            {tunnelDetail && (
              <code style={{
                display: 'block', marginTop: 6,
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.35)',
                borderRadius: 4,
                fontSize: '0.78em',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 96,
                overflowY: 'auto',
                opacity: 0.85,
              }}>
                {tunnelDetail}
              </code>
            )}
          </p>
        )}
        {/*
          Show the QR code as soon as a tunnel URL is known — even before
          the supervisor reports "healthy".  Phones can still scan and
          have the PWA ready to connect the moment the tunnel comes up,
          and the user explicitly asked for a QR on every step that has a
          URL ("Step 2 should ALWAYS generate a QR code").
        */}
        {tunnelUrl && (
          <div className="ccw-inline-qr">
            <h4 className="ccw-inline-qr-title">Scan with your phone now</h4>
            <p className="ccw-inline-qr-help">
              Open your phone camera and point it at this code. The
              companion app will be ready the moment the tunnel goes live.
            </p>
            <QrPanel
              mobileToken={mobileToken}
              companionHost={companionHost}
              tunnelUrl={tunnelUrl}
              localUrl={localUrl}
              hasCopiedLink={hasCopiedLink}
              setHasCopiedLink={setHasCopiedLink}
            />
          </div>
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
        localUrl={localUrl}
        hasCopiedLink={hasCopiedLink}
        setHasCopiedLink={setHasCopiedLink}
      />
    </StepShell>
  )
}

/**
 * QuickFlow — steps after picking Cloudflare Quick Tunnel:
 *   2. Install cloudflared (if needed) then start the tunnel.
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
  localUrl = '',
  tunnelStage,
  tunnelDetail,
  hasCopiedLink,
  setHasCopiedLink,
  onInstallCloudflared,
  onStartQuickTunnel,
  isInstallingCloudflared,
  isStartingQuickTunnel,
  quickTunnelActionError,
}) => {
  const totalSteps = 4

  if (currentStepIndex === 1) {
    return (
      <StepShell
        stepNumber={2}
        totalSteps={totalSteps}
        title="Start your throwaway URL"
        helpText={`A Cloudflare Quick Tunnel gives you a free throwaway URL that lasts as long as Forge is running. The URL changes on every restart. Click "Start Quick Tunnel" below — it takes about 10 seconds.`}
        onPrev={onChangeMethod}
        prevLabel="Change method"
        onNext={onNextStep}
        nextLabel="URL is ready"
        nextDisabled={tunnelStage !== 'healthy'}
      >
        <QuickTunnelStatus
          stage={tunnelStage}
          detail={tunnelDetail}
          url={tunnelUrl}
          isInstalling={isInstallingCloudflared}
          isStarting={isStartingQuickTunnel}
          actionError={quickTunnelActionError}
          onInstall={onInstallCloudflared}
          onStart={onStartQuickTunnel}
        />
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
        localUrl={localUrl}
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
  localUrl = '',
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
        localUrl={localUrl}
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

/**
 * QuickTunnelStatus — shows the correct state for the Quick Tunnel flow.
 *
 * States and what the user sees:
 *   absent     — cloudflared not installed → "Install cloudflared" button
 *   configured — binary present, tunnel not running → "Start Quick Tunnel" button
 *   stopped    — same as configured (process exited cleanly)
 *   starting   — supervisor spawned, probe not yet succeeded → spinner
 *   healthy    — tunnel up and URL available → success
 *   degraded   — probes failing → error + "Try again" button
 */
const QuickTunnelStatus = ({ stage, detail, url, isInstalling, isStarting, actionError, onInstall, onStart }) => {
  const errorBanner = actionError && (
    <div className="ccw-error" role="alert">
      <AlertTriangle size={12} /> {actionError}
    </div>
  )

  if (stage === 'absent') {
    return (
      <div className="ccw-status-group">
        {errorBanner}
        <div className="ccw-status ccw-status-warn">
          <AlertTriangle size={14} />
          <div>
            <strong>cloudflared is not installed.</strong>
            <p>
              Forge needs a small helper program called "cloudflared" to create your tunnel URL.
              Click Install below — it downloads automatically and takes about 30 seconds.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="ccw-btn ccw-btn-primary ccw-status-action"
          onClick={onInstall}
          disabled={isInstalling}
        >
          {isInstalling
            ? <><Loader2 size={12} className="ccw-spin" /> Installing cloudflared…</>
            : <>Install cloudflared</>
          }
        </button>
      </div>
    )
  }

  if (stage === 'healthy' && url) {
    return (
      <div className="ccw-status ccw-status-ok">
        <Check size={14} />
        <div><strong>Quick Tunnel is up!</strong> Your URL is ready — click "URL is ready" below.</div>
      </div>
    )
  }

  if (stage === 'starting') {
    return (
      <div className="ccw-status ccw-status-pending">
        <Loader2 size={14} className="ccw-spin" />
        <div>
          <strong>Starting your Quick Tunnel…</strong>
          <p>{detail || 'Cloudflare is assigning a temporary URL. This takes 5-15 seconds.'}</p>
        </div>
      </div>
    )
  }

  if (stage === 'degraded') {
    return (
      <div className="ccw-status-group">
        {errorBanner}
        <div className="ccw-status ccw-status-warn">
          <AlertTriangle size={14} />
          <div>
            <strong>The tunnel ran into a problem.</strong>
            <p>{detail || 'Something went wrong. Try starting the tunnel again.'}</p>
          </div>
        </div>
        <button
          type="button"
          className="ccw-btn ccw-btn-primary ccw-status-action"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting
            ? <><Loader2 size={12} className="ccw-spin" /> Starting…</>
            : <><RefreshCw size={12} /> Try again</>
          }
        </button>
      </div>
    )
  }

  // Stage is 'configured' or 'stopped' — cloudflared is installed but the
  // tunnel is not running.  The user must click a button to start it.
  return (
    <div className="ccw-status-group">
      {errorBanner}
      <div className="ccw-status ccw-status-pending">
        <Loader2 size={14} className="ccw-spin" />
        <div>
          <strong>cloudflared is installed and ready.</strong>
          <p>Click the button below to get your URL. It takes about 10 seconds.</p>
        </div>
      </div>
      <button
        type="button"
        className="ccw-btn ccw-btn-primary ccw-status-action"
        onClick={onStart}
        disabled={isStarting}
      >
        {isStarting
          ? <><Loader2 size={12} className="ccw-spin" /> Starting…</>
          : <>Start Quick Tunnel</>
        }
      </button>
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
  localUrl = '',
  hasCopiedLink,
  setHasCopiedLink,
}) => {
  const canvasRef = useRef(null)
  const [renderError, setRenderError] = useState(null)
  const deepLink = buildCompanionDeepLink(companionHost, tunnelUrl, mobileToken, localUrl)

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
 * buildCompanionDeepLink — re-exported from ../utils/companionUrl so the
 * wizard and the legacy CompanionAccessCard QR both produce the IDENTICAL
 * deep-link format the Companion PWA actually parses (`#forge=…&token=…`
 * fragment — never a query string).
 */
