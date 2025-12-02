package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
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

func main() {
	// Serve embedded frontend
	webFS, err := fs.Sub(embeddedFS, "web")
	if err != nil {
		log.Fatal("Failed to load embedded web files:", err)
	}
	http.Handle("/", http.FileServer(http.FS(webFS)))

	// WebSocket terminal handler
	termHandler := terminal.NewHandler()
	http.HandleFunc("/ws", termHandler.HandleWebSocket)

	// Commands API
	http.HandleFunc("/api/commands", handleCommands)

	addr := "127.0.0.1:3333"
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

	log.Fatal(http.ListenAndServe(addr, nil))
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
