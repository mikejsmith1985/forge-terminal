package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/creack/pty"
)

func main() {
	// Start PowerShell
	c := exec.Command("powershell.exe", "-NoLogo", "-NoProfile")
	ptmx, err := pty.Start(c)
	if err != nil {
		panic(err)
	}
	defer ptmx.Close()

	// Copy output to stdout
	go func() {
		io.Copy(os.Stdout, ptmx)
	}()

	// Wait for prompt
	time.Sleep(2 * time.Second)

	// Type "echo hello" (simulating user typing)
	fmt.Println("\n--- Typing 'echo hello' ---")
	ptmx.Write([]byte("echo hello"))
	time.Sleep(500 * time.Millisecond)

	// Now simulate the injection: " WORLD" + Enter
	fmt.Println("\n--- Injecting ' WORLD\\r' ---")
	
	// METHOD 1: Atomic Write (Current)
	ptmx.Write([]byte(" WORLD\r"))

	// Wait to see if it executes
	time.Sleep(2 * time.Second)
	
	fmt.Println("\n--- Done ---")
}
