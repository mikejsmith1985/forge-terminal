import React, { useState, useEffect } from 'react';
import { RotateCcw, Database, AlertTriangle, FileClock } from 'lucide-react';

const BackupsPanel = ({ onToast }) => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);

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

  const handleRestore = async (backupName) => {
    if (!window.confirm(`Are you sure you want to restore "${backupName}"? This will overwrite your current commands.`)) {
      return;
    }

    setRestoring(backupName);
    try {
      const res = await fetch('/api/commands/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupName })
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
              The last 20 versions are kept safe. Restore a previous version if you accidentally deleted something important.
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
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                onClick={() => handleRestore(backup.name)}
                disabled={restoring === backup.name}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '0.85em'
                }}
              >
                <RotateCcw size={14} />
                {restoring === backup.name ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BackupsPanel;
