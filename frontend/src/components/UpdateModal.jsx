import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, ExternalLink, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp, History, Upload } from 'lucide-react';

const UpdateModal = ({ isOpen, onClose, updateInfo, currentVersion, onApplyUpdate }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // 'downloading' | 'applying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installFromFileInput, setInstallFromFileInput] = useState('');

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setIsUpdating(false);
      setUpdateStatus(null);
      setErrorMessage('');
      setShowVersions(false);
      setInstallFromFileInput('');
    }
  }, [isOpen]);

  const fetchVersions = async () => {
    if (versions.length > 0) {
      setShowVersions(!showVersions);
      return;
    }
    
    setLoadingVersions(true);
    try {
      const res = await fetch('/api/update/versions');
      const data = await res.json();
      if (data.releases) {
        setVersions(data.releases);
        setShowVersions(true);
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus('downloading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        setUpdateStatus('success');
        // Perform a hard refresh after a brief delay to show success message
        setTimeout(() => {
          const timestamp = new Date().getTime();
          window.location.href = `${window.location.origin}?t=${timestamp}`;
        }, 1500);
      } else {
        setUpdateStatus('error');
        setErrorMessage(data.error || 'Unknown error occurred');
        setIsUpdating(false);
      }
    } catch (err) {
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to connect to server');
      setIsUpdating(false);
    }
  };

  const handleInstallFromFile = async () => {
    if (!installFromFileInput.trim()) {
      setErrorMessage('Please enter a file path');
      return;
    }

    setIsUpdating(true);
    setUpdateStatus('applying');
    setErrorMessage('');

    try {
      const res = await fetch('/api/update/install-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: installFromFileInput })
      });
      const data = await res.json();
      
      if (data.success) {
        setUpdateStatus('success');
        setTimeout(() => {
          const timestamp = new Date().getTime();
          window.location.href = `${window.location.origin}?t=${timestamp}`;
        }, 1500);
      } else {
        setUpdateStatus('error');
        setErrorMessage(data.error || 'Unknown error occurred');
        setIsUpdating(false);
      }
    } catch (err) {
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to connect to server');
      setIsUpdating(false);
    }
  };

  const handleRemindLater = () => {
    // Store dismissal time - we'll remind again in 24 hours
    localStorage.setItem('updateDismissedAt', Date.now().toString());
    localStorage.setItem('updateDismissedVersion', updateInfo?.latestVersion || '');
    onClose();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (!isOpen) return null;

  const hasUpdate = updateInfo?.available;

  return (
    <>
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: '550px' }}>
          <div className="modal-header">
            <h3>
              <Download size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} />
              Software Update
            </h3>
            <button className="btn-close" onClick={onClose} disabled={isUpdating}>×</button>
          </div>

          <div className="modal-body" style={{ padding: '20px' }}>
          {/* Current Version */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px',
            padding: '12px',
            background: '#1a1a1a',
            borderRadius: '8px'
          }}>
            <span style={{ color: '#888' }}>Current Version</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>v{currentVersion}</span>
          </div>

          {hasUpdate ? (
            <>
              {/* Available Update */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '20px',
                padding: '12px',
                background: '#1e1b4b',
                borderRadius: '8px',
                border: '1px solid #8b5cf6'
              }}>
                <span style={{ color: '#a78bfa' }}>Available Update</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#c4b5fd' }}>
                  {updateInfo.latestVersion}
                </span>
              </div>

              {/* Warning Message */}
              <div style={{ 
                background: '#422006', 
                border: '1px solid #f97316',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}>
                <AlertTriangle size={20} style={{ color: '#fb923c', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.9em', color: '#fed7aa' }}>
                  <strong>Warning:</strong> Updating will restart Forge Terminal. Any in-progress 
                  CLI work (including Copilot CLI sessions) will be lost. Make sure to complete 
                  or save your current work before updating.
                </div>
              </div>

              {/* Release Notes */}
              {updateInfo.releaseNotes && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '8px', fontSize: '0.9em', color: '#888' }}>Release Notes</h4>
                  <div style={{ 
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '12px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontSize: '0.85em',
                    whiteSpace: 'pre-wrap',
                    color: '#ccc'
                  }}>
                    {updateInfo.releaseNotes}
                  </div>
                </div>
              )}

              {/* Update Status */}
              {updateStatus && (
                <div style={{ 
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '15px',
                  background: updateStatus === 'error' ? '#450a0a' : 
                              updateStatus === 'success' ? '#14532d' : '#1e3a5f',
                  border: `1px solid ${updateStatus === 'error' ? '#ef4444' : 
                                        updateStatus === 'success' ? '#22c55e' : '#3b82f6'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  {updateStatus === 'downloading' && (
                    <>
                      <RefreshCw size={18} className="spin" style={{ color: '#60a5fa' }} />
                      <span style={{ color: '#93c5fd' }}>Downloading update...</span>
                    </>
                  )}
                  {updateStatus === 'success' && (
                    <>
                      <CheckCircle size={18} style={{ color: '#4ade80' }} />
                      <span style={{ color: '#86efac' }}>Update applied! Restarting...</span>
                    </>
                  )}
                  {updateStatus === 'error' && (
                    <>
                      <AlertTriangle size={18} style={{ color: '#f87171' }} />
                      <span style={{ color: '#fca5a5' }}>{errorMessage}</span>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '30px',
              color: '#888'
            }}>
              <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: '15px' }} />
              <p style={{ margin: 0 }}>You're running the latest version!</p>
            </div>
          )}

          {/* Version History Section */}
          <div style={{ marginTop: '15px', borderTop: '1px solid #333', paddingTop: '15px' }}>
            <button
              onClick={fetchVersions}
              disabled={loadingVersions}
              style={{
                background: 'transparent',
                border: '1px solid #444',
                borderRadius: '6px',
                padding: '10px 15px',
                color: '#888',
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.9em'
              }}
            >
              {loadingVersions ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <History size={16} />
              )}
              {showVersions ? 'Hide' : 'Show'} Previous Versions
              {showVersions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showVersions && versions.length > 0 && (
              <div style={{ 
                marginTop: '15px',
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #333',
                borderRadius: '8px'
              }}>
                {versions.map((release, idx) => (
                  <div 
                    key={release.version}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: idx < versions.length - 1 ? '1px solid #333' : 'none',
                      background: release.isCurrent ? '#1a2e1a' : 'transparent'
                    }}
                  >
                    <div>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 600,
                        color: release.isCurrent ? '#4ade80' : '#ccc'
                      }}>
                        {release.version}
                        {release.isCurrent && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '0.75em', 
                            background: '#22c55e',
                            color: '#000',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Current
                          </span>
                        )}
                      </span>
                      <div style={{ fontSize: '0.8em', color: '#666', marginTop: '2px' }}>
                        {formatDate(release.publishedAt)}
                      </div>
                    </div>
                    {release.downloadUrl && !release.isCurrent && (
                      <a
                        href={release.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.8em',
                          color: '#60a5fa',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Download size={14} />
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual Install Section */}
          <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '0.9em', color: '#888' }}>
              <Upload size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Install from Downloaded File
            </h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Enter path to downloaded binary (e.g., /Users/me/Downloads/forge-darwin-arm64)"
                value={installFromFileInput}
                onChange={(e) => setInstallFromFileInput(e.target.value)}
                disabled={isUpdating}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  color: '#ccc',
                  fontSize: '0.85em',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={handleInstallFromFile}
                disabled={isUpdating || !installFromFileInput.trim()}
                style={{
                  padding: '10px 16px',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: isUpdating || !installFromFileInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isUpdating || !installFromFileInput.trim() ? 0.5 : 1,
                  fontSize: '0.85em',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                {isUpdating && updateStatus === 'applying' ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Install
                  </>
                )}
              </button>
            </div>
            <div style={{ fontSize: '0.75em', color: '#666', marginTop: '8px' }}>
              After downloading a binary manually, paste its full path above to install it.
            </div>
          </div>

          {/* GitHub Releases Link */}
          <div style={{ 
            textAlign: 'center',
            paddingTop: '15px',
            marginTop: '15px',
            borderTop: '1px solid #333'
          }}>
            <a 
              href="https://github.com/mikejsmith1985/forge-terminal/releases" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                color: '#60a5fa', 
                textDecoration: 'none',
                fontSize: '0.85em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <ExternalLink size={14} />
              View all releases on GitHub
            </a>
          </div>
        </div>

        <div className="modal-footer" style={{ 
          padding: '15px 20px', 
          borderTop: '1px solid #333',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          {hasUpdate ? (
            <>
              <button 
                className="btn btn-secondary" 
                onClick={handleRemindLater}
                disabled={isUpdating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Clock size={16} />
                Remind Me Later
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleUpdate}
                disabled={isUpdating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Update Now
                  </>
                )}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
       </div>
    </>
  );
};

export default UpdateModal;
