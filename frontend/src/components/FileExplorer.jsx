import { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  File, 
  FileText, 
  FileCode,
  FileJson,
  ChevronRight,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import './FileExplorer.css';

const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const iconMap = {
    'js': <FileCode size={16} />,
    'jsx': <FileCode size={16} />,
    'ts': <FileCode size={16} />,
    'tsx': <FileCode size={16} />,
    'go': <FileCode size={16} />,
    'py': <FileCode size={16} />,
    'md': <FileText size={16} />,
    'txt': <FileText size={16} />,
    'json': <FileJson size={16} />,
    'yml': <FileText size={16} />,
    'yaml': <FileText size={16} />,
  };
  
  return iconMap[ext] || <File size={16} />;
};

function FileTreeNode({ node, level, onFileOpen, onContextMenu, expandedDirs, toggleExpanded }) {
  const isExpanded = expandedDirs.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  
  const handleClick = (e) => {
    e.stopPropagation();
    if (node.isDir) {
      toggleExpanded(node.path);
    }
  };
  
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (!node.isDir) {
      onFileOpen(node);
    }
  };
  
  const handleRightClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(node, e);
  };
  
  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${node.isGitIgnored ? 'gitignored' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
      >
        <span className="file-tree-chevron">
          {node.isDir && hasChildren && (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          )}
        </span>
        <span className="file-tree-icon">
          {node.isDir ? (
            isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            getFileIcon(node.name)
          )}
        </span>
        <span className="file-tree-name">{node.name}</span>
      </div>
      
      {node.isDir && isExpanded && hasChildren && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileOpen={onFileOpen}
              onContextMenu={onContextMenu}
              expandedDirs={expandedDirs}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContextMenu({ x, y, node, onClose, onAction }) {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);
  
  const actions = node.isDir
    ? [
        { label: 'Open in Terminal', action: 'openInTerminal' },
        { label: 'Send Path to Terminal', action: 'sendPath' },
        { label: '─────────────', disabled: true },
        { label: 'New File', action: 'newFile' },
        { label: 'New Folder', action: 'newFolder' },
        { label: '─────────────', disabled: true },
        { label: 'Rename', action: 'rename' },
        { label: 'Delete', action: 'delete' },
      ]
    : [
        { label: 'Open in Editor', action: 'openInEditor' },
        { label: 'Open in New Tab', action: 'openInNewTab' },
        { label: '─────────────', disabled: true },
        { label: 'Send to Terminal', action: 'sendToTerminal' },
        { label: 'Copy Path', action: 'copyPath' },
        { label: 'Copy Relative Path', action: 'copyRelativePath' },
        { label: '─────────────', disabled: true },
        { label: 'Rename', action: 'rename' },
        { label: 'Delete', action: 'delete' },
      ];
  
  return (
    <div className="context-menu" style={{ top: y, left: x }}>
      {actions.map((action, idx) => (
        action.disabled ? (
          <div key={idx} className="context-menu-separator" />
        ) : (
          <div
            key={idx}
            className="context-menu-item"
            onClick={() => {
              onAction(action.action, node);
              onClose();
            }}
          >
            {action.label}
          </div>
        )
      ))}
    </div>
  );
}

export default function FileExplorer({ currentPath, rootPath, onFileOpen, terminalRef, onRefresh, shellConfig }) {
  const [fileTree, setFileTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [lastValidPath, setLastValidPath] = useState(null);
  const [lastStats, setLastStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const statsCheckInterval = useRef(null);
  
  // Load file tree when path changes
  useEffect(() => {
    const pathToLoad = currentPath || lastValidPath || rootPath || '.';
    loadFileTree(pathToLoad);
    
    // Start stats monitoring
    startStatsMonitoring(pathToLoad);
    
    return () => {
      // Clean up interval on unmount or path change
      if (statsCheckInterval.current) {
        clearInterval(statsCheckInterval.current);
        statsCheckInterval.current = null;
      }
    };
  }, [currentPath, rootPath]);
  
  // Check directory stats for changes
  const checkDirectoryStats = async (path) => {
    try {
      const root = rootPath || '.';
      const params = new URLSearchParams();
      params.set('path', path);
      params.set('rootPath', root);
      
      if (shellConfig?.shellType) {
        params.set('shell', shellConfig.shellType);
        if (shellConfig.shellType === 'wsl' && shellConfig.wslDistro) {
          params.set('distro', shellConfig.wslDistro);
        }
      }
      
      const response = await fetch(`/api/files/stats?${params.toString()}`);
      if (!response.ok) return null;
      
      const stats = await response.json();
      
      // If stats changed, refresh the tree
      if (lastStats && stats.totalCount !== lastStats.totalCount) {
        console.log('[FileExplorer] Directory changed, refreshing...', { 
          old: lastStats.totalCount, 
          new: stats.totalCount 
        });
        loadFileTree(path);
      }
      
      setLastStats(stats);
    } catch (err) {
      // Silent fail for stats check
      console.debug('[FileExplorer] Stats check failed:', err.message);
    }
  };
  
  // Start monitoring directory for changes
  const startStatsMonitoring = (path) => {
    // Clear any existing interval
    if (statsCheckInterval.current) {
      clearInterval(statsCheckInterval.current);
    }
    
    // Check stats every 3 seconds
    statsCheckInterval.current = setInterval(() => {
      checkDirectoryStats(path);
    }, 3000);
    
    // Do initial stats check
    checkDirectoryStats(path);
  };
  
  const loadFileTree = async (path) => {
    setLoading(true);
    setError(null);
    try {
      const root = rootPath || '.';
      const params = new URLSearchParams();
      params.set('path', path);
      params.set('rootPath', root);
      
      // Pass shell type and WSL distro for proper path resolution
      if (shellConfig?.shellType) {
        params.set('shell', shellConfig.shellType);
        if (shellConfig.shellType === 'wsl' && shellConfig.wslDistro) {
          params.set('distro', shellConfig.wslDistro);
        }
      }
      
      const response = await fetch(`/api/files/list?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = errorText || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Failed to load files: ${errorMsg}`);
      }
      const data = await response.json();
      setFileTree(data);
      setLastValidPath(path);
      
      // Auto-expand root and first-level directories
      const newExpanded = new Set([data.path]);
      if (data.children) {
        data.children.forEach(child => {
          if (child.isDir && !child.name.startsWith('.') && child.name !== 'node_modules') {
            newExpanded.add(child.path);
          }
        });
      }
      setExpandedDirs(newExpanded);
    } catch (err) {
      const errorMsg = err?.message || 'Unknown error loading files';
      console.error('FileExplorer load error:', errorMsg);
      setError(errorMsg);
      // If load fails, try falling back to previous valid path or root
      if (path !== '.' && path !== lastValidPath) {
        setTimeout(() => loadFileTree(lastValidPath || rootPath || '.'), 500);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleRetry = () => {
    loadFileTree(currentPath || rootPath || '.');
  };
  
  const handleManualRefresh = () => {
    setRefreshing(true);
    loadFileTree(currentPath || rootPath || '.');
    // Also reset stats to force fresh check
    setLastStats(null);
  };
  
  const toggleExpanded = (path) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };
  
  const handleContextMenu = (node, event) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node
    });
  };
  
  const handleContextAction = async (action, node) => {
    switch (action) {
      case 'openInEditor':
        onFileOpen(node);
        break;
        
      case 'sendToTerminal':
        if (terminalRef?.current) {
          terminalRef.current.write(`./${node.name}`);
        }
        break;
        
      case 'openInTerminal':
        if (terminalRef?.current) {
          terminalRef.current.write(`cd ${node.path} && ls\r`);
        }
        break;
        
      case 'sendPath':
        if (terminalRef?.current) {
          terminalRef.current.write(`./${node.name}/`);
        }
        break;
        
      case 'copyPath':
        navigator.clipboard.writeText(node.path);
        break;
        
      case 'copyRelativePath':
        navigator.clipboard.writeText(`./${node.name}`);
        break;
        
      case 'delete':
        if (confirm(`Delete ${node.name}?`)) {
          try {
            const root = rootPath || '.';
            const response = await fetch('/api/files/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: node.path, rootPath: root })
            });
            if (response.ok) {
              loadFileTree(currentPath || root);
            }
          } catch (err) {
            console.error('Delete failed:', err);
          }
        }
        break;
        
      default:
        console.log('Action not implemented:', action);
    }
  };
  
  if (loading) {
    return <div className="file-explorer-loading">Loading files...</div>;
  }
  
  if (error) {
    return (
      <div className="file-explorer-error">
        <div>Error: {error}</div>
        <button className="file-explorer-retry-btn" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <Folder size={16} />
        <span>Files</span>
        <button 
          className="file-explorer-refresh-btn"
          onClick={handleManualRefresh}
          disabled={loading || refreshing}
          title="Refresh file list"
        >
          <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
        </button>
      </div>
      
      <div className="file-explorer-tree">
        {fileTree && (
          <FileTreeNode
            node={fileTree}
            level={0}
            onFileOpen={onFileOpen}
            onContextMenu={handleContextMenu}
            expandedDirs={expandedDirs}
            toggleExpanded={toggleExpanded}
          />
        )}
      </div>
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}
    </div>
  );
}
