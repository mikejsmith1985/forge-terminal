import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  BookOpen, X, ChevronRight, ChevronDown,
  Play, SkipForward, Check, Folder, FileText, Loader, AlertCircle,
  MessageSquare, Zap, ArrowRight, List, Maximize2
} from 'lucide-react'
import { useAPI } from '../hooks/useAPI'
import { useTutorSession } from '../hooks/useTutorSession'

// Minimum gap between automatic LLM explain calls; prevents call storms during rapid file saves.
const AUTO_EXPLAIN_COOLDOWN_MS = 15_000

// ── Color palette ──────────────────────────────────────────────────────────────
const colors = {
  base:        '#0f1123',
  panel:       '#16213e',
  panelLight:  '#1c2a4a',
  accent:      '#00d4ff',
  accentDim:   'rgba(0,212,255,0.12)',
  text:        '#e8e8f0',
  textDim:     '#8892a4',
  error:       '#ef4444',
  warning:     '#facc15',
  success:     '#22c55e',
  purple:      '#c084fc',
  purpleDim:   'rgba(192,132,252,0.12)',
  trackBg:     '#2a2a3e',
  border:      'rgba(255,255,255,0.07)',
  borderLight: 'rgba(255,255,255,0.12)',
  hoverBg:     'rgba(0,212,255,0.06)',
  activeBg:    'rgba(0,212,255,0.12)',
}

// ── Inline style definitions ───────────────────────────────────────────────────
const styles = {
  // Full-screen backdrop — terminal stays fully interactive behind the modal
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  // Centered modal — feels like a focused workspace, not a side panel
  modal: {
    width: 'min(980px, 96vw)',
    height: 'min(88vh, 920px)',
    background: colors.base,
    borderRadius: 16,
    border: `1px solid ${colors.borderLight}`,
    boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: colors.text,
  },
  // ── Header ─────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '13px 20px',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '0.02em',
    flex: 1,
  },
  modeBadge: (isLive) => ({
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 10,
    background: isLive ? 'rgba(34,197,94,0.15)' : colors.accentDim,
    color: isLive ? colors.success : colors.accent,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(0,212,255,0.25)'}`,
  }),
  headerBtn: {
    background: 'none',
    border: `1px solid ${colors.border}`,
    color: colors.textDim,
    cursor: 'pointer',
    padding: '5px 12px',
    borderRadius: 6,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: colors.textDim,
    cursor: 'pointer',
    padding: 6,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
  // ── Progress row ────────────────────────────────────────────────
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 20px',
    background: colors.panel,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  progressLabel: { fontSize: 11, color: colors.textDim, whiteSpace: 'nowrap' },
  progressTrack: { flex: 1, height: 2, background: colors.trackBg, borderRadius: 2, overflow: 'hidden' },
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: `linear-gradient(90deg, ${colors.accent}, ${colors.success})`,
    borderRadius: 2,
    transition: 'width 0.4s ease',
  }),
  // ── Changed-file pill strip (wizard mode) ───────────────────────
  filePillStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 20px',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    overflowX: 'auto',
    flexShrink: 0,
    scrollbarWidth: 'none',
  },
  filePillLabel: {
    fontSize: 11,
    color: colors.textDim,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  filePill: (isActive) => ({
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    background: isActive ? colors.accentDim : 'rgba(255,255,255,0.05)',
    color: isActive ? colors.accent : colors.textDim,
    border: `1px solid ${isActive ? 'rgba(0,212,255,0.4)' : colors.border}`,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  }),
  // ── Wizard scroll area ──────────────────────────────────────────
  wizardScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px 12px',
  },
  wizardFileHeading: {
    fontSize: 20,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  wizardFileSub: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 20,
    lineHeight: 1.5,
  },
  // ── Section cards (wizard mode — full-width, not collapsible) ───
  sectionCard: {
    marginBottom: 16,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    overflow: 'hidden',
  },
  sectionCardHeader: {
    padding: '9px 16px',
    fontSize: 10,
    fontWeight: 700,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    background: colors.panelLight,
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionCardBody: {
    padding: '14px 16px',
    fontSize: 13,
    lineHeight: 1.75,
    color: colors.text,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  // ── Q&A answer card ─────────────────────────────────────────────
  questionAnswerCard: {
    marginBottom: 20,
    borderRadius: 10,
    border: `1px solid rgba(0,212,255,0.3)`,
    background: 'rgba(0,212,255,0.03)',
    overflow: 'hidden',
  },
  questionBubble: {
    padding: '11px 16px',
    borderBottom: `1px solid rgba(0,212,255,0.15)`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(0,212,255,0.07)',
  },
  questionBubbleText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.accent,
    flex: 1,
  },
  // ── Wizard footer ────────────────────────────────────────────────
  wizardFooter: {
    borderTop: `1px solid ${colors.border}`,
    background: colors.panel,
    padding: '12px 20px',
    flexShrink: 0,
  },
  questionRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  },
  questionInput: {
    flex: 1,
    padding: '9px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.panelLight,
    color: colors.text,
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  sendBtn: (isEnabled) => ({
    padding: '9px 16px',
    borderRadius: 8,
    border: 'none',
    background: colors.accent,
    color: '#000',
    fontSize: 13,
    fontWeight: 700,
    cursor: isEnabled ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    opacity: isEnabled ? 1 : 0.4,
    transition: 'opacity 0.15s',
  }),
  footerActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  diveDeepBtn: {
    padding: '7px 14px',
    borderRadius: 7,
    border: `1px solid rgba(192,132,252,0.4)`,
    background: colors.purpleDim,
    color: colors.purple,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  skipBtn: {
    padding: '7px 14px',
    borderRadius: 7,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.textDim,
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  nextBtn: (isDisabled) => ({
    padding: '7px 18px',
    borderRadius: 7,
    border: 'none',
    background: isDisabled ? '#2a2a3e' : colors.accent,
    color: isDisabled ? '#555' : '#000',
    fontSize: 12,
    fontWeight: 700,
    cursor: isDisabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'all 0.15s',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  }),
  // ── Browse mode ─────────────────────────────────────────────────
  contentArea: { display: 'flex', flex: 1, overflow: 'hidden' },
  browseFileList: {
    width: 220,
    borderRight: `1px solid ${colors.border}`,
    overflowY: 'auto',
    background: colors.panel,
    flexShrink: 0,
  },
  browseCategoryHeader: {
    padding: '8px 12px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: colors.textDim,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    borderBottom: `1px solid ${colors.border}`,
  },
  browseFileEntry: (isCurrent) => ({
    padding: '6px 12px 6px 20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: isCurrent ? colors.activeBg : 'transparent',
    borderLeft: `3px solid ${isCurrent ? colors.accent : 'transparent'}`,
    transition: 'background 0.1s',
  }),
  browseFileName: {
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  browseExplainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  browseExplainScroll: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  browseActions: {
    borderTop: `1px solid ${colors.border}`,
    padding: '10px 16px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    background: colors.panel,
    flexShrink: 0,
  },
  browseQuestionInput: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: 7,
    border: `1px solid ${colors.border}`,
    background: colors.panelLight,
    color: colors.text,
    fontSize: 12,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  // ── Session creation ─────────────────────────────────────────────
  sessionPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    overflowY: 'auto',
  },
  sessionTitle: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sessionSub: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 12,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 1.55,
  },
  input: {
    width: '100%',
    maxWidth: 420,
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.borderLight}`,
    background: colors.panel,
    color: colors.text,
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  primaryBtn: {
    padding: '10px 24px',
    borderRadius: 8,
    border: 'none',
    background: colors.accent,
    color: '#000',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    padding: '8px 16px',
    borderRadius: 7,
    border: `1px solid ${colors.borderLight}`,
    background: 'transparent',
    color: colors.text,
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  modeToggle: {
    display: 'flex',
    borderRadius: 7,
    border: `1px solid ${colors.borderLight}`,
    overflow: 'hidden',
    marginTop: 4,
  },
  modeToggleBtn: (isActive) => ({
    padding: '7px 18px',
    fontSize: 12,
    fontWeight: isActive ? 700 : 400,
    border: 'none',
    cursor: 'pointer',
    background: isActive ? colors.accent : 'transparent',
    color: isActive ? '#000' : colors.textDim,
    transition: 'all 0.15s',
  }),
  sessionListLabel: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop: 12,
    alignSelf: 'flex-start',
    maxWidth: 420,
    width: '100%',
  },
  sessionItem: {
    width: '100%',
    maxWidth: 420,
    padding: '9px 14px',
    borderRadius: 7,
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    color: colors.text,
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'border-color 0.15s',
  },
  // ── Shared ───────────────────────────────────────────────────────
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    background: 'rgba(239,68,68,0.1)',
    borderBottom: '1px solid rgba(239,68,68,0.2)',
    color: colors.error,
    fontSize: 12,
    flexShrink: 0,
  },
  spinner: { animation: 'spin 1s linear infinite' },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: colors.textDim,
    fontSize: 13,
    gap: 10,
  },
  categoryBadge: (cat) => {
    const meta = CATEGORY_META[cat] || CATEGORY_META.Docs
    return {
      fontSize: 8,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 8,
      background: meta.bg,
      color: meta.color,
      flexShrink: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }
  },
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * CodeTutorPanel — "Learn As You Build" fullscreen wizard experience.
 *
 * Two visual modes:
 *   - Wizard: auto-triggered when the watcher detects file changes; opens with the
 *     explanation already loaded, shows only the changed files as pills, and offers
 *     an inline Q&A interface so the user can ask follow-up questions.
 *   - Browse: manually opened; full file list on the left, explanation on the right.
 *
 * @param {boolean}  isOpen          — whether the panel is visible
 * @param {function} onClose         — called when the user dismisses the panel
 * @param {function} onToast         — called with (message, type, duration) for app toasts
 * @param {string}   activeDirectory — CWD of the foreground terminal tab
 * @param {function} onAutoExplain   — called with (filePath) when auto-explain completes
 */
export default function CodeTutorPanel({ isOpen, onClose, onToast, activeDirectory, onAutoExplain }) {
  const {
    session, explanation, isLoading, isExplaining, error, notifications, sessions,
    questionAnswer, isAsking,
    createSession, loadSession, deleteSession, advance, goBack, goToFile,
    skipFile, explain, askQuestion, clearQuestionAnswer,
    updateSettings, clearError, dismissNotification, listSessions,
  } = useTutorSession()

  // readFile is kept for potential future code-preview feature in browse mode
  const { readFile } = useAPI()   // eslint-disable-line no-unused-vars

  // ── Local state ────────────────────────────────────────────────
  const [projectPath, setProjectPath] = useState('')
  const [liveMode, setLiveMode] = useState(true)
  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [errorVisible, setErrorVisible] = useState(false)
  const [questionText, setQuestionText] = useState('')
  // 'wizard' = auto-triggered by file changes; 'browse' = manually opened
  const [displayMode, setDisplayMode] = useState('browse')
  // Paths of files that triggered the current wizard session
  const [wizardChangedFiles, setWizardChangedFiles] = useState([])

  const errorTimerRef = useRef(null)
  // Automation refs: cooldown, auto-explain origin, last auto-created directory
  const autoExplainCooldownRef = useRef(0)
  const wasAutoExplainRef = useRef(false)
  const lastAutoCreatedDirectoryRef = useRef(null)
  const prevNotificationsLengthRef = useRef(0)

  // Reset to browse mode when the panel closes so manual reopens start clean
  useEffect(() => {
    if (!isOpen) {
      setDisplayMode('browse')
      setQuestionText('')
    }
  }, [isOpen])

  // Escape key closes the panel
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKey, { capture: true })
    return () => document.removeEventListener('keydown', handleKey, { capture: true })
  }, [isOpen, onClose])

  // Pre-fill project path from the active tab's working directory
  useEffect(() => {
    if (isOpen && activeDirectory && !session) setProjectPath(activeDirectory)
  }, [isOpen, activeDirectory, session])

  // Auto-create or resume a live session when the active directory changes.
  // Debounced 400ms to avoid redundant API calls during rapid tab switching.
  useEffect(() => {
    if (!activeDirectory) return
    if (lastAutoCreatedDirectoryRef.current === activeDirectory) return
    lastAutoCreatedDirectoryRef.current = activeDirectory
    const debounceTimer = setTimeout(() => createSession(activeDirectory, 'live'), 400)
    return () => clearTimeout(debounceTimer)
  }, [activeDirectory, createSession])

  // Auto-explain the current file when the watcher reports new file changes.
  // A 15-second cooldown prevents LLM call storms during rapid successive saves.
  useEffect(() => {
    if (notifications.length <= prevNotificationsLengthRef.current) {
      prevNotificationsLengthRef.current = notifications.length
      return
    }
    prevNotificationsLengthRef.current = notifications.length
    if (!session || isExplaining) return

    const now = Date.now()
    if (now - autoExplainCooldownRef.current < AUTO_EXPLAIN_COOLDOWN_MS) return

    // Capture which files changed so the wizard pill strip shows them
    const latestNotification = notifications[notifications.length - 1]
    if (latestNotification?.files?.length) {
      setWizardChangedFiles(latestNotification.files.map((f) => f.path))
    }

    autoExplainCooldownRef.current = now
    wasAutoExplainRef.current = true
    explain()
  }, [notifications, session, isExplaining, explain])

  // When auto-explain completes: switch to wizard mode and notify the parent
  // so it can open the panel and surface a toast.
  useEffect(() => {
    if (!explanation || !wasAutoExplainRef.current) return
    wasAutoExplainRef.current = false
    const changedFilename = currentFile?.path || 'changed file'
    setDisplayMode('wizard')
    clearQuestionAnswer?.()
    onAutoExplain?.(changedFilename)
  }, [explanation, onAutoExplain, currentFile, clearQuestionAnswer])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ───────────────────────────────────────────────
  const files = session?.learningPath?.files || []
  const progress = session?.progress || {}
  const currentIndex = session?.currentIndex ?? -1
  const currentFile = files[currentIndex] || null
  const settings = session?.settings || {}
  const isLive = settings.liveMode || false

  const reviewedCount = useMemo(() => {
    return Object.values(progress).filter((s) => s === 'reviewed').length
  }, [progress])

  const progressPct = files.length > 0 ? (reviewedCount / files.length) * 100 : 0

  const groupedFiles = useMemo(() => {
    const groups = {}
    for (const cat of CATEGORY_ORDER) groups[cat] = []
    files.forEach((f, idx) => {
      const cat = CATEGORY_ORDER.includes(f.category) ? f.category : 'Docs'
      groups[cat].push({ ...f, _idx: idx })
    })
    return groups
  }, [files])

  // ── Error auto-dismiss ─────────────────────────────────────────
  useEffect(() => {
    if (error) {
      setErrorVisible(true)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => { setErrorVisible(false); clearError() }, 5000)
    }
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }
  }, [error, clearError])

  // Load session list when the panel opens with no active session
  useEffect(() => {
    if (isOpen && !session && listSessions) listSessions()
  }, [isOpen, session, listSessions])

  // ── Handlers ───────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (!projectPath.trim()) return
    createSession(projectPath.trim(), liveMode ? 'live' : 'on_demand')
  }, [projectPath, liveMode, createSession])

  const handlePathKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleCreate()
  }, [handleCreate])

  const toggleCategory = useCallback((cat) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }, [])

  const handleDeleteSession = useCallback((e, sid) => {
    e.stopPropagation()
    deleteSession(sid)
  }, [deleteSession])

  const handleModeToggle = useCallback(() => {
    updateSettings({ liveMode: !isLive })
  }, [updateSettings, isLive])

  /** Re-explains at maximum depth so the user gets a line-by-line walkthrough. */
  const handleDiveDeeper = useCallback(() => {
    clearQuestionAnswer?.()
    updateSettings({ depth: 'deep' })
    explain()
  }, [updateSettings, explain, clearQuestionAnswer])

  /** Posts the typed question to the backend and shows the answer in-place. */
  const handleAskQuestion = useCallback(() => {
    if (!questionText.trim() || !askQuestion) return
    askQuestion(questionText.trim())
    setQuestionText('')
  }, [questionText, askQuestion])

  const handleQuestionKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskQuestion() }
  }, [handleAskQuestion])

  /** Marks the current file as reviewed and advances to the next one. */
  const handleGotIt = useCallback(() => {
    clearQuestionAnswer?.()
    advance()
  }, [advance, clearQuestionAnswer])

  /** Finds the learning-path index for a file path from a watcher notification. */
  const findFileIndexByPath = useCallback((changedFilePath) => {
    const basename = changedFilePath.split(/[/\\]/).pop()
    return files.findIndex((f) => {
      const fBasename = f.path.split(/[/\\]/).pop()
      return f.path === changedFilePath || fBasename === basename
    })
  }, [files])

  const handleWizardPillClick = useCallback((changedFilePath) => {
    const fileIndex = findFileIndexByPath(changedFilePath)
    if (fileIndex >= 0) {
      clearQuestionAnswer?.()
      goToFile(fileIndex)
    }
  }, [findFileIndexByPath, goToFile, clearQuestionAnswer])

  // ── Shared render helpers ──────────────────────────────────────

  /** Renders explanation sections as full-width readable cards (not collapsible). */
  const renderSectionCards = (sections) => (
    <>
      {sections.map((sec) => (
        <div key={sec.title} style={styles.sectionCard}>
          <div style={styles.sectionCardHeader}>{sec.title}</div>
          <div style={styles.sectionCardBody}>{sec.content}</div>
        </div>
      ))}
    </>
  )

  /** Renders the Q&A answer card with a dismiss button. */
  const renderQuestionAnswer = () => {
    if (!isAsking && !questionAnswer) return null
    return (
      <div style={styles.questionAnswerCard}>
        <div style={styles.questionBubble}>
          <MessageSquare size={14} color={colors.accent} />
          <span style={styles.questionBubbleText}>
            {isAsking ? 'Thinking…' : 'Your question'}
          </span>
          {questionAnswer && (
            <button
              style={{ ...styles.closeBtn, padding: 3 }}
              onClick={clearQuestionAnswer}
              title="Back to file overview"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {isAsking ? (
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: colors.textDim, fontSize: 12 }}>
            <Loader size={14} style={styles.spinner} /> Generating answer…
          </div>
        ) : (
          renderSectionCards(questionAnswer?.sections || [])
        )}
      </div>
    )
  }

  // ── Render: Shared header ──────────────────────────────────────
  const renderHeader = () => (
    <div style={styles.header}>
      <BookOpen size={17} color={colors.accent} />
      <span style={styles.headerTitle}>📖 Code Tutor</span>
      {session && (
        <button style={styles.modeBadge(isLive)} onClick={handleModeToggle} title="Toggle live/on-demand mode">
          {isLive ? '● Live' : '○ On Demand'}
        </button>
      )}
      {session && displayMode === 'wizard' && (
        <button
          style={styles.headerBtn}
          onClick={() => setDisplayMode('browse')}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.hoverBg; e.currentTarget.style.color = colors.text }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textDim }}
        >
          <List size={13} /> Browse All Files
        </button>
      )}
      {session && displayMode === 'browse' && explanation && (
        <button
          style={styles.headerBtn}
          onClick={() => setDisplayMode('wizard')}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.hoverBg; e.currentTarget.style.color = colors.text }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textDim }}
        >
          <Maximize2 size={13} /> Wizard View
        </button>
      )}
      <button
        style={styles.closeBtn}
        onClick={onClose}
        title="Close (Esc)"
        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.textDim; e.currentTarget.style.background = 'none' }}
      >
        <X size={18} />
      </button>
    </div>
  )

  // ── Render: Wizard mode ─────────────────────────────────────────

  const renderChangedFilePills = () => {
    if (!wizardChangedFiles.length) return null
    return (
      <div style={styles.filePillStrip}>
        <span style={styles.filePillLabel}>Changed:</span>
        {wizardChangedFiles.map((changedPath) => {
          const basename = changedPath.split(/[/\\]/).pop()
          const fileIndex = findFileIndexByPath(changedPath)
          const isCurrentPill = fileIndex === currentIndex
          return (
            <button
              key={changedPath}
              style={styles.filePill(isCurrentPill)}
              onClick={() => handleWizardPillClick(changedPath)}
              title={changedPath}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isCurrentPill ? colors.accent : colors.textDim, flexShrink: 0 }} />
              {basename}
            </button>
          )
        })}
      </div>
    )
  }

  const renderWizardFooter = () => {
    if (!currentFile) return null
    return (
      <div style={styles.wizardFooter}>
        <div style={styles.questionRow}>
          <input
            style={styles.questionInput}
            type="text"
            placeholder="Ask something about this file… (Enter to send)"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            onKeyDown={handleQuestionKeyDown}
            onFocus={(e) => { e.target.style.borderColor = colors.accent }}
            onBlur={(e) => { e.target.style.borderColor = colors.border }}
            disabled={isAsking}
          />
          <button
            style={styles.sendBtn(questionText.trim() && !isAsking)}
            onClick={handleAskQuestion}
            disabled={!questionText.trim() || isAsking}
            title="Send question"
          >
            {isAsking ? <Loader size={14} style={styles.spinner} /> : <ArrowRight size={14} />}
          </button>
        </div>
        <div style={styles.footerActions}>
          <button
            style={styles.diveDeepBtn}
            onClick={handleDiveDeeper}
            disabled={isExplaining || isAsking}
            title="Re-explain at maximum technical depth"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,132,252,0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.purpleDim }}
          >
            <Zap size={13} /> Dive Deeper
          </button>
          <button
            style={styles.skipBtn}
            onClick={skipFile}
            title="Mark as skipped and move to next file"
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.hoverBg }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <SkipForward size={13} /> Skip
          </button>
          <button
            style={styles.nextBtn(!currentFile)}
            onClick={handleGotIt}
            disabled={!currentFile}
            title="Mark as reviewed and move to next file"
          >
            <Check size={13} /> Got it, Next File
          </button>
        </div>
      </div>
    )
  }

  const renderWizardContent = () => {
    const mainSections = explanation?.sections || []
    const isInQAMode = isAsking || !!questionAnswer

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={styles.wizardScrollArea}>
          {/* File identity heading */}
          <div style={styles.wizardFileHeading}>
            <FileText size={20} color={colors.accent} />
            {currentFile?.path?.split(/[/\\]/).pop() || '—'}
          </div>
          <div style={styles.wizardFileSub}>
            {currentFile?.path}
            {currentFile?.lineCount ? ` · ${currentFile.lineCount} lines` : ''}
            {currentFile?.category ? ` · ${currentFile.category}` : ''}
          </div>

          {/* Q&A mode: answer replaces main explanation */}
          {isInQAMode && renderQuestionAnswer()}

          {/* Main explanation: visible when not in Q&A mode */}
          {!isInQAMode && (
            isExplaining ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
                <Loader size={28} style={styles.spinner} color={colors.accent} />
                <span style={{ fontSize: 14, color: colors.textDim }}>Generating explanation…</span>
              </div>
            ) : mainSections.length > 0 ? (
              renderSectionCards(mainSections)
            ) : (
              <div style={styles.placeholder}>
                <BookOpen size={32} strokeWidth={1.5} />
                <span>Explanation loading…</span>
              </div>
            )
          )}
        </div>
        {renderWizardFooter()}
      </div>
    )
  }

  // ── Render: Browse mode ─────────────────────────────────────────

  const renderBrowseFileList = () => (
    <div style={styles.browseFileList}>
      {CATEGORY_ORDER.map((cat) => {
        const items = groupedFiles[cat]
        if (!items || items.length === 0) return null
        const isCollapsed = !!collapsedCategories[cat]
        return (
          <div key={cat}>
            <div style={styles.browseCategoryHeader} onClick={() => toggleCategory(cat)}>
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              {cat}
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 10 }}>{items.length}</span>
            </div>
            {!isCollapsed && items.map((f) => {
              const fileStatus = progress[f.path] || 'pending'
              const isCurrentFile = f._idx === currentIndex
              return (
                <div
                  key={f.path}
                  style={styles.browseFileEntry(isCurrentFile)}
                  onClick={() => goToFile(f._idx)}
                  title={f.path}
                  onMouseEnter={(e) => { if (!isCurrentFile) e.currentTarget.style.background = colors.hoverBg }}
                  onMouseLeave={(e) => { if (!isCurrentFile) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 10, flexShrink: 0 }}>{STATUS_ICONS[fileStatus]}</span>
                  <span style={styles.browseFileName}>{f.path.split(/[/\\]/).pop()}</span>
                  <span style={styles.categoryBadge(f.category)}>{f.category}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  const renderBrowseExplanation = () => {
    const mainSections = explanation?.sections || []
    return (
      <div style={styles.browseExplainArea}>
        <div style={styles.browseExplainScroll}>
          {currentFile && (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color={colors.accent} />
                {currentFile.path.split(/[/\\]/).pop()}
              </div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 18 }}>
                {currentFile.path}{currentFile.lineCount ? ` · ${currentFile.lineCount} lines` : ''}
              </div>
            </>
          )}

          {isExplaining ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textDim, fontSize: 13, padding: '16px 0' }}>
              <Loader size={16} style={styles.spinner} /> Generating explanation…
            </div>
          ) : mainSections.length > 0 ? (
            renderSectionCards(mainSections)
          ) : currentFile ? (
            <button
              style={{ ...styles.secondaryBtn, borderColor: colors.accent, color: colors.accent, marginTop: 8 }}
              onClick={explain}
              disabled={isExplaining}
            >
              Explain This File
            </button>
          ) : (
            <div style={styles.placeholder}>
              <BookOpen size={28} strokeWidth={1.5} />
              <span>Select a file from the list</span>
            </div>
          )}

          {/* Q&A answer (browse mode — appended below main explanation) */}
          {(isAsking || questionAnswer) && (
            <div style={{ marginTop: 20 }}>
              {renderQuestionAnswer()}
            </div>
          )}
        </div>

        {currentFile && (
          <div style={styles.browseActions}>
            <button
              style={styles.diveDeepBtn}
              onClick={handleDiveDeeper}
              disabled={isExplaining}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,132,252,0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.purpleDim }}
            >
              <Zap size={12} /> Dive Deeper
            </button>
            <input
              style={styles.browseQuestionInput}
              type="text"
              placeholder="Ask a question…"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              onKeyDown={handleQuestionKeyDown}
              onFocus={(e) => { e.target.style.borderColor = colors.accent }}
              onBlur={(e) => { e.target.style.borderColor = colors.border }}
              disabled={isAsking}
            />
            <button
              style={{ ...styles.sendBtn(questionText.trim() && !isAsking), padding: '6px 12px' }}
              onClick={handleAskQuestion}
              disabled={!questionText.trim() || isAsking}
            >
              {isAsking ? <Loader size={13} style={styles.spinner} /> : <ArrowRight size={13} />}
            </button>
            <button style={styles.skipBtn} onClick={skipFile}>
              <SkipForward size={12} /> Skip
            </button>
            <button style={styles.nextBtn(!currentFile)} onClick={handleGotIt}>
              <Check size={12} /> Next
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Render: Session setup ──────────────────────────────────────
  const renderSessionCreation = () => (
    <div style={styles.sessionPane}>
      <BookOpen size={44} strokeWidth={1.5} color={colors.accent} />
      <div style={styles.sessionTitle}>Code Tutor</div>
      <div style={styles.sessionSub}>
        Your AI coding guide. It watches your project for changes and explains what's
        happening in plain language — so you build and learn at the same time.
      </div>

      {activeDirectory ? (
        <div style={{ ...styles.input, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9, maxWidth: 420 }}>
          <Folder size={14} color={colors.accent} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectPath || activeDirectory}
          </span>
        </div>
      ) : (
        <input
          style={styles.input}
          type="text"
          placeholder="Project path (e.g. C:\Projects\my-app)"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          onKeyDown={handlePathKeyDown}
          onFocus={(e) => { e.target.style.borderColor = colors.accent }}
          onBlur={(e) => { e.target.style.borderColor = colors.borderLight }}
        />
      )}

      <div style={styles.modeToggle}>
        <button style={styles.modeToggleBtn(!liveMode)} onClick={() => setLiveMode(false)}>On Demand</button>
        <button style={styles.modeToggleBtn(liveMode)} onClick={() => setLiveMode(true)}>Live</button>
      </div>

      <button
        style={{ ...styles.primaryBtn, opacity: projectPath.trim() ? 1 : 0.45 }}
        onClick={handleCreate}
        disabled={!projectPath.trim() || isLoading}
      >
        {isLoading ? <Loader size={15} style={styles.spinner} /> : <Play size={15} />}
        Start Learning
      </button>

      {sessions && sessions.length > 0 && (
        <>
          <div style={styles.sessionListLabel}>Continue a Session</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={styles.sessionItem}
              onClick={() => loadSession(s.id)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accent }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <Folder size={13} color={colors.textDim} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {s.projectPath || s.id}
                </span>
              </div>
              <button
                style={{ ...styles.closeBtn, padding: 3 }}
                onClick={(e) => handleDeleteSession(e, s.id)}
                title="Remove session"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )

  // ── Main render ────────────────────────────────────────────────
  const hasSession = !!session && files.length > 0

  if (!isOpen) return null

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {/* Clicking the backdrop closes the panel */}
      <div style={styles.backdrop} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>

          {/* Error banner */}
          {errorVisible && error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={14} />
              <span style={{ flex: 1 }}>{error}</span>
              <button style={{ ...styles.closeBtn, color: colors.error }} onClick={() => { setErrorVisible(false); clearError() }}>
                <X size={14} />
              </button>
            </div>
          )}

          {hasSession ? (
            <>
              {renderHeader()}
              {/* Progress bar */}
              <div style={styles.progressRow}>
                <span style={styles.progressLabel}>{reviewedCount}/{files.length} files reviewed</span>
                <div style={styles.progressTrack}>
                  <div style={styles.progressFill(progressPct)} />
                </div>
              </div>

              {/* Wizard mode: changed-file pills + explanation-first layout */}
              {displayMode === 'wizard' && (
                <>
                  {renderChangedFilePills()}
                  {renderWizardContent()}
                </>
              )}

              {/* Browse mode: file list + explanation side-by-side */}
              {displayMode === 'browse' && (
                <div style={styles.contentArea}>
                  {renderBrowseFileList()}
                  {renderBrowseExplanation()}
                </div>
              )}
            </>
          ) : (
            <>
              {renderHeader()}
              {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
                  <Loader size={32} style={styles.spinner} color={colors.accent} />
                  <span style={{ fontSize: 14, color: colors.textDim }}>Scanning project…</span>
                </div>
              ) : (
                renderSessionCreation()
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
