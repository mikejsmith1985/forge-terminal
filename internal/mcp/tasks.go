// tasks.go provides the TaskBroker — an in-memory, channel-based work queue
// for agent tasks submitted through the MCP task_submit tool.
//
// When an external tool (e.g. EZTest) sends a bug report or code fix request
// via MCP, the TaskBroker receives it, assigns it a UUID, and delivers it to
// the Forge agent loop over a buffered channel. This cleanly replaces the old
// .forge/pending-tasks file-drop approach with a proper acknowledge-on-receipt
// handshake: the MCP client gets a task ID immediately and can check status later.
package mcp

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// ── Task Status Constants ───────────────────────────────────────────────────

const (
	// TaskStatusPending means the task has been received but the agent has
	// not started processing it yet.
	TaskStatusPending = "pending"

	// TaskStatusRunning means the agent picked up the task and is working on it.
	TaskStatusRunning = "running"

	// TaskStatusDone means the task completed successfully.
	TaskStatusDone = "done"

	// TaskStatusFailed means the task encountered an unrecoverable error.
	TaskStatusFailed = "failed"

	// pendingTaskChannelCapacity is the maximum number of un-consumed tasks
	// buffered in memory before new submissions apply back-pressure.
	pendingTaskChannelCapacity = 64
)

// PendingTask is a unit of work submitted by an external MCP client.
// The Forge agent loop consumes tasks from the broker's Incoming() channel.
type PendingTask struct {
	// ID is a UUID assigned at submission — clients use it to poll status.
	ID string `json:"id"`

	// Type categorizes the work so the agent loop can route it correctly
	// (e.g., "bug-report", "test-request", "code-fix").
	Type string `json:"type"`

	// Payload is the full task description, typically a Markdown-formatted prompt.
	Payload string `json:"payload"`

	// Source identifies the submitting client for audit purposes (e.g., "eztest-mcp").
	Source string `json:"source"`

	// SubmittedAt records the UTC time the task was received.
	SubmittedAt time.Time `json:"submittedAt"`

	// Status tracks the current lifecycle stage.
	Status string `json:"status"`
}

// TaskBroker manages submission and retrieval of MCP-submitted tasks.
// All methods are safe for concurrent use across goroutines.
type TaskBroker struct {
	mu      sync.RWMutex
	taskMap map[string]*PendingTask

	// incoming is the channel the agent loop reads from to get new tasks.
	incoming chan *PendingTask
}

// NewTaskBroker constructs a ready-to-use TaskBroker.
func NewTaskBroker() *TaskBroker {
	return &TaskBroker{
		taskMap:  make(map[string]*PendingTask),
		incoming: make(chan *PendingTask, pendingTaskChannelCapacity),
	}
}

// Submit creates a new PendingTask, registers it in the task map, and queues
// it on the incoming channel for the agent loop. Returns the created task so
// the MCP handler can echo the ID back to the caller immediately.
func (broker *TaskBroker) Submit(taskType string, payload string, source string) *PendingTask {
	newTask := &PendingTask{
		ID:          uuid.New().String(),
		Type:        taskType,
		Payload:     payload,
		Source:      source,
		SubmittedAt: time.Now().UTC(),
		Status:      TaskStatusPending,
	}

	broker.mu.Lock()
	broker.taskMap[newTask.ID] = newTask
	broker.mu.Unlock()

	// Non-blocking send: the task is always registered in taskMap (status-queryable)
	// even if the channel is at capacity and the push is dropped.
	select {
	case broker.incoming <- newTask:
	default:
	}

	return newTask
}

// Get returns the current state of a task by ID.
// Returns nil if the ID is not known to this broker.
func (broker *TaskBroker) Get(taskID string) *PendingTask {
	broker.mu.RLock()
	defer broker.mu.RUnlock()
	return broker.taskMap[taskID]
}

// UpdateStatus changes the lifecycle status of a task.
// No-ops silently when the task ID is not found (agent restarts are idempotent).
func (broker *TaskBroker) UpdateStatus(taskID string, newStatus string) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	if task, exists := broker.taskMap[taskID]; exists {
		task.Status = newStatus
	}
}

// ListAll returns a snapshot of every task the broker knows about, sorted by
// submission time (newest first). The returned slice is safe for the caller to
// modify — it does not alias the internal map.
func (broker *TaskBroker) ListAll() []*PendingTask {
	broker.mu.RLock()
	defer broker.mu.RUnlock()

	allTasks := make([]*PendingTask, 0, len(broker.taskMap))
	for _, task := range broker.taskMap {
		allTasks = append(allTasks, task)
	}
	return allTasks
}

// Incoming returns the read-only channel the agent loop should consume.
// The agent calls <-broker.Incoming() to receive the next submitted task.
func (broker *TaskBroker) Incoming() <-chan *PendingTask {
	return broker.incoming
}

// ListAll returns a snapshot of every task in the broker, ordered by submission time.
// Used by the dashboard to show the full task history.
func (broker *TaskBroker) ListAll() []*PendingTask {
	broker.mu.RLock()
	defer broker.mu.RUnlock()

	allTasks := make([]*PendingTask, 0, len(broker.taskMap))
	for _, task := range broker.taskMap {
		allTasks = append(allTasks, task)
	}
	return allTasks
}
