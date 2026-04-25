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

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cloud,
  ChevronDown,
  ChevronUp,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import './NamedTunnelSetupCard.css'

const LOGIN_POLL_MS = 2000

/**
 * NamedTunnelSetupCard — Cloudflare Named Tunnel setup wizard.
 *
 * When embedded={true} (rendered inside CompanionAccessCard), the outer card
 * chrome (border, header button) is omitted and only the step body renders.
 * This keeps the Forge Companion card as the single top-level container.
 */
const NamedTunnelSetupCard = ({ embedded = false }) => {
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
  const [selectedZone, setSelectedZone] = useState('')
  const [subdomain, setSubdomain]       = useState('forge')

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
    try {
      const res = await fetch('/api/tunnel/setup/zones')
      const body = await res.json()
      const zs = Array.isArray(body?.zones) ? body.zones : []
      setZones(zs)
      setZonesLoaded(true)
      if (zs.length > 0 && !selectedZone) setSelectedZone(zs[0].name)
    } catch (err) {
      setError(err?.message || String(err))
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
    if (!subdomain || !selectedZone) return
    setActionPending('create')
    setError('')
    const hostname = `${subdomain.trim()}.${selectedZone}`.toLowerCase()
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
    refreshStatus()
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
    if (!subdomain || !selectedZone) return ''
    return `${subdomain.trim()}.${selectedZone}`.toLowerCase()
  }, [subdomain, selectedZone])

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

    if (step === 'ready') {
      if (status?.config?.hostname) {
        return (
          <div className="nts-ready">
            <div className="nts-ready-badge">
              <Check size={14} /> Your tunnel is live
            </div>
            <div className="nts-hostname">
              <a
                href={`https://${status.config.hostname}`}
                target="_blank"
                rel="noreferrer"
              >
                {status.config.hostname}
                <ExternalLink size={12} />
              </a>
            </div>
            <button
              type="button"
              className="nts-btn nts-btn-secondary"
              onClick={reconfigure}
            >
              <RefreshCw size={14} /> Reconfigure
            </button>
          </div>
        )
      }
      // Tunnel was marked created but the hostname is missing from config —
      // show an actionable error instead of falling through to the create form.
      return (
        <div className="nts-step">
          <div className="nts-error" role="alert">
            <AlertTriangle size={14} />
            <span>Tunnel hostname is missing from config. Try reconfiguring.</span>
          </div>
          <button
            type="button"
            className="nts-btn nts-btn-secondary"
            onClick={reconfigure}
          >
            <RefreshCw size={14} /> Reconfigure
          </button>
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
        <label className="nts-label" htmlFor="nts-zone">
          Domain
        </label>
        <select
          id="nts-zone"
          className="nts-input"
          value={selectedZone}
          onChange={(e) => setSelectedZone(e.target.value)}
        >
          {zones.length === 0 && <option value="">Loading…</option>}
          {zones.map((z) => (
            <option key={z.id || z.name} value={z.name}>
              {z.name}
            </option>
          ))}
        </select>
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
            actionPending === 'create' || !subdomain.trim() || !selectedZone
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
    step === 'ready' ? 'Connected' :
    step === 'install' ? 'Step 1 of 3 — Install' :
    step === 'login' ? 'Step 2 of 3 — Sign in' :
    step === 'create' ? 'Step 3 of 3 — Pick hostname' :
    'Setup'

  // When embedded inside another card (e.g. CompanionAccessCard), skip the
  // outer card chrome so the parent card is the single visual container.
  if (embedded) {
    return (
      <div className="nts-embedded">
        {renderError()}
        {renderStepBody()}
      </div>
    )
  }

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
