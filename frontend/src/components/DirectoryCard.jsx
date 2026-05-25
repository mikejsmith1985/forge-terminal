// DirectoryCard renders the Projects browser and project creation shortcuts.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, FolderPlus, RefreshCw, Settings, X, ChevronUp, ChevronDown, Github, Copy } from 'lucide-react';
import './DirectoryCard.css';

const COPY_SUCCESS_TOAST_MS = 1500;
const COPY_FAILURE_TOAST_MS = 2500;
const COPY_SUCCESS_MESSAGE = 'Copied folder path';
const COPY_FAILURE_MESSAGE = 'Failed to copy folder path';

const DirectoryCard = ({ onExecute, onHide, onToast }) => {
  const [rootPath, setRootPath] = useState(() => localStorage.getItem('forge_directory_card_root') || '');
  const [editingPath, setEditingPath] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredDir, setHoveredDir] = useState(null);
  const [directoryContextMenu, setDirectoryContextMenu] = useState(null);
  const inputRef = useRef(null);
  const contextMenuRef = useRef(null);

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
      const response = await fetch(`/api/directory/list?path=${encodeURIComponent(path.trim())}`);
      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || `HTTP ${response.status}`);
      }
      const directoryListing = await response.json();
      setDirectories(directoryListing || []);
    } catch (fetchError) {
      setError(fetchError.message);
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

  useEffect(() => {
    if (!directoryContextMenu) return undefined;

    const closeMenuOnOutsideMouseDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      setDirectoryContextMenu(null);
    };
    const closeMenuOnEscape = (event) => {
      if (event.key === 'Escape') setDirectoryContextMenu(null);
    };

    document.addEventListener('mousedown', closeMenuOnOutsideMouseDown);
    document.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenuOnOutsideMouseDown);
      document.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, [directoryContextMenu]);

  const handleSavePath = () => {
    const trimmed = editingPath.trim();
    setRootPath(trimmed);
    localStorage.setItem('forge_directory_card_root', trimmed);
    setShowPathInput(false);
    if (trimmed) fetchDirectories(trimmed);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') handleSavePath();
    if (event.key === 'Escape') setShowPathInput(false);
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

  const handleDirectoryClick = (directory) => {
    if (!onExecute) return;
    onExecute({ command: `cd "${directory.path}"`, delay: 0 });
  };

  const handleDirectoryContextMenu = (event, directory) => {
    event.preventDefault();
    event.stopPropagation();
    setHoveredDir(directory.path);
    setDirectoryContextMenu({
      directory,
      horizontalPosition: event.clientX,
      verticalPosition: event.clientY,
    });
  };

  const handleCopyDirectoryPath = async () => {
    if (!directoryContextMenu?.directory?.path) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(directoryContextMenu.directory.path);
      onToast?.(COPY_SUCCESS_MESSAGE, 'success', COPY_SUCCESS_TOAST_MS);
    } catch (clipboardError) {
      console.error('[DirectoryCard] Failed to copy folder path:', clipboardError);
      onToast?.(COPY_FAILURE_MESSAGE, 'error', COPY_FAILURE_TOAST_MS);
    } finally {
      setDirectoryContextMenu(null);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, rootPath, createGitHub, visibility: githubVisibility }),
      });
      const projectCreationResult = await response.json();
      if (!response.ok) throw new Error(projectCreationResult.error || `HTTP ${response.status}`);
      setCreateResult(projectCreationResult);
      setNewProjectName('');
      fetchDirectories(rootPath);
      if (onExecute) onExecute({ command: `cd "${projectCreationResult.path}"`, delay: 0 });
      setTimeout(() => {
        setShowNewProject(false);
        setCreateResult(null);
        setCreateError(null);
      }, 2500);
    } catch (createProjectError) {
      setCreateError(createProjectError.message);
    } finally {
      setCreating(false);
    }
  };

  const handleNewProjectKeyDown = (event) => {
    if (event.key === 'Enter') handleCreateProject();
    if (event.key === 'Escape') {
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
      <div className="directory-card-header" onClick={() => setCollapsed(isCurrentlyCollapsed => !isCurrentlyCollapsed)}>
        <div className="directory-card-title-group">
          <FolderOpen size={18} className="directory-card-icon" />
          <span className="directory-card-title">Projects</span>
          {displayRoot && (
            <span className="directory-card-root-badge" title={rootPath}>
              {displayRoot}
            </span>
          )}
        </div>
        <div className="directory-card-actions" onClick={event => event.stopPropagation()}>
          <button
            className={`directory-card-action-btn ${showNewProject ? 'active' : ''}`}
            title={rootPath ? 'New Project' : 'Set a root directory first'}
            onClick={() => {
              if (!rootPath) return;
              setShowNewProject(isCurrentlyVisible => !isCurrentlyVisible);
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
                onChange={event => setEditingPath(event.target.value)}
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
                      onChange={event => setNewProjectName(event.target.value)}
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
                        onChange={event => setCreateGitHub(event.target.checked)}
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
              {directories.map(directory => (
                <button
                  key={directory.path}
                  className={`directory-card-folder-btn ${hoveredDir === directory.path ? 'hovered' : ''}`}
                  onClick={() => handleDirectoryClick(directory)}
                  onContextMenu={(event) => handleDirectoryContextMenu(event, directory)}
                  onMouseEnter={() => setHoveredDir(directory.path)}
                  onMouseLeave={() => setHoveredDir(null)}
                  title={directory.path}
                >
                  <Folder size={14} />
                  <span>{directory.name}</span>
                </button>
              ))}
              {directoryContextMenu && (
                <div
                  ref={contextMenuRef}
                  className="directory-card-context-menu"
                  role="menu"
                  style={{
                    top: directoryContextMenu.verticalPosition,
                    left: directoryContextMenu.horizontalPosition,
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="directory-card-context-menu-item"
                    role="menuitem"
                    onClick={handleCopyDirectoryPath}
                  >
                    <Copy size={13} />
                    Copy Path
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DirectoryCard;
