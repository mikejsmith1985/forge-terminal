package main

import (
	"fmt"
	"log"

	"github.com/mikejsmith1985/forge-terminal/internal/assistant/parsers"
	"github.com/mikejsmith1985/forge-terminal/internal/assistant/types"
)

// This script simulates the "User Perspective" by taking raw log lines
// (as if they came from the CLI process) and printing the structured events
// that the UI would receive.

func main() {
	fmt.Println("=== Forge Assistant Parser Verification ===")
	fmt.Println("Simulating Claude Code Output Stream...")

	claudeLines := []string{
		`{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"I need to check the file system."}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Looking for main.go"}}`,
		`{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_123","name":"ls","input":{"path":"."}}}`,
		`{"type":"content_block_delta","index":2,"delta":{"type":"text_delta","text":"I found the file."}}`,
		`{"type":"message_stop"}`,
	}

	parser := parsers.NewClaudeParser()

	fmt.Println("\n[UI Stream Events]")
	for _, line := range claudeLines {
		event, err := parser.ParseLine(line)
		if err != nil {
			log.Printf("Error parsing line: %v", err)
			continue
		}
		if event != nil {
			printEvent(event)
		}
	}

	fmt.Println("\n=== Verification Complete ===")
}

func printEvent(event *types.StreamEvent) {
	fmt.Printf("EVENT: Type=%-10s Content=%-20q Meta=%v\n", event.Type, event.Content, event.Meta)
}

