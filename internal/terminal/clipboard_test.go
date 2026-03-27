package terminal

import (
	"testing"
	"time"
)

func TestClipboardStore(t *testing.T) {
	t.Run("stores and retrieves content", func(t *testing.T) {
		cs := NewClipboardStore()
		cs.Set("hello world")
		got := cs.Get()
		if got != "hello world" {
			t.Errorf("got %q, want %q", got, "hello world")
		}
	})

	t.Run("overwrites previous content", func(t *testing.T) {
		cs := NewClipboardStore()
		cs.Set("first")
		cs.Set("second")
		if cs.Get() != "second" {
			t.Error("content not overwritten")
		}
	})

	t.Run("returns empty string when nothing stored", func(t *testing.T) {
		cs := NewClipboardStore()
		if cs.Get() != "" {
			t.Error("expected empty string")
		}
	})

	t.Run("content expires after TTL", func(t *testing.T) {
		cs := NewClipboardStore()
		cs.ttl = 50 * time.Millisecond // Override for test
		cs.Set("expiring")
		time.Sleep(60 * time.Millisecond)
		if cs.Get() != "" {
			t.Error("content should have expired")
		}
	})

	t.Run("concurrent access is safe", func(t *testing.T) {
		cs := NewClipboardStore()
		done := make(chan struct{})
		go func() {
			for i := 0; i < 100; i++ {
				cs.Set("data")
			}
			close(done)
		}()
		for i := 0; i < 100; i++ {
			cs.Get()
		}
		<-done
	})
}
