/**
 * LensFilePicker - Context Builder with swappable view modes
 * 
 * A modern file picker designed for staging files into an LLM context window.
 * Features:
 * - Lens system: Heatmap (recent activity), Graph (dependencies), Search (fuzzy find)
 * - Persistent Context Cart with real-time token counting
 * - Cyberpunk-lite aesthetic
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Flame, Network, Search, ShoppingCart, X, Check, ChevronRight,
  FileCode, Trash2, RefreshCw, Package, Layers
} from 'lucide-react';
import './LensFilePicker.css';

// Lens types
const LENS_TYPES = {
  HEATMAP: 'heatmap',
  GRAPH: 'graph',
  SEARCH: 'search',
  FEATURES: 'features', // NEW: Group files by feature/functionality
};

// Token budget (128k default)
const DEFAULT_TOKEN_BUDGET = 128000;

// Estimate tokens from file size (~4 chars per token)
const estimateTokens = (size) => Math.ceil(size / 4);

// Get heat score based on modification time (0-1)
const getHeatScore = (modTime) => {
  if (!modTime) return 0;
  const hoursSince = (Date.now() - new Date(modTime).getTime()) / (1000 * 60 * 60);
  return Math.max(0, Math.min(1, 1 / (1 + hoursSince / 24)));
};

// Get heat color based on score
const getHeatColor = (score) => {
  if (score > 0.7) return 'var(--lens-hot)';
  if (score > 0.4) return 'var(--lens-warm)';
  if (score > 0.2) return 'var(--lens-cool)';
  return 'var(--lens-cold)';
};

// Humanize time difference
const humanizeTime = (date) => {
  if (!date) return 'unknown';
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
};

// File item component
const FileItem = ({ file, isSelected, onToggle, onOpen, showHeat = false }) => {
  const heat = showHeat ? getHeatScore(file.modTime) : 0;
  const tokens = file.tokenCount || estimateTokens(file.size || 0);
  
  return (
    <div 
      className={`lens-file-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggle(file)}
      onDoubleClick={() => onOpen && onOpen(file)}
      style={showHeat ? { borderLeftColor: getHeatColor(heat) } : {}}
    >
      <div className="lens-file-icon">
        <FileCode size={16} />
      </div>
      <div className="lens-file-info">
        <div className="lens-file-name">{file.name}</div>
        <div className="lens-file-meta">
          <span className="lens-file-tokens">{tokens.toLocaleString()} tokens</span>
          {file.modTime && (
            <span className="lens-file-time">{humanizeTime(file.modTime)}</span>
          )}
        </div>
      </div>
      <div className="lens-file-checkbox">
        {isSelected ? <Check size={16} /> : <div className="lens-checkbox-empty" />}
      </div>
    </div>
  );
};

// Heatmap Lens - sorted by modification time
const HeatmapLens = ({ files, selectedPaths, onToggle, onOpen }) => {
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aTime = new Date(a.modTime || 0).getTime();
      const bTime = new Date(b.modTime || 0).getTime();
      return bTime - aTime; // Newest first
    });
  }, [files]);

  return (
    <div className="lens-content">
      <div className="lens-subtitle">Files sorted by recent activity</div>
      <div className="lens-file-list">
        {sortedFiles.map(file => (
          <FileItem
            key={file.path}
            file={file}
            isSelected={selectedPaths.has(file.path)}
            onToggle={onToggle}
            onOpen={onOpen}
            showHeat={true}
          />
        ))}
      </div>
    </div>
  );
};

// Graph Lens - dependency view (mock for now)
const GraphLens = ({ files, selectedPaths, onToggle, onOpen }) => {
  // Group files by directory for a tree-like view
  const grouped = useMemo(() => {
    const groups = {};
    files.forEach(file => {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(file);
    });
    return groups;
  }, [files]);

  return (
    <div className="lens-content">
      <div className="lens-subtitle">Files grouped by directory</div>
      <div className="lens-graph-tree">
        {Object.entries(grouped).map(([dir, dirFiles]) => (
          <div key={dir} className="lens-graph-group">
            <div className="lens-graph-dir">
              <ChevronRight size={14} />
              <span>{dir || '.'}</span>
            </div>
            <div className="lens-graph-files">
              {dirFiles.map(file => (
                <FileItem
                  key={file.path}
                  file={file}
                  isSelected={selectedPaths.has(file.path)}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Search Lens - fuzzy search
const SearchLens = ({ files, selectedPaths, onToggle, onOpen }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter(f => 
      f.name.toLowerCase().includes(q) || 
      f.path.toLowerCase().includes(q)
    );
  }, [files, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="lens-content">
      <div className="lens-search-input">
        <Search size={16} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} className="lens-search-clear">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="lens-file-list">
        {filteredFiles.map(file => (
          <FileItem
            key={file.path}
            file={file}
            isSelected={selectedPaths.has(file.path)}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
        {filteredFiles.length === 0 && (
          <div className="lens-empty">No files match "{query}"</div>
        )}
      </div>
    </div>
  );
};

// Feature detection - extracts feature names from file paths
const detectFeature = (filePath) => {
  const normalized = filePath.toLowerCase();
  
  // Check for common feature patterns
  if (normalized.includes('/auth/') || normalized.includes('auth.')) return 'Authentication';
  if (normalized.includes('/chat/') || normalized.includes('chat.')) return 'Chat';
  if (normalized.includes('/terminal/') || normalized.includes('terminal.')) return 'Terminal';
  if (normalized.includes('/workflow/') || normalized.includes('workflow.')) return 'Workflows';
  if (normalized.includes('/command') || normalized.includes('command.')) return 'Command Cards';
  if (normalized.includes('/file') || normalized.includes('file.')) return 'File System';
  if (normalized.includes('/settings/') || normalized.includes('settings.')) return 'Settings';
  if (normalized.includes('/theme') || normalized.includes('theme.')) return 'Themes';
  if (normalized.includes('/am/') || normalized.includes('am.')) return 'Artificial Memory';
  if (normalized.includes('/slm/') || normalized.includes('slm.')) return 'Smart Routing';
  if (normalized.includes('/llm/') || normalized.includes('llm.')) return 'LLM Integration';
  if (normalized.includes('/vision/') || normalized.includes('vision.')) return 'Vision';
  if (normalized.includes('/tour/') || normalized.includes('tour.')) return 'Tour';
  if (normalized.includes('/assist') || normalized.includes('assist.')) return 'Forge Assist';
  if (normalized.includes('/editor') || normalized.includes('editor.')) return 'Editor';
  if (normalized.includes('/modal') || normalized.includes('modal.')) return 'Modals';
  if (normalized.includes('/debug') || normalized.includes('debug.')) return 'Debug';
  if (normalized.includes('/search') || normalized.includes('search.')) return 'Search';
  if (normalized.includes('/storage') || normalized.includes('storage.')) return 'Storage';
  if (normalized.includes('/api/') || normalized.includes('api.')) return 'API';
  if (normalized.includes('/utils/') || normalized.includes('utils.')) return 'Utilities';
  if (normalized.includes('/hooks/') || normalized.includes('hook.')) return 'Hooks';
  if (normalized.includes('/components/')) return 'Components';
  if (normalized.includes('/config/')) return 'Configuration';
  if (normalized.includes('/styles/') || normalized.endsWith('.css')) return 'Styles';
  if (normalized.includes('test.') || normalized.includes('spec.')) return 'Tests';
  if (normalized.includes('readme') || normalized.includes('doc')) return 'Documentation';
  
  // Fallback to directory-based grouping
  const parts = filePath.split('/');
  if (parts.length > 1) return parts[0] || 'Root';
  return 'Ungrouped';
};

// Features Lens - group files by feature/functionality
const FeaturesLens = ({ files, selectedPaths, onToggle, onOpen }) => {
  const grouped = useMemo(() => {
    const groups = {};
    files.forEach(file => {
      const feature = detectFeature(file.path);
      if (!groups[feature]) groups[feature] = [];
      groups[feature].push(file);
    });
    
    // Sort features by file count (descending)
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [files]);

  return (
    <div className="lens-content">
      <div className="lens-subtitle">Files grouped by feature/functionality</div>
      <div className="lens-features-groups">
        {grouped.map(([feature, featureFiles]) => {
          const totalTokens = featureFiles.reduce((sum, f) => 
            sum + (f.tokenCount || estimateTokens(f.size || 0)), 0
          );
          const selectedCount = featureFiles.filter(f => selectedPaths.has(f.path)).length;
          
          return (
            <div key={feature} className="lens-feature-group">
              <div className="lens-feature-header">
                <div className="lens-feature-title">
                  <ChevronRight size={14} />
                  <span className="lens-feature-name">{feature}</span>
                  <span className="lens-feature-badge">
                    {featureFiles.length} file{featureFiles.length !== 1 ? 's' : ''}
                  </span>
                  {selectedCount > 0 && (
                    <span className="lens-feature-selected">
                      {selectedCount} selected
                    </span>
                  )}
                </div>
                <div className="lens-feature-tokens">
                  {totalTokens.toLocaleString()} tokens
                </div>
              </div>
              <div className="lens-feature-files">
                {featureFiles.map(file => (
                  <FileItem
                    key={file.path}
                    file={file}
                    isSelected={selectedPaths.has(file.path)}
                    onToggle={onToggle}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Context Cart component
const ContextCart = ({ items, budget, onRemove, onClear }) => {
  const totalTokens = useMemo(() => {
    return items.reduce((sum, f) => sum + (f.tokenCount || estimateTokens(f.size || 0)), 0);
  }, [items]);

  const percentage = Math.min(100, (totalTokens / budget) * 100);
  const isOverBudget = totalTokens > budget;

  return (
    <div className="lens-cart">
      <div className="lens-cart-header">
        <div className="lens-cart-title">
          <Package size={18} />
          <span>Context Cart</span>
        </div>
        {items.length > 0 && (
          <button className="lens-cart-clear" onClick={onClear} title="Clear all">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="lens-cart-budget">
        <div className="lens-budget-bar">
          <div 
            className={`lens-budget-fill ${isOverBudget ? 'over' : ''}`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        <div className={`lens-budget-text ${isOverBudget ? 'over' : ''}`}>
          {totalTokens.toLocaleString()} / {budget.toLocaleString()} tokens
        </div>
      </div>

      <div className="lens-cart-items">
        {items.length === 0 ? (
          <div className="lens-cart-empty">
            <ShoppingCart size={24} />
            <span>No files selected</span>
            <span className="lens-cart-hint">Click files to add them</span>
          </div>
        ) : (
          items.map(file => (
            <div key={file.path} className="lens-cart-item">
              <div className="lens-cart-item-info">
                <div className="lens-cart-item-name">{file.name}</div>
                <div className="lens-cart-item-tokens">
                  {(file.tokenCount || estimateTokens(file.size || 0)).toLocaleString()} tokens
                </div>
              </div>
              <button 
                className="lens-cart-item-remove" 
                onClick={() => onRemove(file.path)}
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main LensFilePicker component
export default function LensFilePicker({ 
  rootPath = '.', 
  currentPath,  // Alias for rootPath from App.jsx
  onSelectionChange,
  onFileSelect,  // Called when file is double-clicked to open
  tokenBudget = DEFAULT_TOKEN_BUDGET,
}) {
  // Use currentPath if provided (from App.jsx), otherwise use rootPath
  const effectivePath = currentPath || rootPath;
  
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Map()); // path -> file
  const [activeLens, setActiveLens] = useState(LENS_TYPES.HEATMAP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Handle file open (double-click)
  const handleFileOpen = useCallback((file) => {
    if (onFileSelect) {
      // Pass the full file object so the parent can access path, name, etc.
      onFileSelect(file);
    }
  }, [onFileSelect]);

  // Fetch files from API
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/files/flat?path=${encodeURIComponent(effectivePath)}&limit=500`);
      if (!response.ok) throw new Error('Failed to load files');
      const data = await response.json();
      
      // API returns array of file path strings, transform to our format
      let fileList = [];
      if (Array.isArray(data)) {
        // Flat array of paths - handle both Windows (\) and Unix (/) separators
        fileList = data.map(filePath => {
          // Split on both forward and back slashes for cross-platform support
          const parts = filePath.split(/[/\\]/);
          const name = parts[parts.length - 1] || filePath;
          return {
            name,
            path: filePath,
            size: 0, // Size unknown from flat API
            modTime: null,
            tokenCount: 0,
          };
        });
      } else if (data.files && Array.isArray(data.files)) {
        // Object with files array - handle both Windows and Unix paths
        fileList = data.files.map(f => ({
          name: f.name || f.path?.split(/[/\\]/).pop() || 'unknown',
          path: f.path,
          size: f.size || 0,
          modTime: f.modTime,
          tokenCount: estimateTokens(f.size || 0),
        }));
      }
      
      setFiles(fileList);
    } catch (err) {
      setError(err.message);
      console.error('[LensFilePicker] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [effectivePath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Selected paths as Set for quick lookup
  const selectedPaths = useMemo(() => new Set(selectedFiles.keys()), [selectedFiles]);

  // Toggle file selection
  const toggleFile = useCallback((file) => {
    setSelectedFiles(prev => {
      const newMap = new Map(prev);
      if (newMap.has(file.path)) {
        newMap.delete(file.path);
      } else {
        newMap.set(file.path, file);
      }
      return newMap;
    });
  }, []);

  // Remove file from selection
  const removeFile = useCallback((path) => {
    setSelectedFiles(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedFiles(new Map());
  }, []);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(selectedFiles.values()));
    }
  }, [selectedFiles, onSelectionChange]);

  // Lens tabs
  const lenses = [
    { type: LENS_TYPES.HEATMAP, icon: Flame, label: 'Heatmap' },
    { type: LENS_TYPES.FEATURES, icon: Layers, label: 'Features' },
    { type: LENS_TYPES.GRAPH, icon: Network, label: 'Graph' },
    { type: LENS_TYPES.SEARCH, icon: Search, label: 'Search' },
  ];

  // Render active lens
  const renderLens = () => {
    const props = { files, selectedPaths, onToggle: toggleFile, onOpen: handleFileOpen };
    switch (activeLens) {
      case LENS_TYPES.FEATURES:
        return <FeaturesLens {...props} />;
      case LENS_TYPES.GRAPH:
        return <GraphLens {...props} />;
      case LENS_TYPES.SEARCH:
        return <SearchLens {...props} />;
      default:
        return <HeatmapLens {...props} />;
    }
  };

  return (
    <div className="lens-picker">
      {/* Lens Header with tabs */}
      <div className="lens-header">
        <div className="lens-tabs">
          {lenses.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              className={`lens-tab ${activeLens === type ? 'active' : ''}`}
              onClick={() => setActiveLens(type)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button className="lens-refresh" onClick={loadFiles} title="Refresh">
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Main content area */}
      <div className="lens-main">
        {/* Left: Lens view */}
        <div className="lens-left">
          {loading ? (
            <div className="lens-loading">
              <RefreshCw className="spinning" size={24} />
              <span>Loading files...</span>
            </div>
          ) : error ? (
            <div className="lens-error">
              <span>Error: {error}</span>
              <button onClick={loadFiles}>Retry</button>
            </div>
          ) : files.length === 0 ? (
            <div className="lens-empty">
              <FileCode size={32} />
              <span>No code files found</span>
            </div>
          ) : (
            renderLens()
          )}
        </div>

        {/* Right: Context Cart */}
        <div className="lens-right">
          <ContextCart
            items={Array.from(selectedFiles.values())}
            budget={tokenBudget}
            onRemove={removeFile}
            onClear={clearSelection}
          />
        </div>
      </div>
    </div>
  );
}
