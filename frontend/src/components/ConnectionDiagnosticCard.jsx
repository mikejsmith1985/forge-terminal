import { useState, useCallback } from 'react';

const STATUS = { IDLE: 'idle', RUNNING: 'running', PASS: 'pass', WARN: 'warn', FAIL: 'fail' };

const statusIcon = (s) => {
  if (s === STATUS.RUNNING) return '⟳';
  if (s === STATUS.PASS)    return '✅';
  if (s === STATUS.WARN)    return '⚠️';
  if (s === STATUS.FAIL)    return '❌';
  return '○';
};

const statusColor = (s) => {
  if (s === STATUS.PASS)    return '#4ade80';
  if (s === STATUS.WARN)    return '#facc15';
  if (s === STATUS.FAIL)    return '#f87171';
  if (s === STATUS.RUNNING) return '#60a5fa';
  return '#9ca3af';
};

const fmtUptime = (sec) => {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const fetchWithTimeout = async (url, timeoutMs = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const t0 = performance.now();
    const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
    const latencyMs = Math.round(performance.now() - t0);
    clearTimeout(id);
    return { res, latencyMs };
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

const probeWebSocket = (wsUrl, timeoutMs = 6000) =>
  new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      ws.close();
      settle({ ok: false, latencyMs: Math.round(performance.now() - t0), reason: 'Connection timed out after 6 seconds' });
    }, timeoutMs);

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      clearTimeout(timer);
      settle({ ok: false, latencyMs: 0, reason: `WebSocket constructor threw: ${err.message}` });
      return;
    }

    ws.onopen = () => {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - t0);
      ws.close(1000, 'diag-probe');
      settle({ ok: true, latencyMs });
    };

    ws.onerror = () => {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - t0);
      settle({ ok: false, latencyMs, reason: 'WebSocket connection refused or upgrade failed' });
    };

    ws.onclose = (evt) => {
      if (!settled) {
        clearTimeout(timer);
        settle({ ok: false, latencyMs: Math.round(performance.now() - t0), reason: `Connection closed before open (code ${evt.code})` });
      }
    };
  });

export default function ConnectionDiagnosticCard() {
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const patchCheck = useCallback((id, patch) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const addCheck = useCallback((check) => {
    setChecks((prev) => [...prev, check]);
  }, []);

  const runDiagnostics = useCallback(async () => {
    setPhase('running');
    setChecks([]);
    setServerInfo(null);

    // ── 1. Browser online ─────────────────────────────────────────────────────
    addCheck({ id: 'browser', label: 'Browser Online', status: STATUS.RUNNING, detail: '', advice: '' });
    if (navigator.onLine) {
      patchCheck('browser', { status: STATUS.PASS, detail: 'navigator.onLine = true' });
    } else {
      patchCheck('browser', { status: STATUS.FAIL, detail: 'navigator.onLine = false', advice: 'Your device appears offline. Check your network connection.' });
    }

    // ── 2. HTTP reachability ──────────────────────────────────────────────────
    addCheck({ id: 'http', label: 'HTTP Server Reachable', status: STATUS.RUNNING, detail: '', advice: '' });
    try {
      const { res, latencyMs } = await fetchWithTimeout('/api/version', 5000);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        patchCheck('http', { status: STATUS.PASS, detail: `${latencyMs}ms — version ${data.version || 'unknown'}` });
      } else {
        patchCheck('http', { status: STATUS.FAIL, detail: `HTTP ${res.status}`, advice: `Server responded with ${res.status}. If 401, the auth token may be invalid — try refreshing with the correct ?token= URL.` });
      }
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      patchCheck('http', {
        status: STATUS.FAIL,
        detail: isTimeout ? 'Request timed out (5s)' : err.message,
        advice: 'Cannot reach the Forge server. Is fterm.exe still running? Check if the port is blocked by a firewall or antivirus.',
      });
    }

    // ── 3. Auth + server health ───────────────────────────────────────────────
    addCheck({ id: 'auth', label: 'Authentication & Server Health', status: STATUS.RUNNING, detail: '', advice: '' });
    let wsEndpoint = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    try {
      const { res, latencyMs } = await fetchWithTimeout('/api/diagnostics/connection', 5000);
      if (res.ok) {
        const data = await res.json();
        setServerInfo(data);
        wsEndpoint = data.wsEndpoint || wsEndpoint;
        patchCheck('auth', {
          status: STATUS.PASS,
          detail: `${latencyMs}ms — v${data.version} · uptime ${fmtUptime(data.uptimeSec)} · ${data.activePtySessions} active session${data.activePtySessions !== 1 ? 's' : ''}`,
        });
      } else if (res.status === 401) {
        patchCheck('auth', { status: STATUS.FAIL, detail: 'HTTP 401 Unauthorized', advice: 'Auth token rejected. Open Forge with the correct token URL: http://localhost:<port>/?token=<yourtoken>' });
      } else {
        patchCheck('auth', { status: STATUS.WARN, detail: `HTTP ${res.status}`, advice: 'Server health endpoint returned an unexpected status.' });
      }
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      patchCheck('auth', {
        status: STATUS.FAIL,
        detail: isTimeout ? 'Timed out' : err.message,
        advice: 'Could not reach /api/diagnostics/connection. HTTP layer must pass before this check is meaningful.',
      });
    }

    // ── 4. WebSocket probe ────────────────────────────────────────────────────
    addCheck({ id: 'ws', label: 'WebSocket Upgrade', status: STATUS.RUNNING, detail: '', advice: '' });
    const probeUrl = `${wsEndpoint}?sessionId=diag-probe-${Date.now()}&tabId=diag-probe&cols=80&rows=24`;
    const wsResult = await probeWebSocket(probeUrl, 6000);
    if (wsResult.ok) {
      patchCheck('ws', { status: STATUS.PASS, detail: `Connected & closed cleanly in ${wsResult.latencyMs}ms` });
    } else {
      patchCheck('ws', {
        status: STATUS.FAIL,
        detail: wsResult.reason,
        advice: 'WebSocket upgrade failed. Common causes: (1) a reverse proxy or firewall blocking WebSocket upgrades, (2) browser blocking mixed-content ws:// on https:// pages, (3) server-side session limit reached. Try a full page reload or restart Forge.',
      });
    }

    // ── 5. Internal server health ─────────────────────────────────────────────
    addCheck({ id: 'internal', label: 'Internal Server Health', status: STATUS.RUNNING, detail: '', advice: '' });
    try {
      const { res } = await fetchWithTimeout('/api/diagnostics/internal', 8000);
      if (res.ok) {
        const data = await res.json();
        if (!data.ok || data.warnings?.length > 0) {
          const topWarning = data.warnings?.[0] || '';
          const isCritical = !data.ok;
          const goroutineInfo = `${data.goroutineCount} goroutines · ${data.heapAllocMB?.toFixed(0)} MB heap`;
          const shellInfo = data.shellAvailable ? data.shellFound : '⚠ no shell found';
          patchCheck('internal', {
            status: isCritical ? STATUS.FAIL : STATUS.WARN,
            detail: `${goroutineInfo} · shell: ${shellInfo}`,
            advice: topWarning + (data.warnings?.length > 1 ? ` (+${data.warnings.length - 1} more — see Copy Report)` : ''),
            _raw: data,
          });
        } else {
          const goroutineInfo = `${data.goroutineCount} goroutines · ${data.heapAllocMB?.toFixed(0)} MB heap`;
          const shellInfo = data.shellAvailable ? data.shellFound : 'not found';
          const sessionInfo = `${data.liveHubs} hub${data.liveHubs !== 1 ? 's' : ''} · ${data.detachedSessions} detached`;
          patchCheck('internal', {
            status: STATUS.PASS,
            detail: `${goroutineInfo} · shell: ${shellInfo} · ${sessionInfo}`,
            _raw: data,
          });
        }
      } else {
        patchCheck('internal', { status: STATUS.WARN, detail: `HTTP ${res.status}`, advice: 'Internal health endpoint not available on this server version.' });
      }
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      patchCheck('internal', {
        status: STATUS.WARN,
        detail: isTimeout ? 'Timed out' : err.message,
        advice: 'Could not reach /api/diagnostics/internal. Upgrade Forge to the latest version.',
      });
    }

    setPhase('done');
  }, [addCheck, patchCheck]);

  const buildReport = useCallback(() => {
    const lines = [
      'FORGE TERMINAL — CONNECTION DIAGNOSTIC REPORT',
      `Generated: ${new Date().toISOString()}`,
      '─'.repeat(52),
      '',
      'CHECKS',
    ];
    for (const c of checks) {
      const icon = c.status === STATUS.PASS ? '✓' : c.status === STATUS.WARN ? '!' : '✗';
      lines.push(`${icon}  ${c.label.padEnd(32)} ${c.detail}`);
      if (c.advice) lines.push(`   → ${c.advice}`);
    }
    lines.push('');
    lines.push('ENVIRONMENT');
    lines.push(`Browser:   ${navigator.userAgent}`);
    lines.push(`Online:    ${navigator.onLine}`);
    lines.push(`Protocol:  ${window.location.protocol}`);
    lines.push(`Host:      ${window.location.host}`);
    if (navigator.connection) {
      const nc = navigator.connection;
      lines.push(`Network:   ${nc.effectiveType || 'unknown'} (rtt=${nc.rtt}ms)`);
    }
    if (serverInfo) {
      lines.push('');
      lines.push('SERVER');
      lines.push(`Version:   ${serverInfo.version}`);
      lines.push(`Port:      ${serverInfo.port}`);
      lines.push(`PID:       ${serverInfo.pid}`);
      lines.push(`Uptime:    ${fmtUptime(serverInfo.uptimeSec)}`);
      lines.push(`Sessions:  ${serverInfo.activePtySessions} active PTY session(s)`);
      lines.push(`OS:        ${serverInfo.goos}/${serverInfo.goArch}`);
      lines.push(`Go:        ${serverInfo.goVersion}`);
      lines.push(`Auth:      ${serverInfo.authEnabled ? 'enabled' : 'disabled'}`);
    }
    // Include full internal diagnostics if available
    const internalCheck = checks.find((c) => c.id === 'internal');
    const internalRaw = internalCheck?._raw;
    if (internalRaw) {
      lines.push('');
      lines.push('INTERNAL HEALTH');
      lines.push(`Goroutines:   ${internalRaw.goroutineCount}`);
      lines.push(`Heap alloc:   ${internalRaw.heapAllocMB?.toFixed(1)} MB`);
      lines.push(`Heap sys:     ${internalRaw.heapSysMB?.toFixed(1)} MB`);
      lines.push(`GC cycles:    ${internalRaw.numGC}`);
      lines.push(`Last GC pause:${internalRaw.lastGCPauseMs?.toFixed(2)} ms`);
      lines.push(`Shell:        ${internalRaw.shellAvailable ? internalRaw.shellFound : 'NOT FOUND'}`);
      lines.push(`PTY device:   ${internalRaw.ptyDevice} (${internalRaw.ptyAvailable ? 'available' : 'UNAVAILABLE'})`);
      lines.push(`Journal dir:  ${internalRaw.journalDirPath} (${internalRaw.journalDirOK ? 'writable' : 'NOT WRITABLE'})`);
      lines.push(`Live hubs:    ${internalRaw.liveHubs}`);
      lines.push(`Detached:     ${internalRaw.detachedSessions}`);
      if (internalRaw.warnings?.length > 0) {
        lines.push('');
        lines.push('INTERNAL WARNINGS');
        for (const w of internalRaw.warnings) lines.push(`  ! ${w}`);
      }
    }
    lines.push('');
    const failed = checks.filter((c) => c.status === STATUS.FAIL).length;
    if (failed === 0) {
      lines.push('All checks passed. If the terminal still won\'t connect, try a full page reload.');
    } else {
      lines.push(`${failed} check(s) failed. See advice above to resolve.`);
    }
    return lines.join('\n');
  }, [checks, serverInfo]);

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — show the report in a prompt as fallback
      window.prompt('Copy the report below:', buildReport());
    }
  }, [buildReport]);

  const allPassed = phase === 'done' && checks.every((c) => c.status === STATUS.PASS);
  const hasFailed = phase === 'done' && checks.some((c) => c.status === STATUS.FAIL);

  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1f2937',
      borderRadius: 8,
      padding: '14px 16px',
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#e5e7eb',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔌</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f9fafb' }}>Connection Diagnostics</span>
        </div>
        {phase === 'done' && (
          <button
            onClick={copyReport}
            style={{
              background: 'none',
              border: '1px solid #374151',
              borderRadius: 4,
              color: copied ? '#4ade80' : '#9ca3af',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 8px',
            }}
          >
            {copied ? '✓ Copied' : '📋 Copy Report'}
          </button>
        )}
      </div>

      {/* Description */}
      {phase === 'idle' && (
        <p style={{ margin: '0 0 12px', color: '#9ca3af', lineHeight: 1.5 }}>
          Diagnose why the terminal won't connect or keeps spinning.
          Runs HTTP, auth, and WebSocket checks in sequence.
        </p>
      )}

      {/* Check list */}
      {checks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {checks.map((c) => (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  color: statusColor(c.status),
                  animation: c.status === STATUS.RUNNING ? 'spin 1s linear infinite' : 'none',
                  display: 'inline-block',
                  width: 16,
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {statusIcon(c.status)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: '#f9fafb' }}>{c.label}</span>
                  {c.detail && (
                    <span style={{ color: '#6b7280', marginLeft: 8 }}>{c.detail}</span>
                  )}
                  {c.advice && (
                    <div style={{
                      color: '#fbbf24',
                      marginTop: 2,
                      paddingLeft: 4,
                      borderLeft: '2px solid #d97706',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}>
                      {c.advice}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary banner */}
      {phase === 'done' && (
        <div style={{
          padding: '6px 10px',
          borderRadius: 4,
          marginBottom: 10,
          background: allPassed ? '#052e16' : hasFailed ? '#2d0a0a' : '#2d2500',
          color: allPassed ? '#4ade80' : hasFailed ? '#f87171' : '#facc15',
          fontSize: 11,
        }}>
          {allPassed
            ? '✅ All checks passed — terminal should connect normally. Try a full page reload if issues persist.'
            : hasFailed
              ? `❌ ${checks.filter(c => c.status === STATUS.FAIL).length} check(s) failed — see advice above.`
              : '⚠️ Some checks returned warnings.'}
        </div>
      )}

      {/* Run / Re-run button */}
      <button
        onClick={runDiagnostics}
        disabled={phase === 'running'}
        style={{
          background: phase === 'running' ? '#1f2937' : '#1d4ed8',
          border: 'none',
          borderRadius: 5,
          color: phase === 'running' ? '#6b7280' : '#fff',
          cursor: phase === 'running' ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 14px',
          width: '100%',
        }}
      >
        {phase === 'running' ? '⟳ Running...' : phase === 'done' ? '↺ Run Again' : '▶ Run Diagnostics'}
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
