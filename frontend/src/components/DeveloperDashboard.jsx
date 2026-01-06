import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, GitCommit, FileCode, MessageSquare, Clock, 
  Zap, ChevronDown, ChevronUp, RefreshCw, X, TrendingUp, Hash, ArrowLeftRight
} from 'lucide-react';
import './DeveloperDashboard.css';

/**
 * DeveloperDashboard - Daily developer stats from terminal activity
 * 
 * v3.12.3: AM system removed - now uses localStorage and GitHub API only
 * Data Sources:
 * - localStorage (forge_daily_stats) - local tracking
 * - GitHub API (if token available) - commit stats
 */
const DeveloperDashboard = ({ isOpen, onClose, devMode = false }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    promptsSent: 0,
    totalTurns: 0,
    conversationsCount: 0,
    providersUsed: {},
    workingDirectories: {},
    gitCommits: 0,
    filesModified: 0,
    testsRun: 0,
    lastActivity: null,
    sessionDuration: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    modelSwitches: 0,
    modelsUsed: {},
  });
  const [dailyStats, setDailyStats] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!isOpen) return;
    
    setRefreshing(true);
    try {
      // v3.12.3: AM APIs removed - use localStorage only
      let totalPrompts = 0;
      let totalTurns = 0;
      let conversationsCount = 0;
      let providersUsed = {};
      let workingDirs = {};
      let sessionDuration = 0;
      let gitCommits = 0;
      let filesModified = 0;
      let testsRun = 0;
      let lastActivity = null;
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let modelSwitches = 0;
      let modelsUsed = {};

      // Try to get GitHub stats if token is available
      const githubToken = localStorage.getItem('forge_github_token');
      if (githubToken) {
        try {
          const authHeader = githubToken.startsWith('github_pat_') 
            ? `Bearer ${githubToken}` 
            : `token ${githubToken}`;
          
          // Get today's commits from authenticated user
          const today = new Date().toISOString().split('T')[0];
          const eventsRes = await fetch('https://api.github.com/users/me/events?per_page=50', {
            headers: {
              'Authorization': authHeader,
              'X-GitHub-Api-Version': '2022-11-28',
            }
          }).catch(() => null);

          if (eventsRes && eventsRes.ok) {
            const events = await eventsRes.json();
            const todayEvents = events.filter(e => 
              e.created_at.startsWith(today) && e.type === 'PushEvent'
            );
            
            todayEvents.forEach(event => {
              if (event.payload?.commits) {
                gitCommits += event.payload.commits.length;
              }
            });
          }
        } catch (err) {
          console.log('[Dashboard] GitHub API error:', err.message);
        }
      }

      // Get stats from localStorage (for locally tracked data)
      const storedStats = localStorage.getItem('forge_daily_stats');
      if (storedStats) {
        try {
          const parsed = JSON.parse(storedStats);
          const today = new Date().toDateString();
          if (parsed.date === today) {
            filesModified = parsed.filesModified || 0;
            testsRun = parsed.testsRun || 0;
            // Merge with git commits if stored
            if (parsed.gitCommits && parsed.gitCommits > gitCommits) {
              gitCommits = parsed.gitCommits;
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      setStats({
        promptsSent: totalPrompts,
        totalTurns,
        conversationsCount,
        providersUsed,
        workingDirectories: workingDirs,
        gitCommits,
        filesModified,
        testsRun,
        lastActivity,
        sessionDuration: Math.round(sessionDuration),
        // v3.12.3: Real stats from SLMTracking
        totalTokensIn,
        totalTokensOut,
        modelSwitches,
        modelsUsed,
      });

      // Build daily stats array for chart
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toDateString();
        const storedDayStats = localStorage.getItem(`forge_stats_${dayKey}`);
        let dayData = { date: dayKey, prompts: 0, commits: 0 };
        
        if (storedDayStats) {
          try {
            dayData = { ...dayData, ...JSON.parse(storedDayStats) };
          } catch (e) {}
        }
        
        // Today's data comes from live stats
        if (i === 0) {
          dayData.prompts = totalPrompts;
          dayData.commits = gitCommits;
        }
        
        days.push(dayData);
      }
      setDailyStats(days);

    } catch (err) {
      console.error('[Dashboard] Failed to fetch stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchStats();
      // Refresh every 30 seconds when open
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchStats]);

  // Save today's stats to localStorage on update
  useEffect(() => {
    if (stats.promptsSent > 0 || stats.gitCommits > 0) {
      const today = new Date().toDateString();
      const dayStats = {
        date: today,
        prompts: stats.promptsSent,
        commits: stats.gitCommits,
        filesModified: stats.filesModified,
        testsRun: stats.testsRun,
      };
      localStorage.setItem(`forge_stats_${today}`, JSON.stringify(dayStats));
      localStorage.setItem('forge_daily_stats', JSON.stringify({
        date: today,
        ...dayStats
      }));
    }
  }, [stats]);

  if (!isOpen) return null;

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatLastActivity = (date) => {
    if (!date) return 'No activity';
    const now = new Date();
    const diff = (now - date) / 1000; // seconds
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const maxPrompts = Math.max(...dailyStats.map(d => d.prompts), 1);

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
        ) : (
          <div className="dd-content">
            {/* Today's Stats Grid */}
            <div className="dd-stats-grid">
              <div className="dd-stat-card primary">
                <MessageSquare size={20} />
                <div className="dd-stat-value">{stats.promptsSent}</div>
                <div className="dd-stat-label">Prompts Today</div>
              </div>
              <div className="dd-stat-card">
                <Zap size={20} />
                <div className="dd-stat-value">{stats.totalTurns}</div>
                <div className="dd-stat-label">Total Turns</div>
              </div>
              <div className="dd-stat-card">
                <GitCommit size={20} />
                <div className="dd-stat-value">{stats.gitCommits}</div>
                <div className="dd-stat-label">Commits</div>
              </div>
              <div className="dd-stat-card">
                <Clock size={20} />
                <div className="dd-stat-value">{formatDuration(stats.sessionDuration)}</div>
                <div className="dd-stat-label">Session Time</div>
              </div>
            </div>

            {/* Token Usage Stats - v3.12.3 */}
            {(stats.totalTokensIn > 0 || stats.totalTokensOut > 0) && (
              <div className="dd-token-stats">
                <div className="dd-token-stat">
                  <Hash size={14} />
                  <span className="dd-token-label">Tokens In:</span>
                  <span className="dd-token-value">{stats.totalTokensIn.toLocaleString()}</span>
                </div>
                <div className="dd-token-stat">
                  <Hash size={14} />
                  <span className="dd-token-label">Tokens Out:</span>
                  <span className="dd-token-value">{stats.totalTokensOut.toLocaleString()}</span>
                </div>
                {stats.modelSwitches > 0 && (
                  <div className="dd-token-stat">
                    <ArrowLeftRight size={14} />
                    <span className="dd-token-label">Model Switches:</span>
                    <span className="dd-token-value">{stats.modelSwitches}</span>
                  </div>
                )}
              </div>
            )}

            {/* Activity Chart */}
            <div className="dd-section">
              <div className="dd-section-header" onClick={() => toggleSection('chart')}>
                <TrendingUp size={16} />
                <span>7-Day Activity</span>
                {expandedSection === 'chart' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
              {expandedSection === 'chart' && (
                <div className="dd-chart">
                  {dailyStats.map((day, i) => (
                    <div key={i} className="dd-chart-bar-container">
                      <div 
                        className="dd-chart-bar"
                        style={{ height: `${(day.prompts / maxPrompts) * 100}%` }}
                        title={`${day.prompts} prompts`}
                      />
                      <div className="dd-chart-label">
                        {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Providers Used */}
            {Object.keys(stats.providersUsed).length > 0 && (
              <div className="dd-section">
                <div className="dd-section-header" onClick={() => toggleSection('providers')}>
                  <Zap size={16} />
                  <span>AI Providers</span>
                  {expandedSection === 'providers' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSection === 'providers' && (
                  <div className="dd-list">
                    {Object.entries(stats.providersUsed).map(([provider, count]) => (
                      <div key={provider} className="dd-list-item">
                        <span className="dd-provider-name">{provider}</span>
                        <span className="dd-provider-count">{count} sessions</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Models Used - v3.12.3 */}
            {Object.keys(stats.modelsUsed).length > 0 && (
              <div className="dd-section">
                <div className="dd-section-header" onClick={() => toggleSection('models')}>
                  <Hash size={16} />
                  <span>Models Used</span>
                  {expandedSection === 'models' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSection === 'models' && (
                  <div className="dd-list">
                    {Object.entries(stats.modelsUsed).map(([model, count]) => (
                      <div key={model} className="dd-list-item">
                        <span className="dd-provider-name">{model}</span>
                        <span className="dd-provider-count">{count} conversations</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Working Directories */}
            {Object.keys(stats.workingDirectories).length > 0 && (
              <div className="dd-section">
                <div className="dd-section-header" onClick={() => toggleSection('dirs')}>
                  <FileCode size={16} />
                  <span>Projects</span>
                  {expandedSection === 'dirs' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSection === 'dirs' && (
                  <div className="dd-list">
                    {Object.entries(stats.workingDirectories).map(([dir, count]) => (
                      <div key={dir} className="dd-list-item">
                        <span className="dd-dir-name">{dir}</span>
                        <span className="dd-dir-count">{count} sessions</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Last Activity */}
            <div className="dd-footer">
              <span className="dd-last-activity">
                Last activity: {formatLastActivity(stats.lastActivity)}
              </span>
              <span className="dd-conversations-count">
                {stats.conversationsCount} conversation{stats.conversationsCount !== 1 ? 's' : ''} logged
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeveloperDashboard;
