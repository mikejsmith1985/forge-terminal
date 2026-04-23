package main

import (
	"testing"
	"time"
)

// TestTunnelHostnameCacheHit verifies that repeated calls within the TTL
// window do not re-invoke the expensive disk-reading path. Without the
// cache, every HTTP response re-reads state.json + notify_config.json,
// which caused the v7.6.29 UI flicker bug.
func TestTunnelHostnameCacheHit(t *testing.T) {
	invalidateTunnelHostnameCache()

	// Prime the cache.
	first := tunnelHostnamesForCSP()

	// Manually stamp cache time to "now" and install a sentinel value.
	tunnelHostnameCacheMu.Lock()
	tunnelHostnameCacheVal = []string{"https://sentinel.example"}
	tunnelHostnameCacheAt = time.Now()
	tunnelHostnameCacheMu.Unlock()

	second := tunnelHostnamesForCSP()
	if len(second) != 1 || second[0] != "https://sentinel.example" {
		t.Fatalf("expected cached sentinel, got %v (first=%v)", second, first)
	}
}

// TestTunnelHostnameCacheExpiry verifies the cache re-reads after TTL.
func TestTunnelHostnameCacheExpiry(t *testing.T) {
	invalidateTunnelHostnameCache()

	tunnelHostnameCacheMu.Lock()
	tunnelHostnameCacheVal = []string{"https://stale.example"}
	tunnelHostnameCacheAt = time.Now().Add(-10 * time.Second) // older than 5s TTL
	tunnelHostnameCacheMu.Unlock()

	got := tunnelHostnamesForCSP()
	for _, h := range got {
		if h == "https://stale.example" {
			t.Fatalf("expected stale entry to be evicted, still present in %v", got)
		}
	}
}

// TestInvalidateTunnelHostnameCache verifies explicit invalidation forces
// a fresh read on the next call.
func TestInvalidateTunnelHostnameCache(t *testing.T) {
	tunnelHostnameCacheMu.Lock()
	tunnelHostnameCacheVal = []string{"https://sticky.example"}
	tunnelHostnameCacheAt = time.Now()
	tunnelHostnameCacheMu.Unlock()

	invalidateTunnelHostnameCache()

	got := tunnelHostnamesForCSP()
	for _, h := range got {
		if h == "https://sticky.example" {
			t.Fatalf("expected invalidation to evict sticky entry, still present in %v", got)
		}
	}
}
