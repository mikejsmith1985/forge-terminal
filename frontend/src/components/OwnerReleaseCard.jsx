import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Copy, Play, GitBranch, Tag, Upload, Shield, AlertCircle, Settings, Plus, Trash2, Folder } from 'lucide-react';
import { useVersionIncrement } from '../hooks/useVersionIncrement';
import './OwnerReleaseCard.css';

// The GitHub username of the repository owner who can trigger releases
const OWNER_USERNAME = 'mikejsmith1985';

const OwnerReleaseCard = ({ onExecuteCommand, onToast, shellType, cwd }) => {
  const [currentVersion, setCurrentVersion] = useState('v1.0.0');
  const [selectedIncrement, setSelectedIncrement] = useState('fix');
  const [showCommand, setShowCommand] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Project Configuration
  const [showSettings, setShowSettings] = useState(false);
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [activeProject, setActiveProject] = useState(null); // null = Internal Forge
  const [autoDetect, setAutoDetect] = useState(true);

  // Authorization state
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [githubUsername, setGithubUsername] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');

  const { incrementMajor, incrementMinor, incrementFix, getReleaseType } = useVersionIncrement();

  // Load configured projects
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

  // Auto-detect project based on CWD
  useEffect(() => {
    if (!autoDetect || !cwd || !projects.length) return;

    // Normalize paths for comparison (simple check)
    const normalizedCwd = cwd.toLowerCase().replace(/\\/g, '/');
    
    const match = projects.find(p => {
        const pPath = p.path.toLowerCase().replace(/\\/g, '/');
        return normalizedCwd.startsWith(pPath);
    });

    if (match) {
        setActiveProject(match);
    } else {
        // If no match found and we were on a project, switch back to internal?
        // Or stay on last selected? Let's switch to internal if explicitly auto-detecting
        setActiveProject(null);
    }
  }, [cwd, projects, autoDetect]);

  const saveProject = () => {
    if (!newProjectName || !newProjectPath) return;
    const updated = [...projects, { name: newProjectName, path: newProjectPath, id: Date.now() }];
    setProjects(updated);
    localStorage.setItem('forge_release_projects', JSON.stringify(updated));
    setNewProjectName('');
    setNewProjectPath('');
    if (onToast) onToast('Project added', 'success');
  };

  const deleteProject = (id) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    localStorage.setItem('forge_release_projects', JSON.stringify(updated));
    if (activeProject && activeProject.id === id) setActiveProject(null);
  };

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
        let response;
        
        if (activeProject) {
            // Fetch git version for external project
            response = await fetch('/api/git/version', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: activeProject.path })
            });
        } else {
            // Fetch internal version
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

    if (isAuthorized) {
      fetchVersion();
    }
  }, [isAuthorized, activeProject]); // Refetch when project changes

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
    let cmdPrefix = '';

    // If active project, cd into directory
    if (activeProject) {
        // Use cd with quotes to handle spaces
        if (shellType === 'powershell') {
            cmdPrefix = `cd "${activeProject.path}"; `;
        } else {
            cmdPrefix = `cd "${activeProject.path}" && `;
        }
    }
    
    // Auto-update package.json if it exists
    let versionBump = '';
    if (shellType === 'powershell') {
        // Check for package.json and run npm version if found
        // Uses $ver_success flag to ensure we only proceed if version bump succeeds (or is skipped)
        versionBump = `$ver_success = $true; if (Test-Path package.json) { Write-Host "Bumping npm version to ${next}..." -ForegroundColor Cyan; npm version ${next} --no-git-tag-version --allow-same-version; $ver_success = $? }; if ($ver_success) { `;
    } else {
        // Bash equivalent
        versionBump = `if [ -f package.json ]; then echo "Bumping npm version to ${next}..." && npm version ${next} --no-git-tag-version --allow-same-version; fi && `;
    }

    if (shellType === 'powershell') {
      // PowerShell 5.1 compatible syntax (no && chaining)
      // We wrap the main logic in the block opened by versionBump
      // Note: We need to close the block at the end with an extra }
      return `${cmdPrefix}${versionBump}$b = git branch --show-current; git add -A; if ($?) { git commit -m "${msg}" --allow-empty; if ($?) { git push origin $b; if ($?) { git checkout main; if ($?) { git pull origin main; if ($?) { git merge $b --no-edit; if ($?) { git push origin main; if ($?) { git push origin :refs/tags/${next} 2>$null; git tag -d ${next} 2>$null; git tag ${next}; if ($?) { git push origin ${next}; if ($?) { git checkout $b; Write-Host "🚀 Release ${next} triggered! GitHub Actions will build." -ForegroundColor Green } } } } } } } } } }`;
    } else {
      // Bash/zsh
      // Delete remote tag first (silently continue if doesn't exist), then create and push
      return `${cmdPrefix}${versionBump}b=$(git branch --show-current) && git add -A && git commit -m "${msg}" --allow-empty && git push origin $b && git checkout main && git pull origin main && git merge $b --no-edit && git push origin main && git push origin :refs/tags/${next} 2>/dev/null; git tag -d ${next} 2>/dev/null; git tag ${next} && git push origin ${next} && git checkout $b && echo "🚀 Release ${next} triggered! GitHub Actions will build."`;
    }
  }, [next, shellType, commitMessage, activeProject]);

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
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 className="orc-title">Release Manager</h3>
                {activeProject && <span style={{ fontSize: '10px', color: '#888' }}>{activeProject.name}</span>}
            </div>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button 
                    className="orc-settings-btn"
                    onClick={() => setShowSettings(!showSettings)}
                    title="Configure Projects"
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}
                >
                    <Settings size={16} />
                </button>
            </div>
          </div>
          <p className="orc-description">Commit, merge to main, and create tagged release</p>
        </div>

        {/* Settings Panel */}
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
                    <h4 style={{ margin: 0 }}>Managed Projects</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={autoDetect} 
                            onChange={(e) => setAutoDetect(e.target.checked)}
                        />
                        Auto-detect from Workspace
                    </label>
                </div>

                <div className="orc-project-list" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '8px' }}>
                    <div 
                        onClick={() => setActiveProject(null)}
                        style={{ 
                            padding: '6px', 
                            cursor: 'pointer', 
                            background: !activeProject ? '#2d2d2d' : 'transparent',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Shield size={12} />
                        <span>Forge Terminal (Internal)</span>
                    </div>
                    {projects.map(p => (
                        <div 
                            key={p.id} 
                            style={{ 
                                padding: '6px', 
                                cursor: 'pointer', 
                                background: activeProject?.id === p.id ? '#2d2d2d' : 'transparent',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginTop: '4px'
                            }}
                        >
                            <div 
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}
                                onClick={() => setActiveProject(p)}
                            >
                                <Folder size={12} />
                                <span>{p.name}</span>
                                <span style={{ color: '#666', fontSize: '10px' }}>{p.path}</span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
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
                        placeholder="Path (C:\Projects\...)" 
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
