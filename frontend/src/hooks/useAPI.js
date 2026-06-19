import { useState, useCallback, useRef } from 'react'
import { API_CONFIG } from '../config'
import { createWebSocketManager } from '../utils/websocketManager'

// Hook for making API calls with automatic error handling and loading states
export const useAPI = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const apiCall = useCallback(async (endpoint, options = {}) => {
    setLoading(true)
    setError(null)

    try {
      const url = `${API_CONFIG.base}${endpoint}`
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      const errorMessage = err.message || 'Unknown API error'
      setError(errorMessage)
      console.error('API Error:', errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const readFile = useCallback(async (path, rootPath = '.') => {
    return apiCall('/api/files/read', {
      method: 'POST',
      body: JSON.stringify({ path, rootPath })
    })
  }, [apiCall])

  const writeFile = useCallback(async (path, content, rootPath = '.') => {
    return apiCall('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content, rootPath })
    })
  }, [apiCall])

  return { apiCall, loading, error, readFile, writeFile }
}

// Maximum reconnect attempts after which the UI shows the manual reconnect button.
// 50 attempts at exponential backoff (500ms → 10s) covers ~8 minutes of outage,
// which is more than enough for an app restart or update to complete.
const maxReconnectAttempts = 50

// Hook for WebSocket connections with automatic exponential-backoff reconnection.
// Uses the existing WebSocketReconnectionManager so no reconnect logic is duplicated here.
// The connection survives app updates, crashes, and network blips without any user action.
export const useWebSocket = (url, onMessage, onOpen, onClose, onError) => {
  const [connected, setConnected] = useState(false)
  const managerRef = useRef(null)

  const connect = useCallback(() => {
    const wsURL = url || API_CONFIG.getWSURL()
    console.log('[WebSocket] Connecting to:', wsURL)

    const manager = createWebSocketManager(wsURL, {
      maxAttempts:       maxReconnectAttempts,
      initialDelay:      500,
      maxDelay:          10000,
      backoffMultiplier: 2,
      onConnect: () => {
        console.log('[WebSocket] Connected')
        setConnected(true)
        onOpen && onOpen()
      },
      onDisconnect: () => {
        console.log('[WebSocket] Disconnected — reconnecting…')
        setConnected(false)
        onClose && onClose()
      },
      onError: (errorDetails) => {
        console.error('[WebSocket] Error:', errorDetails)
        setConnected(false)
        onError && onError(errorDetails)
      },
      onReconnecting: ({ attemptNumber, nextDelayMs }) => {
        console.log(`[WebSocket] Reconnect attempt ${attemptNumber}/${maxReconnectAttempts} in ${nextDelayMs}ms`)
      },
      onMessage: (data) => {
        onMessage && onMessage(data)
      },
    })

    managerRef.current = manager
    manager.connect().catch((connectError) => {
      console.warn('[WebSocket] Initial connect failed — will retry automatically:', connectError)
    })

    return manager
  }, [url, onMessage, onOpen, onClose, onError])

  const disconnect = useCallback(() => {
    managerRef.current?.close()
    managerRef.current = null
    setConnected(false)
  }, [])

  const send = useCallback((data) => {
    if (managerRef.current && connected) {
      managerRef.current.send(data)
    } else {
      console.warn('[WebSocket] Not connected, cannot send:', data)
    }
  }, [connected])

  return {
    connected,
    ws: managerRef.current,
    connect,
    disconnect,
    send,
  }
}
