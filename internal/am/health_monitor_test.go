package am

import (
	"testing"
	"time"
)

// TestHealthMonitorBasic tests basic health monitor functionality
func TestHealthMonitorBasic(t *testing.T) {
	hm := NewHealthMonitor()
	if hm == nil {
		t.Fatal("NewHealthMonitor() returned nil")
	}

	// Test GetSystemHealth doesn't panic
	health := hm.GetSystemHealth()
	if health == nil {
		t.Fatal("GetSystemHealth() returned nil")
	}

	// Verify status is a valid value
	validStatuses := map[string]bool{"HEALTHY": true, "DEGRADED": true, "FAILED": true, "NOT_INITIALIZED": true}
	if !validStatuses[health.Status] {
		t.Errorf("Invalid status: %s", health.Status)
	}
}

// TestGetTabCaptureStatus tests the 3-state tab status logic
func TestGetTabCaptureStatus(t *testing.T) {
	hm := NewHealthMonitor()

	// Test disabled state
	status := hm.GetTabCaptureStatus("test-tab-1", false)
	if status.Status != "disabled" {
		t.Errorf("Expected 'disabled' when amEnabled=false, got '%s'", status.Status)
	}
	if status.DetailedReason == "" {
		t.Error("DetailedReason should not be empty for disabled status")
	}

	// Test active state (no logger yet - waiting for LLM)
	status = hm.GetTabCaptureStatus("test-tab-2", true)
	if status.Status != "active" {
		t.Errorf("Expected 'active' when no logger exists, got '%s'", status.Status)
	}
	if status.DetailedReason == "" {
		t.Error("DetailedReason should explain why AM is waiting")
	}
}

// TestHealthMonitorErrorHandling tests error resilience
func TestHealthMonitorErrorHandling(t *testing.T) {
	hm := NewHealthMonitor()

	// Multiple rapid calls should not panic
	for i := 0; i < 10; i++ {
		_ = hm.GetSystemHealth()
		_ = hm.GetTabCaptureStatus("rapid-test", true)
	}
}

// TestRedundancyStatus tests that redundancy info is always populated
func TestRedundancyStatus(t *testing.T) {
	hm := NewHealthMonitor()
	status := hm.GetTabCaptureStatus("test-tab", true)
	
	// RedundancyStatus should be populated
	if status.RedundancyStatus == nil {
		t.Error("RedundancyStatus should not be nil when amEnabled=true")
	}
	
	// HealthMonitorOk should always be true if this code is running
	if status.RedundancyStatus != nil && !status.RedundancyStatus.HealthMonitorOk {
		t.Error("HealthMonitorOk should be true when health monitor is running")
	}
}

// TestEventBusIntegration tests event handling doesn't crash
func TestEventBusIntegration(t *testing.T) {
	hm := NewHealthMonitor()
	
	// Simulate some events
	hm.RecordInputCapture()
	hm.RecordOutputCapture()
	hm.RecordParseFailure()
	hm.RecordLowConfidence()
	
	// Wait for events to process
	time.Sleep(50 * time.Millisecond)
	
	// Get health should reflect events
	health := hm.GetSystemHealth()
	if health.Metrics == nil {
		t.Fatal("Metrics should not be nil")
	}
	
	if health.Metrics.InputTurnsDetected < 1 {
		t.Errorf("Expected at least 1 input turn detected, got %d", health.Metrics.InputTurnsDetected)
	}
}

// TestNativeMonitorErrorHandling tests native session error resilience
func TestNativeMonitorErrorHandling(t *testing.T) {
	hm := NewHealthMonitor()
	
	// This should not panic even if native session dirs don't exist
	status := hm.GetTabCaptureStatus("test-native", true)
	
	// NativeRecoveryOk can be true or false depending on environment
	// But it should not cause a panic
	if status.TabID != "test-native" {
		t.Errorf("TabID mismatch: expected 'test-native', got '%s'", status.TabID)
	}
}
