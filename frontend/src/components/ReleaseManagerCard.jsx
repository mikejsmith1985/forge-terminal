import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Copy, Play } from 'lucide-react';
import { useVersionIncrement } from '../hooks/useVersionIncrement';
import './ReleaseManagerCard.css';

const ReleaseManagerCard = ({ onExecuteCommand, onToast, shellType }) => {
  const [currentVersion, setCurrentVersion] = useState('v1.23.10');
  const [selectedIncrement, setSelectedIncrement] = useState('fix');
  const [showCommand, setShowCommand] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [buildAssets, setBuildAssets] = useState(false);

  const { incrementMajor, incrementMinor, incrementFix, getReleaseType } = useVersionIncrement();

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/version');
        if (response.ok) {
          const data = await response.json();
          const version = data.version || '1.23.10';
          setCurrentVersion(version.startsWith('v') ? version : `v${version}`);
          setError(null);
        } else {
          setError('Failed to fetch version');
          setCurrentVersion('v1.23.10');
        }
      } catch (err) {
        console.error('Error fetching version:', err);
        setError('Version fetch error');
        setCurrentVersion('v1.23.10');
      } finally {
        setLoading(false);
      }
    };

    fetchVersion();
  }, []);

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

  const generateReleaseCommand = useCallback(() => {
    if (!next) return '';
    
    let buildCmd = '';
    if (buildAssets) {
      if (shellType === 'powershell') {
        buildCmd = '.\\build.ps1';
      } else if (shellType === 'cmd') {
        buildCmd = 'powershell -ExecutionPolicy Bypass -File .\\build.ps1';
      } else {
        buildCmd = 'make build';
      }
    }

    // Generate command based on shell type
    if (shellType === 'powershell') {
      // PowerShell 5.1 compatible syntax (no &&)
      const buildPart = buildAssets ? `${buildCmd}; if ($?) { ` : '';
      const buildEnd = buildAssets ? ' }' : '';
      const assetPart = buildAssets ? ' bin\\forge.exe' : '';
      return `${buildPart}$b = git branch --show-current; git checkout main; if ($?) { git pull origin main; if ($?) { git merge $b; if ($?) { git push origin main; if ($?) { gh release create ${next} --title "${next} - Release" --target main --generate-notes${assetPart}; if ($?) { git checkout $b; echo "Release ${next} created successfully!" } } } } }${buildEnd}`;
    } else {
      // Bash, CMD, and PowerShell 7+ support &&
      const buildPart = buildAssets ? `${buildCmd} && ` : '';
      const assetPart = buildAssets ? ' bin/forge.exe' : '';
      return `${buildPart}b=$(git branch --show-current) && git checkout main && git pull origin main && git merge $b && git push origin main && gh release create ${next} --title "${next} - Release" --target main --generate-notes${assetPart} && git checkout $b && echo "Release ${next} created successfully!"`;
    }
  }, [next, shellType, buildAssets]);

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
      } else {
        throw new Error('Clipboard API not available');
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
        id: 'release-manager',
        command: releaseCommand,
        description: `Release ${next}`,
        triggerAM: true,
      });
    }
  }, [releaseCommand, next, onExecuteCommand]);

  const getReleaseTypeDisplay = () => {
    switch (releaseType) {
      case 'major':
        return { label: 'BREAKING CHANGES', color: 'red' };
      case 'minor':
        return { label: 'NEW FEATURES', color: 'blue' };
      case 'fix':
      default:
        return { label: 'BUG FIXES', color: 'green' };
    }
  };

  const releaseDisplay = getReleaseTypeDisplay();

  return (
    <div className="release-manager-card">
      <div className="release-manager-content">
        <div className="rm-header">
          <h3 className="rm-title">Release Manager</h3>
          <p className="rm-description">Intelligent semantic versioning and release automation</p>
        </div>

        <div className="rm-version-display">
          {loading ? (
            <div className="rm-loading">
              <div className="rm-spinner"></div>
              <span>Loading version...</span>
            </div>
          ) : (
            <>
              <div className="rm-version-box">
                <span className="rm-version-label">Current</span>
                <span className="current-version">{currentVersion}</span>
              </div>
              <div className="rm-arrow">→</div>
              <div className="rm-version-box">
                <span className="rm-version-label">Next</span>
                <span className="next-version">{next}</span>
              </div>
            </>
          )}
        </div>

        <div className={`rm-release-type ${releaseDisplay.color}`}>
          {releaseDisplay.label}
        </div>

        <div className="rm-options" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
          <label className="rm-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em', color: '#ccc' }}>
            <input
              type="checkbox"
              checked={buildAssets}
              onChange={(e) => setBuildAssets(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Build Assets
          </label>
        </div>

        <div className="rm-buttons-group">
          <button
            className={`rm-button ${selectedIncrement === 'major' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('major')}
            title="Major version increment (breaking changes)"
          >
            <span className="rm-button-label">MAJOR</span>
            <span className="rm-button-preview">{incrementMajor(currentVersion)}</span>
          </button>
          <button
            className={`rm-button ${selectedIncrement === 'minor' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('minor')}
            title="Minor version increment (new features)"
          >
            <span className="rm-button-label">MINOR</span>
            <span className="rm-button-preview">{incrementMinor(currentVersion)}</span>
          </button>
          <button
            className={`rm-button ${selectedIncrement === 'fix' ? 'selected' : ''}`}
            onClick={() => setSelectedIncrement('fix')}
            title="Fix version increment (bug fixes)"
          >
            <span className="rm-button-label">FIX</span>
            <span className="rm-button-preview">{incrementFix(currentVersion)}</span>
          </button>
        </div>

        <div className="rm-command-section">
          <button
            className="rm-command-toggle"
            onClick={() => setShowCommand(!showCommand)}
          >
            {showCommand ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {showCommand ? 'V' : '>'} Show Command
          </button>

          {showCommand && (
            <div className="rm-command-display">
              <pre className="rm-command-text">{releaseCommand}</pre>
              <div className="rm-command-actions">
                <button
                  className="rm-action-button copy-button"
                  onClick={handleCopy}
                  title="Copy command to clipboard"
                >
                  <Copy size={16} />
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          className="rm-execute-button"
          onClick={handleExecute}
          disabled={loading || !releaseCommand}
          title="Execute release immediately"
        >
          <Play size={18} />
          Release {next}
        </button>

        {error && <div className="rm-error">{error}</div>}
      </div>
    </div>
  );
};

export default ReleaseManagerCard;
