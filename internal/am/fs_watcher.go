// Package am provides file system watching for AM conversation files.
package am

import (
	"context"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// FSWatcher monitors the AM directory for file changes (Layer 4).
type FSWatcher struct {
	watcher *fsnotify.Watcher
	amDir   string
}

// NewFSWatcher creates a new file system watcher.
func NewFSWatcher(amDir string) (*FSWatcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	fw := &FSWatcher{
		watcher: watcher,
		amDir:   amDir,
	}

	if err := watcher.Add(amDir); err != nil {
		watcher.Close()
		return nil, err
	}

	log.Printf("[FS Layer 4] Watching directory: %s", amDir)
	return fw, nil
}

// Start begins watching for file system events.
func (fw *FSWatcher) Start(ctx context.Context) {
	log.Printf("[FS Layer 4] Starting file system watcher")

	// Initial heartbeat
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     4,
		Timestamp: time.Now(),
	})

	// Periodic heartbeat ticker
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			fw.watcher.Close()
			log.Printf("[FS Layer 4] Shutting down")
			return

		case <-ticker.C:
			// Send periodic heartbeat even without file activity
			EventBus.Publish(&LayerEvent{
				Type:      "HEARTBEAT",
				Layer:     4,
				Timestamp: time.Now(),
			})

		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}
			fw.handleEvent(event)

		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[FS Layer 4] Error: %v", err)
		}
	}
}

func (fw *FSWatcher) handleEvent(event fsnotify.Event) {
	if !strings.Contains(event.Name, "llm-conv-") {
		return
	}

	var eventType string
	switch {
	case event.Op&fsnotify.Create == fsnotify.Create:
		eventType = "FS_CREATE"
	case event.Op&fsnotify.Write == fsnotify.Write:
		eventType = "FS_WRITE"
	case event.Op&fsnotify.Remove == fsnotify.Remove:
		eventType = "FS_REMOVE"
	default:
		return
	}

	log.Printf("[FS Layer 4] %s: %s", eventType, filepath.Base(event.Name))

	EventBus.Publish(&LayerEvent{
		Type:      eventType,
		Layer:     4,
		Timestamp: time.Now(),
		Metadata: map[string]interface{}{
			"path": event.Name,
		},
	})

	// Heartbeat on activity
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     4,
		Timestamp: time.Now(),
	})
}

// Close stops the watcher.
func (fw *FSWatcher) Close() error {
	return fw.watcher.Close()
}
