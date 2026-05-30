// ToggleCardFooter renders the two-button footer for an on/off toggle command
// card: a Start button that launches a service and a Stop button that tears it
// down. The last-clicked side stays highlighted so the user can see which
// action they last triggered. The highlight is intentionally in-memory only —
// Forge cannot verify whether the underlying process is actually running, so
// persisting an "on" state across restarts would risk showing a false signal.
import React, { useState } from 'react'
import { Play, Square } from 'lucide-react'

// Default button labels, overridable via the card's toggle.onLabel/offLabel.
const DEFAULT_ON_LABEL = 'Start'
const DEFAULT_OFF_LABEL = 'Stop'

/**
 * ToggleCardFooter wires the start/stop buttons to the existing execution
 * pipeline. It does NOT execute commands itself — it synthesizes the right
 * command object for each side and hands it to onExecute (App.jsx's
 * handleExecute), which already owns terminal dispatch and the Zero-Click
 * macro injection. This is why a toggle card needed no backend changes.
 *
 * @param {object} command - the toggle command card; top-level fields are the
 *   "on" action and command.toggle holds the "off" action + labels.
 * @param {function} onExecute - runs a command object in the active terminal.
 */
export default function ToggleCardFooter({ command, onExecute }) {
  // Which side was last triggered: 'on', 'off', or null before any click.
  const [activeSide, setActiveSide] = useState(null)

  const toggle = command.toggle || {}
  const onLabel = toggle.onLabel || DEFAULT_ON_LABEL
  const offLabel = toggle.offLabel || DEFAULT_OFF_LABEL

  // Start reuses the card's top-level fields as the "on" action — handleExecute
  // reads command/delay/macro_payload/macro_delay directly off this object.
  const handleStart = () => {
    setActiveSide('on')
    onExecute(command)
  }

  // Stop maps the toggle's off-* fields onto the snake_case names handleExecute
  // expects, so the teardown reuses the identical run + macro pipeline as start.
  const handleStop = () => {
    setActiveSide('off')
    onExecute({
      ...command,
      command: toggle.offCommand,
      delay: toggle.offDelay,
      macro_payload: toggle.offMacroPayload,
      macro_delay: toggle.offMacroDelay,
    })
  }

  return (
    <div className="card-footer card-footer-toggle">
      <button
        className={`btn-action btn-toggle-on ${activeSide === 'on' ? 'active' : ''}`}
        onClick={handleStart}
        title="Start / launch this service"
      >
        <Play size={14} /> {onLabel}
      </button>
      <button
        className={`btn-action btn-toggle-off ${activeSide === 'off' ? 'active' : ''}`}
        onClick={handleStop}
        title="Stop / tear down this service"
      >
        <Square size={14} /> {offLabel}
      </button>
    </div>
  )
}
