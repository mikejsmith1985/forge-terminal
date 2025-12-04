package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/mikejsmith1985/forge-terminal/internal/commands"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
)

//go:embed all:web
var embeddedFS embed.FS

// Preferred ports to try, in order
var preferredPorts = []int{8333, 8080, 9000, 3000, 3333}

func main() {
	// Serve embedded frontend with no-cache headers
	webFS, err := fs.Sub(embeddedFS, "web")
	if err != nil {
		log.Fatal("Failed to load embedded web files:", err)
	}
	
	// Wrap file server with cache-control headers
	fileServer := http.FileServer(http.FS(webFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Prevent caching to avoid stale WebSocket connection issues
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fileServer.ServeHTTP(w, r)
	})

	// WebSocket terminal handler
	termHandler := terminal.NewHandler()
	http.HandleFunc("/ws", termHandler.HandleWebSocket)

	// Commands API
	http.HandleFunc("/api/commands", handleCommands)

	// Find an available port
	addr, listener, err := findAvailablePort()
	if err != nil {
		log.Fatalf("Failed to find available port: %v", err)
	}

	log.Printf("🔥 Forge Terminal starting at http://%s", addr)

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		log.Println("\n👋 Shutting down Forge...")
		os.Exit(0)
	}()

	// Auto-open browser
	go openBrowser("http://" + addr)

	log.Fatal(http.Serve(listener, nil))
}

func handleCommands(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		cmds, err := commands.LoadCommands()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(cmds)

	case http.MethodPost:
		var cmds []commands.Command
		if err := json.NewDecoder(r.Body).Decode(&cmds); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := commands.SaveCommands(cmds); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	if cmd != nil {
		_ = cmd.Start()
	}
}

// findAvailablePort tries preferred ports in order and returns the first available one
func findAvailablePort() (string, net.Listener, error) {
	for _, port := range preferredPorts {
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return addr, listener, nil
		}
		log.Printf("Port %d unavailable, trying next...", port)
	}

	// Fallback: let OS assign a random available port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, fmt.Errorf("no available ports: %w", err)
	}
	addr := listener.Addr().String()
	log.Printf("Using OS-assigned port: %s", addr)
	return addr, listener, nil
}
