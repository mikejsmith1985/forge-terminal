import { useState, useCallback, useEffect, useRef } from 'react'
import { API_CONFIG } from '../config'

const STORAGE_KEY = 'forge-tutor-session'
const AUTH_TOKEN_KEY = 'forge-auth-token'
const WATCHER_POLL_MS = 3000
const ERROR_DISMISS_MS = 5000

/**
 * Fetch wrapper for tutor API calls.
 * Prepends the configured API base, sets JSON content type,
 * and attaches the auth token when available.
 */
const tutorFetch = async (url, options = {}) => {
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
 * React hook for managing Code Tutor sessions.
 *
 * Provides full lifecycle management — creating, loading, navigating,
 * explaining files, updating settings, polling for watcher notifications,
 * and running the Change Wizard for post-edit walkthroughs.
 *
 * @returns {{
 *   session: object|null,
 *   explanation: object|null,
 *   isLoading: boolean,
 *   isExplaining: boolean,
 *   error: string|null,
 *   notifications: Array,
 *   sessions: Array,
 *   wizardChanges: Array,
 *   wizardStepIndex: number,
 *   isWizardMode: boolean,
 *   hasCheckedForChanges: boolean,
 *   isFetchingChanges: boolean,
 *   changeExplanation: object|null,
 *   isExplainingChange: boolean,
 *   createSession: (projectPath: string, mode?: string) => Promise<void>,
 *   loadSession: (sessionId: string) => Promise<void>,
 *   deleteSession: (sessionId: string) => Promise<void>,
 *   advance: () => Promise<void>,
 *   goBack: () => Promise<void>,
 *   goToFile: (index: number) => Promise<void>,
 *   skipFile: () => Promise<void>,
 *   explain: () => Promise<void>,
 *   updateSettings: (settings: object) => Promise<void>,
 *   clearError: () => void,
 *   dismissNotification: (index: number) => void,
 *   listSessions: () => Promise<void>,
 *   fetchRecentChanges: (projectPath: string) => Promise<void>,
 *   explainChange: (filePath: string, diff: string) => Promise<void>,
 *   exitWizardMode: () => void,
 *   wizardAdvance: () => void,
 *   wizardGoBack: () => void,
 *   wizardSkip: () => void,
 * }}
 */
export function useTutorSession() {
  const [session, setSession] = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExplaining, setIsExplaining] = useState(false)
  const [error, setError] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [sessions, setSessions] = useState([])

  // Wizard mode — shown when recent git changes are detected.
  // Replaces the full file-tree view with a focused step-by-step walkthrough.
  const [wizardChanges, setWizardChanges] = useState([])
  const [wizardStepIndex, setWizardStepIndex] = useState(0)
  const [isWizardMode, setIsWizardMode] = useState(false)
  const [hasCheckedForChanges, setHasCheckedForChanges] = useState(false)
  const [isFetchingChanges, setIsFetchingChanges] = useState(false)
  const [changeExplanation, setChangeExplanation] = useState(null)
  const [isExplainingChange, setIsExplainingChange] = useState(false)
  const [explanationError, setExplanationError] = useState(null)

  const errorTimerRef = useRef(null)
  const pollingRef = useRef(null)

  // ---------------------------------------------------------------------------
  // Error helpers
  // ---------------------------------------------------------------------------

  const setTimedError = useCallback((message) => {
    setError(message)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_DISMISS_MS)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Session CRUD
  // ---------------------------------------------------------------------------

  const loadSession = useCallback(async (sessionId) => {
    setIsLoading(true)
    // Reset wizard state when loading a different session so the wizard
    // re-checks for changes against the new project.
    setHasCheckedForChanges(false)
    setIsWizardMode(false)
    setWizardChanges([])
    setWizardStepIndex(0)
    setChangeExplanation(null)
    try {
      const data = await tutorFetch(`/api/tutor/sessions/${sessionId}`)
      setSession(data)
      localStorage.setItem(STORAGE_KEY, sessionId)
    } catch (err) {
      console.error('[TutorSession] loadSession error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  const createSession = useCallback(async (projectPath, mode = 'on_demand') => {
    setIsLoading(true)
    // Reset wizard so it runs fresh for the new project.
    setHasCheckedForChanges(false)
    setIsWizardMode(false)
    setWizardChanges([])
    setWizardStepIndex(0)
    setChangeExplanation(null)
    try {
      const data = await tutorFetch('/api/tutor/sessions', {
        method: 'POST',
        body: JSON.stringify({ projectPath, mode }),
      })
      setSession(data)
      setExplanation(null)
      localStorage.setItem(STORAGE_KEY, data.id)
    } catch (err) {
      console.error('[TutorSession] createSession error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  const deleteSession = useCallback(async (sessionId) => {
    setIsLoading(true)
    try {
      await tutorFetch(`/api/tutor/sessions?id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (session?.id === sessionId) {
        setSession(null)
        setExplanation(null)
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (err) {
      console.error('[TutorSession] deleteSession error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [session?.id, setTimedError])

  const listSessions = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await tutorFetch('/api/tutor/sessions')
      setSessions(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('[TutorSession] listSessions error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setTimedError])

  // ---------------------------------------------------------------------------
  // Navigation (regular file-tree mode)
  // ---------------------------------------------------------------------------

  const navigate = useCallback(async (action, index) => {
    if (!session) return
    setIsLoading(true)
    try {
      const body = { sessionId: session.id, action }
      if (index !== undefined) body.index = index
      const data = await tutorFetch('/api/tutor/navigate', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setSession(data)
      setExplanation(null)
    } catch (err) {
      console.error('[TutorSession] navigate error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [session, setTimedError])

  const advance = useCallback(() => navigate('next'), [navigate])
  const goBack = useCallback(() => navigate('prev'), [navigate])
  const goToFile = useCallback((index) => navigate('goto', index), [navigate])
  const skipFile = useCallback(() => navigate('skip'), [navigate])

  // ---------------------------------------------------------------------------
  // Explanation (regular file mode)
  // ---------------------------------------------------------------------------

  const explain = useCallback(async () => {
    if (!session) return
    setIsExplaining(true)
    try {
      const data = await tutorFetch('/api/tutor/explain', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id }),
      })
      setExplanation(data)
    } catch (err) {
      console.error('[TutorSession] explain error:', err)
      setTimedError(err.message)
    } finally {
      setIsExplaining(false)
    }
  }, [session, setTimedError])

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const updateSettings = useCallback(async (settings) => {
    if (!session) return
    setIsLoading(true)
    try {
      await tutorFetch('/api/tutor/settings', {
        method: 'PUT',
        body: JSON.stringify({ sessionId: session.id, settings }),
      })
      setSession((prev) => prev ? { ...prev, settings: { ...prev.settings, ...settings } } : prev)
    } catch (err) {
      console.error('[TutorSession] updateSettings error:', err)
      setTimedError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [session, setTimedError])

  // ---------------------------------------------------------------------------
  // Notifications (from file watcher)
  // ---------------------------------------------------------------------------

  const dismissNotification = useCallback((index) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ---------------------------------------------------------------------------
  // Wizard mode — Change Walkthrough
  // ---------------------------------------------------------------------------

  /**
   * Queries git for recently changed files and enters wizard mode if any are found.
   * Marks hasCheckedForChanges=true after running so we don't re-check on every render.
   */
  const fetchRecentChanges = useCallback(async (projectPath) => {
    if (!projectPath) return
    setIsFetchingChanges(true)
    try {
      const data = await tutorFetch(
        `/api/tutor/recent-changes?projectPath=${encodeURIComponent(projectPath)}`
      )
      if (data?.files?.length > 0) {
        setWizardChanges(data.files)
        setWizardStepIndex(0)
        setIsWizardMode(true)
        setChangeExplanation(null)
      }
    } catch (err) {
      // Non-fatal — wizard simply won't activate if git is unavailable.
      console.error('[TutorSession] fetchRecentChanges error:', err)
    } finally {
      setIsFetchingChanges(false)
      setHasCheckedForChanges(true)
    }
  }, [])

  /**
   * Generates a diff-aware explanation for a specific changed file.
   * Uses the /api/tutor/explain-change endpoint which focuses the LLM
   * on what changed and why, rather than describing the file generally.
   */
  const explainChange = useCallback(async (filePath, diff) => {
    if (!session) return
    setIsExplainingChange(true)
    setChangeExplanation(null)
    setExplanationError(null)
    try {
      const data = await tutorFetch('/api/tutor/explain-change', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id, filePath, diff }),
      })
      setChangeExplanation(data)
    } catch (err) {
      console.error('[TutorSession] explainChange error:', err)
      setExplanationError(err.message || 'Failed to generate explanation')
      setTimedError(err.message)
    } finally {
      setIsExplainingChange(false)
    }
  }, [session, setTimedError])

  /** Exits wizard mode and returns to the full file-tree view. */
  const exitWizardMode = useCallback(() => {
    setIsWizardMode(false)
    setWizardChanges([])
    setWizardStepIndex(0)
    setChangeExplanation(null)
  }, [])

  /** Advances to the next wizard step, clearing the current explanation. */
  const wizardAdvance = useCallback(() => {
    setWizardStepIndex((prev) => {
      const nextIndex = prev + 1
      if (nextIndex >= wizardChanges.length) {
        // All steps done — exit wizard and return to browse mode.
        setIsWizardMode(false)
        setWizardChanges([])
        setChangeExplanation(null)
        return 0
      }
      setChangeExplanation(null)
      return nextIndex
    })
  }, [wizardChanges.length])

  /** Goes back one wizard step, clearing the current explanation. */
  const wizardGoBack = useCallback(() => {
    setWizardStepIndex((prev) => {
      if (prev <= 0) return 0
      setChangeExplanation(null)
      return prev - 1
    })
  }, [])

  /** Skips the current wizard file without marking it as understood. */
  const wizardSkip = useCallback(() => {
    wizardAdvance()
  }, [wizardAdvance])

  // ---------------------------------------------------------------------------
  // Watcher polling (active only when liveMode is enabled)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    if (!session?.id || !session?.settings?.liveMode) return

    const poll = async () => {
      try {
        const data = await tutorFetch(
          `/api/tutor/watcher?sessionId=${encodeURIComponent(session.id)}`
        )
        // Backend returns an array of WatcherNotification objects
        if (Array.isArray(data) && data.length > 0) {
          setNotifications((prev) => [...prev, ...data])
          // Re-check for changes when the watcher detects edits,
          // but only if the wizard is not already active.
          if (!isWizardMode && session.projectPath) {
            setHasCheckedForChanges(false)
          }
        }
      } catch (err) {
        console.error('[TutorSession] watcher poll error:', err)
      }
    }

    pollingRef.current = setInterval(poll, WATCHER_POLL_MS)
    return () => {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [session?.id, session?.settings?.liveMode, isWizardMode, session?.projectPath])

  // ---------------------------------------------------------------------------
  // Restore last active session on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY)
    if (savedId) {
      loadSession(savedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  return {
    // Regular session state
    session,
    explanation,
    isLoading,
    isExplaining,
    error,
    notifications,
    sessions,

    // Wizard state
    wizardChanges,
    wizardStepIndex,
    isWizardMode,
    hasCheckedForChanges,
    isFetchingChanges,
    changeExplanation,
    isExplainingChange,
    explanationError,

    // Regular session actions
    createSession,
    loadSession,
    deleteSession,
    advance,
    goBack,
    goToFile,
    skipFile,
    explain,
    updateSettings,
    clearError,
    dismissNotification,
    listSessions,

    // Wizard actions
    fetchRecentChanges,
    explainChange,
    exitWizardMode,
    wizardAdvance,
    wizardGoBack,
    wizardSkip,
  }
}