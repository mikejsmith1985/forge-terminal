import { useState, useRef } from 'react'
import '../styles/mobile-input.css'

const SPECIAL_KEYS = [
  { label: 'Tab', key: 'Tab' },
  { label: 'Esc', key: 'Escape' },
  { label: 'Ctrl', key: 'Ctrl', toggle: true },
  { label: '↑', key: 'ArrowUp', ariaLabel: 'up' },
  { label: '↓', key: 'ArrowDown', ariaLabel: 'down' },
  { label: '←', key: 'ArrowLeft', ariaLabel: 'left' },
  { label: '→', key: 'ArrowRight', ariaLabel: 'right' },
  { label: 'Ctrl+C', key: 'Ctrl+c', ariaLabel: 'sigint' },
  { label: 'Ctrl+D', key: 'Ctrl+d', ariaLabel: 'eof' },
]

export function MobileInputBar({ onSubmit, onSpecialKey, onImageUpload }) {
  const [input, setInput] = useState('')
  const [ctrlActive, setCtrlActive] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [pasteError, setPasteError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const submit = (text) => {
    if (!text) return
    if (ctrlActive && text.length === 1) {
      onSpecialKey(`Ctrl+${text}`)
      setCtrlActive(false)
    } else {
      if (ctrlActive) setCtrlActive(false)
      onSubmit(text)
    }
    setInput('')
    setExpanded(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
    // Shift+Enter in textarea inserts newline (default behavior)
  }

  const handleSpecialKey = (keyDef) => {
    if (keyDef.toggle) {
      setCtrlActive(!ctrlActive)
      return
    }
    onSpecialKey(keyDef.key)
    inputRef.current?.focus()
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        // For long text, put it in the input field rather than sending immediately
        if (text.length > 200) {
          setInput(text)
          setExpanded(true)
          setPasteError(false)
        } else {
          onSubmit(text)
          setPasteError(false)
        }
      }
    } catch {
      setPasteError(true)
      inputRef.current?.focus()
      setTimeout(() => setPasteError(false), 2000)
    }
  }

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/files/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      const filePath = data.path || data.filePath || file.name
      // Inject file reference into terminal (same pattern as desktop image paste)
      if (onImageUpload) {
        onImageUpload(filePath)
      } else {
        onSubmit(`see file at ${filePath}`)
      }
    } catch (err) {
      console.error('[MobileInput] Image upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Toggle expanded textarea for long prompts
  const toggleExpand = () => {
    setExpanded(!expanded)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const InputComponent = expanded ? 'textarea' : 'input'
  const inputProps = expanded
    ? { rows: 4, className: 'mobile-command-input mobile-command-textarea' }
    : { type: 'text', className: 'mobile-command-input' }

  return (
    <div className="mobile-input-bar">
      <div className="mobile-special-keys">
        {SPECIAL_KEYS.map((keyDef) => (
          <button
            key={keyDef.key}
            className={`mobile-special-key ${keyDef.toggle && ctrlActive ? 'active' : ''}`}
            onClick={() => handleSpecialKey(keyDef)}
            aria-label={keyDef.ariaLabel || keyDef.label.toLowerCase()}
          >
            {keyDef.label}
          </button>
        ))}
      </div>
      <div className="mobile-input-row">
        <button
          className={`mobile-paste-btn ${pasteError ? 'error' : ''}`}
          onClick={handlePaste}
          aria-label="paste from clipboard"
          title={pasteError ? 'Long-press input to paste' : 'Paste clipboard'}
        >
          {pasteError ? '⚠' : '⎘'}
        </button>
        <button
          className="mobile-expand-btn"
          onClick={toggleExpand}
          aria-label={expanded ? 'collapse input' : 'expand for long input'}
          title={expanded ? 'Single line' : 'Multi-line (long prompts)'}
        >
          {expanded ? '▾' : '▴'}
        </button>
        <InputComponent
          ref={inputRef}
          {...inputProps}
          placeholder={ctrlActive ? 'Ctrl+? (type letter)' : expanded ? 'Type long prompt… (Shift+Enter for newline)' : 'Type command…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="mobile-image-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="attach image"
          title="Upload image/file"
          disabled={uploading}
        >
          {uploading ? '⏳' : '📷'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.txt,.env,.json,.yaml,.yml,.toml,.xml,.csv,.log"
          style={{ display: 'none' }}
          onChange={handleImagePick}
        />
        <button
          className="mobile-send-btn"
          onClick={() => submit(input)}
          aria-label="send command"
          disabled={!input}
        >
          ↵
        </button>
      </div>
    </div>
  )
}
