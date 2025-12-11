// Package am provides session recovery for terminal interruptions.
package am

import (
	"crypto/md5"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	amDir         = ".forge/am"
	archiveDir    = ".forge/am/archive"
	retentionDays = 10
)

// SessionInfo represents info about a recoverable session.
type SessionInfo struct {
	SessionID       string    `json:"sessionId"`
	TabID           string    `json:"tabId"`
	TabName         string    `json:"tabName"`
	Workspace       string    `json:"workspace"`
	LastCommand     string    `json:"lastCommand"`
	DurationSeconds int       `json:"durationSeconds"`
	ConversationID  string    `json:"conversationId"`
	ConversationNum int       `json:"conversationNum"`
	Timestamp       time.Time `json:"timestamp"`
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

// CheckForRecoverableSessions looks for interrupted sessions.
func CheckForRecoverableSessions() ([]SessionInfo, error) {
	amPath := GetAMDir()

	// Create the directory if it doesn't exist
	if err := ensureDir(amPath); err != nil {
		return nil, err
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

		// Parse filename: YYYY-MM-DD_HH-MM_workspace_session.md
		parts := strings.Split(strings.TrimSuffix(entry.Name(), ".md"), "_")
		if len(parts) < 3 {
			continue
		}

		contentStr, err := os.ReadFile(filepath.Join(amPath, entry.Name()))
		if err != nil {
			continue
		}

		// Try to parse the log content
		sessionLog, err := parseSessionLogContent(string(contentStr))
		if err != nil {
			continue
		}

		// Extract workspace from filename
		workspaceName := extractWorkspaceName("", parts[2])

		// Convert to SessionInfo
		info, err := sessionInfoFromLog(sessionLog)
		if err != nil {
			continue
		}

		info.Workspace = workspaceName
		sessions = append(sessions, *info)
	}

	return sessions, nil
}

// CleanupOldLogs removes archived logs older than retention period.
func CleanupOldLogs() error {
	archivePath := GetArchiveDir()

	// If archive doesn't exist, nothing to clean
	if _, err := os.Stat(archivePath); os.IsNotExist(err) {
		return nil
	}

	entries, err := os.ReadDir(archivePath)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		age := now.Sub(info.ModTime())
		if age > time.Duration(retentionDays)*24*time.Hour {
			os.Remove(filepath.Join(archivePath, entry.Name()))
		}
	}

	return nil
}

// GetLogContent returns the content of a log file.
func GetLogContent(tabID string) (string, error) {
	amPath := GetAMDir()

	// For simplicity, we return empty since we're moving to JSON-based LLMLogger
	// This is kept for backward compatibility with session restoration
	entries, err := os.ReadDir(amPath)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() && strings.Contains(entry.Name(), tabID) && strings.HasSuffix(entry.Name(), ".md") {
			content, _ := os.ReadFile(filepath.Join(amPath, entry.Name()))
			return string(content), nil
		}
	}

	return "", fmt.Errorf("log not found for tab %s", tabID)
}

// ArchiveLog archives a specific log file.
func ArchiveLog(tabID string) error {
	amPath := GetAMDir()
	archivePath := GetArchiveDir()

	if err := ensureDir(archivePath); err != nil {
		return err
	}

	entries, err := os.ReadDir(amPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() && strings.Contains(entry.Name(), tabID) && strings.HasSuffix(entry.Name(), ".md") {
			srcPath := filepath.Join(amPath, entry.Name())
			dstPath := filepath.Join(archivePath, entry.Name())
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			if err := os.WriteFile(dstPath, data, 0644); err != nil {
				return err
			}
			return os.Remove(srcPath)
		}
	}

	return fmt.Errorf("log not found for tab %s", tabID)
}

// RecoveryInfo represents session recovery information.
type RecoveryInfo struct {
	Status          string        `json:"status"`
	HasRecoverable  bool          `json:"hasRecoverable"`
	Sessions        []SessionInfo `json:"sessions"`
}

// RecoveryInfoGrouped represents grouped session recovery information by workspace.
type RecoveryInfoGrouped struct {
	Status         string         `json:"status"`
	HasRecoverable bool           `json:"hasRecoverable"`
	Groups         []SessionGroup `json:"groups"`
	TotalSessions  int            `json:"totalSessions"`
}

// SessionLog represents a parsed session log file.
type SessionLog struct {
	TabID       string `json:"tabId"`
	TabName     string `json:"tabName"`
	Workspace   string `json:"workspace"`
	StartTime   time.Time `json:"startTime"`
	LastUpdated time.Time `json:"lastUpdated"`
	Ended       bool   `json:"ended"`
}

// sessionInfoFromLog converts a SessionLog to SessionInfo with extracted context.
func sessionInfoFromLog(log *SessionLog) (*SessionInfo, error) {
	if log == nil {
		return nil, fmt.Errorf("log is nil")
	}

	info := &SessionInfo{
		TabID:           log.TabID,
		TabName:         log.TabName,
		Workspace:       log.Workspace,
		DurationSeconds: int(log.LastUpdated.Sub(log.StartTime).Seconds()),
		Timestamp:       log.LastUpdated,
		SessionID:       generateSessionID(log.TabID, log.Workspace),
	}

	return info, nil
}

// SessionGroup groups sessions by workspace.
type SessionGroup struct {
	Workspace string        `json:"workspace"`
	Sessions  []SessionInfo `json:"sessions"`
	Latest    SessionInfo   `json:"latest"`
}

// parseSessionLogContent parses the markdown content of a session log file.
func parseSessionLogContent(content string) (*SessionLog, error) {
	if content == "" {
		return nil, fmt.Errorf("empty content")
	}

	log := &SessionLog{}

	// Parse markdown table format
	// Looking for key: value patterns in markdown
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip markdown table separators and headers
		if strings.HasPrefix(line, "|") {
			parts := strings.Split(line, "|")
			if len(parts) >= 3 {
				key := strings.TrimSpace(parts[1])
				value := strings.TrimSpace(parts[2])

				if key == "" || value == "" {
					continue
				}

				switch key {
				case "Tab ID":
					log.TabID = value
				case "Tab Name":
					log.TabName = value
				case "Workspace":
					log.Workspace = value
				case "Status":
					log.Ended = value == "Ended"
				}
			}
		}
	}

	// Set timestamps to now if not parsed
	if log.StartTime.IsZero() {
		log.StartTime = time.Now()
	}
	if log.LastUpdated.IsZero() {
		log.LastUpdated = time.Now()
	}

	return log, nil
}

// generateSessionID creates a unique session ID.
func generateSessionID(tabID, workspace string) string {
	h := md5.Sum([]byte(tabID + "-" + workspace + "-" + time.Now().String()))
	return fmt.Sprintf("%x", h)[:12]
}

// GroupSessionsByWorkspace groups sessions by their workspace.
func GroupSessionsByWorkspace(sessions []SessionInfo) []SessionGroup {
	groups := make(map[string][]SessionInfo)
	var latest SessionInfo

	for _, session := range sessions {
		groups[session.Workspace] = append(groups[session.Workspace], session)
		if session.Timestamp.After(latest.Timestamp) {
			latest = session
		}
	}

	var result []SessionGroup
	for workspace, sessionsInGroup := range groups {
		result = append(result, SessionGroup{
			Workspace: workspace,
			Sessions:  sessionsInGroup,
			Latest:    latest,
		})
	}

	return result
}

// extractWorkspaceName extracts workspace name from path or parameter.
func extractWorkspaceName(workspace, tabName string) string {
	if workspace != "" {
		parts := strings.Split(workspace, "/")
		return parts[len(parts)-1]
	}

	return strings.TrimSuffix(tabName, "_session.md")
}
