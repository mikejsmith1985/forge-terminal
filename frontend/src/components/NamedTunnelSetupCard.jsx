// NamedTunnelSetupCard.jsx — v7.6.31 UI for the Named Cloudflare Tunnel
// setup wizard.  Renders a step-by-step flow that drives the backend
// endpoints under /api/tunnel/setup/*:
//
//   1. Install     — POST /install  (downloads cloudflared into ~/.forge/bin)
//   2. Log in      — POST /login    (spawns `cloudflared login`, returns auth URL)
//                    GET  /login/status (polled until success|error|timeout)
//   3. Pick zone   — GET  /zones    (zones accessible to the cert)
//      + subdomain
//   4. Create      — POST /create   { hostname, localPort }
//   5. Ready       — status.config.hostname displayed with Reconfigure option
//
// The card re-fetches /status on mount and after every state-changing
// action, so the step shown always reflects the server's source of
// truth.  Polling is only active while a login is in progress — there
// is intentionally no always-on timer to avoid contributing to the
// broader re-render flicker issue fixed elsewhere in v7.6.31.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Cloud,
  ChevronDown,
  ChevronUp,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Smartphone,
} from 'lucide-react'
import './NamedTunnelSetupCard.css'

const LOGIN_POLL_MS = 2000

const NamedTunnelSetupCard = () => {
  // Start expanded so the setup wizard is immediately actionable.
  // Users who have already completed setup see a compact "Connected"
  // view and can collapse the card; see auto-collapse effect below.
  const [isExpanded, setIsExpanded]     = useState(true)
  const [status, setStatus]             = useState(null) // WizardState or null
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [actionPending, setActionPending] = useState('') // 'install' | 'login' | 'create' | ''
  const [login, setLogin]               = useState(null) // LoginSnapshot
  const [zones, setZones]               = useState([])
  const [zonesLoaded, setZonesLoaded]   = useState(false)
  const [zonesError, setZonesError]     = useState('')
  const [manualZoneMode, setManualZoneMode] = useState(false)
  const [manualZone, setManualZone]     = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [subdomain, setSubdomain]       = useState('forge')
  const [copied, setCopied]             = useState(false)

  // ── Fetch helpers ────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tunnel/setup/status')
      if (!res.ok) {
        setError(`HTTP ${res.status}`)
        return
      }
      const body = await res.json()
      setStatus(body)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Health auto-refresh: while the wizard is on the Ready view and
  // the supervisor stage is not yet "healthy", poll /status every 5 s
  // so the badge transitions Starting → Live without the user having
  // to click anything.  Stops once Healthy is reached or the card is
  // collapsed, so a steady-state Live tunnel costs zero polls.
  useEffect(() => {
    const stage = status?.health?.stage || ''
    const isReady = status?.state === 'ready'
    const needsPolling = isReady && isExpanded && stage !== 'healthy'
    if (!needsPolling) return undefined

    const HEALTH_POLL_MS = 5000
    const id = setInterval(() => {
      // Background refresh — don't toggle the loading spinner so the
      // pill updates silently.
      fetch('/api/tunnel/setup/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => { if (body) setStatus(body) })
        .catch(() => { /* transient errors retry next tick */ })
    }, HEALTH_POLL_MS)
    return () => clearInterval(id)
  }, [status?.health?.stage, status?.state, isExpanded])

  // ── Login polling (only while the session is running) ────────────

  useEffect(() => {
    if (!login || login.status !== 'running') return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch('/api/tunnel/setup/login/status')
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        setLogin(body)
        if (body.status === 'success') {
          // Cert landed — refresh wizard state + preload zones.
          await refreshStatus()
        }
      } catch {
        /* transient network errors are tolerated — the next tick retries */
      }
    }
    const id = setInterval(tick, LOGIN_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [login, refreshStatus])

  // ── Zone loading (lazy, only when needed) ────────────────────────

  const loadZones = useCallback(async () => {
    setZonesError('')
    try {
      const res = await fetch('/api/tunnel/setup/zones')
      const body = await res.json().catch(() => ({}))
      const zs = Array.isArray(body?.zones) ? body.zones : []
      setZones(zs)
      setZonesLoaded(true)
      if (!res.ok || body?.error) {
        // Backend returns 400 + { zones: [], error } when the cert is present
        // but the API token can't enumerate zones. Surface it so the user can
        // enter a hostname manually instead of staring at "Loading…" forever.
        setZonesError(body?.error || `HTTP ${res.status}`)
        setManualZoneMode(true)
      } else if (zs.length === 0) {
        // Cert valid, no zones reachable — same manual-entry fallback.
        setManualZoneMode(true)
      } else if (!selectedZone) {
        setSelectedZone(zs[0].name)
      }
    } catch (err) {
      setZonesError(err?.message || String(err))
      setZonesLoaded(true)
      setManualZoneMode(true)
    }
  }, [selectedZone])

  useEffect(() => {
    if (status?.loggedIn && !status?.created && !zonesLoaded) {
      loadZones()
    }
  }, [status, zonesLoaded, loadZones])

  // ── Actions ──────────────────────────────────────────────────────

  const install = async () => {
    setActionPending('install')
    setError('')
    try {
      const res = await fetch('/api/tunnel/setup/install', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error || `HTTP ${res.status}`)
        return
      }
      await refreshStatus()
    } finally {
      setActionPending('')
    }
  }

  const startLogin = async () => {
    setActionPending('login')
    setError('')
    try {
      const res = await fetch('/api/tunnel/setup/login', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`)
        return
      }
      setLogin(body)
    } finally {
      setActionPending('')
    }
  }

  const cancelLogin = async () => {
    try {
      await fetch('/api/tunnel/setup/login/cancel', { method: 'POST' })
    } catch {
      /* Cancel is best-effort; the session will time out on its own. */
    } finally {
      setLogin(null)
    }
  }

  const create = async () => {
    const effectiveZone = manualZoneMode ? manualZone.trim().toLowerCase() : selectedZone
    if (!subdomain || !effectiveZone) return
    setActionPending('create')
    setError('')
    const hostname = `${subdomain.trim()}.${effectiveZone}`.toLowerCase()
    // Tell the tunnel to forward to the port this UI is served from —
    // that is the forge-terminal backend the user wants to expose.
    const localPort = Number(window?.location?.port) || 8333
    try {
      const res = await fetch('/api/tunnel/setup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, localPort }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`)
        return
      }
      await refreshStatus()
    } finally {
      setActionPending('')
    }
  }

  const reconfigure = () => {
    // Local UI reset — the user can create a new tunnel on top of the
    // existing one.  The backend re-uses credentials if the hostname
    // matches, otherwise it allocates a fresh tunnel.
    setSelectedZone('')
    setSubdomain('forge')
    setZones([])
    setZonesLoaded(false)
    setZonesError('')
    setManualZoneMode(false)
    setManualZone('')
    refreshStatus()
  }

  // restartTunnel kicks the supervisor: stops any running cloudflared and
  // spawns a fresh one using the saved config.  This is the user's
  // recovery path when forge.<their-domain> shows Cloudflare error 1033
  // ("tunnel not running") — historically they had to restart fterm.
  const restartTunnel = async () => {
    setActionPending('restart')
    setError('')
    try {
      const res = await fetch('/api/tunnel/setup/restart', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`)
        return
      }
      // Give the supervisor a moment to publish a "Starting" stage before
      // we re-poll, so the user sees the badge actually transition.
      await new Promise((resolve) => setTimeout(resolve, 500))
      await refreshStatus()
    } finally {
      setActionPending('')
    }
  }

  // ── Derived state ────────────────────────────────────────────────

  const step = useMemo(() => {
    if (!status) return 'loading'
    if (status.created) return 'ready'
    if (!status.installed) return 'install'
    if (!status.loggedIn) return 'login'
    return 'create'
  }, [status])

  const hostnamePreview = useMemo(() => {
    const effectiveZone = manualZoneMode ? manualZone.trim().toLowerCase() : selectedZone
    if (!subdomain || !effectiveZone) return ''
    return `${subdomain.trim()}.${effectiveZone}`.toLowerCase()
  }, [subdomain, selectedZone, manualZoneMode, manualZone])

  // ── QR code for ready state ──────────────────────────────────────
  // Mobile devices have no easy way to type long domain names — render a
  // QR code of the tunnel URL so the companion PWA can be opened in one tap.
  const qrCanvasRef = useRef(null)
  const readyHostname = status?.created && status?.config?.hostname
    ? status.config.hostname
    : ''
  const readyUrl = readyHostname ? `https://${readyHostname}` : ''

  useEffect(() => {
    if (!readyUrl || !qrCanvasRef.current) return
    QRCode.toCanvas(qrCanvasRef.current, readyUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    }).catch(() => {
      /* canvas unmounted or QR library error — non-fatal */
    })
  }, [readyUrl])

  const copyReadyUrl = useCallback(async () => {
    if (!readyUrl) return
    try {
      await navigator.clipboard.writeText(readyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard API unavailable — fall back silently */
    }
  }, [readyUrl])

  // ── Render helpers ───────────────────────────────────────────────

  const renderError = () =>
    error ? (
      <div className="nts-error" role="alert">
        <AlertTriangle size={14} />
        <span>{error}</span>
      </div>
    ) : null

  const renderStepBody = () => {
    if (loading && !status) {
      return <div className="nts-loading">Loading setup status…</div>
    }

    if (step === 'ready' && status?.config?.hostname) {
      // Translate the supervisor's stage into a human badge.  We treat
      // "configured" (the ranker's idle pre-supervisor state) as Stopped
      // for UI purposes since from the user's perspective the tunnel
      // isn't actually running.
      const stage = status?.health?.stage || ''
      const isLive       = stage === 'healthy'
      const isStarting   = stage === 'starting'
      const isDegraded   = stage === 'degraded'
      const isStopped    = stage === 'stopped' || stage === 'configured' || stage === ''
      const healthLabel  = isLive ? 'Live'
                         : isStarting ? 'Starting'
                         : isDegraded ? 'Degraded'
                         : 'Stopped'
      const healthClass  = isLive ? 'nts-health-live'
                         : isStarting ? 'nts-health-starting'
                         : isDegraded ? 'nts-health-degraded'
                         : 'nts-health-stopped'
      const lastError    = status?.health?.lastError || ''
      const recoveryHint = status?.health?.recoveryHint || ''
      const lastLogLine  = status?.lastLogLine || ''

      return (
        <div className="nts-ready">
          <div className="nts-ready-badge">
            <Check size={14} /> Tunnel configured
            <span className={`nts-health-pill ${healthClass}`}>{healthLabel}</span>
          </div>
          <div className="nts-hostname">
            <a
              href={readyUrl}
              target="_blank"
              rel="noreferrer"
            >
              {status.config.hostname}
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="nts-qr-wrap">
            <canvas ref={qrCanvasRef} className="nts-qr" aria-label="QR code for tunnel URL" />
            <div className="nts-qr-caption">
              <Smartphone size={12} /> Scan to open on your phone
            </div>
          </div>
          {!isLive && (lastError || recoveryHint || lastLogLine) ? (
            <div className="nts-health-detail" role="status">
              {lastError ? <div className="nts-health-error">{lastError}</div> : null}
              {recoveryHint ? <div className="nts-health-hint">{recoveryHint}</div> : null}
              {lastLogLine ? (
                <div className="nts-health-log" title="Last line cloudflared logged">
                  <code>{lastLogLine}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="nts-ready-actions">
            <button
              type="button"
              className="nts-btn nts-btn-secondary"
              onClick={copyReadyUrl}
              aria-label="Copy tunnel URL"
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy URL</>}
            </button>
            <button
              type="button"
              className="nts-btn nts-btn-primary"
              onClick={restartTunnel}
              disabled={actionPending === 'restart'}
              aria-label="Restart tunnel"
            >
              {actionPending === 'restart'
                ? <><Loader2 size={14} className="nts-spin" /> Restarting…</>
                : <><RefreshCw size={14} /> {isStopped || isDegraded ? 'Start tunnel' : 'Restart tunnel'}</>}
            </button>
            <button
              type="button"
              className="nts-btn nts-btn-ghost"
              onClick={reconfigure}
            >
              <RefreshCw size={14} /> Reconfigure
            </button>
          </div>
          <p className="nts-ready-note">
            {isLive
              ? 'Tunnel is live — the QR code points to a working public URL.'
              : 'Tunnel is registered but not currently serving traffic. Click "Start tunnel" to spawn cloudflared.'}
          </p>
        </div>
      )
    }

    if (step === 'install') {
      return (
        <div className="nts-step">
          <p className="nts-step-desc">
            We&apos;ll download <code>cloudflared</code> into{' '}
            <code>~/.forge/bin</code>. No system-wide install needed.
          </p>
          <button
            type="button"
            className="nts-btn nts-btn-primary"
            disabled={actionPending === 'install'}
            onClick={install}
          >
            {actionPending === 'install' ? (
              <>
                <Loader2 size={14} className="nts-spin" /> Installing…
              </>
            ) : (
              <>Install cloudflared</>
            )}
          </button>
        </div>
      )
    }

    if (step === 'login') {
      if (login && login.status === 'running' && login.authURL) {
        return (
          <div className="nts-step">
            <p className="nts-step-desc">
              Open this URL in any browser and sign in to your Cloudflare
              account, then pick the domain you want Forge to use:
            </p>
            <a
              className="nts-btn nts-btn-primary"
              href={login.authURL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open Cloudflare login"
            >
              Open Cloudflare login <ExternalLink size={12} />
            </a>
            <div className="nts-auth-url">{login.authURL}</div>
            <button
              type="button"
              className="nts-btn nts-btn-ghost"
              onClick={cancelLogin}
            >
              Cancel
            </button>
          </div>
        )
      }
      if (login && login.status === 'error') {
        return (
          <div className="nts-step">
            <div className="nts-error" role="alert">
              <AlertTriangle size={14} />
              <span>{login.error || 'Login failed'}</span>
            </div>
            <button
              type="button"
              className="nts-btn nts-btn-primary"
              onClick={startLogin}
            >
              Try again
            </button>
          </div>
        )
      }
      return (
        <div className="nts-step">
          <p className="nts-step-desc">
            Authorize Forge to create a tunnel on your Cloudflare account.
            You&apos;ll be handed an auth URL to open in your browser.
          </p>
          <button
            type="button"
            className="nts-btn nts-btn-primary"
            disabled={actionPending === 'login'}
            onClick={startLogin}
          >
            {actionPending === 'login' ? (
              <>
                <Loader2 size={14} className="nts-spin" /> Starting…
              </>
            ) : (
              <>Log in to Cloudflare</>
            )}
          </button>
        </div>
      )
    }

    // step === 'create'
    return (
      <div className="nts-step">
        <p className="nts-step-desc">
          Pick the domain and subdomain where Forge should be reachable.
        </p>
        {zonesError && (
          <div className="nts-error" role="alert">
            <AlertTriangle size={14} />
            <span>Couldn&apos;t load your Cloudflare zones: {zonesError}</span>
          </div>
        )}
        <label className="nts-label" htmlFor="nts-zone">
          Domain
        </label>
        {manualZoneMode ? (
          <>
            <input
              id="nts-zone"
              className="nts-input"
              value={manualZone}
              onChange={(e) => setManualZone(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="nts-hint-row">
              <span className="nts-hint">
                Enter the apex domain you own in Cloudflare. The cert on
                disk will be used to sign the tunnel.
              </span>
              <button
                type="button"
                className="nts-btn nts-btn-ghost nts-btn-sm"
                onClick={() => {
                  setManualZoneMode(false)
                  setZonesLoaded(false)
                  loadZones()
                }}
              >
                <RefreshCw size={12} /> Retry zone list
              </button>
            </div>
          </>
        ) : (
          <>
            <select
              id="nts-zone"
              className="nts-input"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              disabled={!zonesLoaded}
            >
              {!zonesLoaded && <option value="">Loading…</option>}
              {zonesLoaded && zones.length === 0 && (
                <option value="">No zones found</option>
              )}
              {zones.map((z) => (
                <option key={z.id || z.name} value={z.name}>
                  {z.name}
                </option>
              ))}
            </select>
            {zonesLoaded && (
              <button
                type="button"
                className="nts-btn nts-btn-ghost nts-btn-sm"
                onClick={() => setManualZoneMode(true)}
              >
                Enter domain manually
              </button>
            )}
          </>
        )}
        <label className="nts-label" htmlFor="nts-sub">
          Subdomain
        </label>
        <input
          id="nts-sub"
          className="nts-input"
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          placeholder="forge"
        />
        {hostnamePreview && (
          <div className="nts-preview">
            Full hostname: <code>{hostnamePreview}</code>
          </div>
        )}
        <button
          type="button"
          className="nts-btn nts-btn-primary"
          disabled={
            actionPending === 'create' ||
            !subdomain.trim() ||
            (manualZoneMode ? !manualZone.trim() : !selectedZone)
          }
          onClick={create}
        >
          {actionPending === 'create' ? (
            <>
              <Loader2 size={14} className="nts-spin" /> Creating…
            </>
          ) : (
            <>Create tunnel</>
          )}
        </button>
      </div>
    )
  }

  const stepLabel =
    step === 'ready' ? 'Configured' :
    step === 'install' ? 'Step 1 of 3 — Install' :
    step === 'login' ? 'Step 2 of 3 — Sign in' :
    step === 'create' ? 'Step 3 of 3 — Pick hostname' :
    'Setup'

  return (
    <div className="nts-card">
      <button
        type="button"
        className="nts-header"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
      >
        <span className="nts-title">
          <Cloud size={16} />
          Named Cloudflare Tunnel
        </span>
        <span className="nts-sub">{stepLabel}</span>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {isExpanded && (
        <div className="nts-body">
          {renderError()}
          {renderStepBody()}
        </div>
      )}
    </div>
  )
}

export default NamedTunnelSetupCard
