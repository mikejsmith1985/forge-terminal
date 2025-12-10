// Package am provides session logging for terminal recovery.
package am

import (
	"crypto/md5"
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

	// Extract workspace name from path (fallback to tabName if no workspace)
	workspaceName := extractWorkspaceName(workspace, tabName)
	
	// Format with date, time, workspace
	now := time.Now()
	date := now.Format("2006-01-02")
	timeStr := now.Format("15-04") // HH-MM
	
	// Filename format: YYYY-MM-DD_HH-MM_workspace_session.md
	filename := fmt.Sprintf("%s_%s_%s_session.md", date, timeStr, workspaceName)
	logPath := filepath.Join(GetAMDir(), filename)

	session := &SessionLog{
		TabID:       tabID,
		TabName:     tabName,
		Workspace:   workspace,
		StartTime:   now,
		LastUpdated: now,
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
	TabID           string    `json:"tabId"`
	TabName         string    `json:"tabName"`
	Workspace       string    `json:"workspace"`
	FilePath        string    `json:"filePath"`
	FileName        string    `json:"fileName"`
	LastUpdated     time.Time `json:"lastUpdated"`
	Content         string    `json:"content"`
	LastCommand     string    `json:"lastCommand"`
	Provider        string    `json:"provider"`
	ActiveCount     int       `json:"activeCount"`
	DurationMinutes int       `json:"durationMinutes"`
	SessionID       string    `json:"sessionId"`
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

			// Parse the session log to extract context
			sessionLog, err := parseSessionLogContent(contentStr)
			var tabName, workspace, lastCmd, provider string
			var duration, convCount int
			var sessionID string

			if err == nil && sessionLog != nil {
				tabName = sessionLog.TabName
				workspace = sessionLog.Workspace
				lastCmd = extractLastCommand(sessionLog.Entries)
				duration = calculateSessionDuration(sessionLog.StartTime, sessionLog.LastUpdated)
				convCount = extractConversationCount(sessionLog.Entries)
				sessionID = generateSessionID(sessionLog.TabID, workspace)

				// Extract provider
				for _, entry := range sessionLog.Entries {
					if strings.Contains(strings.ToLower(entry.Content), "copilot") {
						provider = "copilot"
						break
					}
					if strings.Contains(strings.ToLower(entry.Content), "claude") {
						provider = "claude"
						break
					}
				}
			}

			sessions = append(sessions, SessionInfo{
				TabID:           tabID,
				TabName:         tabName,
				Workspace:       workspace,
				FilePath:        filePath,
				FileName:        entry.Name(),
				LastUpdated:     info.ModTime(),
				Content:         contentStr,
				LastCommand:     lastCmd,
				Provider:        provider,
				ActiveCount:     convCount,
				DurationMinutes: duration,
				SessionID:       sessionID,
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
	TabID       string       `json:"tabId"`
	TabName     string       `json:"tabName"`
	Workspace   string       `json:"workspace"`
	EntryType   LogEntryType `json:"entryType"`
	Content     string       `json:"content"`
	TriggerAM   bool         `json:"triggerAM,omitempty"`
	LLMProvider string       `json:"llmProvider,omitempty"`
	LLMType     string       `json:"llmType,omitempty"`
	Description string       `json:"description,omitempty"`
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

// RecoveryInfoGrouped represents grouped session recovery information by workspace.
type RecoveryInfoGrouped struct {
	HasRecoverable bool            `json:"hasRecoverable"`
	Groups         []SessionGroup  `json:"groups"`
	TotalSessions  int             `json:"totalSessions"`
}

// extractLastCommand finds the most recent command executed in the log entries.
func extractLastCommand(entries []LogEntry) string {
	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].Type == EntryCommandExecuted {
			return entries[i].Content
		}
	}
	return ""
}

// calculateSessionDuration returns the session duration in minutes.
func calculateSessionDuration(startTime, lastUpdated time.Time) int {
	duration := lastUpdated.Sub(startTime)
	minutes := int(duration.Minutes())
	return minutes
}

// extractConversationCount counts LLM_START events in the entries.
func extractConversationCount(entries []LogEntry) int {
	count := 0
	for _, entry := range entries {
		if entry.Type == "LLM_START" {
			count++
		}
	}
	return count
}

// generateSessionID creates a unique session ID from tab ID and workspace.
func generateSessionID(tabID, workspace string) string {
	input := fmt.Sprintf("%s:%s", tabID, workspace)
	hash := md5.Sum([]byte(input))
	return fmt.Sprintf("%s-%x", tabID[:len(tabID)/2], hash[:4])
}

// sessionInfoFromLog converts a SessionLog to SessionInfo with extracted context.
func sessionInfoFromLog(log *SessionLog) (*SessionInfo, error) {
	if log == nil {
		return nil, fmt.Errorf("session log is nil")
	}

	lastCmd := extractLastCommand(log.Entries)
	duration := calculateSessionDuration(log.StartTime, log.LastUpdated)
	convCount := extractConversationCount(log.Entries)
	sessionID := generateSessionID(log.TabID, log.Workspace)

	// Extract provider from entries (default to empty if not found)
	provider := ""
	for _, entry := range log.Entries {
		if strings.Contains(strings.ToLower(entry.Content), "copilot") {
			provider = "copilot"
			break
		}
		if strings.Contains(strings.ToLower(entry.Content), "claude") {
			provider = "claude"
			break
		}
	}

	info := &SessionInfo{
		TabID:           log.TabID,
		TabName:         log.TabName,
		Workspace:       log.Workspace,
		FilePath:        "",
		FileName:        "",
		LastUpdated:     log.LastUpdated,
		Content:         "",
		LastCommand:     lastCmd,
		Provider:        provider,
		ActiveCount:     convCount,
		DurationMinutes: duration,
		SessionID:       sessionID,
	}

	return info, nil
}

// SessionGroup represents recoverable sessions grouped by workspace.
type SessionGroup struct {
	Workspace string         `json:"workspace"`
	Sessions  []SessionInfo  `json:"sessions"`
	Latest    SessionInfo    `json:"latest"`
	Count     int            `json:"count"`
}

// parseSessionLogContent parses the markdown content of a session log file.
func parseSessionLogContent(content string) (*SessionLog, error) {
	lines := strings.Split(content, "\n")
	if len(lines) < 10 {
		return nil, fmt.Errorf("invalid session log format")
	}

	log := &SessionLog{
		Entries: []LogEntry{},
	}

	// Parse the metadata table (lines 2-9)
	for i := 3; i < len(lines) && i < 10; i++ {
		line := strings.TrimSpace(lines[i])
		if !strings.Contains(line, "|") {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) < 3 {
			continue
		}

		key := strings.TrimSpace(parts[1])
		value := strings.TrimSpace(parts[2])

		switch key {
		case "Tab ID":
			log.TabID = value
		case "Tab Name":
			log.TabName = value
		case "Workspace":
			log.Workspace = value
		case "Session Start":
			t, err := time.Parse(time.RFC3339, value)
			if err == nil {
				log.StartTime = t
			}
		case "Last Updated":
			t, err := time.Parse(time.RFC3339, value)
			if err == nil {
				log.LastUpdated = t
			}
		}
	}

	// Parse entries from the content
	inActivity := false
	currentEntry := ""
	entryType := ""

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Detect activity markers
		if strings.HasPrefix(trimmed, "###") && strings.Contains(trimmed, "[") {
			// Save previous entry if exists
			if entryType != "" && currentEntry != "" {
				log.Entries = append(log.Entries, LogEntry{
					Type:    LogEntryType(entryType),
					Content: strings.TrimSpace(currentEntry),
				})
			}

			// Parse new entry
			if strings.Contains(trimmed, "[USER_INPUT]") {
				entryType = "USER_INPUT"
				inActivity = true
			} else if strings.Contains(trimmed, "[AGENT_OUTPUT]") {
				entryType = "AGENT_OUTPUT"
				inActivity = true
			} else if strings.Contains(trimmed, "[COMMAND_EXECUTED]") {
				entryType = "COMMAND_EXECUTED"
				inActivity = true
			} else if strings.Contains(trimmed, "[LLM_START]") {
				entryType = "LLM_START"
				inActivity = true
			} else if strings.Contains(trimmed, "[LLM_END]") {
				entryType = "LLM_END"
				inActivity = true
			} else {
				inActivity = false
			}

			currentEntry = ""
		} else if inActivity && trimmed != "" && !strings.HasPrefix(trimmed, "###") {
			currentEntry += line + "\n"
		}
	}

	// Save last entry
	if entryType != "" && currentEntry != "" {
		log.Entries = append(log.Entries, LogEntry{
			Type:    LogEntryType(entryType),
			Content: strings.TrimSpace(currentEntry),
		})
	}

	return log, nil
}

// GroupSessionsByWorkspace groups sessions by their workspace (exported for API use).
func GroupSessionsByWorkspace(sessions []SessionInfo) []SessionGroup {
	// Group by workspace
	groups := make(map[string][]SessionInfo)
	for _, session := range sessions {
		groups[session.Workspace] = append(groups[session.Workspace], session)
	}

	// Create result with sorted workspaces
	result := make([]SessionGroup, 0, len(groups))
	workspaces := make([]string, 0, len(groups))
	for workspace := range groups {
		workspaces = append(workspaces, workspace)
	}

	// Sort workspaces for consistent order
	for _, workspace := range workspaces {
		sessionList := groups[workspace]

		// Find latest session
		var latest SessionInfo
		var latestTime time.Time
		for _, session := range sessionList {
			if session.LastUpdated.After(latestTime) {
				latestTime = session.LastUpdated
				latest = session
			}
		}

		group := SessionGroup{
			Workspace: workspace,
			Sessions:  sessionList,
			Latest:    latest,
			Count:     len(sessionList),
		}
		result = append(result, group)
	}

	return result
}


// extractWorkspaceName sanitizes workspace path for filename.
// Falls back to tabName if workspace is empty.
func extractWorkspaceName(workspace, tabName string) string {
name := ""

// Try workspace path first
if workspace != "" {
// Get last component of path
parts := strings.Split(strings.TrimSuffix(workspace, "/"), "/")
if len(parts) > 0 {
name = parts[len(parts)-1]
// If last part is empty (trailing slash), use second-to-last
if name == "" && len(parts) > 1 {
name = parts[len(parts)-2]
}
}
}

// Fallback to tab title if no workspace name
if name == "" && tabName != "" {
name = tabName
}

// Default fallback
if name == "" {
return "unknown"
}

// Sanitize: lowercase, replace spaces/special chars with hyphen
name = strings.ToLower(name)
name = strings.Map(func(r rune) rune {
if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
return r
}
return '-'
}, name)

// Trim hyphens, limit length
name = strings.Trim(name, "-")
if len(name) > 30 {
name = name[:30]
}

// Final check
if name == "" {
return "unknown"
}

return name
}
