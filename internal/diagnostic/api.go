// Package diagnostic provides API handlers for freeze detection.
package diagnostic

import (
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"runtime/debug"
	"strconv"
)

// RegisterHandlers registers all diagnostic API handlers.
// Call this from main.go to add the freeze detection endpoints.
func RegisterHandlers(mux *http.ServeMux, middleware func(http.HandlerFunc) http.HandlerFunc) {
	// If mux is nil, use the default mux
	if mux == nil {
		http.HandleFunc("/api/diagnostics/freeze/metrics", middleware(HandleFreezeMetrics))
		http.HandleFunc("/api/diagnostics/freeze/current", middleware(HandleFreezeCurrent))
		http.HandleFunc("/api/diagnostics/freeze/stats", middleware(HandleFreezeStats))
		http.HandleFunc("/api/diagnostics/freeze/gc", middleware(HandleForceGC))
		http.HandleFunc("/api/diagnostics/freeze/goroutines", middleware(HandleGoroutines))
		http.HandleFunc("/api/diagnostics/runtime", middleware(HandleRuntimeStats))
	} else {
		mux.HandleFunc("/api/diagnostics/freeze/metrics", middleware(HandleFreezeMetrics))
		mux.HandleFunc("/api/diagnostics/freeze/current", middleware(HandleFreezeCurrent))
		mux.HandleFunc("/api/diagnostics/freeze/stats", middleware(HandleFreezeStats))
		mux.HandleFunc("/api/diagnostics/freeze/gc", middleware(HandleForceGC))
		mux.HandleFunc("/api/diagnostics/freeze/goroutines", middleware(HandleGoroutines))
		mux.HandleFunc("/api/diagnostics/runtime", middleware(HandleRuntimeStats))
	}
	log.Printf("[Diagnostic] Freeze detection API endpoints registered")
}

// HandleFreezeMetrics returns recent freeze detector metrics.
func HandleFreezeMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Get count parameter, default to 100
	count := 100
	if countStr := r.URL.Query().Get("count"); countStr != "" {
		if n, err := strconv.Atoi(countStr); err == nil && n > 0 {
			count = n
		}
	}

	fd := GetFreezeDetector()
	metrics := fd.GetMetrics(count)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"metrics": metrics,
		"count":   len(metrics),
	})
}

// HandleFreezeCurrent returns current system state.
func HandleFreezeCurrent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	fd := GetFreezeDetector()
	current := fd.GetCurrentMetrics()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"current": current,
	})
}

// HandleFreezeStats returns comprehensive runtime statistics.
func HandleFreezeStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	fd := GetFreezeDetector()
	stats := fd.GetRuntimeStats()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"stats":   stats,
	})
}

// HandleForceGC forces garbage collection and returns stats.
func HandleForceGC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	fd := GetFreezeDetector()
	result := fd.ForceGC()

	log.Printf("[Diagnostic] Forced GC: freed %.1fMB, %d objects",
		result["freed_mb"], result["objects_freed"])

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"gc":      result,
	})
}

// HandleGoroutines returns goroutine profile.
func HandleGoroutines(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Check for full stack trace request
	full := r.URL.Query().Get("full") == "true"

	fd := GetFreezeDetector()
	profile := fd.GetGoroutineProfile()

	response := map[string]interface{}{
		"success": true,
		"total":   runtime.NumGoroutine(),
		"profile": profile,
	}

	if full {
		// Capture full stack traces (WARNING: can be large)
		buf := make([]byte, 1024*1024)
		n := runtime.Stack(buf, true)
		response["stacks"] = string(buf[:n])
	}

	json.NewEncoder(w).Encode(response)
}

// HandleRuntimeStats returns comprehensive Go runtime statistics.
func HandleRuntimeStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// Build info
	buildInfo, _ := debug.ReadBuildInfo()
	var buildInfoMap map[string]interface{}
	if buildInfo != nil {
		buildInfoMap = map[string]interface{}{
			"go_version": buildInfo.GoVersion,
			"path":       buildInfo.Path,
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"runtime": map[string]interface{}{
			"version":     runtime.Version(),
			"goos":        runtime.GOOS,
			"goarch":      runtime.GOARCH,
			"num_cpu":     runtime.NumCPU(),
			"gomaxprocs":  runtime.GOMAXPROCS(0),
			"goroutines":  runtime.NumGoroutine(),
			"cgo_calls":   runtime.NumCgoCall(),
			"build_info":  buildInfoMap,
		},
		"memory": map[string]interface{}{
			"alloc_mb":        float64(m.Alloc) / 1024 / 1024,
			"total_alloc_mb":  float64(m.TotalAlloc) / 1024 / 1024,
			"sys_mb":          float64(m.Sys) / 1024 / 1024,
			"heap_alloc_mb":   float64(m.HeapAlloc) / 1024 / 1024,
			"heap_sys_mb":     float64(m.HeapSys) / 1024 / 1024,
			"heap_idle_mb":    float64(m.HeapIdle) / 1024 / 1024,
			"heap_inuse_mb":   float64(m.HeapInuse) / 1024 / 1024,
			"heap_objects":    m.HeapObjects,
			"stack_inuse_mb":  float64(m.StackInuse) / 1024 / 1024,
			"stack_sys_mb":    float64(m.StackSys) / 1024 / 1024,
			"mallocs":         m.Mallocs,
			"frees":           m.Frees,
		},
		"gc": map[string]interface{}{
			"num_gc":          m.NumGC,
			"num_forced_gc":   m.NumForcedGC,
			"gc_cpu_fraction": m.GCCPUFraction,
			"pause_total_ns":  m.PauseTotalNs,
			"pause_total_ms":  float64(m.PauseTotalNs) / 1e6,
			"last_pause_ns":   m.PauseNs[(m.NumGC+255)%256],
			"last_pause_ms":   float64(m.PauseNs[(m.NumGC+255)%256]) / 1e6,
			"next_gc_mb":      float64(m.NextGC) / 1024 / 1024,
		},
	})
}
