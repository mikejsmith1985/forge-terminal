// Package am provides session logging for terminal recovery.
package am

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	amDir         = ".forge/am"
	archiveDir    = ".forge/am/archive"
	retentionDays = 10
)

// LogEntryType represents the type of log entry.
type LogEntryType string

const (
	EntryUserInput          LogEntryType = "USER_INPUT"
	EntryAgentOutput        LogEntryType = "AGENT_OUTPUT"
	EntryCommandExecuted    LogEntryType = "COMMAND_EXECUTED"
	EntryFileCreated        LogEntryType = "FILE_CREATED"
	EntryFileModified       LogEntryType = "FILE_MODIFIED"
	EntryError              LogEntryType = "ERROR"
	EntrySessionStarted     LogEntryType = "SESSION_STARTED"
	EntrySessionEnded       LogEntryType = "SESSION_ENDED"
	EntrySessionInterrupted LogEntryType = "SESSION_INTERRUPTED"
)

// LogEntry represents a single log entry.
type LogEntry struct {
	Timestamp time.Time    `json:"timestamp"`
	Type      LogEntryType `json:"type"`
	Content   string       `json:"content"`
}

// SessionLog represents a complete session log.
type SessionLog struct {
	TabID       string     `json:"tabId"`
	TabName     string     `json:"tabName"`
	Workspace   string     `json:"workspace"`
	StartTime   time.Time  `json:"startTime"`
	LastUpdated time.Time  `json:"lastUpdated"`
	Entries     []LogEntry `json:"entries"`
	Ended       bool       `json:"ended"`
}

// Logger manages AM logging for a session.
type Logger struct {
	mu      sync.Mutex
	tabID   string
	logPath string
	session *SessionLog
	enabled bool
}

// GetAMDir returns the AM directory path.
func GetAMDir() string {
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, amDir)
}

// GetArchiveDir returns the archive directory path.
func GetArchiveDir() string {
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, archiveDir)
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}

// NewLogger creates a new AM logger for a tab.
func NewLogger(tabID, tabName, workspace string) (*Logger, error) {
	if err := ensureDir(GetAMDir()); err != nil {
		return nil, fmt.Errorf("failed to create AM directory: %w", err)
	}

	date := time.Now().Format("2006-01-02")
	logPath := filepath.Join(GetAMDir(), fmt.Sprintf("session-%s-%s.md", tabID, date))

	session := &SessionLog{
		TabID:       tabID,
		TabName:     tabName,
		Workspace:   workspace,
		StartTime:   time.Now(),
		LastUpdated: time.Now(),
		Entries:     []LogEntry{},
		Ended:       false,
	}

	return &Logger{
		tabID:   tabID,
		logPath: logPath,
		session: session,
		enabled: false,
	}, nil
}

// Enable starts logging.
func (l *Logger) Enable() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.enabled {
		return nil
	}

	l.enabled = true
	l.session.StartTime = time.Now()
	l.session.Entries = append(l.session.Entries, LogEntry{
		Timestamp: time.Now(),
		Type:      EntrySessionStarted,
		Content:   "Session logging started",
	})

	return l.flush()
}

// Disable stops logging.
func (l *Logger) Disable() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.enabled {
		return nil
	}

	l.enabled = false
	l.session.Ended = true
	l.session.Entries = append(l.session.Entries, LogEntry{
		Timestamp: time.Now(),
		Type:      EntrySessionEnded,
		Content:   "Session logging ended",
	})

	return l.flush()
}

// IsEnabled returns whether logging is enabled.
func (l *Logger) IsEnabled() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.enabled
}

// Log adds an entry to the session log.
func (l *Logger) Log(entryType LogEntryType, content string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.session.Entries = append(l.session.Entries, LogEntry{
		Timestamp: time.Now(),
		Type:      entryType,
		Content:   content,
	})
	l.session.LastUpdated = time.Now()

	return l.flush()
}

func (l *Logger) flush() error {
	content := l.generateMarkdown()
	return os.WriteFile(l.logPath, []byte(content), 0644)
}

func (l *Logger) generateMarkdown() string {
	var sb strings.Builder

	sb.WriteString("# Forge AM (Artificial Memory) Log\n\n")
	sb.WriteString("| Property | Value |\n")
	sb.WriteString("|----------|-------|\n")
	sb.WriteString(fmt.Sprintf("| Tab ID | %s |\n", l.session.TabID))
	sb.WriteString(fmt.Sprintf("| Tab Name | %s |\n", l.session.TabName))
	sb.WriteString(fmt.Sprintf("| Workspace | %s |\n", l.session.Workspace))
	sb.WriteString(fmt.Sprintf("| Session Start | %s |\n", l.session.StartTime.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("| Last Updated | %s |\n", l.session.LastUpdated.Format(time.RFC3339)))
	sb.WriteString("\n---\n\n")
	sb.WriteString("## Session Activity\n\n")

	for _, entry := range l.session.Entries {
		timeStr := entry.Timestamp.Format("15:04:05")
		sb.WriteString(fmt.Sprintf("### %s [%s]\n", timeStr, entry.Type))
		sb.WriteString("```\n")
		sb.WriteString(entry.Content)
		sb.WriteString("\n```\n\n")
	}

	if !l.session.Ended {
		sb.WriteString("---\n\n")
		sb.WriteString("> ⚠️ **Session in progress**\n")
	}

	return sb.String()
}

// GetLogPath returns the path to the log file.
func (l *Logger) GetLogPath() string {
	return l.logPath
}

// SessionInfo represents info about a recoverable session.
type SessionInfo struct {
	TabID       string    `json:"tabId"`
	FilePath    string    `json:"filePath"`
	FileName    string    `json:"fileName"`
	LastUpdated time.Time `json:"lastUpdated"`
	Content     string    `json:"content"`
}

// CheckForRecoverableSessions looks for interrupted sessions.
func CheckForRecoverableSessions() ([]SessionInfo, error) {
	amPath := GetAMDir()
	if _, err := os.Stat(amPath); os.IsNotExist(err) {
		return nil, nil
	}

	entries, err := os.ReadDir(amPath)
	if err != nil {
		return nil, err
	}

	var sessions []SessionInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		filePath := filepath.Join(amPath, entry.Name())
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		contentStr := string(content)
		if !strings.Contains(contentStr, "[SESSION_ENDED]") {
			info, err := entry.Info()
			if err != nil {
				continue
			}

			tabID := strings.TrimPrefix(entry.Name(), "session-")
			tabID = strings.TrimSuffix(tabID, filepath.Ext(tabID))
			if idx := strings.LastIndex(tabID, "-"); idx > 0 {
				tabID = tabID[:idx]
			}

			sessions = append(sessions, SessionInfo{
				TabID:       tabID,
				FilePath:    filePath,
				FileName:    entry.Name(),
				LastUpdated: info.ModTime(),
				Content:     contentStr,
			})
		}
	}

	return sessions, nil
}

// CleanupOldLogs removes archived logs older than retention period.
func CleanupOldLogs() error {
	archivePath := GetArchiveDir()
	if _, err := os.Stat(archivePath); os.IsNotExist(err) {
		return nil
	}

	entries, err := os.ReadDir(archivePath)
	if err != nil {
		return err
	}

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			filePath := filepath.Join(archivePath, entry.Name())
			os.Remove(filePath)
		}
	}

	return nil
}

// GetLogContent returns the content of a log file.
func GetLogContent(tabID string) (string, error) {
	amPath := GetAMDir()
	entries, err := os.ReadDir(amPath)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if strings.Contains(entry.Name(), tabID) {
			filePath := filepath.Join(amPath, entry.Name())
			content, err := os.ReadFile(filePath)
			if err != nil {
				return "", err
			}
			return string(content), nil
		}
	}

	return "", fmt.Errorf("log not found for tab %s", tabID)
}

// ArchiveLog archives a specific log file.
func ArchiveLog(tabID string) error {
	if err := ensureDir(GetArchiveDir()); err != nil {
		return err
	}

	amPath := GetAMDir()
	entries, err := os.ReadDir(amPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if strings.Contains(entry.Name(), tabID) && !entry.IsDir() {
			srcPath := filepath.Join(amPath, entry.Name())
			dstPath := filepath.Join(GetArchiveDir(), entry.Name())
			return os.Rename(srcPath, dstPath)
		}
	}

	return nil
}

// LoggerRegistry manages loggers for multiple tabs.
type LoggerRegistry struct {
	mu      sync.RWMutex
	loggers map[string]*Logger
}

var registry = &LoggerRegistry{
	loggers: make(map[string]*Logger),
}

// GetRegistry returns the global logger registry.
func GetRegistry() *LoggerRegistry {
	return registry
}

// Get returns a logger for a tab, creating one if needed.
func (r *LoggerRegistry) Get(tabID, tabName, workspace string) (*Logger, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if logger, ok := r.loggers[tabID]; ok {
		return logger, nil
	}

	logger, err := NewLogger(tabID, tabName, workspace)
	if err != nil {
		return nil, err
	}

	r.loggers[tabID] = logger
	return logger, nil
}

// Remove removes a logger from the registry.
func (r *LoggerRegistry) Remove(tabID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.loggers, tabID)
}

// AppendLogRequest represents a request to append to a log.
type AppendLogRequest struct {
	TabID     string       `json:"tabId"`
	TabName   string       `json:"tabName"`
	Workspace string       `json:"workspace"`
	EntryType LogEntryType `json:"entryType"`
	Content   string       `json:"content"`
}

// EnableRequest represents a request to enable/disable AM.
type EnableRequest struct {
	TabID     string `json:"tabId"`
	TabName   string `json:"tabName"`
	Workspace string `json:"workspace"`
	Enabled   bool   `json:"enabled"`
}

// RecoveryInfo represents session recovery information.
type RecoveryInfo struct {
	HasRecoverable bool          `json:"hasRecoverable"`
	Sessions       []SessionInfo `json:"sessions"`
}
