import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, FolderPlus, RefreshCw, Settings, X, ChevronUp, ChevronDown, Github } from 'lucide-react';
import ContextMenu from './ContextMenu';
import { copyText } from '../utils/copyText';
import './DirectoryCard.css';

// What a right-click on a project folder offers. Copy Path leads because it is
// the reason the menu exists: the path is the thing a project row is most often
// wanted for, and there was previously no way to get it out of the UI.
const FOLDER_MENU_ITEMS = [
  { label: 'Copy Path', action: 'copyPath' },
  { label: 'Copy Folder Name', action: 'copyName' },
  { separator: true },
  { label: 'Open in Terminal', action: 'openInTerminal' },
];

const DirectoryCard = ({ onExecute, onHide }) => {
  const [rootPath, setRootPath] = useState(() => localStorage.getItem('forge_directory_card_root') || '');
  const [editingPath, setEditingPath] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredDir, setHoveredDir] = useState(null);
  // Which folder was right-clicked, and where to open its menu.
  const [folderMenu, setFolderMenu] = useState(null);
  const inputRef = useRef(null);

  // New Project wizard state
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createGitHub, setCreateGitHub] = useState(false);
  const [githubVisibility, setGithubVisibility] = useState('private');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createResult, setCreateResult] = useState(null);
  const newProjectInputRef = useRef(null);

  const fetchDirectories = useCallback(async (path) => {
    if (!path || !path.trim()) {
      setDirectories([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/directory/list?path=${encodeURIComponent(path.trim())}`);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDirectories(data || []);
    } catch (err) {
      setError(err.message);
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootPath) {
      fetchDirectories(rootPath);
    }
  }, [rootPath, fetchDirectories]);

  useEffect(() => {
    if (showNewProject) {
      setTimeout(() => newProjectInputRef.current?.focus(), 50);
    }
  }, [showNewProject]);

  const handleSavePath = () => {
    const trimmed = editingPath.trim();
    setRootPath(trimmed);
    localStorage.setItem('forge_directory_card_root', trimmed);
    setShowPathInput(false);
    if (trimmed) fetchDirectories(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSavePath();
    if (e.key === 'Escape') setShowPathInput(false);
  };

  const handleShowInput = () => {
    setEditingPath(rootPath);
    setShowPathInput(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleClearRoot = () => {
    setRootPath('');
    localStorage.removeItem('forge_directory_card_root');
    setDirectories([]);
    setError(null);
  };

  const handleDirectoryClick = (dir) => {
    if (!onExecute) return;
    onExecute({ command: `cd "${dir.path}"`, delay: 0 });
  };

  /** Opens the folder menu where the pointer is, without opening the folder. */
  const handleDirectoryRightClick = (dir, event) => {
    event.preventDefault();
    event.stopPropagation();
    setFolderMenu({ dir, x: event.clientX, y: event.clientY });
  };

  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);

  /**
   * Runs a folder-menu action.
   *
   * @returns A message for the menu to show, or nothing to close it silently.
   */
  const handleFolderMenuAction = async (actionName) => {
    const dir = folderMenu?.dir;
    if (!dir) return undefined;

    switch (actionName) {
      case 'copyPath':
        return (await copyText(dir.path))
          ? 'Copied path'
          : 'Could not copy — clipboard unavailable';

      case 'copyName':
        return (await copyText(dir.name))
          ? 'Copied name'
          : 'Could not copy — clipboard unavailable';

      case 'openInTerminal':
        handleDirectoryClick(dir);
        return undefined;

      default:
        return undefined;
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, rootPath, createGitHub, visibility: githubVisibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCreateResult(data);
      setNewProjectName('');
      fetchDirectories(rootPath);
      if (onExecute) onExecute({ command: `cd "${data.path}"`, delay: 0 });
      setTimeout(() => {
        setShowNewProject(false);
        setCreateResult(null);
        setCreateError(null);
      }, 2500);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleNewProjectKeyDown = (e) => {
    if (e.key === 'Enter') handleCreateProject();
    if (e.key === 'Escape') {
      setShowNewProject(false);
      setCreateError(null);
      setNewProjectName('');
    }
  };

  const displayRoot = rootPath
    ? rootPath.replace(/\\/g, '/').replace(/(.{35}).*(.{12})/, '$1…$2')
    : null;

  return (
    <div className="directory-card">
      <div className="directory-card-header" onClick={() => setCollapsed(c => !c)}>
        <div className="directory-card-title-group">
          <FolderOpen size={18} className="directory-card-icon" />
          <span className="directory-card-title">Projects</span>
          {displayRoot && (
            <span className="directory-card-root-badge" title={rootPath}>
              {displayRoot}
            </span>
          )}
        </div>
        <div className="directory-card-actions" onClick={e => e.stopPropagation()}>
          <button
            className={`directory-card-action-btn ${showNewProject ? 'active' : ''}`}
            title={rootPath ? 'New Project' : 'Set a root directory first'}
            onClick={() => {
              if (!rootPath) return;
              setShowNewProject(v => !v);
              setCreateError(null);
            }}
            disabled={!rootPath}
          >
            <FolderPlus size={13} />
          </button>
          <button
            className="directory-card-action-btn"
            title="Refresh directories"
            onClick={() => fetchDirectories(rootPath)}
            disabled={!rootPath || loading}
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="directory-card-action-btn"
            title="Set root directory"
            onClick={handleShowInput}
          >
            <Settings size={13} />
          </button>
          <button
            className="directory-card-collapse-btn"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {onHide && (
            <button
              className="directory-card-action-btn"
              title="Hide Projects Browser"
              onClick={onHide}
              style={{ color: '#888' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="directory-card-body">
          {showPathInput && (
            <div className="directory-card-path-input-row">
              <input
                ref={inputRef}
                className="directory-card-path-input"
                type="text"
                value={editingPath}
                onChange={e => setEditingPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. C:\Projects or ~/projects"
              />
              <button className="directory-card-btn-save" onClick={handleSavePath}>Set</button>
              <button className="directory-card-btn-cancel" onClick={() => setShowPathInput(false)}>
                <X size={13} />
              </button>
            </div>
          )}

          {showNewProject && (
            <div className="directory-card-new-project">
              {createResult ? (
                <div className="directory-card-new-project-success">
                  <span>✓ <strong>{createResult.path.split(/[\\/]/).pop()}</strong> created</span>
                  {createResult.github?.created && (
                    <a href={createResult.github.url} target="_blank" rel="noreferrer" className="directory-card-gh-link">
                      <Github size={12} /> View on GitHub
                    </a>
                  )}
                  {createResult.github?.error && (
                    <span className="directory-card-gh-warn">⚠ {createResult.github.error}</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="directory-card-new-project-row">
                    <input
                      ref={newProjectInputRef}
                      className="directory-card-path-input"
                      type="text"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={handleNewProjectKeyDown}
                      placeholder="Project name"
                      disabled={creating}
                    />
                    <button
                      className="directory-card-btn-cancel"
                      onClick={() => { setShowNewProject(false); setCreateError(null); setNewProjectName(''); }}
                      disabled={creating}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="directory-card-new-project-options">
                    <label className="directory-card-gh-toggle">
                      <input
                        type="checkbox"
                        checked={createGitHub}
                        onChange={e => setCreateGitHub(e.target.checked)}
                        disabled={creating}
                      />
                      <Github size={12} /> Create GitHub repo
                    </label>
                    {createGitHub && (
                      <div className="directory-card-visibility">
                        <label>
                          <input type="radio" name="visibility" value="private" checked={githubVisibility === 'private'} onChange={() => setGithubVisibility('private')} disabled={creating} />
                          Private
                        </label>
                        <label>
                          <input type="radio" name="visibility" value="public" checked={githubVisibility === 'public'} onChange={() => setGithubVisibility('public')} disabled={creating} />
                          Public
                        </label>
                      </div>
                    )}
                  </div>
                  {createError && <p className="directory-card-new-project-error">⚠ {createError}</p>}
                  <button
                    className="directory-card-btn-create"
                    onClick={handleCreateProject}
                    disabled={creating || !newProjectName.trim()}
                  >
                    {creating ? <RefreshCw size={12} className="spinning" /> : <FolderPlus size={12} />}
                    {creating ? 'Creating…' : 'Create Project'}
                  </button>
                </>
              )}
            </div>
          )}

          {!rootPath && !showPathInput && (
            <div className="directory-card-empty">
              <p>No root directory set.</p>
              <button className="directory-card-set-btn" onClick={handleShowInput}>
                <Settings size={14} /> Set Root Directory
              </button>
            </div>
          )}

          {rootPath && error && (
            <div className="directory-card-error">
              <span>⚠️ {error}</span>
              <button className="directory-card-action-btn" onClick={handleClearRoot} title="Clear">
                <X size={12} />
              </button>
            </div>
          )}

          {rootPath && !error && directories.length === 0 && !loading && (
            <div className="directory-card-empty">
              <p>No subdirectories found.</p>
            </div>
          )}

          {rootPath && !error && directories.length > 0 && (
            <div className="directory-card-grid">
              {directories.map(dir => (
                <button
                  key={dir.path}
                  className={`directory-card-folder-btn ${hoveredDir === dir.path ? 'hovered' : ''}`}
                  onClick={() => handleDirectoryClick(dir)}
                  onContextMenu={(event) => handleDirectoryRightClick(dir, event)}
                  onMouseEnter={() => setHoveredDir(dir.path)}
                  onMouseLeave={() => setHoveredDir(null)}
                  title={dir.path}
                >
                  <Folder size={14} />
                  <span>{dir.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={FOLDER_MENU_ITEMS}
          onClose={closeFolderMenu}
          onAction={handleFolderMenuAction}
        />
      )}
    </div>
  );
};

export default DirectoryCard;
