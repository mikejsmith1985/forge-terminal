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
  const inputRef = useRef(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (ctrlActive && input.length > 0) {
        onSpecialKey(`Ctrl+${input}`)
        setCtrlActive(false)
      } else if (input) {
        onSubmit(input)
      }
      setInput('')
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
        <input
          ref={inputRef}
          type="text"
          className="mobile-command-input"
          placeholder="Type command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
