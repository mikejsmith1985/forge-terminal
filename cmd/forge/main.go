package main

import (
"embed"
"io/fs"
"log"
"net/http"
"os"
"os/exec"
"os/signal"
"runtime"
"syscall"
)

//go:embed web/*
var embeddedFS embed.FS

func main() {
// Serve embedded frontend
webFS, err := fs.Sub(embeddedFS, "web")
if err != nil {
log.Fatal("Failed to load embedded web files:", err)
}
http.Handle("/", http.FileServer(http.FS(webFS)))

// TODO: Add WebSocket handler at /ws (Issue #2)
// http.HandleFunc("/ws", terminal.HandleWebSocket)

// TODO: Add commands API (Issue #3)
// http.HandleFunc("/api/commands", handleCommands)

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
