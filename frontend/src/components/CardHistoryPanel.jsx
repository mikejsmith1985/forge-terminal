import React, { useState, useEffect } from 'react';
import { RotateCcw, History, ChevronDown, ChevronRight, Check, Database, Info } from 'lucide-react';
import { iconMap, getEmojiFromIcon } from './IconPicker';

const CardHistoryPanel = ({ onToast }) => {
  const [histories, setHistories] = useState([]);
  const [currentCards, setCurrentCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState(new Map()); // cardID -> versionNum
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch card histories
      const histRes = await fetch('/api/commands/card-history');
      const histData = await histRes.json();
      setHistories(histData || []);

      // Fetch current commands
      const cmdsRes = await fetch('/api/commands');
      const cmdsData = await cmdsRes.json();
      setCurrentCards(cmdsData || []);
    } catch (err) {
      console.error('Failed to fetch card histories:', err);
      if (onToast) onToast('Failed to load card history', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInitialize = async () => {
    if (!window.confirm('Initialize card history system? This will create initial versions for all current cards and delete old backups.')) {
      return;
    }

    setInitializing(true);
    try {
      const res = await fetch('/api/commands/card-history/init', {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        if (onToast) onToast('Card history initialized successfully!', 'success');
        fetchData(); // Reload
      } else {
        if (onToast) onToast(`Initialization failed: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to initialize:', err);
      if (onToast) onToast('Failed to initialize card history', 'error');
    } finally {
      setInitializing(false);
    }
  };

  const toggleExpand = (cardID) => {
    setExpandedCard(expandedCard === cardID ? null : cardID);
  };

  const toggleVersionSelection = (cardID, versionNum) => {
    const newMap = new Map(selectedVersions);
    if (newMap.get(cardID) === versionNum) {
      newMap.delete(cardID);
    } else {
      newMap.set(cardID, versionNum);
    }
    setSelectedVersions(newMap);
  };

  const handleRestore = async () => {
    if (selectedVersions.size === 0) {
      if (onToast) onToast('No versions selected', 'warning');
      return;
    }

    const count = selectedVersions.size;
    if (!window.confirm(`Restore ${count} card(s) to selected versions? This will overwrite current versions.`)) {
      return;
    }

    setRestoring(true);
    try {
      const restorations = Object.fromEntries(selectedVersions);
      const res = await fetch('/api/commands/card-history/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restorations })
      });
      const data = await res.json();

      if (data.success) {
        if (onToast) onToast(`Restored ${count} card(s) successfully!`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        if (onToast) onToast(`Restore failed: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to restore:', err);
      if (onToast) onToast('Failed to restore cards', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getCardName = (cardID) => {
    const card = currentCards.find(c => c.id === cardID);
    return card ? card.description : `Card ${cardID}`;
  };

  const getCardIcon = (cardID) => {
    const card = currentCards.find(c => c.id === cardID);
    if (!card || !card.icon) return null;
    
    const emoji = getEmojiFromIcon(card.icon);
    if (emoji) return <span style={{ fontSize: '18px', marginRight: '8px' }}>{emoji}</span>;
    
    const Icon = iconMap[card.icon];
    if (Icon) return <Icon size={18} style={{ marginRight: '8px', color: '#f97316' }} />;
    
    return null;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
        Loading card histories...
      </div>
    );
  }

  if (histories.length === 0) {
    return (
      <div className="card-history-panel">
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <History size={48} style={{ color: '#60a5fa', marginBottom: '16px' }} />
          <h3 style={{ color: '#60a5fa', marginBottom: '12px' }}>Card Version History</h3>
          <p style={{ color: '#ccc', marginBottom: '16px' }}>
            Track and restore previous versions of your command cards. Each card maintains up to 5 recent versions.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleInitialize}
            disabled={initializing}
            style={{ fontSize: '1rem', padding: '12px 24px' }}
          >
            {initializing ? 'Initializing...' : 'Initialize Card History'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-history-panel">
      <div style={{
        background: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={16} />
          Per-Card Version History
        </h4>
        <p style={{ margin: 0, fontSize: '0.9em', color: '#ccc' }}>
          Each card maintains its last 5 versions. Select cards and versions below to restore.
        </p>
      </div>

      {selectedVersions.size > 0 && (
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #2563eb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong style={{ color: '#2563eb' }}>{selectedVersions.size} card(s) selected for restore</strong>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleRestore}
            disabled={restoring}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RotateCcw size={16} />
            {restoring ? 'Restoring...' : 'Restore Selected'}
          </button>
        </div>
      )}

      <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '16px' }}>
        Command Cards ({histories.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {histories.map((history) => {
          const isExpanded = expandedCard === history.card_id;
          const selectedVersion = selectedVersions.get(history.card_id);
          const hasVersions = history.versions && history.versions.length > 0;

          return (
            <div key={history.card_id} style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                  onClick={() => toggleExpand(history.card_id)}
                >
                  {isExpanded ? <ChevronDown size={20} color="#888" /> : <ChevronRight size={20} color="#888" />}
                  {getCardIcon(history.card_id)}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: '#e5e5e5' }}>
                      {getCardName(history.card_id)}
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#888' }}>
                      {hasVersions ? `${history.versions.length} version(s)` : 'No versions yet'}
                    </div>
                  </div>
                  {selectedVersion && (
                    <div style={{
                      background: '#2563eb',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8em',
                      fontWeight: 600
                    }}>
                      v{selectedVersion} Selected
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && hasVersions && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #333', paddingLeft: '32px' }}>
                  <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: '12px' }}>
                    Select a version to restore:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {history.versions.map((ver) => {
                      const isSelected = selectedVersion === ver.version;
                      const isCurrent = ver.version === history.versions[0].version;

                      return (
                        <div
                          key={ver.version}
                          onClick={() => toggleVersionSelection(history.card_id, ver.version)}
                          style={{
                            background: isSelected ? 'rgba(37, 99, 235, 0.2)' : '#222',
                            border: isSelected ? '1px solid #2563eb' : '1px solid #444',
                            borderRadius: '6px',
                            padding: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '20px', height: '20px',
                              borderRadius: '4px',
                              border: '2px solid #666',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: isSelected ? '#2563eb' : 'transparent'
                            }}>
                              {isSelected && <Check size={14} color="white" />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 600, color: '#ddd' }}>Version {ver.version}</span>
                                {isCurrent && (
                                  <span style={{
                                    background: '#22c55e',
                                    color: '#000',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.75em',
                                    fontWeight: 700
                                  }}>
                                    CURRENT
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.85em', color: '#888' }}>
                                {formatDate(ver.timestamp)}
                              </div>
                              {ver.command && ver.command.description && (
                                <div style={{ fontSize: '0.9em', color: '#aaa', marginTop: '4px' }}>
                                  {ver.command.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardHistoryPanel;
