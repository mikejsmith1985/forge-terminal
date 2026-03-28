package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipRecord struct {
	count       int
	windowStart time.Time
}

// RateLimiter implements a fixed-window IP-based rate limiter.
type RateLimiter struct {
	mu      sync.Mutex
	records map[string]*ipRecord
	limit   int
	window  time.Duration
}

// NewRateLimiter creates a rate limiter that allows limit requests per IP
// within the given window duration.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		records: make(map[string]*ipRecord),
		limit:   limit,
		window:  window,
	}
	go rl.cleanup()
	return rl
}

// Allow reports whether a request from ip should be permitted.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rec, exists := rl.records[ip]
	if !exists || now.Sub(rec.windowStart) >= rl.window {
		rl.records[ip] = &ipRecord{count: 1, windowStart: now}
		return true
	}
	rec.count++
	return rec.count <= rl.limit
}

// Middleware wraps an http.HandlerFunc with per-IP rate limiting.
func (rl *RateLimiter) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !rl.Allow(ip) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}

// extractIP determines the client IP from the request, preferring
// X-Forwarded-For (first entry) and falling back to RemoteAddr.
func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// cleanup periodically removes stale records to prevent unbounded growth.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window * 2)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for ip, rec := range rl.records {
			if now.Sub(rec.windowStart) >= rl.window*2 {
				delete(rl.records, ip)
			}
		}
		rl.mu.Unlock()
	}
}
