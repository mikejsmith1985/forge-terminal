// Package am provides the Artificial Memory multi-layer capture system.
package am

import (
	"sync"
	"time"
)

// EventBus is the global event bus instance for inter-layer communication.
var EventBus = NewEventBusInstance()

// LayerEvent represents an event from any AM layer.
type LayerEvent struct {
	Type      string                 `json:"type"`
	Layer     int                    `json:"layer"`
	TabID     string                 `json:"tabId,omitempty"`
	ConvID    string                 `json:"convId,omitempty"`
	Provider  string                 `json:"provider,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// EventBusInstance manages event subscriptions and publishing.
type EventBusInstance struct {
	subscribers []func(*LayerEvent)
	mutex       sync.RWMutex
}

// NewEventBusInstance creates a new event bus.
func NewEventBusInstance() *EventBusInstance {
	return &EventBusInstance{
		subscribers: make([]func(*LayerEvent), 0),
	}
}

// Subscribe adds a handler for layer events.
func (eb *EventBusInstance) Subscribe(handler func(*LayerEvent)) {
	eb.mutex.Lock()
	defer eb.mutex.Unlock()
	eb.subscribers = append(eb.subscribers, handler)
}

// Publish sends an event to all subscribers.
func (eb *EventBusInstance) Publish(event *LayerEvent) {
	eb.mutex.RLock()
	defer eb.mutex.RUnlock()

	for _, handler := range eb.subscribers {
		go handler(event)
	}
}

// Reset clears all subscribers (for testing).
func (eb *EventBusInstance) Reset() {
	eb.mutex.Lock()
	defer eb.mutex.Unlock()
	eb.subscribers = make([]func(*LayerEvent), 0)
}
