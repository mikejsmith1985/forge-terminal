package mcp_test

import (
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

func TestTaskBroker_Submit_AssignsID(t *testing.T) {
	broker := mcp.NewTaskBroker()
	task := broker.Submit("bug-report", "do something", "eztest")

	if task.ID == "" {
		t.Error("expected submitted task to have a non-empty ID")
	}
	if task.Status != mcp.TaskStatusPending {
		t.Errorf("expected status %q, got %q", mcp.TaskStatusPending, task.Status)
	}
	if task.Type != "bug-report" {
		t.Errorf("expected type 'bug-report', got %q", task.Type)
	}
	if task.Source != "eztest" {
		t.Errorf("expected source 'eztest', got %q", task.Source)
	}
}

func TestTaskBroker_Get_ReturnsSubmitted(t *testing.T) {
	broker := mcp.NewTaskBroker()
	task := broker.Submit("test-request", "run tests", "copilot")

	retrieved := broker.Get(task.ID)
	if retrieved == nil {
		t.Fatalf("expected Get(%q) to return the task, got nil", task.ID)
	}
	if retrieved.ID != task.ID {
		t.Errorf("expected ID %q, got %q", task.ID, retrieved.ID)
	}
}

func TestTaskBroker_Get_MissingID(t *testing.T) {
	broker := mcp.NewTaskBroker()
	result := broker.Get("does-not-exist")
	if result != nil {
		t.Error("expected Get with unknown ID to return nil")
	}
}

func TestTaskBroker_UpdateStatus(t *testing.T) {
	broker := mcp.NewTaskBroker()
	task := broker.Submit("code-fix", "fix the bug", "cursor")

	broker.UpdateStatus(task.ID, mcp.TaskStatusRunning)

	updated := broker.Get(task.ID)
	if updated.Status != mcp.TaskStatusRunning {
		t.Errorf("expected status %q, got %q", mcp.TaskStatusRunning, updated.Status)
	}
}

func TestTaskBroker_UpdateStatus_UnknownID(t *testing.T) {
	// Should be a no-op — not a panic.
	broker := mcp.NewTaskBroker()
	broker.UpdateStatus("nonexistent-id", mcp.TaskStatusDone)
}

func TestTaskBroker_Incoming_ReceivesTask(t *testing.T) {
	broker := mcp.NewTaskBroker()
	submitted := broker.Submit("bug-report", "payload", "test")

	select {
	case received := <-broker.Incoming():
		if received.ID != submitted.ID {
			t.Errorf("expected received task ID %q, got %q", submitted.ID, received.ID)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("expected task to appear on Incoming() channel within 100ms")
	}
}

func TestTaskBroker_SubmittedAt_IsRecent(t *testing.T) {
	before := time.Now().UTC().Add(-1 * time.Second)
	broker := mcp.NewTaskBroker()
	task := broker.Submit("bug-report", "payload", "test")
	after := time.Now().UTC().Add(1 * time.Second)

	if task.SubmittedAt.Before(before) || task.SubmittedAt.After(after) {
		t.Errorf("SubmittedAt %v is outside expected range [%v, %v]", task.SubmittedAt, before, after)
	}
}

func TestTaskBroker_MultipleSubmissions_UniqueIDs(t *testing.T) {
	broker := mcp.NewTaskBroker()
	ids := make(map[string]bool)

	const count = 20
	for range count {
		task := broker.Submit("bug-report", "payload", "test")
		if ids[task.ID] {
			t.Errorf("duplicate task ID generated: %q", task.ID)
		}
		ids[task.ID] = true
	}
}
