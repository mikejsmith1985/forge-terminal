// runner_test.go verifies the real release runner contract with safe argument slices.
package releasejobs

import (
	"context"
	"runtime"
	"strings"
	"testing"
)

func TestRealReleaseProcessRunner_RunReleaseCommandReturnsCapturedOutput(t *testing.T) {
	runner := &realReleaseProcessRunner{}
	executable, arguments := createEchoCommand("release-output")

	output, runErr := runner.RunReleaseCommand(context.Background(), executable, arguments, t.TempDir())
	if runErr != nil {
		t.Fatalf("RunReleaseCommand returned error: %v", runErr)
	}
	if !strings.Contains(output.Stdout, "release-output") {
		t.Fatalf("stdout = %q, want release-output", output.Stdout)
	}
	if output.ExitCode != 0 {
		t.Fatalf("exit code = %d, want 0", output.ExitCode)
	}
}

func createEchoCommand(message string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd.exe", []string{"/c", "echo " + message}
	}
	return "sh", []string{"-c", "echo " + message}
}
