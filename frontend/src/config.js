// API Configuration
// Allows dynamic backend URL configuration for different deployment modes
// Priority: VITE_API_BASE env var > localStorage > detected localhost

const getAPIBase = () => {
  // 1. Check environment variable (set during build)
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE
  }

  // 2. Check localStorage (user configured)
  const stored = localStorage.getItem('forge_api_base')
  if (stored) {
    return stored
  }

  // 3. Try localhost (local development)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:8333`
  }

  // 4. Return current origin (same-origin deployment)
  return window.location.origin
}

const getWSBase = () => {
  const apiBase = getAPIBase()
  if (apiBase.startsWith('https://')) {
    return apiBase.replace('https://', 'wss://')
  }
  if (apiBase.startsWith('http://')) {
    return apiBase.replace('http://', 'ws://')
  }
  return apiBase
}

export const API_CONFIG = {
  base: getAPIBase(),
  wsBase: getWSBase(),
  
  // API endpoints
  getCommandsURL: () => `${API_CONFIG.base}/api/commands`,
  getConfigURL: () => `${API_CONFIG.base}/api/config`,
  getWSURL: () => `${API_CONFIG.wsBase}/ws`,
  getVersionURL: () => `${API_CONFIG.base}/api/version`,
  getUpdateCheckURL: () => `${API_CONFIG.base}/api/update/check`,
  getUpdateApplyURL: () => `${API_CONFIG.base}/api/update/apply`,
  getWSLDetectURL: () => `${API_CONFIG.base}/api/wsl/detect`,
  getAssistantURL: () => `${API_CONFIG.base}/api/assistant`,
  getShutdownURL: () => `${API_CONFIG.base}/api/shutdown`,
}

// Allow runtime API base configuration via window
if (typeof window !== 'undefined') {
  window.__forgeAPIConfig = {
    setAPIBase: (url) => {
      localStorage.setItem('forge_api_base', url)
      // Reload to apply new configuration
      window.location.reload()
    },
    getAPIBase: getAPIBase,
    getWSBase: getWSBase,
  }
}

export const setAPIBase = (url) => {
  localStorage.setItem('forge_api_base', url)
}

export const clearAPIBase = () => {
  localStorage.removeItem('forge_api_base')
}

// AM Monitoring Configuration
const getAMPollingInterval = () => {
  // 1. Check environment variable (set during build)
  const envVar = import.meta.env.VITE_AM_POLLING_INTERVAL
  if (envVar) {
    const interval = parseInt(envVar, 10)
    if (!isNaN(interval) && interval > 0) {
      return interval
    }
  }

  // 2. Check localStorage (user configured)
  const stored = localStorage.getItem('forge_am_polling_interval')
  if (stored) {
    const interval = parseInt(stored, 10)
    if (!isNaN(interval) && interval > 0) {
      return interval
    }
  }

  // 3. Default to 30000ms (30 seconds) - reduced from 10s for better performance
  return 30000
}

export const AM_CONFIG = {
  getPollingInterval: getAMPollingInterval,
}

// Allow runtime AM configuration via window
if (typeof window !== 'undefined') {
  window.__forgeAMConfig = {
    setPollingInterval: (ms) => {
      if (ms > 0) {
        localStorage.setItem('forge_am_polling_interval', ms.toString())
        window.location.reload()
      }
    },
    getPollingInterval: getAMPollingInterval,
  }
}
