package main

import (
	"net/http"
	"net/http/pprof"
)

// NewPprofMux returns a ServeMux with pprof handlers wrapped in AuthMiddleware.
// Used by both production registration and tests.
func NewPprofMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", AuthMiddleware(pprof.Index))
	mux.HandleFunc("/debug/pprof/cmdline", AuthMiddleware(pprof.Cmdline))
	mux.HandleFunc("/debug/pprof/profile", AuthMiddleware(pprof.Profile))
	mux.HandleFunc("/debug/pprof/symbol", AuthMiddleware(pprof.Symbol))
	mux.HandleFunc("/debug/pprof/trace", AuthMiddleware(pprof.Trace))
	return mux
}

// RegisterPprofRoutes registers pprof handlers on http.DefaultServeMux
// behind AuthMiddleware. Call this instead of importing _ "net/http/pprof".
func RegisterPprofRoutes() {
	http.HandleFunc("/debug/pprof/", AuthMiddleware(pprof.Index))
	http.HandleFunc("/debug/pprof/cmdline", AuthMiddleware(pprof.Cmdline))
	http.HandleFunc("/debug/pprof/profile", AuthMiddleware(pprof.Profile))
	http.HandleFunc("/debug/pprof/symbol", AuthMiddleware(pprof.Symbol))
	http.HandleFunc("/debug/pprof/trace", AuthMiddleware(pprof.Trace))
}
