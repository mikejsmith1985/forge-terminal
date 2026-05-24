// Command: forge-env
// 
// A standalone CLI tool that wraps Forge Terminal's environment detection
// and execution logic. Agents can call it from any terminal to run builds
// in the appropriate Linux environment (WSL2, Docker, or native).
//
// Usage:
//   forge-env --command "npm run build" --environment auto --cwd /path/to/project --timeout 300
//
// Output (JSON):
//   {
//     "exit_code": 0,
//     "stdout": "...",
//     "stderr": "",
//     "environment_used": "linux-wsl",
//     "duration_seconds": 45.23
//   }
//
// This tool is intentionally standalone — it does NOT require Forge Terminal
// to be running. It uses the same environment detection and execution logic
// as the MCP server, but exposed as a command-line tool.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

func main() {
	// Parse command-line flags
	command := flag.String("command", "", "Shell command to execute (required)")
	environment := flag.String("environment", "auto", "Execution environment: auto, native, linux-wsl, linux-docker")
	cwd := flag.String("cwd", "", "Working directory for command (defaults to current directory)")
	image := flag.String("image", "node:lts", "Docker image to use when environment is linux-docker")
	timeout := flag.Int("timeout", 120, "Timeout in seconds (1-600)")
	help := flag.Bool("help", false, "Show help message")

	flag.Parse()

	if *help {
		printHelp()
		os.Exit(0)
	}

	// Validate required arguments
	if *command == "" {
		fmt.Fprintf(os.Stderr, "Error: --command is required\n")
		fmt.Fprintf(os.Stderr, "Use --help for usage information\n")
		os.Exit(1)
	}

	// Use current directory if cwd not specified
	if *cwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: unable to get current directory: %v\n", err)
			os.Exit(1)
		}
		*cwd = wd
	}

	// Clamp timeout to valid range
	if *timeout < 1 {
		*timeout = 1
	} else if *timeout > 600 {
		*timeout = 600
	}

	// Create the real command runner (uses platform-specific execution)
	runner := &mcp.RealCommandRunner{}

	// Build run options
	runOpts := mcp.RunOptions{
		Command:          *command,
		Environment:      *environment,
		WorkingDirectory: *cwd,
		DockerImage:      *image,
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*timeout)*time.Second)
	defer cancel()

	// Execute the command with timeout
	startTime := time.Now()
	result, runErr := mcp.RunInEnvironment(ctx, runner, runOpts)
	elapsed := time.Since(startTime).Seconds()

	// Build response
	response := map[string]interface{}{
		"exit_code":        result.ExitCode,
		"stdout":           result.Stdout,
		"stderr":           result.Stderr,
		"environment_used": result.EnvironmentUsed,
		"duration_seconds": elapsed,
	}

	// Handle errors
	if runErr != nil {
		response["error"] = runErr.Error()
		outputJSON(response)
		os.Exit(1)
	}

	// Output result as JSON
	outputJSON(response)

	// Exit with the command's exit code
	os.Exit(result.ExitCode)
}

// outputJSON writes the result as JSON to stdout
func outputJSON(data interface{}) {
	output, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error serializing result: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(output))
}

func printHelp() {
	fmt.Fprintf(os.Stderr, `forge-env — Run commands in the best available Linux environment

USAGE:
  forge-env [options]

OPTIONS:
  --command STRING        Shell command to execute (required)
                         Example: "npm install && npm run build"

  --environment STRING    Execution environment (default: auto)
                         Values: auto, native, linux-wsl, linux-docker
                         - auto: Use WSL2 if available, else Docker, else native
                         - native: Run on current OS (Windows/macOS/Linux)
                         - linux-wsl: Force execution in WSL2
                         - linux-docker: Force execution in Docker

  --cwd PATH              Working directory for command (default: current dir)
                         Example: "/mnt/c/ProjectsWin/my-site/website"

  --image STRING          Docker image when environment=linux-docker (default: node:lts)
                         Example: "node:lts", "ubuntu:latest"

  --timeout SECONDS       Timeout in seconds (1-600, default: 120)
                         Use higher values for large builds (e.g., 480 for npm install)

  --help                  Show this help message

EXAMPLES:

  # Run a build in the best available environment
  forge-env --command "npm install && npm run build" --environment auto

  # Run in WSL2 specifically
  forge-env --command "npm run build" --environment linux-wsl --cwd "/path/to/project"

  # Force Docker execution with custom image
  forge-env --command "cargo build --release" \
    --environment linux-docker \
    --image rust:latest \
    --timeout 300

  # Run on native OS
  forge-env --command "go build ./cmd/..." --environment native

EXIT CODE:
  0       Command succeeded
  1       Tool error (invalid arguments, timeout, unreachable environment)
  Other   Exit code from the command itself

OUTPUT (JSON):
  {
    "exit_code": 0,
    "stdout": "build output...",
    "stderr": "",
    "environment_used": "linux-wsl",
    "duration_seconds": 45.23
  }

REQUIREMENTS:

  For --environment=auto or linux-wsl:
    - Windows 10/11 with WSL2 installed and enabled
    - Or macOS/Linux with WSL2 available

  For --environment=linux-docker:
    - Docker installed and running

  For --environment=native:
    - No special requirements
    - Build tool must handle current OS path format

INTEGRATION WITH AGENTS:

  From PowerShell:
    $result = forge-env --command "npm run build" | ConvertFrom-Json
    if ($result.exit_code -eq 0) { Write-Host "Build succeeded" }

  From bash:
    result=$(forge-env --command "npm run build")
    exit_code=$(echo $result | jq .exit_code)

SEE ALSO:
  https://github.com/mikejsmith1985/forge-terminal
`)
}
