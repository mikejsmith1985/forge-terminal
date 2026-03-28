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

export function MobileInputBar({ onSubmit, onSpecialKey }) {
  const [input, setInput] = useState('')
  const [ctrlActive, setCtrlActive] = useState(false)
  const [pasteError, setPasteError] = useState(false)
  const inputRef = useRef(null)

  const submit = (text) => {
    if (!text) return
    if (ctrlActive) {
      onSpecialKey(`Ctrl+${text}`)
      setCtrlActive(false)
    } else {
      onSubmit(text)
    }
    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit(input)
    }
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
        onSubmit(text)
        setPasteError(false)
      }
    } catch {
      // Clipboard API not available or permission denied — fall back to
      // focusing the input so the user can trigger the native paste menu
      setPasteError(true)
      inputRef.current?.focus()
      setTimeout(() => setPasteError(false), 2000)
    }
  }

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
        <input
          ref={inputRef}
          type="text"
          className="mobile-command-input"
          placeholder={ctrlActive ? 'Ctrl+? (type letter)' : 'Type command…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
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
