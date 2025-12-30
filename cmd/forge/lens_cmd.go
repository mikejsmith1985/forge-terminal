package main

import (
	"fmt"

	"github.com/mikejsmith1985/forge-terminal/internal/lens"
)

// runLensCommand runs the Context Builder file picker TUI.
func runLensCommand(args []string) error {
	rootPath := "."
	if len(args) > 0 {
		rootPath = args[0]
	}

	files, err := lens.RunTUI(rootPath)
	if err != nil {
		return fmt.Errorf("lens TUI error: %w", err)
	}

	if len(files) > 0 {
		fmt.Printf("\n✅ Selected %d files:\n", len(files))
		totalTokens := 0
		for _, f := range files {
			fmt.Printf("  • %s (%d tokens)\n", f.Path, f.TokenCount)
			totalTokens += f.TokenCount
		}
		fmt.Printf("\n📊 Total: %d tokens\n", totalTokens)
	}

	return nil
}

// Add to main.go's command dispatch
func init() {
	// Register the lens command
	// This will be integrated into the main command dispatch
}
