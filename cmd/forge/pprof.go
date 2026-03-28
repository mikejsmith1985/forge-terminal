package main

import (
"fmt"
"net/http"
"runtime/pprof"
"strconv"
)

// Auth-protected pprof endpoints. We avoid importing net/http/pprof because
// its init() auto-registers on DefaultServeMux, which conflicts with
// Go 1.22+ stricter route matching when we also register our own handlers.

func pprofIndex(w http.ResponseWriter, r *http.Request) {
w.Header().Set("Content-Type", "text/html; charset=utf-8")
fmt.Fprint(w, "<html><body><h1>pprof</h1><ul>")
for _, p := range pprof.Profiles() {
fmt.Fprintf(w, "<li><a href='/debug/pprof/%s?debug=1'>%s</a> (%d)</li>", p.Name(), p.Name(), p.Count())
}
fmt.Fprint(w, "</ul></body></html>")
}

func pprofNamedHandler(name string) http.HandlerFunc {
return func(w http.ResponseWriter, r *http.Request) {
p := pprof.Lookup(name)
if p == nil {
http.Error(w, "unknown profile: "+name, http.StatusNotFound)
return
}
debug, _ := strconv.Atoi(r.URL.Query().Get("debug"))
if debug > 0 {
w.Header().Set("Content-Type", "text/plain; charset=utf-8")
} else {
w.Header().Set("Content-Type", "application/octet-stream")
w.Header().Set("Content-Disposition", "attachment; filename=\""+name+".pb.gz\"")
}
p.WriteTo(w, debug)
}
}

// NewPprofMux returns a ServeMux with pprof handlers wrapped in AuthMiddleware.
func NewPprofMux() *http.ServeMux {
mux := http.NewServeMux()
mux.HandleFunc("/debug/pprof/", AuthMiddleware(pprofIndex))
for _, name := range []string{"heap", "goroutine", "allocs", "block", "mutex", "threadcreate"} {
mux.HandleFunc("/debug/pprof/"+name, AuthMiddleware(pprofNamedHandler(name)))
}
return mux
}

// RegisterPprofRoutes registers pprof handlers on http.DefaultServeMux behind auth.
func RegisterPprofRoutes() {
http.HandleFunc("/debug/pprof/", AuthMiddleware(pprofIndex))
for _, name := range []string{"heap", "goroutine", "allocs", "block", "mutex", "threadcreate"} {
http.HandleFunc("/debug/pprof/"+name, AuthMiddleware(pprofNamedHandler(name)))
}
}