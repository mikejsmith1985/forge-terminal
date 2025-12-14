package diagnostic

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewService(t *testing.T) {
	s := NewService()
	
	if s.sessionID == "" {
		t.Error("sessionID should not be empty")
	}
	
	if s.maxEvents != 500 {
		t.Errorf("maxEvents should be 500, got %d", s.maxEvents)
	}
	
	if len(s.events) != 0 {
		t.Errorf("events should be empty initially, got %d", len(s.events))
	}
}

func TestRecordEvent(t *testing.T) {
	s := NewService()
	
	s.RecordEvent("KEYBOARD", "keydown", map[string]interface{}{
		"key":  "Space",
		"code": "Space",
	}, "Spacebar pressed")
	
	events := s.GetEvents(10)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	
	event := events[0]
	if event.Type != "KEYBOARD" {
		t.Errorf("expected type KEYBOARD, got %s", event.Type)
	}
	if event.Subtype != "keydown" {
		t.Errorf("expected subtype keydown, got %s", event.Subtype)
	}
	if event.PlainText != "Spacebar pressed" {
		t.Errorf("expected plain text 'Spacebar pressed', got '%s'", event.PlainText)
	}
}

func TestCircularBuffer(t *testing.T) {
	s := &Service{
		sessionID:     "test",
		startTime:     time.Now(),
		events:        make([]DiagnosticEvent, 0, 10),
		maxEvents:     10,
		lastEventTime: time.Now(),
	}
	
	// Add 15 events to a buffer of 10
	for i := 0; i < 15; i++ {
		s.RecordEvent("TEST", "test", map[string]interface{}{
			"index": i,
		}, "test event")
	}
	
	events := s.GetEvents(100)
	if len(events) != 10 {
		t.Errorf("expected 10 events (buffer size), got %d", len(events))
	}
	
	// First event should be index 5 (0-4 were dropped)
	if events[0].Data["index"].(int) != 5 {
		t.Errorf("expected first event index to be 5, got %v", events[0].Data["index"])
	}
	
	// Last event should be index 14
	if events[9].Data["index"].(int) != 14 {
		t.Errorf("expected last event index to be 14, got %v", events[9].Data["index"])
	}
}

func TestGetAMStatus(t *testing.T) {
	s := NewService()
	
	status := s.GetAMStatus()
	
	// AMDirectory should be set
	if status.AMDirectory == "" {
		t.Error("AMDirectory should not be empty")
	}
	
	// If directory doesn't exist, that's fine for test
	// Just verify the function doesn't panic
	t.Logf("AM Status: exists=%v, writable=%v, files=%d", 
		status.DirectoryExists, status.DirectoryWritable, status.TotalFiles)
}

func TestGetPlatformInfo(t *testing.T) {
	s := NewService()
	
	info := s.GetPlatformInfo()
	
	if info.OS == "" {
		t.Error("OS should not be empty")
	}
	if info.Arch == "" {
		t.Error("Arch should not be empty")
	}
	if info.HomeDir == "" {
		t.Error("HomeDir should not be empty")
	}
	if info.ForgeDataDir == "" {
		t.Error("ForgeDataDir should not be empty")
	}
	
	t.Logf("Platform: OS=%s, Arch=%s, IsWSL=%v", info.OS, info.Arch, info.IsWSL)
}

func TestExportSession(t *testing.T) {
	s := NewService()
	
	// Add some events
	s.RecordEvent("TEST", "test1", nil, "test event 1")
	s.RecordEvent("TEST", "test2", nil, "test event 2")
	
	// Export
	path, err := s.ExportSession()
	if err != nil {
		t.Fatalf("ExportSession failed: %v", err)
	}
	
	// Verify file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Errorf("exported file does not exist: %s", path)
	}
	
	// Clean up
	os.Remove(path)
	
	t.Logf("Session exported to: %s", path)
}

func TestReset(t *testing.T) {
	s := NewService()
	oldSessionID := s.sessionID
	
	// Add events
	s.RecordEvent("TEST", "test", nil, "test")
	
	// Reset
	s.Reset()
	
	if s.sessionID == oldSessionID {
		t.Error("sessionID should change after reset")
	}
	
	if len(s.events) != 0 {
		t.Errorf("events should be empty after reset, got %d", len(s.events))
	}
}

func TestSubscription(t *testing.T) {
	s := NewService()
	
	ch := s.Subscribe()
	defer s.Unsubscribe(ch)
	
	// Record event in goroutine
	go func() {
		time.Sleep(10 * time.Millisecond)
		s.RecordEvent("TEST", "test", nil, "subscriber test")
	}()
	
	// Wait for event
	select {
	case event := <-ch:
		if event.PlainText != "subscriber test" {
			t.Errorf("unexpected event: %s", event.PlainText)
		}
	case <-time.After(1 * time.Second):
		t.Error("timeout waiting for event")
	}
}

func TestGlobalService(t *testing.T) {
	s1 := GetService()
	s2 := GetService()
	
	if s1 != s2 {
		t.Error("GetService should return same instance")
	}
}

func TestAMStatusWithFiles(t *testing.T) {
	// Create a temp directory to simulate AM directory
	tmpDir := t.TempDir()
	
	s := &Service{
		amDir: tmpDir,
	}
	
	// Create some test files
	testFile := filepath.Join(tmpDir, "test-conv.json")
	err := os.WriteFile(testFile, []byte(`{"test": true}`), 0644)
	if err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}
	
	status := s.GetAMStatus()
	
	if !status.DirectoryExists {
		t.Error("DirectoryExists should be true")
	}
	if !status.DirectoryWritable {
		t.Error("DirectoryWritable should be true")
	}
	if status.TotalFiles != 1 {
		t.Errorf("TotalFiles should be 1, got %d", status.TotalFiles)
	}
	if status.LastFileWritePath != "test-conv.json" {
		t.Errorf("LastFileWritePath should be 'test-conv.json', got '%s'", status.LastFileWritePath)
	}
	if !status.FileWriteVerified {
		t.Error("FileWriteVerified should be true")
	}
}
