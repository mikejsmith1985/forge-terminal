// runner.go executes release processes while hiding child console windows on Windows.
package releasejobs

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

type realReleaseProcessRunner struct{}

// RunReleaseCommand starts PowerShell with an argument slice so user-provided
// release notes never become shell syntax.
func (runner *realReleaseProcessRunner) RunReleaseCommand(ctx context.Context, executable string, arguments []string, workingDirectory string) (ProcessOutput, error) {
	command := exec.CommandContext(ctx, executable, arguments...)
	suppressReleaseConsoleWindow(command)
	command.Dir = workingDirectory

	var stdoutBuffer, stderrBuffer bytes.Buffer
	command.Stdout = &stdoutBuffer
	command.Stderr = &stderrBuffer

	runErr := command.Run()
	output := ProcessOutput{
		Stdout: stdoutBuffer.String(),
		Stderr: stderrBuffer.String(),
	}
	if runErr != nil {
		if exitErr, isExitError := runErr.(*exec.ExitError); isExitError {
			output.ExitCode = exitErr.ExitCode()
			return output, nil
		}
		return output, fmt.Errorf("could not execute release command: %w", runErr)
	}
	return output, nil
}
