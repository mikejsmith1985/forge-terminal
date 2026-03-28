import { Wifi, WifiOff, Loader2 } from 'lucide-react'

function getStatusClass(latency, connected, reconnecting) {
  if (reconnecting) return 'reconnecting'
  if (!connected) return 'disconnected'
  if (latency === null || latency === undefined) return 'unknown'
  if (latency < 100) return 'good'
  if (latency < 500) return 'degraded'
  return 'poor'
}

export function NetworkIndicator({ latency, connected, reconnecting }) {
  const statusClass = getStatusClass(latency, connected, reconnecting)

  return (
    <div className={`network-indicator ${statusClass}`} title={connected ? `${latency}ms` : 'Disconnected'}>
      {reconnecting ? (
        <>
          <Loader2 size={14} className="network-reconnecting spin" />
          <span className="network-label">Reconnecting...</span>
        </>
      ) : connected ? (
        <>
          <Wifi size={14} />
          <span className="network-label">{latency}ms</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span className="network-label">Offline</span>
        </>
      )}
    </div>
  )
}
