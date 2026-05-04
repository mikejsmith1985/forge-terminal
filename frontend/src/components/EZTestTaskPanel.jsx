/**
 * EZTestTaskPanel.jsx — Live task-status panel for the EZTest ↔ Forge integration.
 *
 * Shows all tasks currently tracked by the Forge MCP TaskBroker — bug reports,
 * test requests, and code-fix requests submitted by EZTest (or any MCP client).
 * Tasks auto-refresh every 5 seconds while the panel is open.
 *
 * Each task card shows:
 *   - Status badge (pending / running / done / failed) with distinct colours
 *   - Type badge (bug-report / test-request / code-fix)
 *   - Source label (eztest-mcp, copilot-chat, etc.)
 *   - Relative submission time
 *   - First 120 characters of the payload, expandable on click
 *   - Task UUID (click to copy)
 */

import { useState, useCallback } from 'react';
import { FlaskConical, RefreshCw, X, ChevronDown, ChevronUp, Copy, Check, AlertCircle } from 'lucide-react';
import { useEZTestTasks } from '../hooks/useEZTestTasks';
import './EZTestTaskPanel.css';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum characters shown in the collapsed payload preview. */
const PAYLOAD_PREVIEW_MAX_CHARS = 120;

/** How long (ms) the "Copied!" confirmation stays visible after copying a task ID. */
const COPY_CONFIRM_DISPLAY_MS = 1500;

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * Renders a coloured pill badge for a task status value.
 * The colour communicates urgency at a glance:
 *   - yellow → pending (waiting for agent to pick up)
 *   - blue   → running (agent actively working)
 *   - green  → done
 *   - red    → failed
 */
function StatusBadge({ status }) {
  return (
    <span className={`eztest-badge eztest-badge--status eztest-badge--${status}`}>
      {status}
    </span>
  );
}

/**
 * Renders a grey pill badge for the task type (bug-report, test-request, etc.).
 * Normalises the type string to title-case for display.
 */
function TypeBadge({ taskType }) {
  const displayLabel = taskType.replace(/-/g, ' ');
  return (
    <span className="eztest-badge eztest-badge--type">
      {displayLabel}
    </span>
  );
}

/**
 * Formats a UTC ISO timestamp as a human-readable relative time string
 * (e.g., "just now", "2 min ago", "1 hr ago").
 *
 * @param {string} isoTimestamp - UTC timestamp in ISO 8601 format.
 * @returns {string} Human-readable relative time.
 */
function formatRelativeTime(isoTimestamp) {
  const submittedAt = new Date(isoTimestamp);
  const elapsedSeconds = Math.floor((Date.now() - submittedAt.getTime()) / 1000);

  if (elapsedSeconds < 10) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;

  return submittedAt.toLocaleDateString();
}

/**
 * A single task card. Shows summary info collapsed; expands to show the
 * full payload markdown on click. The task ID can be copied to clipboard.
 */
function TaskCard({ task }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const hasLongPayload = task.payload.length > PAYLOAD_PREVIEW_MAX_CHARS;
  const payloadPreview = hasLongPayload
    ? task.payload.slice(0, PAYLOAD_PREVIEW_MAX_CHARS) + '…'
    : task.payload;

  const handleCopyTaskId = useCallback(async (clickEvent) => {
    clickEvent.stopPropagation();
    try {
      await navigator.clipboard.writeText(task.id);
      setHasCopiedId(true);
      setTimeout(() => setHasCopiedId(false), COPY_CONFIRM_DISPLAY_MS);
    } catch {
      // Clipboard API unavailable — silently ignore.
    }
  }, [task.id]);

  return (
    <div className={`eztest-task-card eztest-task-card--${task.status}`}>
      {/* ── Card header row ── */}
      <div className="eztest-task-card__header">
        <div className="eztest-task-card__badges">
          <StatusBadge status={task.status} />
          <TypeBadge taskType={task.type} />
        </div>
        <span className="eztest-task-card__time">
          {formatRelativeTime(task.submittedAt)}
        </span>
      </div>

      {/* ── Source label + task ID row ── */}
      <div className="eztest-task-card__meta">
        <span className="eztest-task-card__source">{task.source}</span>
        <button
          className="eztest-task-card__id-btn"
          onClick={handleCopyTaskId}
          title="Copy task ID"
          aria-label="Copy task ID to clipboard"
        >
          <code>{task.id.slice(0, 8)}</code>
          {hasCopiedId ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>

      {/* ── Payload preview (expandable) ── */}
      <div
        className="eztest-task-card__payload"
        onClick={() => hasLongPayload && setIsExpanded(prev => !prev)}
        role={hasLongPayload ? 'button' : undefined}
        aria-expanded={hasLongPayload ? isExpanded : undefined}
        tabIndex={hasLongPayload ? 0 : undefined}
        onKeyDown={(keyEvent) => {
          if (hasLongPayload && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
            setIsExpanded(prev => !prev);
          }
        }}
      >
        <pre className="eztest-task-card__payload-text">
          {isExpanded ? task.payload : payloadPreview}
        </pre>
        {hasLongPayload && (
          <span className="eztest-task-card__expand-hint">
            {isExpanded
              ? <><ChevronUp size={12} /> collapse</>
              : <><ChevronDown size={12} /> show full payload</>
            }
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Panel Component ──────────────────────────────────────────────────────

/**
 * EZTestTaskPanel — the top-level panel component.
 *
 * @param {boolean}  isOpen   - Whether the panel is currently visible.
 * @param {Function} onClose  - Callback to close the panel.
 */
function EZTestTaskPanel({ isOpen, onClose }) {
  const { tasks, isLoading, error, refresh } = useEZTestTasks(isOpen);

  if (!isOpen) return null;

  return (
    <div className="eztest-panel" role="dialog" aria-label="EZTest Tasks">
      {/* ── Panel header ── */}
      <div className="eztest-panel__header">
        <div className="eztest-panel__title">
          <FlaskConical size={16} />
          <span>EZTest Tasks</span>
          {tasks.length > 0 && (
            <span className="eztest-panel__count">{tasks.length}</span>
          )}
        </div>
        <div className="eztest-panel__actions">
          <button
            className="eztest-panel__action-btn"
            onClick={refresh}
            title="Refresh"
            aria-label="Refresh task list"
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'eztest-spin' : ''} />
          </button>
          <button
            className="eztest-panel__action-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close EZTest panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Panel body ── */}
      <div className="eztest-panel__body">
        {/* Error state — shown when the polling fetch fails */}
        {error && (
          <div className="eztest-panel__error">
            <AlertCircle size={14} />
            <span>Could not load tasks: {error}</span>
          </div>
        )}

        {/* Empty state — shown when there are no tasks yet */}
        {!error && tasks.length === 0 && !isLoading && (
          <div className="eztest-panel__empty">
            <FlaskConical size={32} className="eztest-panel__empty-icon" />
            <p className="eztest-panel__empty-title">No tasks yet</p>
            <p className="eztest-panel__empty-hint">
              When EZTest sends a bug report to Forge, it will appear here.
            </p>
          </div>
        )}

        {/* Task list */}
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export default EZTestTaskPanel;
