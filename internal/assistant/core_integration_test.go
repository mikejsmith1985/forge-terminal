package assistant

import (
	"context"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/assistant/providers"
	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// MockProvider for testing Core integration without real CLI calls.
type MockProvider struct {
	events []types.StreamEvent
}

func (m *MockProvider) Ask(ctx context.Context, prompt string, opts providers.AskOptions) (<-chan types.StreamEvent, error) {
	ch := make(chan types.StreamEvent)
	go func() {
		defer close(ch)
		for _, e := range m.events {
			ch <- e
		}
	}()
	return ch, nil
}

func (m *MockProvider) Cancel() error { return nil }
func (m *MockProvider) GetHistory() ([]types.Message, error) { return nil, nil }

func TestCore_SetProvider(t *testing.T) {
	amSystem := &am.System{} // Mock or nil is fine for this test
	core := NewCore(amSystem)

	// Test setting Claude
	err := core.SetProvider("claude")
	if err != nil {
		t.Errorf("Failed to set claude provider: %v", err)
	}

	// Test setting Copilot
	err = core.SetProvider("copilot")
	if err != nil {
		t.Errorf("Failed to set copilot provider: %v", err)
	}

	// Test setting unknown
	err = core.SetProvider("unknown")
	if err == nil {
		t.Error("Expected error for unknown provider, got nil")
	}
}

func TestCore_Ask_Integration(t *testing.T) {
	// Setup EventBus capture
	receivedEvents := make([]*am.LayerEvent, 0)
	am.EventBus.Reset()
	am.EventBus.Subscribe(func(e *am.LayerEvent) {
		receivedEvents = append(receivedEvents, e)
	})

	// Setup Core with MockProvider
	amSystem := &am.System{}
	core := NewCore(amSystem)
	
	mockEvents := []types.StreamEvent{
		{Type: "thinking", Content: "Thinking..."},
		{Type: "text", Content: "Hello"},
		{Type: "done"},
	}
	core.activeProvider = &MockProvider{events: mockEvents} // Inject mock directly for test

	// Execute Ask
	ctx := context.Background()
	err := core.Ask(ctx, "Test Prompt", "tab-123")
	if err != nil {
		t.Fatalf("Ask failed: %v", err)
	}

	// Wait a bit for async processing (EventBus is async)
	time.Sleep(100 * time.Millisecond)

	// Verify Events
	if len(receivedEvents) == 0 {
		t.Fatal("No events received on EventBus")
	}

	// Check for specific event types mapped to AM LayerEvents
	foundThinking := false
	foundText := false

	for _, e := range receivedEvents {
		if e.Type == "assistant_thinking" && e.Metadata["content"] == "Thinking..." {
			foundThinking = true
		}
		if e.Type == "assistant_response" && e.Metadata["content"] == "Hello" {
			foundText = true
		}
		if e.TabID != "tab-123" {
			t.Errorf("Expected TabID 'tab-123', got %s", e.TabID)
		}
	}

	if !foundThinking {
		t.Error("Did not find expected thinking event")
	}
	if !foundText {
		t.Error("Did not find expected text event")
	}
}
