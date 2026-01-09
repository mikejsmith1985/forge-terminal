import React, { useState, useEffect } from 'react';
import { RotateCcw, Database, AlertTriangle, FileClock, ChevronDown, ChevronRight, Check } from 'lucide-react';

const BackupsPanel = ({ onToast }) => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);
  
  // New state for preview
  const [expandedBackup, setExpandedBackup] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/commands/backups');
      const data = await res.json();
      setBackups(data || []);
    } catch (err) {
      console.error('Failed to fetch backups:', err);
      if (onToast) onToast('Failed to load backups', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = async (backupName) => {
      if (expandedBackup === backupName) {
          setExpandedBackup(null);
          setPreviewData([]);
          setSelectedIds(new Set());
          return;
      }

      setExpandedBackup(backupName);
      setLoadingPreview(true);
      setPreviewData([]);
      setSelectedIds(new Set());

      try {
          const res = await fetch(`/api/commands/backups?file=${backupName}`);
          const data = await res.json();
          setPreviewData(data || []);
      } catch (err) {
          console.error('Failed to load backup details:', err);
          if (onToast) onToast('Failed to load backup details', 'error');
      } finally {
          setLoadingPreview(false);
      }
  };

  const toggleSelection = (id) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const handleRestore = async (backupName, specificIds = null) => {
    const isFullRestore = !specificIds;
    const msg = isFullRestore 
        ? `Are you sure you want to fully restore "${backupName}"? This will overwrite ALL your current commands.` 
        : `Are you sure you want to restore ${specificIds.length} commands from "${backupName}"? This will overwrite matching commands.`;

    if (!window.confirm(msg)) {
      return;
    }

    setRestoring(backupName);
    try {
      const body = { backupName };
      if (specificIds) {
          body.selectedIds = specificIds;
      }

      const res = await fetch('/api/commands/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        if (onToast) onToast('Backup restored successfully!', 'success');
        // Reload page to apply changes
        setTimeout(() => {
            window.location.reload();
        }, 1500);
      } else {
        if (onToast) onToast(`Restore failed: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to restore backup:', err);
      if (onToast) onToast('Failed to restore backup', 'error');
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="backups-panel">
      <div style={{
          background: 'rgba(59, 130, 246, 0.1)', 
          border: '1px solid rgba(59, 130, 246, 0.3)', 
          padding: '16px', 
          borderRadius: '8px', 
          marginBottom: '20px'
      }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} />
              Automated Rotating Backups
          </h4>
          <p style={{ margin: 0, fontSize: '0.9em', color: '#ccc' }}>
              Forge automatically backs up your command cards every time you make a change. 
              Expand a backup to preview its contents and restore specific commands.
          </p>
      </div>

      <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '16px' }}>Available Recovery Points</h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Loading backups...
        </div>
      ) : backups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No backups found yet. Make some changes to your commands to generate a backup.
        </div>
      ) : (
        <div className="backup-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {backups.map((backup) => (
            <div key={backup.name} style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div 
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                    onClick={() => handleToggleExpand(backup.name)}
                  >
                    {expandedBackup === backup.name ? <ChevronDown size={20} color="#888" /> : <ChevronRight size={20} color="#888" />}
                    <FileClock size={20} color="#888" />
                    <div>
                      <div style={{ fontWeight: 500, color: '#e5e5e5' }}>{formatDate(backup.timestamp)}</div>
                      <div style={{ fontSize: '0.8em', color: '#888' }}>
                        {backup.count} command cards • {backup.name}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={(e) => { e.stopPropagation(); handleRestore(backup.name); }}
                    disabled={restoring === backup.name}
                    title="Restore everything (overwrite current)"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        fontSize: '0.85em',
                        background: '#333'
                    }}
                  >
                    <RotateCcw size={14} />
                    {restoring === backup.name ? 'Restoring...' : 'Full Restore'}
                  </button>
              </div>

              {expandedBackup === backup.name && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #333', paddingLeft: '32px' }}>
                      {loadingPreview ? (
                          <div style={{color: '#888', fontStyle: 'italic'}}>Loading contents...</div>
                      ) : (
                          <div>
                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                  <div style={{fontSize: '0.9em', color: '#aaa'}}>
                                      Select cards to restore ({selectedIds.size} selected)
                                  </div>
                                  <button 
                                      className="btn btn-sm btn-primary"
                                      disabled={selectedIds.size === 0 || restoring === backup.name}
                                      onClick={() => handleRestore(backup.name, Array.from(selectedIds))}
                                      style={{
                                          fontSize: '0.85em', 
                                          padding: '4px 10px',
                                          background: selectedIds.size > 0 ? '#2563eb' : '#444',
                                          opacity: selectedIds.size > 0 ? 1 : 0.5
                                      }}
                                  >
                                      Restore Selected
                                  </button>
                              </div>
                              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                                  {previewData.map(cmd => (
                                      <div 
                                        key={cmd.id} 
                                        onClick={() => toggleSelection(cmd.id)}
                                        style={{
                                            background: selectedIds.has(cmd.id) ? 'rgba(37, 99, 235, 0.2)' : '#222',
                                            border: selectedIds.has(cmd.id) ? '1px solid #2563eb' : '1px solid #444',
                                            borderRadius: '4px',
                                            padding: '8px',
                                            cursor: 'pointer',
                                            fontSize: '0.9em'
                                        }}
                                      >
                                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                                              <div style={{
                                                  width: '16px', height: '16px', 
                                                  borderRadius: '4px', 
                                                  border: '1px solid #666',
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  background: selectedIds.has(cmd.id) ? '#2563eb' : 'transparent'
                                              }}>
                                                  {selectedIds.has(cmd.id) && <Check size={12} color="white" />}
                                              </div>
                                              <span style={{fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{cmd.description}</span>
                                          </div>
                                          <div style={{fontSize: '0.8em', color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                              {cmd.command}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BackupsPanel;
