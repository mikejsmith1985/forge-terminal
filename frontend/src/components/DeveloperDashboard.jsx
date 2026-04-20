import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  BarChart3, GitCommit, FileCode, Clock, 
  Cpu, ChevronDown, ChevronUp, RefreshCw, X, TrendingUp, 
  GitBranch, Monitor, Server, Layers
} from 'lucide-react';
import './DeveloperDashboard.css';

const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DeveloperDashboard = ({ isOpen, onClose, devMode = false, tabCount = 0, projectDir = '' }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [expandedSection, setExpandedSection] = useState('chart');
  const [refreshing, setRefreshing] = useState(false);
  const sessionStart = useRef(Date.now());

  const fetchStats = useCallback(async () => {
    if (!isOpen) return;

    setRefreshing(true);
    setError(null);
    try {
      const url = projectDir
        ? `/api/dashboard/stats?dir=${encodeURIComponent(projectDir)}`
        : '/api/dashboard/stats';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('[Dashboard] Failed to fetch stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchStats();
      const interval = setInterval(fetchStats, 15000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchStats]);

  if (!isOpen) return null;

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${Math.floor(seconds)}s`;
  };

  const formatSessionTime = () => {
    const elapsed = (Date.now() - sessionStart.current) / 1000;
    return formatUptime(elapsed);
  };

  const formatMB = (mb) => {
    if (!mb) return '0 MB';
    return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Build ordered 7-day chart data from gitWeekly map
  const getChartData = () => {
    if (!stats?.gitWeekly) return [];
    const today = new Date().getDay();
    const ordered = [];
    for (let i = 6; i >= 0; i--) {
      const dayIdx = (today - i + 7) % 7;
      const label = DAY_ORDER[dayIdx];
      ordered.push({ label, commits: stats.gitWeekly[label] || 0 });
    }
    return ordered;
  };

  const chartData = getChartData();
  const maxCommits = Math.max(...chartData.map(d => d.commits), 1);

  return (
    <div className="dev-dashboard-overlay" onClick={onClose}>
      <div className="dev-dashboard" onClick={(e) => e.stopPropagation()}>
        <div className="dd-header">
          <div className="dd-title-row">
            <BarChart3 size={22} className="dd-icon" />
            <h2 className="dd-title">Developer Dashboard</h2>
            {devMode && <span className="dd-dev-badge">DEV</span>}
          </div>
          <div className="dd-header-actions">
            <button 
              className="dd-refresh-btn"
              onClick={fetchStats}
              disabled={refreshing}
              title="Refresh stats"
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            </button>
            <button className="dd-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="dd-loading">
            <RefreshCw size={24} className="spinning" />
            <span>Loading stats...</span>
          </div>
        ) : error ? (
          <div className="dd-loading">
            <span style={{ color: '#ef4444' }}>Failed to load: {error}</span>
            <button className="dd-refresh-btn" onClick={fetchStats} style={{ marginTop: 8 }}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        ) : stats && (
          <div className="dd-content">
            {/* Top Stats Grid */}
            <div className="dd-stats-grid">
              <div className="dd-stat-card primary">
                <GitCommit size={20} />
                <div className="dd-stat-value">{stats.gitCommitsToday}</div>
                <div className="dd-stat-label">Commits Today</div>
              </div>
              <div className="dd-stat-card">
                <FileCode size={20} />
                <div className="dd-stat-value">{stats.gitChangedFiles}</div>
                <div className="dd-stat-label">Changed Files</div>
              </div>
              <div className="dd-stat-card">
                <Layers size={20} />
                <div className="dd-stat-value">{tabCount || stats.activeSessions}</div>
                <div className="dd-stat-label">Active Tabs</div>
              </div>
              <div className="dd-stat-card">
                <Clock size={20} />
                <div className="dd-stat-value">{formatUptime(stats.uptimeSec)}</div>
                <div className="dd-stat-label">Server Uptime</div>
              </div>
            </div>

            {/* Git Info Bar */}
            {stats.gitBranch && (
              <div className="dd-token-stats">
                <div className="dd-token-stat">
                  <GitBranch size={14} />
                  <span className="dd-token-label">Branch:</span>
                  <span className="dd-token-value">{stats.gitBranch}</span>
                </div>
                {stats.gitLastCommit && (
                  <div className="dd-token-stat" style={{ flex: 1, minWidth: 0 }}>
                    <GitCommit size={14} />
                    <span className="dd-token-label">Last:</span>
                    <span className="dd-token-value" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stats.gitLastCommit}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 7-Day Commit Chart */}
            <div className="dd-section">
              <div className="dd-section-header" onClick={() => toggleSection('chart')}>
                <TrendingUp size={16} />
                <span>7-Day Commits</span>
                {expandedSection === 'chart' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
              {expandedSection === 'chart' && (
                <div className="dd-chart">
                  {chartData.map((day, i) => (
                    <div key={i} className="dd-chart-bar-container">
                      <div 
                        className="dd-chart-bar"
                        style={{ height: `${(day.commits / maxCommits) * 100}%` }}
                        title={`${day.commits} commit${day.commits !== 1 ? 's' : ''}`}
                      />
                      <div className="dd-chart-label">{day.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* System Info */}
            <div className="dd-section">
              <div className="dd-section-header" onClick={() => toggleSection('system')}>
                <Monitor size={16} />
                <span>System</span>
                {expandedSection === 'system' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
              {expandedSection === 'system' && (
                <div className="dd-list">
                  <div className="dd-list-item">
                    <span className="dd-provider-name">Memory (Alloc)</span>
                    <span className="dd-provider-count">{formatMB(stats.memAllocMB)}</span>
                  </div>
                  <div className="dd-list-item">
                    <span className="dd-provider-name">Memory (Sys)</span>
                    <span className="dd-provider-count">{formatMB(stats.memSysMB)}</span>
                  </div>
                  <div className="dd-list-item">
                    <span className="dd-provider-name">Goroutines</span>
                    <span className="dd-provider-count">{stats.goroutines}</span>
                  </div>
                  <div className="dd-list-item">
                    <span className="dd-provider-name">GC Cycles</span>
                    <span className="dd-provider-count">{stats.numGC}</span>
                  </div>
                  <div className="dd-list-item">
                    <span className="dd-provider-name">Runtime</span>
                    <span className="dd-provider-count">{stats.goVersion}</span>
                  </div>
                  <div className="dd-list-item">
                    <span className="dd-provider-name">Platform</span>
                    <span className="dd-provider-count">{stats.os}/{stats.arch} ({stats.numCPU} CPU)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="dd-footer">
              <span className="dd-last-activity">
                <Server size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Session: {formatSessionTime()}
              </span>
              <span className="dd-conversations-count">
                <Cpu size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {stats.activeSessions} PTY session{stats.activeSessions !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeveloperDashboard;
