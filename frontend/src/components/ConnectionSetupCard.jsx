// ConnectionSetupCard.jsx — v7.6.29 unified mobile-access UI.
//
// One card lists all four tunnel modes returned by GET /api/tunnel/options
// with their live health state. The user can override the ranker's pick
// by clicking "Set as default" on any mode in Configured/Healthy state,
// which writes to ~/.forge/tunnel/preference.json via POST /api/tunnel/select.
//
// Backend contract:
//   GET  /api/tunnel/options  → { active, preference: {mode}, options: [HealthState...] }
//   POST /api/tunnel/select   → { mode: "" | "named" | "tailscale" | "quick" | "lan" }
//
// HealthState shape (from internal/tunnel/health.go):
//   { Mode, Stage, Detail, URL, LastProbed, RecoveryHint }
// where Stage ∈ { absent, configured, starting, healthy, degraded, stopped }.
//
// The "Other ways to connect" section stays collapsed by default — one
// primary CTA (the active mode) is the thing the user cares about 95%
// of the time.

import React, { useEffect, useState, useCallback } from 'react'
import {
  Link as LinkIcon,
  Check,
  AlertTriangle,
  Loader2,
  Settings,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'

const MODE_META = {
  named: {
    label: 'Named Cloudflare Tunnel',
    hint: 'Stable hostname — recommended for daily use.',
  },
  tailscale: {
    label: 'Tailscale Funnel',
    hint: 'Uses your existing Tailscale identity.',
  },
  quick: {
    label: 'Quick Tunnel',
    hint: 'Zero-setup fallback — URL rotates each restart.',
  },
  lan: {
    label: 'Local Network',
    hint: 'Same Wi-Fi only — fastest, no internet needed.',
  },
}

function stageBadgeClass(stage) {
  switch (stage) {
    case 'healthy':
      return 'badge badge-success'
    case 'configured':
    case 'starting':
      return 'badge badge-info'
    case 'degraded':
      return 'badge badge-warning'
    case 'stopped':
    case 'absent':
    default:
      return 'badge badge-muted'
  }
}

function stageIcon(stage) {
  if (stage === 'healthy') return <Check size={14} />
  if (stage === 'starting') return <Loader2 size={14} className="spin" />
  if (stage === 'degraded') return <AlertTriangle size={14} />
  return null
}

export default function ConnectionSetupCard({ apiBase = '', authToken = '', embedded = false }) {
  const [state, setState] = useState({ loading: true, active: '', options: [], preference: { mode: '' } })
  const [error, setError] = useState(null)
  const [selecting, setSelecting] = useState('')
  const [showAll, setShowAll] = useState(false)

  const headers = authToken
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }
    : { 'Content-Type': 'application/json' }

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch(`${apiBase}/api/tunnel/options`, { headers })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setState({ loading: false, ...data })
    } catch (e) {
      setError(e.message || 'failed to load tunnel options')
      setState((s) => ({ ...s, loading: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, authToken])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10000) // live-refresh every 10s
    return () => clearInterval(t)
  }, [refresh])

  const selectMode = async (mode) => {
    setSelecting(mode || 'clear')
    try {
      const r = await fetch(`${apiBase}/api/tunnel/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${r.status}`)
      }
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSelecting('')
    }
  }

  if (state.loading && !embedded) {
    return (
      <div className="card connection-setup-card">
        <h3><LinkIcon size={16} /> Connection Setup</h3>
        <p className="muted"><Loader2 size={14} className="spin" /> Scanning tunnels…</p>
      </div>
    )
  }

  const active = state.options.find((o) => o.mode === state.active)
  const others = state.options.filter((o) => o.mode !== state.active)

  // Inner content shared between embedded and standalone renders
  const cardContent = (
    <>
      {state.loading && (
        <p className="muted"><Loader2 size={14} className="spin" /> Scanning tunnels…</p>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {active && (
        <div className="mode-row mode-row-active">
          <div className="mode-row-main">
            <div className="mode-label">
              <strong>{MODE_META[active.mode]?.label || active.mode}</strong>
              <span className={stageBadgeClass(active.stage)}>
                {stageIcon(active.stage)} {active.stage}
              </span>
            </div>
            <div className="mode-hint">{MODE_META[active.mode]?.hint}</div>
            {active.url && (
              <a className="mode-url" href={active.url} target="_blank" rel="noreferrer">
                {active.url} <ExternalLink size={12} />
              </a>
            )}
            {active.detail && <div className="mode-detail muted">{active.detail}</div>}
            {active.recoveryHint && (
              <div className="mode-recovery">
                <AlertTriangle size={12} /> {active.recoveryHint}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        className="link-btn"
        onClick={() => setShowAll((v) => !v)}
        aria-expanded={showAll}
      >
        {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Other ways to connect ({others.length})
      </button>

      {showAll && (
        <ul className="mode-list">
          {others.map((opt) => (
            <li key={opt.mode} className="mode-row">
              <div className="mode-row-main">
                <div className="mode-label">
                  <strong>{MODE_META[opt.mode]?.label || opt.mode}</strong>
                  <span className={stageBadgeClass(opt.stage)}>
                    {stageIcon(opt.stage)} {opt.stage}
                  </span>
                </div>
                <div className="mode-hint">{MODE_META[opt.mode]?.hint}</div>
                {opt.detail && <div className="mode-detail muted">{opt.detail}</div>}
              </div>
              {(opt.stage === 'healthy' || opt.stage === 'configured') && (
                <button
                  className="btn btn-secondary"
                  disabled={selecting === opt.mode}
                  onClick={() => selectMode(opt.mode)}
                >
                  {selecting === opt.mode ? <Loader2 size={12} className="spin" /> : <Settings size={12} />}
                  Make default
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.preference && state.preference.mode && (
        <div className="preference-footer">
          <span className="muted">
            Preference pinned to <code>{state.preference.mode}</code>.
          </span>
          <button
            className="link-btn"
            onClick={() => selectMode('')}
            disabled={selecting === 'clear'}
          >
            {selecting === 'clear' ? <Loader2 size={12} className="spin" /> : null}
            Clear preference
          </button>
        </div>
      )}
    </>
  )

  // When embedded inside another card, skip the outer card chrome.
  if (embedded) {
    return <div className="connection-setup-embedded">{cardContent}</div>
  }

  return (
    <div className="card connection-setup-card">
      <div className="card-header">
        <h3><LinkIcon size={16} /> Connection Setup</h3>
        <button
          className="icon-btn"
          onClick={refresh}
          title="Rescan tunnels"
          aria-label="Rescan tunnels"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {cardContent}
    </div>
  )
}
