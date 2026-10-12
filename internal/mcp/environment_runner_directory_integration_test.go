// environment_runner_directory_integration_test.go - a real child process starts in the requested directory.
//
// Integration, not unit: it spawns the host shell, because the defect (cmd.Dir
// never set) is invisible to a mocked runner.
package mcp

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// childProcessTimeout bounds the spawned shell so a hung process cannot stall the suite.
const childProcessTimeout = 10 * time.Second

func TestRealNativeCommandStartsInTheRequestedDirectory(t *testing.T) {
	requestedDirectory := t.TempDir()
	runContext, cancelRun := context.WithTimeout(context.Background(), childProcessTimeout)
	defer cancelRun()

	result, runErr := runInEnvironment(runContext, &realCommandRunner{}, RunOptions{
		Command:          printWorkingDirectoryCommand(),
		Environment:      StrategyNative,
		WorkingDirectory: requestedDirectory,
	})
	if runErr != nil {
		t.Fatalf("run failed: %v", runErr)
	}

	reportedDirectory := filepath.Clean(strings.TrimSpace(result.Stdout))
	resolvedRequested, _ := filepath.EvalSymlinks(requestedDirectory)
	resolvedReported, _ := filepath.EvalSymlinks(reportedDirectory)
	if !strings.EqualFold(resolvedReported, resolvedRequested) {
		t.Fatalf("child process started in %q, want %q", reportedDirectory, requestedDirectory)
	}
}
