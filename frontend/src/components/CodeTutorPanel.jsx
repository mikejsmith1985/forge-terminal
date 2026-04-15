import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  BookOpen, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Play, SkipForward, Check, Folder, FileText, Loader, AlertCircle, Eye, Power
} from 'lucide-react'
import { useAPI } from '../hooks/useAPI'
import { useTutorSession } from '../hooks/useTutorSession'

// ── Category display metadata ──────────────────────────────────────────────────
const CATEGORY_META = {
  Config:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  Types:    { color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  Utils:    { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  Core:     { color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  Handlers: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  UI:       { color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
  Tests:    { color: '#facc15', bg: 'rgba(250,204,21,0.15)' },
  Docs:     { color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
}

const STATUS_ICONS = {
  reviewed: '✅',
  current:  '🔵',
  pending:  '⬜',
  skipped:  '⏭️',
}

const CATEGORY_ORDER = ['Config', 'Types', 'Utils', 'Core', 'Handlers', 'UI', 'Tests', 'Docs']

// ── Inline style definitions ───────────────────────────────────────────────────
const colors = {
  base:       '#1a1a2e',
  panel:      '#16213e',
  accent:     '#00d4ff',
  text:       '#e0e0e0',
  textDim:    '#888',
  error:      '#ef4444',
  warning:    '#facc15',
  trackBg:    '#333',
  codeBg:     '#0d1117',
  hoverBg:    'rgba(0,212,255,0.08)',
  activeBg:   'rgba(0,212,255,0.15)',
  border:     'rgba(255,255,255,0.08)',
  borderLight:'rgba(255,255,255,0.12)',
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 999,
  },
  drawer: (isOpen) => ({
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: 500,
    background: colors.base,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: colors.textDim,
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.15s',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px',
    background: colors.panel,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.textDim,
    whiteSpace: 'nowrap',
  },
  progressTrack: {
    flex: 1,
    height: 3,
    background: colors.trackBg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: colors.accent,
    borderRadius: 2,
    transition: 'width 0.4s ease',
  }),
  modeBadge: (isLive) => ({
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 10,
    background: isLive ? 'rgba(34,197,94,0.2)' : 'rgba(0,212,255,0.15)',
    color: isLive ? '#22c55e' : colors.accent,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }),
  contentArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  // ── Session creation ─────────────────
  sessionPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    overflowY: 'auto',
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 4,
  },
  sessionSub: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 340,
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    background: colors.panel,
    color: colors.text,
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  primaryBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    background: colors.accent,
    color: '#000',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    background: 'transparent',
    color: colors.text,
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background 0.15s',
  },
  modeToggle: {
    display: 'flex',
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    overflow: 'hidden',
    marginTop: 4,
  },
  modeToggleBtn: (active) => ({
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    border: 'none',
    cursor: 'pointer',
    background: active ? colors.accent : 'transparent',
    color: active ? '#000' : colors.textDim,
    transition: 'all 0.15s',
  }),
  sessionListLabel: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop: 12,
    alignSelf: 'flex-start',
    maxWidth: 340,
    width: '100%',
  },
  sessionItem: {
    width: '100%',
    maxWidth: 340,
    padding: '8px 12px',
    borderRadius: 6,
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
  // ── File tree ────────────────────────
  fileTree: {
    width: 180,
    borderRight: `1px solid ${colors.border}`,
    overflowY: 'auto',
    overflowX: 'hidden',
    flexShrink: 0,
    background: colors.panel,
    fontSize: 11,
  },
  categoryHeader: {
    padding: '6px 10px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.textDim,
    userSelect: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  fileEntry: (isCurrent) => ({
    padding: '4px 10px 4px 18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: isCurrent ? colors.activeBg : 'transparent',
    borderLeft: isCurrent ? `2px solid ${colors.accent}` : '2px solid transparent',
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  fileStatusIcon: {
    flexShrink: 0,
    fontSize: 10,
    width: 16,
    textAlign: 'center',
  },
  fileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: 11,
  },
  categoryBadge: (cat) => {
    const meta = CATEGORY_META[cat] || CATEGORY_META.Docs
    return {
      fontSize: 8,
      fontWeight: 600,
      padding: '1px 5px',
      borderRadius: 8,
      background: meta.bg,
      color: meta.color,
      flexShrink: 0,
      marginLeft: 'auto',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }
  },
  // ── Code viewer ──────────────────────
  codeArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  codeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    fontSize: 12,
    color: colors.textDim,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    flexShrink: 0,
  },
  codeScroll: {
    flex: 1,
    overflow: 'auto',
    background: colors.codeBg,
  },
  codePre: {
    margin: 0,
    padding: '12px 0',
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
    minWidth: 'fit-content',
  },
  codeLine: (isHighlight) => ({
    display: 'flex',
    padding: '0 12px 0 0',
    background: isHighlight ? 'rgba(0,212,255,0.06)' : 'transparent',
  }),
  lineNumber: {
    display: 'inline-block',
    width: 44,
    textAlign: 'right',
    paddingRight: 12,
    color: '#555',
    userSelect: 'none',
    flexShrink: 0,
  },
  lineContent: {
    whiteSpace: 'pre',
    flex: 1,
  },
  // ── Explanation ──────────────────────
  explainArea: {
    borderTop: `1px solid ${colors.border}`,
    maxHeight: 260,
    overflowY: 'auto',
    background: colors.panel,
    flexShrink: 0,
  },
  explainBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    margin: '10px 12px',
    borderRadius: 6,
    border: `1px solid ${colors.accent}`,
    background: 'transparent',
    color: colors.accent,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  sectionToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: `1px solid ${colors.border}`,
    textAlign: 'left',
  },
  sectionContent: {
    padding: '8px 12px 12px',
    fontSize: 12,
    lineHeight: 1.6,
    color: colors.textDim,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  // ── Bottom nav ───────────────────────
  bottomBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderTop: `1px solid ${colors.border}`,
    background: colors.panel,
    flexShrink: 0,
  },
  navBtn: (disabled) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    background: 'transparent',
    color: disabled ? '#555' : colors.text,
    fontSize: 12,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s',
  }),
  advanceBtn: (disabled) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: disabled ? '#333' : colors.accent,
    color: disabled ? '#666' : '#000',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'opacity 0.15s',
  }),
  questionInput: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.base,
    color: colors.text,
    fontSize: 12,
    outline: 'none',
    marginLeft: 'auto',
  },
  // ── Banners ──────────────────────────
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: 'rgba(239,68,68,0.12)',
    borderBottom: '1px solid rgba(239,68,68,0.25)',
    color: colors.error,
    fontSize: 12,
    flexShrink: 0,
  },
  notifBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: 'rgba(250,204,21,0.1)',
    borderBottom: '1px solid rgba(250,204,21,0.2)',
    color: colors.warning,
    fontSize: 12,
    flexShrink: 0,
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: colors.textDim,
    fontSize: 13,
    gap: 8,
  },
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CodeTutorPanel({ isOpen, onClose, onDisableFeature, onToast, activeDirectory }) {
  const {
    session, explanation, isLoading, isExplaining, error, notifications, sessions,
    createSession, loadSession, deleteSession, advance, goBack, goToFile,
    skipFile, explain, updateSettings, clearError, dismissNotification, listSessions,
  } = useTutorSession()

  const { readFile } = useAPI()

  // ── Local state ────────────────────────────────────────────────
  const [projectPath, setProjectPath] = useState('')
  const [liveMode, setLiveMode] = useState(false)
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState({})
  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [errorVisible, setErrorVisible] = useState(false)

  const codeScrollRef = useRef(null)
  const errorTimerRef = useRef(null)

  // Escape key closes the panel
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey, { capture: true })
    return () => document.removeEventListener('keydown', handleKey, { capture: true })
  }, [isOpen, onClose])

  // Seed project path from active tab's working directory
  useEffect(() => {
    if (isOpen && activeDirectory && !session) {
      setProjectPath(activeDirectory)
    }
  }, [isOpen, activeDirectory, session])

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

  // ── Fetch file content on navigation ──────────────────────────
  useEffect(() => {
    if (!currentFile || !session) return
    let cancelled = false

    const fetchFile = async () => {
      setFileLoading(true)
      setFileContent(null)
      try {
        const resp = await readFile(currentFile.path, session.projectPath || '.')
        if (!cancelled) {
          setFileContent(resp.content ?? resp.data ?? '')
        }
      } catch {
        if (!cancelled) setFileContent('// Failed to load file contents')
      } finally {
        if (!cancelled) setFileLoading(false)
      }
    }

    fetchFile()
    return () => { cancelled = true }
  }, [currentFile?.path, session?.projectPath, readFile, currentFile, session])

  // Reset code scroll on file change
  useEffect(() => {
    if (codeScrollRef.current) codeScrollRef.current.scrollTop = 0
  }, [currentFile?.path])

  // ── Error auto-dismiss ─────────────────────────────────────────
  useEffect(() => {
    if (error) {
      setErrorVisible(true)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => {
        setErrorVisible(false)
        clearError()
      }, 5000)
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [error, clearError])

  // ── Load sessions list when panel opens with no session ────────
  useEffect(() => {
    if (isOpen && !session && listSessions) {
      listSessions()
    }
  }, [isOpen, session, listSessions])

  // ── Handlers ───────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    if (!projectPath.trim()) return
    createSession(projectPath.trim(), liveMode ? 'live' : 'on_demand')
  }, [projectPath, liveMode, createSession])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleCreate()
  }, [handleCreate])

  const toggleSection = useCallback((title) => {
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }))
  }, [])

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

  // ── Render helpers ─────────────────────────────────────────────
  const renderFileTree = () => (
    <div style={styles.fileTree}>
      {CATEGORY_ORDER.map((cat) => {
        const items = groupedFiles[cat]
        if (!items || items.length === 0) return null
        const collapsed = !!collapsedCategories[cat]
        return (
          <div key={cat}>
            <div
              style={styles.categoryHeader}
              onClick={() => toggleCategory(cat)}
            >
              {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              {cat}
              <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{items.length}</span>
            </div>
            {!collapsed && items.map((f) => {
              const status = progress[f.path] || 'pending'
              const isCurrent = f._idx === currentIndex
              return (
                <div
                  key={f.path}
                  style={styles.fileEntry(isCurrent)}
                  onClick={() => goToFile(f._idx)}
                  title={f.path}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = colors.hoverBg
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={styles.fileStatusIcon}>{STATUS_ICONS[status]}</span>
                  <span style={styles.fileName}>{f.path.split('/').pop()}</span>
                  <span style={styles.categoryBadge(f.category)}>{f.category}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  const renderCodeViewer = () => {
    const lines = typeof fileContent === 'string' ? fileContent.split('\n') : []
    return (
      <div style={styles.codeArea}>
        <div style={styles.codeHeader}>
          <FileText size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentFile ? currentFile.path : 'No file selected'}
          </span>
          {currentFile && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textDim }}>
              {currentFile.lineCount ? `${currentFile.lineCount} lines` : ''}
              {currentFile.complexity ? ` · ${currentFile.complexity}` : ''}
            </span>
          )}
        </div>
        <div style={styles.codeScroll} ref={codeScrollRef}>
          {fileLoading ? (
            <div style={styles.placeholder}>
              <Loader size={20} style={styles.spinner} />
              <span>Loading file…</span>
            </div>
          ) : !fileContent && !currentFile ? (
            <div style={styles.placeholder}>
              <BookOpen size={28} strokeWidth={1.5} />
              <span>Select a file to begin</span>
            </div>
          ) : (
            <pre style={styles.codePre}>
              {lines.map((line, i) => (
                <div key={i} style={styles.codeLine(false)}>
                  <span style={styles.lineNumber}>{i + 1}</span>
                  <span style={styles.lineContent}>{line}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    )
  }

  const renderExplanation = () => {
    const sections = explanation?.sections || []
    return (
      <div style={styles.explainArea}>
        {!explanation && !isExplaining && (
          <button
            style={styles.explainBtn}
            onClick={explain}
            disabled={!currentFile || isExplaining}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Eye size={14} />
            Explain This File
          </button>
        )}
        {isExplaining && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', color: colors.textDim, fontSize: 12 }}>
            <Loader size={14} style={styles.spinner} />
            Generating explanation…
          </div>
        )}
        {sections.map((sec) => {
          const open = expandedSections[sec.title] !== false
          return (
            <div key={sec.title}>
              <button style={styles.sectionToggle} onClick={() => toggleSection(sec.title)}>
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {sec.title}
              </button>
              {open && <div style={styles.sectionContent}>{sec.content}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  const renderSessionCreation = () => (
    <div style={styles.sessionPane}>
      <BookOpen size={36} strokeWidth={1.5} color={colors.accent} />
      <div style={styles.sessionTitle}>Code Tutor</div>
      <div style={styles.sessionSub}>
        Learn any codebase file-by-file with guided explanations.
      </div>

      {activeDirectory ? (
        <div style={{ ...styles.input, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9 }}>
          <Folder size={14} color={colors.accent} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectPath || activeDirectory}
          </span>
        </div>
      ) : (
        <input
          style={styles.input}
          type="text"
          placeholder="Project path (e.g. ./my-project)"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(e) => { e.target.style.borderColor = colors.accent }}
          onBlur={(e) => { e.target.style.borderColor = colors.borderLight }}
        />
      )}

      <div style={styles.modeToggle}>
        <button
          style={styles.modeToggleBtn(!liveMode)}
          onClick={() => setLiveMode(false)}
        >
          On Demand
        </button>
        <button
          style={styles.modeToggleBtn(liveMode)}
          onClick={() => setLiveMode(true)}
        >
          Live
        </button>
      </div>

      <button
        style={{ ...styles.primaryBtn, opacity: projectPath.trim() ? 1 : 0.5 }}
        onClick={handleCreate}
        disabled={!projectPath.trim() || isLoading}
      >
        {isLoading ? <Loader size={14} style={styles.spinner} /> : <Play size={14} />}
        Start Learning
      </button>

      {sessions && sessions.length > 0 && (
        <>
          <div style={styles.sessionListLabel}>Previous Sessions</div>
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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.projectPath || s.id}
                </span>
              </div>
              <button
                style={{ ...styles.closeBtn, fontSize: 10 }}
                onClick={(e) => handleDeleteSession(e, s.id)}
                title="Delete session"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const renderNotificationBanner = () => {
    if (!notifications || notifications.length === 0) return null
    const notif = notifications[0]
    const modifiedCount = notif.files?.length || 0
    return (
      <div style={styles.notifBanner}>
        <AlertCircle size={14} />
        <span style={{ flex: 1 }}>
          {modifiedCount} file{modifiedCount !== 1 ? 's' : ''} modified — want a walkthrough?
        </span>
        <button
          style={{ ...styles.secondaryBtn, padding: '3px 10px', borderColor: 'rgba(250,204,21,0.3)', color: colors.warning }}
          onClick={() => {
            if (notif.files?.length) goToFile(0)
            dismissNotification(0)
          }}
        >
          View Changes
        </button>
        <button
          style={{ ...styles.closeBtn, color: colors.warning }}
          onClick={() => dismissNotification(0)}
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────
  const hasSession = !!session && files.length > 0

  return (
    <>
      {isOpen && <div style={styles.overlay} onClick={onClose} />}
      <div style={styles.drawer(isOpen)}>
        {/* Spinner keyframes — injected once */}
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.title}>📖 Code Tutor</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onDisableFeature && (
              <button
                style={styles.closeBtn}
                onClick={onDisableFeature}
                title="Disable Code Tutor"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = colors.textDim; e.currentTarget.style.background = 'none' }}
              >
                <Power size={16} />
              </button>
            )}
            <button
              style={styles.closeBtn}
              onClick={onClose}
              title="Close (Esc)"
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = colors.textDim; e.currentTarget.style.background = 'none' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Progress bar (only when session active) */}
        {hasSession && (
          <div style={styles.progressRow}>
            <span style={styles.progressLabel}>
              {reviewedCount}/{files.length} files
            </span>
            <div style={styles.progressTrack}>
              <div style={styles.progressFill(progressPct)} />
            </div>
            <button
              style={{
                ...styles.modeBadge(isLive),
                cursor: 'pointer',
                border: `1px solid ${isLive ? 'rgba(34,197,94,0.4)' : 'rgba(0,212,255,0.3)'}`,
              }}
              onClick={handleModeToggle}
              title={isLive ? 'Switch to On Demand mode' : 'Switch to Live mode'}
              disabled={isLoading}
            >
              {isLive ? '● Live' : '○ On Demand'}
            </button>
          </div>
        )}

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

        {/* Notification banner */}
        {hasSession && renderNotificationBanner()}

        {/* Main content */}
        {hasSession ? (
          <>
            <div style={styles.contentArea}>
              {renderFileTree()}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {renderCodeViewer()}
                {currentFile && renderExplanation()}
              </div>
            </div>

            {/* Bottom navigation */}
            <div style={styles.bottomBar}>
              <button
                style={styles.navBtn(currentIndex <= 0)}
                onClick={goBack}
                disabled={currentIndex <= 0}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                style={styles.navBtn(!currentFile)}
                onClick={skipFile}
                disabled={!currentFile}
              >
                <SkipForward size={14} /> Skip
              </button>
              <button
                style={styles.advanceBtn(!currentFile)}
                onClick={advance}
                disabled={!currentFile}
              >
                <Check size={14} /> Next
              </button>
              <input
                style={styles.questionInput}
                type="text"
                placeholder="Ask a question… (coming soon)"
                disabled
              />
            </div>
          </>
        ) : (
          renderSessionCreation()
        )}
      </div>
    </>
  )
}
