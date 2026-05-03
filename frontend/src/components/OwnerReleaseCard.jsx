import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Copy, Play, GitBranch, Tag, Upload, AlertCircle, Settings, Plus, Trash2, Folder } from 'lucide-react';
import { useVersionIncrement } from '../hooks/useVersionIncrement';
import './OwnerReleaseCard.css';

// Helper to extract repo name from path
const getRepoNameFromPath = (path) => {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
};

const OwnerReleaseCard = ({ onExecuteCommand, onToast, shellType, cwd }) => {
  const [currentVersion, setCurrentVersion] = useState('v1.0.0');
  const [selectedIncrement, setSelectedIncrement] = useState('fix');
  const [showCommand, setShowCommand] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // v3.16.12: Robust workspace detection - auto-detect ANY git repo from CWD
  const [isExternalRepo, setIsExternalRepo] = useState(false);
  const [externalRepoPath, setExternalRepoPath] = useState(null);
  const [externalRepoName, setExternalRepoName] = useState(null);
  
  // Project Configuration (optional favorites, not required for detection)
  const [showSettings, setShowSettings] = useState(false);
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');

  const [commitMessage, setCommitMessage] = useState('');
  
  // v3.17.9: Custom version support
  const [customVersion, setCustomVersion] = useState('');
  const [useCustomVersion, setUseCustomVersion] = useState(false);

  const { incrementMajor, incrementMinor, incrementFix, getReleaseType } = useVersionIncrement();

  // Load configured projects (favorites)
  useEffect(() => {
    const saved = localStorage.getItem('forge_release_projects');
    if (saved) {
      try {
        setProjects(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse projects', e);
      }
    }
  }, []);

  // v3.16.12: ROBUST AUTO-DETECT - Check if CWD is ANY git repo (no pre-config needed!)
  useEffect(() => {
    if (!cwd) {
      // No CWD, fall back to internal
      setIsExternalRepo(false);
      setExternalRepoPath(null);
      setExternalRepoName(null);
      return;
    }

    const detectGitRepo = async () => {
      try {
        console.log('[ReleaseManager] Checking if git repo:', cwd);
        const res = await fetch('/api/git/version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cwd })
        });
        
        const data = await res.json();
        
        // Check if it's a valid git repo (no error field, or has valid version)
        if (res.ok && !data.error && data.version) {
          const repoName = getRepoNameFromPath(cwd);
          console.log('[ReleaseManager] Git repo detected:', repoName, 'version:', data.version);
          
          // Check if this is the forge-terminal repo itself
          const isForgeRepo = repoName?.toLowerCase() === 'forge-terminal';
          
          // Always check for local release pipeline regardless of which repo it is
          try {
            const sr = await fetch('/api/project/release-script', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: cwd })
            });
            const sd = await sr.json();
            setHasLocalScript(sd.exists === true);
          } catch { setHasLocalScript(false); }

          if (isForgeRepo) {
            setIsExternalRepo(false);
            setExternalRepoPath(null);
            setExternalRepoName(null);
          } else {
            setIsExternalRepo(true);
            setExternalRepoPath(cwd);
            setExternalRepoName(repoName);
          }
        } else {
          // Not a git repo or error
          console.log('[ReleaseManager] Not a git repo or error:', data.error || 'unknown');
          setIsExternalRepo(false);
          setExternalRepoPath(null);
          setExternalRepoName(null);
        }
      } catch (err) {
        console.error('[ReleaseManager] Git detection failed:', err);
        setIsExternalRepo(false);
        setExternalRepoPath(null);
        setExternalRepoName(null);
      }
    };

    detectGitRepo();
  }, [cwd]);

  const saveProject = () => {
    if (!newProjectName || !newProjectPath) return;
    const updated = [...projects, { name: newProjectName, path: newProjectPath, id: Date.now() }];
    setProjects(updated);
    localStorage.setItem('forge_release_projects', JSON.stringify(updated));
    setNewProjectName('');
    setNewProjectPath('');
    if (onToast) onToast('Project saved to favorites', 'success');
  };

  const deleteProject = (id) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    localStorage.setItem('forge_release_projects', JSON.stringify(updated));
  };
  
  // v3.19.1: detect local release pipeline script
  const [hasLocalScript, setHasLocalScript] = useState(false);
  
  // Quick save current repo to favorites
  const saveCurrentToFavorites = () => {
    if (!isExternalRepo || !externalRepoPath || !externalRepoName) return;
    // Check if already saved
    const exists = projects.some(p => p.path.toLowerCase() === externalRepoPath.toLowerCase());
    if (exists) {
      if (onToast) onToast('Already in favorites', 'info');
      return;
    }
    const updated = [...projects, { name: externalRepoName, path: externalRepoPath, id: Date.now() }];
    setProjects(updated);
    localStorage.setItem('forge_release_projects', JSON.stringify(updated));
    if (onToast) onToast(`Added "${externalRepoName}" to favorites`, 'success');
  };

  // Authorization removed - releases use git credentials, not PAT

  // Fetch current version - uses isExternalRepo state from auto-detect
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setLoading(true);
        let response;
        
        // Always use git describe to get the actual repo tag version.
        // The running binary version can be stale (e.g. user downloaded an old release),
        // which would cause the Release Manager to create duplicate/wrong version tags.
        const repoPath = (isExternalRepo && externalRepoPath) ? externalRepoPath : cwd;
        
        if (repoPath) {
            response = await fetch('/api/git/version', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: repoPath })
            });
        } else {
            // No path available, fall back to binary version
            response = await fetch('/api/version');
        }

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

    fetchVersion();
  }, [isExternalRepo, externalRepoPath, cwd]); // Refetch when repo detection changes

  // v3.17.9: Parse and validate custom version
  const parseCustomVersion = useCallback((input) => {
    if (!input) return null;
    // Remove 'v' prefix if present and validate format
    const cleaned = input.trim().replace(/^v/i, '');
    // Match semver: major.minor.patch with optional pre-release
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?$/);
    if (!match) return null;
    return `v${cleaned}`;
  }, []);

  const nextVersion = useCallback(() => {
    // v3.17.9: Use custom version if enabled and valid
    if (useCustomVersion && customVersion) {
      const parsed = parseCustomVersion(customVersion);
      if (parsed) return parsed;
    }
    
    switch (selectedIncrement) {
      case 'major':
        return incrementMajor(currentVersion);
      case 'minor':
        return incrementMinor(currentVersion);
      case 'fix':
      default:
        return incrementFix(currentVersion);
    }
  }, [currentVersion, selectedIncrement, incrementMajor, incrementMinor, incrementFix, useCustomVersion, customVersion, parseCustomVersion]);

  const next = nextVersion();
  const releaseType = getReleaseType(currentVersion, next);

  // Generate complete release command (commit, push, merge to main, tag, push tag, gh release create — no GH Actions needed)
  const generateReleaseCommand = useCallback(() => {
    if (!next) return '';
    
    let cmdPrefix = '';
    // v3.16.12: Use detected external repo path for cd prefix
    if (isExternalRepo && externalRepoPath) {
        if (shellType === 'powershell') {
            cmdPrefix = `cd "${externalRepoPath}"; `;
        } else {
            cmdPrefix = `cd "${externalRepoPath}" && `;
        }
    }

    // v3.19.2: Pass the explicit next-version number to the local release script
    // instead of a relative bump type (patch/minor/major). Sending a bump type
    // causes the script to recompute the version from package.json, which diverges
    // from what the card is displaying when a previous release attempt partially
    // bumped the version file. Passing the explicit version guarantees the script
    // releases exactly what the UI showed — eliminating the double-bump bug.
    if (hasLocalScript) {
      const explicitVersionNumber = next.replace(/^v/, '');
      if (shellType === 'powershell') {
        return `${cmdPrefix}.\\scripts\\local-release.ps1 ${explicitVersionNumber}`;
      } else {
        return `${cmdPrefix}pwsh -File ./scripts/local-release.ps1 ${explicitVersionNumber}`;
      }
    }

    const msg = commitMessage.trim() || `Release ${next}`;
    
    // Auto-update package.json if it exists
    let versionBump = '';
    if (shellType === 'powershell') {
        versionBump = `$ver_success = $true; if (Test-Path package.json) { Write-Host "Bumping npm version to ${next}..." -ForegroundColor Cyan; npm version ${next} --no-git-tag-version --allow-same-version; $ver_success = $? }; if ($ver_success) { `;
    } else {
        versionBump = `if [ -f package.json ]; then echo "Bumping npm version to ${next}..." && npm version ${next} --no-git-tag-version --allow-same-version; fi && `;
    }

    if (shellType === 'powershell') {
      return `${cmdPrefix}${versionBump}$b = git branch --show-current; git add -A; if ($?) { git commit -m "${msg}" --allow-empty; if ($?) { git push origin $b; if ($?) { git checkout main; if ($?) { git pull origin main; if ($?) { git merge $b --no-edit; if ($?) { git push origin main; if ($?) { git push origin :refs/tags/${next} 2>$null; git tag -d ${next} 2>$null; git tag ${next}; if ($?) { git push origin ${next}; if ($?) { gh release delete ${next} --yes 2>$null; gh release create ${next} --title "Release ${next}" --notes "Release ${next}" --latest; git checkout $b; Write-Host "Release ${next} published on GitHub." -ForegroundColor Green } } } } } } } } } }`;
    } else {
      return `${cmdPrefix}${versionBump}b=$(git branch --show-current) && git add -A && git commit -m "${msg}" --allow-empty && git push origin $b && git checkout main && git pull origin main && git merge $b --no-edit && git push origin main && git push origin :refs/tags/${next} 2>/dev/null; git tag -d ${next} 2>/dev/null; git tag ${next} && git push origin ${next} && (gh release delete ${next} --yes 2>/dev/null; gh release create ${next} --title "Release ${next}" --notes "Release ${next}" --latest) && git checkout $b && echo "Release ${next} published on GitHub."`;
    }
  }, [next, shellType, commitMessage, isExternalRepo, externalRepoPath, hasLocalScript, selectedIncrement]);

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

  return (
    <div className="owner-release-card" data-testid="owner-release-card">
      <div className="orc-content">
        <div className="orc-header">
          <div className="orc-title-row">
            <Tag size={20} className="orc-icon" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 className="orc-title">Release Manager</h3>
                <span style={{ fontSize: '10px', color: isExternalRepo ? '#4CAF50' : '#888' }}>
                  {isExternalRepo ? externalRepoName : 'Forge Terminal (Internal)'}
                </span>
            </div>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Save to favorites button - only show for external repos not already saved */}
                {isExternalRepo && externalRepoPath && !projects.some(p => p.path.toLowerCase() === externalRepoPath.toLowerCase()) && (
                    <button 
                        onClick={saveCurrentToFavorites}
                        title="Save to favorites"
                        style={{ background: 'none', border: 'none', color: '#4CAF50', cursor: 'pointer', padding: '4px', fontSize: '14px' }}
                    >
                        ★
                    </button>
                )}
                <button 
                    className="orc-settings-btn"
                    onClick={() => setShowSettings(!showSettings)}
                    title="Favorites"
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}
                >
                    <Settings size={16} />
                </button>
            </div>
          </div>
          <p className="orc-description">Commit, merge to main, and create tagged release</p>
        </div>

        {/* Settings Panel - now for favorites only */}
        {showSettings && (
            <div className="orc-settings-panel" style={{ 
                background: '#1e1e1e', 
                border: '1px solid #333', 
                padding: '12px', 
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>Favorite Projects</h4>
                    <span style={{ fontSize: '10px', color: '#888' }}>Auto-detects any git repo</span>
                </div>

                <div className="orc-project-list" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '8px' }}>
                    {projects.length === 0 ? (
                        <div style={{ padding: '8px', color: '#666', fontStyle: 'italic' }}>
                            No favorites yet. Navigate to a repo and click ★ to save.
                        </div>
                    ) : (
                        projects.map(p => (
                            <div 
                                key={p.id} 
                                style={{ 
                                    padding: '6px', 
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: '4px',
                                    background: externalRepoPath?.toLowerCase() === p.path.toLowerCase() ? '#2d2d2d' : 'transparent'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                    <Folder size={12} />
                                    <span>{p.name}</span>
                                    <span style={{ color: '#666', fontSize: '10px' }}>{p.path}</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
                                    title="Remove from favorites"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                    <input 
                        type="text" 
                        placeholder="Project Name" 
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '4px', fontSize: '11px' }}
                    />
                    <input 
                        type="text" 
                        placeholder="Path (C:\\Projects\\...)" 
                        value={newProjectPath}
                        onChange={(e) => setNewProjectPath(e.target.value)}
                        style={{ flex: 2, background: '#111', border: '1px solid #333', color: '#fff', padding: '4px', fontSize: '11px' }}
                    />
                    <button 
                        onClick={saveProject}
                        disabled={!newProjectName || !newProjectPath}
                        style={{ background: '#238636', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '0 8px' }}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>
        )}

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
            className={`orc-button ${selectedIncrement === 'major' && !useCustomVersion ? 'selected' : ''}`}
            onClick={() => { setSelectedIncrement('major'); setUseCustomVersion(false); }}
            data-testid="major-btn"
          >
            <span className="orc-button-label">MAJOR</span>
            <span className="orc-button-preview">{incrementMajor(currentVersion)}</span>
          </button>
          <button
            className={`orc-button ${selectedIncrement === 'minor' && !useCustomVersion ? 'selected' : ''}`}
            onClick={() => { setSelectedIncrement('minor'); setUseCustomVersion(false); }}
            data-testid="minor-btn"
          >
            <span className="orc-button-label">MINOR</span>
            <span className="orc-button-preview">{incrementMinor(currentVersion)}</span>
          </button>
          <button
            className={`orc-button ${selectedIncrement === 'fix' && !useCustomVersion ? 'selected' : ''}`}
            onClick={() => { setSelectedIncrement('fix'); setUseCustomVersion(false); }}
            data-testid="fix-btn"
          >
            <span className="orc-button-label">FIX</span>
            <span className="orc-button-preview">{incrementFix(currentVersion)}</span>
          </button>
        </div>

        {/* v3.17.9: Custom Version Input */}
        <div className="orc-custom-version-section" style={{
          marginTop: '8px',
          padding: '8px',
          background: useCustomVersion ? 'rgba(35, 134, 54, 0.1)' : 'transparent',
          borderRadius: '6px',
          border: useCustomVersion ? '1px solid #238636' : '1px solid transparent',
          transition: 'all 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="use-custom-version"
              checked={useCustomVersion}
              onChange={(e) => setUseCustomVersion(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label 
              htmlFor="use-custom-version" 
              style={{ fontSize: '11px', color: '#888', cursor: 'pointer', userSelect: 'none' }}
            >
              Custom version
            </label>
            {useCustomVersion && (
              <input
                type="text"
                placeholder="e.g., 2.0.0 or v2.0.0-beta"
                value={customVersion}
                onChange={(e) => setCustomVersion(e.target.value)}
                style={{
                  flex: 1,
                  background: '#111',
                  border: parseCustomVersion(customVersion) || !customVersion ? '1px solid #333' : '1px solid #f44',
                  color: '#fff',
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: '4px'
                }}
                data-testid="custom-version-input"
              />
            )}
          </div>
          {useCustomVersion && customVersion && !parseCustomVersion(customVersion) && (
            <div style={{ fontSize: '10px', color: '#f44', marginTop: '4px', marginLeft: '24px' }}>
              Invalid version format. Use: X.Y.Z (e.g., 2.0.0)
            </div>
          )}
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
          {hasLocalScript ? (
            <>
              <div className="orc-step"><Play size={14} /> Run local-release.ps1</div>
              <div className="orc-step-arrow">↓</div>
              <div className="orc-step"><Upload size={14} /> Builds & publishes GitHub Release</div>
            </>
          ) : (
            <>
              <div className="orc-step"><GitBranch size={14} /> Commit & push branch</div>
              <div className="orc-step-arrow">↓</div>
              <div className="orc-step"><GitBranch size={14} /> Checkout & merge to main</div>
              <div className="orc-step-arrow">↓</div>
              <div className="orc-step"><Tag size={14} /> Create & push tag {next}</div>
              <div className="orc-step-arrow">↓</div>
              <div className="orc-step"><Upload size={14} /> GitHub Actions builds release</div>
            </>
          )}
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
