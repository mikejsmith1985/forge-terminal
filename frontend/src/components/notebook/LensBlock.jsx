/**
 * LensBlock - File reference cell for Notebook view
 * 
 * Displays a file reference injected from the Lens File Picker sidebar.
 * When a user selects a file in the sidebar, it creates a LensBlock
 * that grants the active Agent permission to read/edit the file.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
  FileCode, FileText, File, Image, Settings, 
  X, ExternalLink, Eye, Edit2, Lock, Unlock,
  ChevronDown, ChevronUp
} from 'lucide-react';

// Permission levels
const PERMISSION = {
  READ: 'read',
  EDIT: 'edit',
  NONE: 'none',
};

// Get icon based on file extension
const getFileIcon = (filename) => {
  if (!filename) return File;
  
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'go', 'py', 'rs', 'java', 'c', 'cpp', 'h', 'cs'];
  const textExts = ['md', 'txt', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  const configExts = ['config', 'env', 'ini', 'conf'];
  
  if (codeExts.includes(ext)) return FileCode;
  if (textExts.includes(ext)) return FileText;
  if (imageExts.includes(ext)) return Image;
  if (configExts.includes(ext)) return Settings;
  
  return File;
};

// Estimate tokens from file size
const estimateTokens = (size) => Math.ceil((size || 0) / 4);

// Format file size
const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const LensBlock = ({
  cellId,
  file, // { path, name, size, modTime, content? }
  permission = PERMISSION.READ,
  onPermissionChange,
  onRemove,
  onOpen,
  onPreview,
  showPreview = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPermission, setCurrentPermission] = useState(permission);

  const FileIcon = useMemo(() => getFileIcon(file?.name), [file?.name]);
  const tokens = useMemo(() => estimateTokens(file?.size), [file?.size]);

  // Toggle permission between read/edit
  const togglePermission = useCallback(() => {
    const newPerm = currentPermission === PERMISSION.READ 
      ? PERMISSION.EDIT 
      : PERMISSION.READ;
    setCurrentPermission(newPerm);
    onPermissionChange?.(file, newPerm);
  }, [currentPermission, file, onPermissionChange]);

  // Remove this file reference
  const handleRemove = useCallback(() => {
    onRemove?.(file);
  }, [file, onRemove]);

  if (!file) return null;

  return (
    <div className={`lens-block ${currentPermission}`}>
      {/* Header */}
      <div className="lens-block-header">
        <div className="lens-block-file-info">
          <FileIcon size={18} className="lens-block-icon" />
          <div className="lens-block-name-col">
            <span className="lens-block-name" title={file.path}>
              {file.name}
            </span>
            <span className="lens-block-path">
              {file.path?.replace(file.name, '').replace(/[\/\\]$/, '') || '.'}
            </span>
          </div>
        </div>

        <div className="lens-block-meta">
          <span className="lens-block-tokens" title="Estimated tokens">
            ~{tokens.toLocaleString()} tokens
          </span>
          <span className="lens-block-size">
            {formatSize(file.size)}
          </span>
        </div>

        <div className="lens-block-actions">
          {/* Permission toggle */}
          <button
            className={`lens-block-btn permission ${currentPermission}`}
            onClick={togglePermission}
            title={currentPermission === PERMISSION.READ ? 'Read-only (click for Edit)' : 'Edit allowed (click for Read-only)'}
          >
            {currentPermission === PERMISSION.READ ? (
              <>
                <Eye size={14} />
                <span>Read</span>
              </>
            ) : (
              <>
                <Edit2 size={14} />
                <span>Edit</span>
              </>
            )}
          </button>

          {/* Open in editor */}
          {onOpen && (
            <button
              className="lens-block-btn open"
              onClick={() => onOpen(file)}
              title="Open in editor"
            >
              <ExternalLink size={14} />
            </button>
          )}

          {/* Expand/collapse preview */}
          {file.content && (
            <button
              className="lens-block-btn expand"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Collapse' : 'Preview'}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* Remove */}
          <button
            className="lens-block-btn remove"
            onClick={handleRemove}
            title="Remove from context"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Preview content */}
      {isExpanded && file.content && (
        <div className="lens-block-preview">
          <pre>
            <code>{file.content.slice(0, 500)}{file.content.length > 500 ? '\n...' : ''}</code>
          </pre>
        </div>
      )}

      {/* Permission indicator bar */}
      <div className={`lens-block-permission-bar ${currentPermission}`}>
        {currentPermission === PERMISSION.READ ? (
          <><Lock size={10} /> Agent can read this file</>
        ) : (
          <><Unlock size={10} /> Agent can read and edit this file</>
        )}
      </div>
    </div>
  );
};

export { LensBlock, PERMISSION };
export default LensBlock;
