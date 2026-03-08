import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, RefreshCw, Settings, X, ChevronUp, ChevronDown } from 'lucide-react';
import './DirectoryCard.css';

const DirectoryCard = ({ onExecute }) => {
  const [rootPath, setRootPath] = useState(() => localStorage.getItem('forge_directory_card_root') || '');
  const [editingPath, setEditingPath] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredDir, setHoveredDir] = useState(null);
  const inputRef = useRef(null);

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

  // Load directories when rootPath changes
  useEffect(() => {
    if (rootPath) {
      fetchDirectories(rootPath);
    }
  }, [rootPath, fetchDirectories]);

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
    // Normalize path for the shell: use forward slashes for cross-platform
    const cdPath = dir.path;
    onExecute({ command: `cd "${cdPath}"`, delay: 0 });
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
    </div>
  );
};

export default DirectoryCard;
