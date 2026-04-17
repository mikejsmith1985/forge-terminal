/**
 * ConnectionDiagnosticWizard.jsx
 *
 * Guides the user through diagnosing and fixing terminal connection failures.
 * Replaces the old feature-tour overlay with a problem-focused repair wizard.
 *
 * States:
 *   checking   → automatically runs /api/diagnostics/internal?ptyTest=true
 *   allClear   → all checks passed, terminal is ready
 *   issueFound → a specific problem was detected with a one-click fix available
 *   fixing     → applying the fix (clearing invalid working directory)
 *   verifying  → re-running diagnostics after the fix
 *   advanced   → fix didn't work; show manual troubleshooting steps
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Loader, Terminal, ChevronRight, X, RefreshCw, Wrench } from 'lucide-react';
import './ConnectionDiagnosticWizard.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const WIZARD_STATE = {
  CHECKING: 'checking',
  ALL_CLEAR: 'allClear',
  ISSUE_FOUND: 'issueFound',
  FIXING: 'fixing',
  VERIFYING: 'verifying',
  ADVANCED: 'advanced',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated spinner icon for in-progress states. */
const SpinnerIcon = () => (
  <Loader className="cdw-spin-icon" size={22} />
);

/** Shows a single diagnostic check row with pass/fail/pending status. */
const DiagnosticRow = ({ label, status, detail }) => {
  const iconMap = {
    pass:    <CheckCircle size={16} className="cdw-row-icon cdw-row-icon--pass" />,
    fail:    <XCircle    size={16} className="cdw-row-icon cdw-row-icon--fail" />,
    pending: <Loader     size={16} className="cdw-row-icon cdw-row-icon--pending cdw-spin-icon" />,
  };
  return (
    <div className={`cdw-diag-row cdw-diag-row--${status}`}>
      {iconMap[status]}
      <div className="cdw-diag-row-text">
        <span className="cdw-diag-row-label">{label}</span>
        {detail && <span className="cdw-diag-row-detail">{detail}</span>}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * ConnectionDiagnosticWizard
 *
 * @param {boolean}  isVisible        - Whether to render the wizard
 * @param {string}   triggerReason    - 'firstRun' | 'spawnFailed' | 'manual'
 * @param {function} onClose          - Called when user closes the wizard
 * @param {function} onOpenNewTerminal - Called to open a fresh terminal tab
 */
const ConnectionDiagnosticWizard = ({ isVisible, triggerReason, onClose, onOpenNewTerminal }) => {
  const [wizardState, setWizardState] = useState(WIZARD_STATE.CHECKING);
  const [diagnosticResults, setDiagnosticResults] = useState(null);
  const [detectedIssue, setDetectedIssue] = useState(null);
  const [isAnimatingIn, setIsAnimatingIn] = useState(true);

  // Reset and start checking every time the wizard becomes visible.
  useEffect(() => {
    if (!isVisible) return;
    setWizardState(WIZARD_STATE.CHECKING);
    setDiagnosticResults(null);
    setDetectedIssue(null);
    setIsAnimatingIn(true);
    const animationTimer = setTimeout(() => setIsAnimatingIn(false), 350);
    runDiagnostics();
    return () => clearTimeout(animationTimer);
  }, [isVisible]);

  // ── Diagnostics runner ─────────────────────────────────────────────────────

  const runDiagnostics = useCallback(async () => {
    setWizardState(WIZARD_STATE.CHECKING);
    try {
      const response = await fetch('/api/diagnostics/internal?ptyTest=true');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const results = await response.json();
      setDiagnosticResults(results);

      if (results.ok && (results.ptySpawnOk === null || results.ptySpawnOk === undefined || results.ptySpawnOk === true)) {
        setWizardState(WIZARD_STATE.ALL_CLEAR);
        return;
      }

      // Extract the most actionable issue to show the user.
      const issue = classifyIssue(results);
      setDetectedIssue(issue);
      setWizardState(WIZARD_STATE.ISSUE_FOUND);
    } catch (fetchError) {
      setDiagnosticResults({ ok: false, warnings: [`Could not reach the Forge server: ${fetchError.message}`] });
      setDetectedIssue({
        type: 'serverUnreachable',
        title: 'Cannot Reach the Forge Server',
        description: 'The Forge backend is not responding. It may have crashed or stopped.',
        fixLabel: null,
      });
      setWizardState(WIZARD_STATE.ISSUE_FOUND);
    }
  }, []);

  /**
   * Inspects the diagnostics payload and returns a structured issue description.
   * The most actionable (fixable) issue is returned so we can offer a one-click fix.
   */
  const classifyIssue = (results) => {
    // PTY spawn failed — most common cause of "terminals not connecting".
    if (results.ptySpawnOk === false) {
      const spawnError = results.ptySpawnError || '';

      // If the error message hints at a bad path, classify it as fixable.
      const isBadPathError = /directory|path|working|not exist|invalid/i.test(spawnError);
      if (isBadPathError) {
        return {
          type: 'badWorkingDirectory',
          title: 'Your Saved Startup Folder No Longer Exists',
          description:
            'Forge is trying to open your terminal in a folder that has been deleted, ' +
            'renamed, or moved to a different computer. This is the most common cause of ' +
            '"terminals not connecting."',
          badPath: extractBadPath(spawnError),
          fixLabel: 'Clear the Invalid Folder & Retry',
          fixable: true,
        };
      }

      return {
        type: 'ptySpawnFailed',
        title: 'Terminal Process Failed to Start',
        description: spawnError || 'The terminal shell process could not be started.',
        fixLabel: null,
        fixable: false,
      };
    }

    // Shell binary not found.
    if (!results.shellAvailable) {
      return {
        type: 'shellMissing',
        title: `Shell Not Found: ${results.shellFound || 'Unknown'}`,
        description:
          'Forge could not find the configured shell program on this machine. ' +
          'You can change the shell type in Settings.',
        fixLabel: null,
        fixable: false,
      };
    }

    // Generic warning from the diagnostics endpoint.
    if (results.warnings?.length > 0) {
      return {
        type: 'genericWarning',
        title: 'Potential Issue Detected',
        description: results.warnings[0],
        fixLabel: null,
        fixable: false,
      };
    }

    return {
      type: 'unknown',
      title: 'Unexpected Issue',
      description: 'Diagnostics returned an error but could not identify a specific cause.',
      fixLabel: null,
      fixable: false,
    };
  };

  /**
   * Tries to pull a folder path out of a spawn error message so we can
   * display the offending path to the user.
   */
  const extractBadPath = (errorMessage) => {
    const windowsPathMatch = errorMessage.match(/[A-Za-z]:\\[^\s"']+/);
    if (windowsPathMatch) return windowsPathMatch[0];
    const unixPathMatch = errorMessage.match(/\/[^\s"']+/);
    if (unixPathMatch) return unixPathMatch[0];
    return null;
  };

  // ── Fix: clear invalid working directory ──────────────────────────────────

  const applyWorkingDirectoryFix = useCallback(async () => {
    setWizardState(WIZARD_STATE.FIXING);
    try {
      // Load current config, wipe home path fields, then save.
      const configResponse = await fetch('/api/config');
      const currentConfig = await configResponse.json();
      const cleanedConfig = {
        ...currentConfig,
        psHomePath: '',
        cmdHomePath: '',
        wslHomePath: '',
      };
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedConfig),
      });

      // Re-run diagnostics to verify the fix worked.
      setWizardState(WIZARD_STATE.VERIFYING);
      const verifyResponse = await fetch('/api/diagnostics/internal?ptyTest=true');
      const verifyResults = await verifyResponse.json();
      setDiagnosticResults(verifyResults);

      if (verifyResults.ok && verifyResults.ptySpawnOk !== false) {
        setWizardState(WIZARD_STATE.ALL_CLEAR);
      } else {
        const remainingIssue = classifyIssue(verifyResults);
        setDetectedIssue(remainingIssue);
        setWizardState(WIZARD_STATE.ADVANCED);
      }
    } catch (fixError) {
      setWizardState(WIZARD_STATE.ADVANCED);
    }
  }, []);

  if (!isVisible) return null;

  // ── Header styling differs by context ─────────────────────────────────────

  const isErrorContext = triggerReason === 'spawnFailed' || wizardState === WIZARD_STATE.ISSUE_FOUND;
  const headerVariant = isErrorContext ? 'error' : 'info';

  return (
    <div className={`cdw-overlay ${isAnimatingIn ? 'cdw-overlay--entering' : ''}`}>
      {/* Backdrop — clicking it does NOT dismiss; user must make a choice */}
      <div className="cdw-backdrop" />

      <div className={`cdw-panel cdw-panel--${headerVariant}`}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={`cdw-header cdw-header--${headerVariant}`}>
          <div className="cdw-header-icon">
            {headerVariant === 'error'
              ? <AlertTriangle size={20} />
              : <Wrench size={20} />
            }
          </div>
          <div className="cdw-header-text">
            <span className="cdw-header-label">
              {headerVariant === 'error' ? 'Terminal Connection Problem' : 'Connection Setup'}
            </span>
            <span className="cdw-header-subtitle">
              This wizard will diagnose and fix the issue automatically
            </span>
          </div>
          <button
            className="cdw-close-btn"
            onClick={onClose}
            title="Dismiss (you can reopen this from Settings)"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body — varies by state ──────────────────────────────────────── */}
        <div className="cdw-body">
          {wizardState === WIZARD_STATE.CHECKING && <CheckingState />}
          {wizardState === WIZARD_STATE.ALL_CLEAR && (
            <AllClearState onOpenTerminal={onOpenNewTerminal} onClose={onClose} />
          )}
          {wizardState === WIZARD_STATE.ISSUE_FOUND && detectedIssue && (
            <IssueFoundState
              issue={detectedIssue}
              diagnosticResults={diagnosticResults}
              onApplyFix={applyWorkingDirectoryFix}
              onSkipFix={() => setWizardState(WIZARD_STATE.ADVANCED)}
              onClose={onClose}
            />
          )}
          {wizardState === WIZARD_STATE.FIXING && <FixingState />}
          {wizardState === WIZARD_STATE.VERIFYING && <VerifyingState />}
          {wizardState === WIZARD_STATE.ADVANCED && (
            <AdvancedState
              diagnosticResults={diagnosticResults}
              detectedIssue={detectedIssue}
              onRetry={runDiagnostics}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── State Screens ────────────────────────────────────────────────────────────

const CheckingState = () => (
  <div className="cdw-state cdw-state--checking">
    <SpinnerIcon />
    <h2 className="cdw-state-title">Running Connection Test…</h2>
    <p className="cdw-state-body">
      Checking your shell, working directory, and process spawn pipeline.
      This takes about 3 seconds.
    </p>
    <div className="cdw-diag-list">
      <DiagnosticRow label="Checking server health" status="pending" />
      <DiagnosticRow label="Checking shell availability" status="pending" />
      <DiagnosticRow label="Testing terminal spawn" status="pending" />
    </div>
  </div>
);

const AllClearState = ({ onOpenTerminal, onClose }) => (
  <div className="cdw-state cdw-state--success">
    <CheckCircle size={44} className="cdw-state-hero-icon cdw-state-hero-icon--success" />
    <h2 className="cdw-state-title">Everything Looks Good! 🎉</h2>
    <p className="cdw-state-body">
      Your terminal can connect successfully. Open a new terminal tab to get started.
    </p>
    <div className="cdw-diag-list">
      <DiagnosticRow label="Server reachable" status="pass" />
      <DiagnosticRow label="Shell available" status="pass" />
      <DiagnosticRow label="Terminal spawn test" status="pass" />
    </div>
    <div className="cdw-actions">
      <button className="cdw-btn cdw-btn--primary cdw-btn--large" onClick={onOpenTerminal}>
        <Terminal size={18} />
        Open Terminal
      </button>
      <button className="cdw-btn cdw-btn--ghost" onClick={onClose}>
        Dismiss
      </button>
    </div>
  </div>
);

const IssueFoundState = ({ issue, diagnosticResults, onApplyFix, onSkipFix, onClose }) => (
  <div className="cdw-state cdw-state--issue">

    {/* Problem banner */}
    <div className="cdw-issue-banner">
      <XCircle size={28} className="cdw-issue-banner-icon" />
      <div>
        <p className="cdw-issue-banner-title">{issue.title}</p>
        <p className="cdw-issue-banner-body">{issue.description}</p>
      </div>
    </div>

    {/* Show the bad path if we found one */}
    {issue.badPath && (
      <div className="cdw-bad-path-box">
        <span className="cdw-bad-path-label">Problematic path:</span>
        <code className="cdw-bad-path-value">{issue.badPath}</code>
      </div>
    )}

    {/* Raw diagnostics for context */}
    {diagnosticResults?.warnings?.length > 0 && (
      <div className="cdw-warnings-list">
        {diagnosticResults.warnings.map((warning, index) => (
          <div key={index} className="cdw-warning-item">
            <AlertTriangle size={14} className="cdw-warning-item-icon" />
            <span>{warning}</span>
          </div>
        ))}
      </div>
    )}

    <div className="cdw-actions">
      {issue.fixable ? (
        <>
          {/* Primary action: one-click fix */}
          <button className="cdw-btn cdw-btn--primary cdw-btn--large cdw-btn--fix" onClick={onApplyFix}>
            <Wrench size={18} />
            {issue.fixLabel}
          </button>
          <button className="cdw-btn cdw-btn--ghost" onClick={onSkipFix}>
            I'll Fix It Manually
          </button>
        </>
      ) : (
        <>
          <button className="cdw-btn cdw-btn--primary" onClick={onSkipFix}>
            See Troubleshooting Steps
            <ChevronRight size={16} />
          </button>
          <button className="cdw-btn cdw-btn--ghost" onClick={onClose}>
            Dismiss
          </button>
        </>
      )}
    </div>
  </div>
);

const FixingState = () => (
  <div className="cdw-state cdw-state--checking">
    <SpinnerIcon />
    <h2 className="cdw-state-title">Applying Fix…</h2>
    <p className="cdw-state-body">
      Clearing the invalid startup folder from your configuration.
    </p>
  </div>
);

const VerifyingState = () => (
  <div className="cdw-state cdw-state--checking">
    <SpinnerIcon />
    <h2 className="cdw-state-title">Verifying Fix…</h2>
    <p className="cdw-state-body">
      Re-running the terminal spawn test to confirm the fix worked.
    </p>
  </div>
);

const AdvancedState = ({ diagnosticResults, detectedIssue, onRetry, onClose }) => (
  <div className="cdw-state cdw-state--advanced">
    <h2 className="cdw-state-title">Manual Troubleshooting</h2>
    <p className="cdw-state-body">
      The automatic fix didn't fully resolve the issue. Here are the next steps:
    </p>

    <div className="cdw-steps-list">
      <div className="cdw-step">
        <span className="cdw-step-num">1</span>
        <div>
          <strong>Check your Home Directory setting</strong>
          <p>Open <kbd>Settings</kbd> (gear icon) → Shell Settings → clear the "Home Directory" field and save.</p>
        </div>
      </div>
      <div className="cdw-step">
        <span className="cdw-step-num">2</span>
        <div>
          <strong>Open Web Tools Diagnostics</strong>
          <p>Press <kbd>Ctrl+Shift+D</kbd> to open Web Tools, then click the <strong>Diagnostics</strong> tab for detailed system info.</p>
        </div>
      </div>
      <div className="cdw-step">
        <span className="cdw-step-num">3</span>
        <div>
          <strong>Check your antivirus or security software</strong>
          <p>Some antivirus programs block shell process creation. Try temporarily disabling real-time protection.</p>
        </div>
      </div>
      <div className="cdw-step">
        <span className="cdw-step-num">4</span>
        <div>
          <strong>Check the server logs</strong>
          <p>Look in the <code>logs/</code> folder next to the Forge executable for detailed error messages.</p>
        </div>
      </div>
    </div>

    {detectedIssue?.description && (
      <div className="cdw-error-detail">
        <span className="cdw-error-detail-label">Last error:</span>
        <code className="cdw-error-detail-value">{detectedIssue.description}</code>
      </div>
    )}

    <div className="cdw-actions">
      <button className="cdw-btn cdw-btn--primary" onClick={onRetry}>
        <RefreshCw size={16} />
        Re-run Diagnostics
      </button>
      <button className="cdw-btn cdw-btn--ghost" onClick={onClose}>
        Dismiss
      </button>
    </div>
  </div>
);

export default ConnectionDiagnosticWizard;
