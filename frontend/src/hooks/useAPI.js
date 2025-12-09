import { useState, useCallback } from 'react'
import { API_CONFIG } from '../config'

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

  return { apiCall, loading, error }
}

// Hook for WebSocket connections
export const useWebSocket = (url, onMessage, onOpen, onClose, onError) => {
  const [connected, setConnected] = useState(false)
  const [ws, setWS] = useState(null)

  const connect = useCallback(() => {
    try {
      const wsURL = url || API_CONFIG.getWSURL()
      console.log('[WebSocket] Connecting to:', wsURL)
      
      const socket = new WebSocket(wsURL)
      
      socket.onopen = () => {
        console.log('[WebSocket] Connected')
        setConnected(true)
        onOpen && onOpen()
      }

      socket.onmessage = (event) => {
        onMessage && onMessage(event.data)
      }

      socket.onclose = () => {
        console.log('[WebSocket] Disconnected')
        setConnected(false)
        onClose && onClose()
      }

      socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
        setConnected(false)
        onError && onError(error)
      }

      setWS(socket)
      return socket
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err)
      onError && onError(err)
    }
  }, [url, onMessage, onOpen, onClose, onError])

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close()
      setWS(null)
    }
  }, [ws])

  const send = useCallback((data) => {
    if (ws && connected) {
      ws.send(data)
    } else {
      console.warn('[WebSocket] Not connected, cannot send:', data)
    }
  }, [ws, connected])

  return {
    connected,
    ws,
    connect,
    disconnect,
    send,
  }
}
