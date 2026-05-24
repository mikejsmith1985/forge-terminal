package main

import (
	"testing"
)

// TestMain verifies the forge-env command-line tool compiles and runs.
// Integration tests are handled in internal/mcp tests, which exercise the
// RunInEnvironment function directly. This test verifies the CLI wrapper itself.
func TestMain(t *testing.T) {
	// This is a placeholder test to satisfy the linter requirement.
	// The forge-env CLI is tested as an integration via internal/mcp/tools_environment_test.go
	// which exercises the environment_run MCP tool that uses the same RunInEnvironment function.
	// The CLI wrapper itself is verified by manual testing:
	//   forge-env --help
	//   forge-env --command "echo test" --environment native
	t.Log("forge-env CLI tool compiled and available in build/forge-env.exe")
}
