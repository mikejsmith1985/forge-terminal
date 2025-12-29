// Package chat provides the bridge between AM events and Chat store.
// v3.5.1: Syncs terminal output to Chat messages.
package chat

import (
	"log"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

// Bridge connects AM events to the Chat store
type Bridge struct {
	store       *Store
	unsubscribe func()
}

// NewBridge creates a bridge that syncs AM events to Chat
func NewBridge(store *Store) *Bridge {
	b := &Bridge{
		store: store,
	}
	b.start()
	return b
}

// start subscribes to AM events
func (b *Bridge) start() {
	b.unsubscribe = am.EventBus.Subscribe(b.handleEvent)
	log.Printf("[ChatBridge] Started - listening for AM events")
}

// Stop unsubscribes from AM events
func (b *Bridge) Stop() {
	if b.unsubscribe != nil {
		b.unsubscribe()
		log.Printf("[ChatBridge] Stopped")
	}
}

// handleEvent processes AM events and converts them to Chat messages
func (b *Bridge) handleEvent(event *am.LayerEvent) {
	if b.store == nil || event == nil {
		return
	}

	// Map AM event types to Chat message types
	switch event.Type {
	case "LLM_START":
		// New LLM session started
		provider := event.Provider
		if provider == "" {
			provider = "AI"
		}
		
		msg := Message{
			Type:       MessageTypeSystem,
			Content:    "Started " + provider + " session",
			Timestamp:  event.Timestamp,
			WorkerID:   event.TabID,
			WorkerName: provider,
		}
		if err := b.store.AddMessage(msg); err != nil {
			log.Printf("[ChatBridge] Failed to add system message: %v", err)
		}

		// Register worker
		worker := Worker{
			ID:         event.TabID + "-" + provider,
			Name:       provider,
			Type:       provider,
			Status:     "running",
			TabID:      event.TabID,
			CreatedAt:  event.Timestamp,
			LastActive: event.Timestamp,
		}
		if err := b.store.RegisterWorker(worker); err != nil {
			log.Printf("[ChatBridge] Failed to register worker: %v", err)
		}
		
		log.Printf("[ChatBridge] Registered LLM_START for %s in tab %s", provider, event.TabID)

	case "LLM_END":
		// LLM session ended
		provider := event.Provider
		if provider == "" {
			provider = "AI"
		}
		
		msg := Message{
			Type:       MessageTypeSystem,
			Content:    "Ended " + provider + " session",
			Timestamp:  event.Timestamp,
			WorkerID:   event.TabID,
			WorkerName: provider,
		}
		if err := b.store.AddMessage(msg); err != nil {
			log.Printf("[ChatBridge] Failed to add system message: %v", err)
		}

		// Update worker status
		workerID := event.TabID + "-" + provider
		if err := b.store.UpdateWorkerStatus(workerID, "idle"); err != nil {
			log.Printf("[ChatBridge] Failed to update worker status: %v", err)
		}
		
		log.Printf("[ChatBridge] Registered LLM_END for %s in tab %s", provider, event.TabID)

	case "LLM_TURN":
		// A conversation turn was captured
		role, _ := event.Metadata["role"].(string)
		content, _ := event.Metadata["content"].(string)
		
		if content == "" {
			return
		}
		
		var msgType MessageType
		switch role {
		case "user":
			msgType = MessageTypeUser
		case "assistant":
			msgType = MessageTypeAssistant
		default:
			msgType = MessageTypeSystem
		}
		
		provider := event.Provider
		if provider == "" {
			provider = "AI"
		}
		
		msg := Message{
			Type:       msgType,
			Content:    content,
			Timestamp:  event.Timestamp,
			WorkerID:   event.TabID,
			WorkerName: provider,
			Metadata: &MessageMetadata{
				Provider: provider,
			},
		}
		if err := b.store.AddMessage(msg); err != nil {
			log.Printf("[ChatBridge] Failed to add turn message: %v", err)
		}
		
		log.Printf("[ChatBridge] Added %s turn from %s", role, provider)

	case "LLM_SNAPSHOT":
		// A screen snapshot was captured - we can extract content
		// This is useful for capturing long AI responses
		content, _ := event.Metadata["cleanedContent"].(string)
		if content != "" && len(content) > 50 {
			// Only log significant snapshots
			log.Printf("[ChatBridge] Snapshot captured: %d chars", len(content))
		}
	}
}

// SyncConversationToChat imports an existing AM conversation to Chat
func (b *Bridge) SyncConversationToChat(conv *am.LLMConversation) error {
	if conv == nil || b.store == nil {
		return nil
	}

	log.Printf("[ChatBridge] Syncing conversation %s with %d turns", conv.ConversationID, len(conv.Turns))

	for _, turn := range conv.Turns {
		var msgType MessageType
		switch turn.Role {
		case "user":
			msgType = MessageTypeUser
		case "assistant":
			msgType = MessageTypeAssistant
		default:
			msgType = MessageTypeSystem
		}

		provider := turn.Provider
		if provider == "" {
			provider = conv.Provider
		}

		msg := Message{
			Type:       msgType,
			Content:    turn.Content,
			Timestamp:  turn.Timestamp,
			WorkerID:   conv.TabID,
			WorkerName: provider,
			Metadata: &MessageMetadata{
				Provider:       provider,
				ConversationID: conv.ConversationID,
			},
		}

		if err := b.store.AddMessage(msg); err != nil {
			log.Printf("[ChatBridge] Failed to sync turn: %v", err)
		}
	}

	return nil
}

// ArchiveOldMessages triggers archiving of old messages
func (b *Bridge) ArchiveOldMessages() error {
	// Archive messages older than 7 days
	return b.store.ArchiveOldMessages(7 * 24 * time.Hour)
}
