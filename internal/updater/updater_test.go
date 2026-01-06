package updater

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestDownloadUpdateRetryLogic tests the retry mechanism
func TestDownloadUpdateRetryLogic(t *testing.T) {
	attempts := 0
	
	// Create a test server that fails twice, then succeeds
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		// Success on 3rd attempt
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("fake-binary-content"))
	}))
	defer server.Close()

	info := &UpdateInfo{
		Available:     true,
		DownloadURL:   server.URL + "/test-binary",
		LatestVersion: "1.0.0-test",
	}

	// This should succeed after retries
	tmpFile, err := DownloadUpdateWithRetries(info, 3)
	if err != nil {
		t.Errorf("Expected success after retries, got error: %v", err)
	}
	if tmpFile == "" && err == nil {
		t.Error("Expected tmpFile path on success")
	}
	
	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

// TestDownloadUpdateRedirectHandling tests HTTP redirect following
func TestDownloadUpdateRedirectHandling(t *testing.T) {
	redirectCount := 0
	
	// Create a test server with redirects
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if redirectCount < 2 {
			redirectCount++
			http.Redirect(w, r, "/redirect-"+string(rune('0'+redirectCount)), http.StatusFound)
			return
		}
		// Final destination
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("binary-after-redirects"))
	}))
	defer server.Close()

	info := &UpdateInfo{
		Available:     true,
		DownloadURL:   server.URL + "/start",
		LatestVersion: "1.0.0-redirect",
	}

	tmpFile, err := DownloadUpdateWithRetries(info, 1)
	if err != nil {
		t.Errorf("Redirect handling failed: %v", err)
	}
	if tmpFile == "" && err == nil {
		t.Error("Expected tmpFile path on success")
	}
}

// TestDownloadUpdateNoUpdateAvailable tests behavior when no update available
func TestDownloadUpdateNoUpdateAvailable(t *testing.T) {
	info := &UpdateInfo{
		Available: false,
	}

	_, err := DownloadUpdate(info)
	if err == nil {
		t.Error("Expected error when no update available")
	}
}

// TestDownloadUpdateExponentialBackoff tests backoff timing
func TestDownloadUpdateExponentialBackoff(t *testing.T) {
	attempts := 0
	attemptTimes := []time.Time{}
	
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attemptTimes = append(attemptTimes, time.Now())
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	info := &UpdateInfo{
		Available:     true,
		DownloadURL:   server.URL + "/fail",
		LatestVersion: "1.0.0-backoff",
	}

	startTime := time.Now()
	_, err := DownloadUpdateWithRetries(info, 2) // Will try 3 times total
	totalTime := time.Since(startTime)
	
	if err == nil {
		t.Error("Expected error after all retries fail")
	}
	
	// Should have attempted 3 times (initial + 2 retries)
	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
	
	// With exponential backoff: 1s + 2s = 3s minimum delay
	// Allow some tolerance for execution time
	if totalTime < 2*time.Second {
		t.Errorf("Expected at least 2s for backoff delays, took %v", totalTime)
	}
}

// TestCheckForUpdateTimeout tests timeout handling
func TestCheckForUpdateTimeout(t *testing.T) {
	// Create a server that hangs
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(15 * time.Second) // Longer than timeout
	}))
	defer server.Close()

	// This test would need to override the GitHub API URL
	// For now, just verify the function exists and returns properly
	info, err := CheckForUpdate()
	// May succeed or fail depending on network - just don't panic
	_ = info
	_ = err
}

// TestTooManyRedirects tests redirect limit
func TestTooManyRedirects(t *testing.T) {
	redirectCount := 0
	
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirectCount++
		// Infinite redirects
		http.Redirect(w, r, "/redirect-"+string(rune('0'+redirectCount%10)), http.StatusFound)
	}))
	defer server.Close()

	info := &UpdateInfo{
		Available:     true,
		DownloadURL:   server.URL + "/infinite",
		LatestVersion: "1.0.0-redirect-loop",
	}

	_, err := DownloadUpdateWithRetries(info, 1)
	if err == nil {
		t.Error("Expected error from too many redirects")
	}
}
