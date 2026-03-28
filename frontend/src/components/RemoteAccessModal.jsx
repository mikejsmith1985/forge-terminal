import { useState, useCallback } from 'react';
import { Wifi, WifiOff, X, Copy, Check, Eye, EyeOff, Loader2, Radio } from 'lucide-react';
import { useHostedMode } from '../hooks/useHostedMode';

function CopyButton({ text, style = {} }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        background: 'none',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: '4px 8px',
        cursor: 'pointer',
        color: copied ? '#4ade80' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        transition: 'color 0.15s',
        ...style,
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function RemoteAccessModal({ isOpen, onClose }) {
  const { status, loading, error, start, stop } = useHostedMode(isOpen);
  const [tokenVisible, setTokenVisible] = useState(false);

  if (!isOpen) return null;

  const isCloudflaredError = error && error.toLowerCase().includes('cloudflared');
  const hasTunnel = status.running && status.tunnelURL;
  const waitingForTunnel = status.running && !status.tunnelURL;

  const displayToken = tokenVisible
    ? status.token
    : status.token
      ? status.token.slice(0, 8) + '...'
      : '';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          width: 460,
          maxWidth: '95vw',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Radio size={18} color="var(--accent-color)" />
            <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
              Remote Access
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: status.running ? '#4ade80' : 'var(--text-secondary)',
                  display: 'inline-block',
                  flexShrink: 0,
                  boxShadow: status.running ? '0 0 6px #4ade8088' : 'none',
                  transition: 'background 0.3s',
                }}
              />
              <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                {status.running ? 'Active' : 'Inactive'}
              </span>
            </div>
            {status.running
              ? <Wifi size={16} color="#4ade80" />
              : <WifiOff size={16} color="var(--text-secondary)" />
            }
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#f87171',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {error}
              {isCloudflaredError && (
                <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                  Install cloudflared from{' '}
                  <a
                    href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                  >
                    developers.cloudflare.com
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Not running: explainer */}
          {!status.running && !loading && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              Start a secure tunnel to share this terminal session remotely.
              Anyone with the link and token can connect from a browser.
            </p>
          )}

          {/* Waiting for tunnel */}
          {waitingForTunnel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Establishing tunnel…
            </div>
          )}

          {/* Running + tunnel ready */}
          {hasTunnel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* QR code */}
              {status.qrCodeBase64 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 10,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${status.qrCodeBase64}`}
                      alt="Scan to connect"
                      style={{ width: 260, height: 260, borderRadius: 8, display: 'block', margin: '0 auto' }}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
                    ⚠️ This URL changes every session — scan fresh each time. Don't save it as a bookmark.
                  </p>
                </div>
              )}

              {/* URL row */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Access URL
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: 'var(--accent-color)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace',
                    }}
                  >
                    {status.accessURL || status.tunnelURL}
                  </span>
                  <CopyButton text={status.accessURL || status.tunnelURL} />
                </div>
              </div>

              {/* Token row */}
              {status.token && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Access Token
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        letterSpacing: tokenVisible ? '0.04em' : 'normal',
                      }}
                    >
                      {displayToken}
                    </span>
                    <button
                      onClick={() => setTokenVisible((v) => !v)}
                      title={tokenVisible ? 'Hide token' : 'Show token'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: 2,
                      }}
                    >
                      {tokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <CopyButton text={status.token} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {status.running ? (
              <button
                onClick={stop}
                disabled={loading}
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  padding: '9px 20px',
                  color: '#f87171',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: loading ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                Stop Session
              </button>
            ) : (
              <button
                onClick={start}
                disabled={loading}
                style={{
                  background: 'var(--accent-color)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 20px',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: loading ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Radio size={14} />
                }
                Start Remote Access
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spinner keyframes injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
