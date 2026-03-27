package terminal

import (
	"sync"
	"time"
)

type ClipboardStore struct {
	mu      sync.RWMutex
	content string
	setAt   time.Time
	ttl     time.Duration
}

func NewClipboardStore() *ClipboardStore {
	return &ClipboardStore{ttl: 5 * time.Minute}
}

func (cs *ClipboardStore) Set(content string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.content = content
	cs.setAt = time.Now()
}

func (cs *ClipboardStore) Get() string {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	if cs.content == "" {
		return ""
	}
	if time.Since(cs.setAt) > cs.ttl {
		return ""
	}
	return cs.content
}
