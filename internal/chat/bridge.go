// Package chat provides the bridge between AM events and Chat store.
// v3.12.3: AM system removed - bridge is now a no-op stub.
package chat

import (
	"log"
	"time"
)

// Bridge connects AM events to the Chat store
// v3.12.3: AM removed - this is now a no-op
type Bridge struct {
	store *Store
}

// NewBridge creates a bridge (no-op since AM removed)
func NewBridge(store *Store) *Bridge {
	log.Printf("[ChatBridge] v3.12.3: AM system removed - bridge disabled")
	return &Bridge{store: store}
}

// Stop is a no-op since AM removed
func (b *Bridge) Stop() {}

// ArchiveOldMessages triggers archiving of old messages
func (b *Bridge) ArchiveOldMessages() error {
	return b.store.ArchiveOldMessages(7 * 24 * time.Hour)
}
