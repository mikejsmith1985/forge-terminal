import { useState, useCallback, useRef, useEffect } from 'react'
import { API_CONFIG } from '../config'

const AUTH_TOKEN_KEY = 'forge-auth-token'

/**
 * Authenticated fetch wrapper for workflow API calls.
 * Prepends the configured API base and attaches the auth token.
 */
const workflowFetch = async (url, options = {}) => {
  const base = API_CONFIG.base
  const token = localStorage.getItem(AUTH_TOKEN_KEY)

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${base}${url}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * React hook for the Enterprise Workflow Architect feature.
 *
 * Provides full lifecycle management — project detection, preset management,
 * scaffold preview, apply, status, and compliance scanning.
 *
 * @returns {{
 *   detection: object|null,
 *   presets: Array,
 *   selectedPreset: object|null,
 *   config: object,
 *   preview: object|null,
 *   applyResult: object|null,
 *   status: object|null,
 *   compliance: object|null,
 *   modules: Array,
 *   isDetecting: boolean,
 *   isPreviewing: boolean,
 *   isApplying: boolean,
 *   error: string|null,
 *   detect: Function,
 *   loadPresets: Function,
 *   selectPreset: Function,
 *   savePreset: Function,
 *   deletePreset: Function,
 *   updateConfig: Function,
 *   toggleModule: Function,
 *   setQualityMode: Function,
 *   generatePreview: Function,
 *   applyWorkflow: Function,
 *   checkStatus: Function,
 *   scanCompliance: Function,
 *   clearError: Function,
 *   reset: Function,
 * }}
 */
export function useWorkflowSetup() {
  // Core state
  const [detection, setDetection] = useState(null)
  const [presets, setPresets] = useState([])
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [config, setConfig] = useState(defaultConfig())
  const [preview, setPreview] = useState(null)
  const [applyResult, setApplyResult] = useState(null)
  const [status, setStatus] = useState(null)
  const [compliance, setCompliance] = useState(null)
  const [modules, setModules] = useState([])

  // Loading states
  const [isDetecting, setIsDetecting] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  // Watcher state
  const [watcherNotifications, setWatcherNotifications] = useState([])
  const [isWatcherActive, setIsWatcherActive] = useState(false)
  const watcherPollRef = useRef(null)
  const watcherPathRef = useRef(null)

  // Error handling
  const [error, setError] = useState(null)
  const errorTimerRef = useRef(null)

  // Auto-dismiss errors after 8 seconds
  const setErrorWithAutoDismiss = useCallback((errorMessage) => {
    setError(errorMessage)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), 8000)
  }, [])

  /**
   * Detect project type, existing structure, and recommendations
   * for the directory at the given path.
   */
  const detect = useCallback(async (projectPath) => {
    if (!projectPath) return
    setIsDetecting(true)
    setError(null)
    try {
      const result = await workflowFetch('/api/workflow/detect', {
        method: 'POST',
        body: JSON.stringify({ path: projectPath }),
      })
      setDetection(result)
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Detection failed: ${fetchError.message}`)
      return null
    } finally {
      setIsDetecting(false)
    }
  }, [setErrorWithAutoDismiss])

  /**
   * Load the available workflow presets (built-in + user-saved).
   */
  const loadPresets = useCallback(async () => {
    try {
      const result = await workflowFetch('/api/workflow/presets')
      setPresets(result || [])
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Failed to load presets: ${fetchError.message}`)
      return []
    }
  }, [setErrorWithAutoDismiss])

  /**
   * Load the module catalog from the server.
   */
  const loadModules = useCallback(async () => {
    try {
      const result = await workflowFetch('/api/workflow/modules')
      setModules(result || [])
      return result
    } catch (fetchError) {
      console.error('Failed to load modules:', fetchError)
      return []
    }
  }, [])

  /**
   * Apply a preset's configuration to the current config state.
   */
  const selectPreset = useCallback((preset) => {
    setSelectedPreset(preset)
    if (preset && preset.config) {
      setConfig(preset.config)
    }
  }, [])

  /**
   * Save the current configuration as a named preset.
   */
  const savePreset = useCallback(async (presetName, presetDescription = '') => {
    const presetId = presetName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const newPreset = {
      id: presetId,
      name: presetName,
      description: presetDescription,
      builtIn: false,
      config: { ...config },
    }

    try {
      const result = await workflowFetch('/api/workflow/presets', {
        method: 'POST',
        body: JSON.stringify(newPreset),
      })
      // Reload presets to reflect the save
      await loadPresets()
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Failed to save preset: ${fetchError.message}`)
      return null
    }
  }, [config, loadPresets, setErrorWithAutoDismiss])

  /**
   * Delete a user-created preset by its ID.
   */
  const deletePreset = useCallback(async (presetId) => {
    try {
      await workflowFetch(`/api/workflow/presets?id=${presetId}`, {
        method: 'DELETE',
      })
      await loadPresets()
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Failed to delete preset: ${fetchError.message}`)
    }
  }, [loadPresets, setErrorWithAutoDismiss])

  /**
   * Update the workflow configuration with a partial config object.
   */
  const updateConfig = useCallback((partialConfig) => {
    setConfig(previousConfig => ({ ...previousConfig, ...partialConfig }))
    setSelectedPreset(null) // Config was manually changed — deselect preset
    setPreview(null) // Invalidate any existing preview
  }, [])

  /**
   * Toggle a specific workflow module on or off.
   */
  const toggleModule = useCallback((moduleId) => {
    setConfig(previousConfig => {
      const currentModules = previousConfig.enabledModules || []
      const isCurrentlyEnabled = currentModules.includes(moduleId)

      return {
        ...previousConfig,
        enabledModules: isCurrentlyEnabled
          ? currentModules.filter(existingModuleId => existingModuleId !== moduleId)
          : [...currentModules, moduleId],
      }
    })
    setSelectedPreset(null) // Manual change
    setPreview(null)
  }, [])

  /**
   * Set the quality mode (BEST or FAST).
   */
  const setQualityMode = useCallback((mode) => {
    setConfig(previousConfig => ({ ...previousConfig, qualityMode: mode }))
    setSelectedPreset(null)
    setPreview(null)
  }, [])

  /**
   * Generate a dry-run preview showing what files will be created/modified.
   */
  const generatePreview = useCallback(async (projectPath) => {
    if (!projectPath) return
    setIsPreviewing(true)
    setError(null)
    try {
      const result = await workflowFetch('/api/workflow/preview', {
        method: 'POST',
        body: JSON.stringify({ path: projectPath, config }),
      })
      setPreview(result)
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Preview failed: ${fetchError.message}`)
      return null
    } finally {
      setIsPreviewing(false)
    }
  }, [config, setErrorWithAutoDismiss])

  /**
   * Apply the workflow configuration to the project (creates/updates files).
   */
  const applyWorkflow = useCallback(async (projectPath) => {
    if (!projectPath) return
    setIsApplying(true)
    setError(null)
    try {
      const result = await workflowFetch('/api/workflow/apply', {
        method: 'POST',
        body: JSON.stringify({ path: projectPath, config }),
      })
      setApplyResult(result)
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Apply failed: ${fetchError.message}`)
      return null
    } finally {
      setIsApplying(false)
    }
  }, [config, setErrorWithAutoDismiss])

  /**
   * Check the workflow status for a project (configured, preset, compliance).
   */
  const checkStatus = useCallback(async (projectPath) => {
    if (!projectPath) return
    try {
      const result = await workflowFetch(`/api/workflow/status?path=${encodeURIComponent(projectPath)}`)
      setStatus(result)
      return result
    } catch (fetchError) {
      console.error('Status check failed:', fetchError)
      return null
    }
  }, [])

  /**
   * Run a compliance scan against the project and return the report.
   */
  const scanCompliance = useCallback(async (projectPath) => {
    if (!projectPath) return
    try {
      const result = await workflowFetch(`/api/workflow/compliance?path=${encodeURIComponent(projectPath)}`)
      setCompliance(result)
      return result
    } catch (fetchError) {
      setErrorWithAutoDismiss(`Compliance scan failed: ${fetchError.message}`)
      return null
    }
  }, [setErrorWithAutoDismiss])

  /**
   * Start a file-change watcher for the given project path.
   */
  const startWatcher = useCallback(async (projectPath) => {
    if (!projectPath) return
    try {
      const watcherResponse = await workflowFetch('/api/workflow/watch', {
        method: 'POST',
        body: JSON.stringify({ path: projectPath }),
      })
      if (watcherResponse.active) {
        setIsWatcherActive(true)
        watcherPathRef.current = projectPath
      }
      return watcherResponse
    } catch (fetchError) {
      console.error('Failed to start workflow watcher:', fetchError)
      return null
    }
  }, [])

  /**
   * Stop the file-change watcher for the given project path.
   */
  const stopWatcher = useCallback(async (projectPath) => {
    if (!projectPath) return
    try {
      await workflowFetch(`/api/workflow/watch/stop?path=${encodeURIComponent(projectPath)}`, {
        method: 'DELETE',
      })
    } catch (fetchError) {
      console.error('Failed to stop workflow watcher:', fetchError)
    }
    setIsWatcherActive(false)
    watcherPathRef.current = null
  }, [])

  /**
   * Dismiss a specific watcher notification by its index.
   */
  const dismissWatcherNotification = useCallback((notificationIndex) => {
    setWatcherNotifications(previousNotifications =>
      previousNotifications.filter((_, currentIndex) => currentIndex !== notificationIndex)
    )
  }, [])

  // Poll for watcher notifications every 3 seconds when watcher is active
  useEffect(() => {
    if (!isWatcherActive || !watcherPathRef.current) {
      if (watcherPollRef.current) {
        clearInterval(watcherPollRef.current)
        watcherPollRef.current = null
      }
      return
    }

    const pollPath = watcherPathRef.current

    const pollForNotifications = async () => {
      try {
        const polledNotifications = await workflowFetch(
          `/api/workflow/watch/poll?path=${encodeURIComponent(pollPath)}`
        )
        if (Array.isArray(polledNotifications) && polledNotifications.length > 0) {
          setWatcherNotifications(previousNotifications => [
            ...previousNotifications,
            ...polledNotifications,
          ])
        }
      } catch (fetchError) {
        console.error('Watcher poll failed:', fetchError)
      }
    }

    watcherPollRef.current = setInterval(pollForNotifications, 3000)

    return () => {
      if (watcherPollRef.current) {
        clearInterval(watcherPollRef.current)
        watcherPollRef.current = null
      }
    }
  }, [isWatcherActive])

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watcherPollRef.current) {
        clearInterval(watcherPollRef.current)
      }
      if (watcherPathRef.current) {
        workflowFetch(`/api/workflow/watch/stop?path=${encodeURIComponent(watcherPathRef.current)}`, {
          method: 'DELETE',
        }).catch(() => {})
      }
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  /**
   * Reset the entire wizard state to start over.
   */
  const reset = useCallback(() => {
    setDetection(null)
    setSelectedPreset(null)
    setConfig(defaultConfig())
    setPreview(null)
    setApplyResult(null)
    setStatus(null)
    setCompliance(null)
    setError(null)
  }, [])

  return {
    detection,
    presets,
    selectedPreset,
    config,
    preview,
    applyResult,
    status,
    compliance,
    modules,
    isDetecting,
    isPreviewing,
    isApplying,
    error,
    watcherNotifications,
    isWatcherActive,
    detect,
    loadPresets,
    loadModules,
    selectPreset,
    savePreset,
    deletePreset,
    updateConfig,
    toggleModule,
    setQualityMode,
    generatePreview,
    applyWorkflow,
    checkStatus,
    scanCompliance,
    clearError,
    reset,
    startWatcher,
    stopWatcher,
    dismissWatcherNotification,
  }
}

/**
 * Returns a sensible default workflow configuration.
 * Matches the Go DefaultConfig() in internal/workflow/types.go.
 */
function defaultConfig() {
  return {
    projectName: '',
    qualityMode: 'best',
    enabledModules: [
      'copilot-instructions',
      'branching-strategy',
      'code-quality',
      'testing-standards',
      'pr-workflow',
      'documentation',
      'code-tutor',
      'multi-agent',
    ],
    conflictStrategy: 'skip',
    tutorAutoNotify: true,
    tutorDefaultDepth: 'standard',
  }
}
