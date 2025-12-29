// Package chat provides SQLite-backed persistent chat storage.
// v3.5.1: Chat as orchestration layer with full-text search and threading.
package chat

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite" // Pure-Go SQLite driver (no CGO required)
)

// MessageType defines the type of chat message
type MessageType string

const (
	MessageTypeUser      MessageType = "user"
	MessageTypeAssistant MessageType = "assistant"
	MessageTypeSystem    MessageType = "system"
	MessageTypeCommand   MessageType = "command"
	MessageTypeFile      MessageType = "file"
	MessageTypeImage     MessageType = "image"
	MessageTypeAnalysis  MessageType = "analysis"
)

// Message represents a chat message
type Message struct {
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	Content   string      `json:"content"`
	Timestamp time.Time   `json:"timestamp"`
	
	// Threading
	ReplyTo   *string `json:"replyTo,omitempty"`   // Parent message ID for threads
	ThreadID  *string `json:"threadId,omitempty"`  // Thread root ID
	
	// Agent/Worker tracking
	WorkerID   string `json:"workerId,omitempty"`   // Which terminal/agent
	WorkerName string `json:"workerName,omitempty"` // Display name (e.g., "Copilot", "Claude")
	
	// Metadata (stored as JSON)
	Metadata *MessageMetadata `json:"metadata,omitempty"`
}

// MessageMetadata holds type-specific data
type MessageMetadata struct {
	// For assistant messages
	Provider  string `json:"provider,omitempty"`
	Model     string `json:"model,omitempty"`
	TokensIn  int    `json:"tokensIn,omitempty"`
	TokensOut int    `json:"tokensOut,omitempty"`

	// For SLM analysis
	Complexity       int      `json:"complexity,omitempty"`
	TaskType         string   `json:"taskType,omitempty"`
	RecommendedModel string   `json:"recommendedModel,omitempty"`
	AvailableModels  []string `json:"availableModels,omitempty"`
	BudgetRemaining  float64  `json:"budgetRemaining,omitempty"`

	// For command messages
	CommandName string `json:"commandName,omitempty"`
	CommandCard string `json:"commandCard,omitempty"`
	ExitCode    *int   `json:"exitCode,omitempty"`
	Duration    int    `json:"duration,omitempty"` // milliseconds

	// For file messages
	FilePath    string `json:"filePath,omitempty"`
	FilePreview string `json:"filePreview,omitempty"`
	FileSize    int64  `json:"fileSize,omitempty"`

	// For image messages
	ImagePath    string `json:"imagePath,omitempty"`
	ImageURL     string `json:"imageUrl,omitempty"`
	ImageSummary string `json:"imageSummary,omitempty"`
	ImageWidth   int    `json:"imageWidth,omitempty"`
	ImageHeight  int    `json:"imageHeight,omitempty"`

	// For linking to AM conversation
	ConversationID string `json:"conversationId,omitempty"`
	TurnIndex      int    `json:"turnIndex,omitempty"`
}

// Store manages the SQLite chat database
type Store struct {
	db          *sql.DB
	dbPath      string
	imagesDir   string
	mu          sync.RWMutex
	subscribers map[string]chan Message
	subMu       sync.RWMutex
}

var (
	globalStore *Store
	storeMu     sync.Mutex
)

// GetStore returns the singleton chat store
func GetStore(forgeDir string) (*Store, error) {
	storeMu.Lock()
	defer storeMu.Unlock()

	if globalStore != nil {
		return globalStore, nil
	}

	chatDir := filepath.Join(forgeDir, "chat")
	if err := os.MkdirAll(chatDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create chat dir: %w", err)
	}

	imagesDir := filepath.Join(chatDir, "images")
	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create images dir: %w", err)
	}

	dbPath := filepath.Join(chatDir, "chat.db")
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{
		db:          db,
		dbPath:      dbPath,
		imagesDir:   imagesDir,
		subscribers: make(map[string]chan Message),
	}

	if err := store.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to init schema: %w", err)
	}

	globalStore = store
	log.Printf("[ChatStore] Initialized SQLite store at %s", dbPath)
	return store, nil
}

// initSchema creates the database tables
func (s *Store) initSchema() error {
	schema := `
	-- Main messages table
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		content TEXT NOT NULL,
		timestamp DATETIME NOT NULL,
		reply_to TEXT,
		thread_id TEXT,
		worker_id TEXT,
		worker_name TEXT,
		metadata TEXT,
		archived INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Indexes for common queries
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
	CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
	CREATE INDEX IF NOT EXISTS idx_messages_worker ON messages(worker_id);
	CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(archived);

	-- Full-text search table
	CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
		id,
		content,
		worker_name,
		content='messages',
		content_rowid='rowid'
	);

	-- Triggers to keep FTS in sync
	CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
		INSERT INTO messages_fts(rowid, id, content, worker_name) 
		VALUES (NEW.rowid, NEW.id, NEW.content, NEW.worker_name);
	END;

	CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
		INSERT INTO messages_fts(messages_fts, rowid, id, content, worker_name) 
		VALUES('delete', OLD.rowid, OLD.id, OLD.content, OLD.worker_name);
	END;

	CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
		INSERT INTO messages_fts(messages_fts, rowid, id, content, worker_name) 
		VALUES('delete', OLD.rowid, OLD.id, OLD.content, OLD.worker_name);
		INSERT INTO messages_fts(rowid, id, content, worker_name) 
		VALUES (NEW.rowid, NEW.id, NEW.content, NEW.worker_name);
	END;

	-- Workers/Agents table
	CREATE TABLE IF NOT EXISTS workers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		status TEXT DEFAULT 'idle',
		tab_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_active DATETIME
	);

	-- Archive table for compressed old messages
	CREATE TABLE IF NOT EXISTS archive (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		start_date DATETIME NOT NULL,
		end_date DATETIME NOT NULL,
		message_count INTEGER NOT NULL,
		compressed_data BLOB NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := s.db.Exec(schema)
	return err
}

// AddMessage inserts a new message
func (s *Store) AddMessage(msg Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if msg.ID == "" {
		msg.ID = fmt.Sprintf("msg-%d", time.Now().UnixNano())
	}
	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now()
	}

	var metadataJSON []byte
	if msg.Metadata != nil {
		var err error
		metadataJSON, err = json.Marshal(msg.Metadata)
		if err != nil {
			return fmt.Errorf("failed to marshal metadata: %w", err)
		}
	}

	_, err := s.db.Exec(`
		INSERT INTO messages (id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, msg.ID, msg.Type, msg.Content, msg.Timestamp, msg.ReplyTo, msg.ThreadID, msg.WorkerID, msg.WorkerName, metadataJSON)

	if err != nil {
		return fmt.Errorf("failed to insert message: %w", err)
	}

	// Notify subscribers
	go s.notifySubscribers(msg)

	return nil
}

// GetMessages retrieves messages with optional filters
func (s *Store) GetMessages(since time.Time, limit int) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata
		FROM messages
		WHERE archived = 0 AND timestamp > ?
		ORDER BY timestamp ASC
		LIMIT ?
	`

	if limit <= 0 {
		limit = 1000
	}

	rows, err := s.db.Query(query, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanMessages(rows)
}

// GetRecentMessages retrieves the last N messages
func (s *Store) GetRecentMessages(limit int) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata
		FROM messages
		WHERE archived = 0
		ORDER BY timestamp DESC
		LIMIT ?
	`

	rows, err := s.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages, err := s.scanMessages(rows)
	if err != nil {
		return nil, err
	}

	// Reverse to get chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}

// Search performs full-text search
func (s *Store) Search(query string, limit int) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}

	sqlQuery := `
		SELECT m.id, m.type, m.content, m.timestamp, m.reply_to, m.thread_id, m.worker_id, m.worker_name, m.metadata
		FROM messages m
		JOIN messages_fts fts ON m.id = fts.id
		WHERE messages_fts MATCH ? AND m.archived = 0
		ORDER BY m.timestamp DESC
		LIMIT ?
	`

	rows, err := s.db.Query(sqlQuery, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanMessages(rows)
}

// GetThread retrieves all messages in a thread
func (s *Store) GetThread(threadID string) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata
		FROM messages
		WHERE (thread_id = ? OR id = ?) AND archived = 0
		ORDER BY timestamp ASC
	`

	rows, err := s.db.Query(query, threadID, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanMessages(rows)
}

// GetMessagesByWorker retrieves messages from a specific worker
func (s *Store) GetMessagesByWorker(workerID string, limit int) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata
		FROM messages
		WHERE worker_id = ? AND archived = 0
		ORDER BY timestamp DESC
		LIMIT ?
	`

	rows, err := s.db.Query(query, workerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanMessages(rows)
}

// scanMessages converts rows to Message slice
func (s *Store) scanMessages(rows *sql.Rows) ([]Message, error) {
	var messages []Message

	for rows.Next() {
		var msg Message
		var replyTo, threadID, workerID, workerName sql.NullString
		var metadataJSON sql.NullString

		err := rows.Scan(
			&msg.ID, &msg.Type, &msg.Content, &msg.Timestamp,
			&replyTo, &threadID, &workerID, &workerName, &metadataJSON,
		)
		if err != nil {
			return nil, err
		}

		if replyTo.Valid {
			msg.ReplyTo = &replyTo.String
		}
		if threadID.Valid {
			msg.ThreadID = &threadID.String
		}
		if workerID.Valid {
			msg.WorkerID = workerID.String
		}
		if workerName.Valid {
			msg.WorkerName = workerName.String
		}

		if metadataJSON.Valid && metadataJSON.String != "" {
			var metadata MessageMetadata
			if err := json.Unmarshal([]byte(metadataJSON.String), &metadata); err == nil {
				msg.Metadata = &metadata
			}
		}

		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// ArchiveOldMessages compresses messages older than the threshold
func (s *Store) ArchiveOldMessages(olderThan time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-olderThan)

	// Get messages to archive
	rows, err := s.db.Query(`
		SELECT id, type, content, timestamp, reply_to, thread_id, worker_id, worker_name, metadata
		FROM messages
		WHERE timestamp < ? AND archived = 0
		ORDER BY timestamp ASC
	`, cutoff)
	if err != nil {
		return err
	}

	messages, err := s.scanMessages(rows)
	rows.Close()
	if err != nil {
		return err
	}

	if len(messages) == 0 {
		return nil
	}

	// Compress messages
	data, err := json.Marshal(messages)
	if err != nil {
		return err
	}

	// TODO: Add gzip compression here
	compressedData := data // For now, just store as-is

	// Get date range
	startDate := messages[0].Timestamp
	endDate := messages[len(messages)-1].Timestamp

	// Insert archive record
	_, err = s.db.Exec(`
		INSERT INTO archive (start_date, end_date, message_count, compressed_data)
		VALUES (?, ?, ?, ?)
	`, startDate, endDate, len(messages), compressedData)
	if err != nil {
		return err
	}

	// Mark messages as archived
	_, err = s.db.Exec(`UPDATE messages SET archived = 1 WHERE timestamp < ?`, cutoff)
	if err != nil {
		return err
	}

	log.Printf("[ChatStore] Archived %d messages from %s to %s", len(messages), startDate, endDate)
	return nil
}

// GetContextForSLM returns recent messages formatted for SLM context
func (s *Store) GetContextForSLM(hours int, maxTokens int) (string, error) {
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	messages, err := s.GetMessages(since, 200)
	if err != nil {
		return "", err
	}

	var context string
	estimatedTokens := 0

	for _, msg := range messages {
		var line string
		switch msg.Type {
		case MessageTypeUser:
			line = fmt.Sprintf("[User]: %s\n", truncate(msg.Content, 500))
		case MessageTypeAssistant:
			worker := msg.WorkerName
			if worker == "" {
				worker = "Assistant"
			}
			line = fmt.Sprintf("[%s]: %s\n", worker, truncate(msg.Content, 500))
		case MessageTypeCommand:
			if msg.Metadata != nil && msg.Metadata.CommandName != "" {
				line = fmt.Sprintf("[Command]: %s\n", msg.Metadata.CommandName)
			}
		case MessageTypeAnalysis:
			if msg.Metadata != nil {
				line = fmt.Sprintf("[Analysis]: Complexity %d/10, Recommended: %s\n",
					msg.Metadata.Complexity, msg.Metadata.RecommendedModel)
			}
		}

		if line != "" {
			lineTokens := len(line) / 4 // Rough estimate
			if estimatedTokens+lineTokens > maxTokens {
				break
			}
			context += line
			estimatedTokens += lineTokens
		}
	}

	return context, nil
}

// Subscribe registers for real-time message updates
func (s *Store) Subscribe(connID string) chan Message {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	ch := make(chan Message, 100)
	s.subscribers[connID] = ch
	log.Printf("[ChatStore] Subscriber added: %s", connID)
	return ch
}

// Unsubscribe removes a subscriber
func (s *Store) Unsubscribe(connID string) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if ch, ok := s.subscribers[connID]; ok {
		close(ch)
		delete(s.subscribers, connID)
		log.Printf("[ChatStore] Subscriber removed: %s", connID)
	}
}

func (s *Store) notifySubscribers(msg Message) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for connID, ch := range s.subscribers {
		select {
		case ch <- msg:
		default:
			log.Printf("[ChatStore] Subscriber %s buffer full", connID)
		}
	}
}

// SaveImage stores an uploaded image
func (s *Store) SaveImage(filename string, data []byte) (string, error) {
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = ".png"
	}
	
	uniqueName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	fullPath := filepath.Join(s.imagesDir, uniqueName)

	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", err
	}

	return uniqueName, nil
}

// GetImagesDir returns the images directory path
func (s *Store) GetImagesDir() string {
	return s.imagesDir
}

// Close closes the database connection
func (s *Store) Close() error {
	return s.db.Close()
}

// Worker represents a terminal/agent worker
type Worker struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Type       string    `json:"type"` // copilot, claude, aider, custom
	Status     string    `json:"status"` // idle, running, error
	TabID      string    `json:"tabId,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	LastActive time.Time `json:"lastActive"`
}

// RegisterWorker adds or updates a worker
func (s *Store) RegisterWorker(worker Worker) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO workers (id, name, type, status, tab_id, created_at, last_active)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, worker.ID, worker.Name, worker.Type, worker.Status, worker.TabID, worker.CreatedAt, worker.LastActive)

	return err
}

// GetWorkers returns all registered workers
func (s *Store) GetWorkers() ([]Worker, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, name, type, status, tab_id, created_at, last_active
		FROM workers
		ORDER BY last_active DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workers []Worker
	for rows.Next() {
		var w Worker
		var tabID sql.NullString
		var lastActive sql.NullTime

		err := rows.Scan(&w.ID, &w.Name, &w.Type, &w.Status, &tabID, &w.CreatedAt, &lastActive)
		if err != nil {
			return nil, err
		}

		if tabID.Valid {
			w.TabID = tabID.String
		}
		if lastActive.Valid {
			w.LastActive = lastActive.Time
		}

		workers = append(workers, w)
	}

	return workers, rows.Err()
}

// UpdateWorkerStatus updates a worker's status
func (s *Store) UpdateWorkerStatus(workerID, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		UPDATE workers SET status = ?, last_active = ? WHERE id = ?
	`, status, time.Now(), workerID)

	return err
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
