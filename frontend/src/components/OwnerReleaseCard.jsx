import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Copy, Play, GitBranch, Tag, Upload, Shield, AlertCircle } from 'lucide-react';
import { useVersionIncrement } from '../hooks/useVersionIncrement';
import './OwnerReleaseCard.css';

// The GitHub username of the repository owner who can trigger releases
const OWNER_USERNAME = 'mikejsmith1985';

const OwnerReleaseCard = ({ onExecuteCommand, onToast, shellType }) => {
  const [currentVersion, setCurrentVersion] = useState('v1.0.0');
  const [selectedIncrement, setSelectedIncrement] = useState('fix');
  const [showCommand, setShowCommand] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Authorization state
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [githubUsername, setGithubUsername] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');

  const { incrementMajor, incrementMinor, incrementFix, getReleaseType } = useVersionIncrement();

  // Check GitHub authorization on mount
  useEffect(() => {
    const checkAuthorization = async () => {
      setAuthChecking(true);
      const token = localStorage.getItem('forge_github_token');
      
      if (!token) {
        setIsAuthorized(false);
        setAuthChecking(false);
        return;
      }

      try {
        const authHeader = token.startsWith('github_pat_') ? `Bearer ${token}` : `token ${token}`;
        const res = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': authHeader,
            'X-GitHub-Api-Version': '2022-11-28',
          }
        });

        if (res.ok) {
          const userData = await res.json();
          setGithubUsername(userData.login);
          setIsAuthorized(userData.login.toLowerCase() === OWNER_USERNAME.toLowerCase());
        } else {
          setIsAuthorized(false);
        }
      } catch (err) {
        console.error('[OwnerReleaseCard] Auth check failed:', err);
        setIsAuthorized(false);
      } finally {
        setAuthChecking(false);
      }
    };

    checkAuthorization();
  }, []);

  // Fetch current version
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/version');
        if (response.ok) {
          const data = await response.json();
          const version = data.version || '1.0.0';
          setCurrentVersion(version.startsWith('v') ? version : `v${version}`);
          setError(null);
        } else {
          setError('Failed to fetch version');
          setCurrentVersion('v1.0.0');
        }
      } catch (err) {
        console.error('Error fetching version:', err);
        setError('Version fetch error');
        setCurrentVersion('v1.0.0');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthorized) {
      fetchVersion();
    }
  }, [isAuthorized]);

  const nextVersion = useCallback(() => {
    switch (selectedIncrement) {
      case 'major':
        return incrementMajor(currentVersion);
      case 'minor':
        return incrementMinor(currentVersion);
      case 'fix':
      default:
        return incrementFix(currentVersion);
    }
  }, [currentVersion, selectedIncrement, incrementMajor, incrementMinor, incrementFix]);

  const next = nextVersion();
  const releaseType = getReleaseType(currentVersion, next);

  // Generate complete release command (commit, push, merge to main, tag, push tag)
  const generateReleaseCommand = useCallback(() => {
    if (!next) return '';
    
    const msg = commitMessage.trim() || `Release ${next}`;
    
    if (shellType === 'powershell') {
      // PowerShell 5.1 compatible syntax (no && chaining)
      return `$b = git branch --show-current; git add -A; if ($?) { git commit -m "${msg}"; if ($?) { git push origin $b; if ($?) { git checkout main; if ($?) { git pull origin main; if ($?) { git merge $b --no-edit; if ($?) { git push origin main; if ($?) { git tag ${next}; if ($?) { git push origin ${next}; if ($?) { git checkout $b; Write-Host "🚀 Release ${next} triggered! GitHub Actions will build." -ForegroundColor Green } } } } } } } } }`;
    } else {
      // Bash/zsh
      return `b=$(git branch --show-current) && git add -A && git commit -m "${msg}" && git push origin $b && git checkout main && git pull origin main && git merge $b --no-edit && git push origin main && git tag ${next} && git push origin ${next} && git checkout $b && echo "🚀 Release ${next} triggered! GitHub Actions will build."`;
    }
  }, [next, shellType, commitMessage]);

  const releaseCommand = generateReleaseCommand();

  const handleCopy = useCallback(async () => {
    if (!releaseCommand) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(releaseCommand);
        setCopySuccess(true);
        if (onToast) {
          onToast('Command copied to clipboard!', 'success', 2000);
        }
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      if (onToast) {
        onToast('Failed to copy command', 'error', 2000);
      }
    }
  }, [releaseCommand, onToast]);

  const handleExecute = useCallback(() => {
    if (onExecuteCommand && releaseCommand) {
      onExecuteCommand({
        id: 'owner-release',
        command: releaseCommand,
        description: `Release ${next}`,
        triggerAM: true,
      });
    }
  }, [releaseCommand, next, onExecuteCommand]);

  const getReleaseTypeDisplay = () => {
    if (!releaseType) return { label: 'BUG FIXES', color: 'green', icon: '🐛' };
    
    if (releaseType.startsWith('MAJOR')) {
      return { label: 'BREAKING CHANGES', color: 'red', icon: '⚠️' };
    }
    if (releaseType.startsWith('MINOR')) {
      return { label: 'NEW FEATURES', color: 'blue', icon: '✨' };
    }
    return { label: 'BUG FIXES', color: 'green', icon: '🐛' };
  };

  const releaseDisplay = getReleaseTypeDisplay();

  // Show loading while checking auth
  if (authChecking) {
    return (
      <div className="owner-release-card loading-auth">
        <div className="orc-spinner"></div>
        <span>Checking authorization...</span>
      </div>
    );
  }

  // Show unauthorized message if not owner
  if (!isAuthorized) {
    return (
      <div className="owner-release-card unauthorized">
        <div className="orc-unauthorized-content">
          <Shield size={24} className="orc-shield-icon" />
          <h3 className="orc-title">Release Manager</h3>
          <p className="orc-unauthorized-msg">
            {githubUsername 
              ? `Logged in as @${githubUsername}. Only the repository owner can create releases.`
              : 'Configure GitHub PAT in Feedback modal to enable release management.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="owner-release-card" data-testid="owner-release-card">
      <div className="orc-content">
        <div className="orc-header">
          <div className="orc-title-row">
            <Tag size={20} className="orc-icon" />
            <h3 className="orc-title">Release Manager</h3>
            <span className="orc-owner-badge">Owner</span>
          </div>
          <p className="orc-description">Commit, merge to main, and create tagged release</p>
        </div>

        {/* Version Display */}
        <div className="orc-version-display">
          {loading ? (
            <div className="orc-loading">
              <div className="orc-spinner"></div>
              <span>Loading version...</span>
            </div>
          ) : (
            <>
              <div className="orc-version-box">
                <span className="orc-version-label">Current</span>
                <span className="orc-current-version">{currentVersion}</span>
              </div>
              <div className="orc-arrow">→</div>
              <div className="orc-version-box">
                <span className="orc-version-label">Next</span>
                <span className="orc-next-version">{next}</span>
              </div>
            </>
          )}
        </div>

        {/* Release Type Badge */}
        <div className={`orc-release-type ${releaseDisplay.color}`}>
          {releaseDisplay.icon} {releaseDisplay.label}
        </div>

        {/* Version Increment Buttons */}
        <div className="orc-buttons-group">
          <button
            className={`orc-button ${selectedIncrement === 'major' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('major')}
            data-testid="major-btn"
          >
            <span className="orc-button-label">MAJOR</span>
            <span className="orc-button-preview">{incrementMajor(currentVersion)}</span>
          </button>
          <button
            className={`orc-button ${selectedIncrement === 'minor' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('minor')}
            data-testid="minor-btn"
          >
            <span className="orc-button-label">MINOR</span>
            <span className="orc-button-preview">{incrementMinor(currentVersion)}</span>
          </button>
          <button
            className={`orc-button ${selectedIncrement === 'fix' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('fix')}
            data-testid="fix-btn"
          >
            <span className="orc-button-label">FIX</span>
            <span className="orc-button-preview">{incrementFix(currentVersion)}</span>
          </button>
        </div>

        {/* Commit Message Input */}
        <div className="orc-commit-section">
          <label className="orc-commit-label">Commit Message (optional)</label>
          <input
            type="text"
            className="orc-commit-input"
            placeholder={`Release ${next}`}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            data-testid="commit-message-input"
          />
        </div>

        {/* Workflow Steps Preview */}
        <div className="orc-workflow">
          <div className="orc-step"><GitBranch size={14} /> Commit & push branch</div>
          <div className="orc-step-arrow">↓</div>
          <div className="orc-step"><GitBranch size={14} /> Checkout & merge to main</div>
          <div className="orc-step-arrow">↓</div>
          <div className="orc-step"><Tag size={14} /> Create & push tag {next}</div>
          <div className="orc-step-arrow">↓</div>
          <div className="orc-step"><Upload size={14} /> GitHub Actions builds release</div>
        </div>

        {/* Command Toggle */}
        <div className="orc-command-section">
          <button
            className="orc-command-toggle"
            onClick={() => setShowCommand(!showCommand)}
          >
            {showCommand ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {showCommand ? 'Hide' : 'Show'} Command
          </button>

          {showCommand && (
            <div className="orc-command-display">
              <pre className="orc-command-text">{releaseCommand}</pre>
              <div className="orc-command-actions">
                <button
                  className="orc-action-button"
                  onClick={handleCopy}
                >
                  <Copy size={16} />
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Execute Button */}
        <button
          className="orc-execute-button"
          onClick={handleExecute}
          disabled={loading || !releaseCommand}
          data-testid="release-execute-btn"
        >
          <Play size={18} />
          Release {next}
        </button>

        {error && (
          <div className="orc-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerReleaseCard;
