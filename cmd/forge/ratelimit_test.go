package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("requests within limit pass", func(t *testing.T) {
		rl := NewRateLimiter(5, 1*time.Second)
		handler := rl.Middleware(dummyHandler)

		for i := 0; i < 5; i++ {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "192.168.1.1:12345"
			rr := httptest.NewRecorder()
			handler(rr, req)
			if rr.Code != http.StatusOK {
				t.Errorf("request %d: got status %d, want %d", i+1, rr.Code, http.StatusOK)
			}
		}
	})

	t.Run("burst over limit returns 429", func(t *testing.T) {
		rl := NewRateLimiter(5, 1*time.Second)
		handler := rl.Middleware(dummyHandler)

		for i := 0; i < 5; i++ {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "10.0.0.1:9999"
			rr := httptest.NewRecorder()
			handler(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("request %d should pass, got %d", i+1, rr.Code)
			}
		}

		// 6th request should be rate limited
		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "10.0.0.1:9999"
		rr := httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusTooManyRequests {
			t.Errorf("got status %d, want %d", rr.Code, http.StatusTooManyRequests)
		}
		if rr.Header().Get("Retry-After") == "" {
			t.Error("missing Retry-After header on 429 response")
		}
	})

	t.Run("different IPs have independent limits", func(t *testing.T) {
		rl := NewRateLimiter(3, 1*time.Second)
		handler := rl.Middleware(dummyHandler)

		// Exhaust limit for IP1
		for i := 0; i < 3; i++ {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "1.1.1.1:1000"
			rr := httptest.NewRecorder()
			handler(rr, req)
		}

		// IP1 should be blocked
		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "1.1.1.1:1000"
		rr := httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusTooManyRequests {
			t.Errorf("IP1 should be blocked, got %d", rr.Code)
		}

		// IP2 should still work
		req = httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "2.2.2.2:2000"
		rr = httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("IP2 should pass, got %d", rr.Code)
		}
	})

	t.Run("limit resets after window", func(t *testing.T) {
		rl := NewRateLimiter(2, 100*time.Millisecond)
		handler := rl.Middleware(dummyHandler)

		// Exhaust the limit
		for i := 0; i < 2; i++ {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "3.3.3.3:3000"
			rr := httptest.NewRecorder()
			handler(rr, req)
		}

		// Should be blocked
		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "3.3.3.3:3000"
		rr := httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusTooManyRequests {
			t.Fatalf("should be blocked, got %d", rr.Code)
		}

		// Wait for window to expire
		time.Sleep(150 * time.Millisecond)

		// Should be allowed again
		req = httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "3.3.3.3:3000"
		rr = httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("after window reset: got %d, want %d", rr.Code, http.StatusOK)
		}
	})

	t.Run("X-Forwarded-For is respected", func(t *testing.T) {
		rl := NewRateLimiter(2, 1*time.Second)
		handler := rl.Middleware(dummyHandler)

		// Exhaust limit using X-Forwarded-For IP
		for i := 0; i < 2; i++ {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "127.0.0.1:8080"
			req.Header.Set("X-Forwarded-For", "99.99.99.99, 10.0.0.1")
			rr := httptest.NewRecorder()
			handler(rr, req)
		}

		// Same X-Forwarded-For IP should be blocked
		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "127.0.0.1:8080"
		req.Header.Set("X-Forwarded-For", "99.99.99.99")
		rr := httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusTooManyRequests {
			t.Errorf("X-Forwarded-For IP should be blocked, got %d", rr.Code)
		}

		// Different RemoteAddr but no X-Forwarded-For — different identity, should pass
		req = httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "127.0.0.1:8080"
		rr = httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("request without X-Forwarded-For should use RemoteAddr, got %d", rr.Code)
		}
	})
}
