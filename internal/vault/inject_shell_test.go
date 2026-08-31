// inject_shell_test.go — integration tests that source a generated injection
// script in a real shell.
//
// Unit tests can only assert the shape of the generated text. The bug this
// guards against was a *parse* failure, so the only honest proof is handing the
// script to the shell that rejected it and checking two things: the variable
// actually arrives, and the secret never appears in the shell's output.
package vault

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// shellProbeSecret is a recognisable value: if the shell ever echoes a failing
// line, this string shows up in the captured output and fails the test.
const shellProbeSecret = "re_shell_probe_value_9f2c"

// TestPowerShellSourcesHyphenatedNameWithoutLeaking sources a real generated
// script in pwsh and proves the hyphenated variable is readable afterwards.
func TestPowerShellSourcesHyphenatedNameWithoutLeaking(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: spawns a real shell")
	}
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell injection path only runs on Windows")
	}
	powerShellPath := findExecutable("pwsh", "powershell")
	if powerShellPath == "" {
		t.Skip("no PowerShell interpreter on PATH")
	}

	scriptPath := buildScriptForShellProbe(t, hyphenatedEntryName)
	defer os.Remove(scriptPath)

	// Read the value back through the braced form and mark it, so a successful
	// read is distinguishable from the shell merely echoing the assignment line.
	readBackCommand := "& { . '" + scriptPath + "'; 'READBACK=' + ${env:" + hyphenatedEntryName + "} }"
	shellOutput := runShell(t, powerShellPath, "-NonInteractive", "-Command", readBackCommand)

	assertNoParserLeak(t, shellOutput, "READBACK="+shellProbeSecret)
}

// TestPosixShellSourcesDerivedNameWithoutLeaking sources a real POSIX script and
// proves the derived underscore variable arrives while the original name's value
// is never echoed by a rejected export.
func TestPosixShellSourcesDerivedNameWithoutLeaking(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: spawns a real shell")
	}
	shellPath := findExecutable("sh", "bash")
	if shellPath == "" {
		t.Skip("no POSIX shell on PATH")
	}

	scriptPath := writeTempShellScript(t, buildPosixShellScriptBody(
		map[string]string{hyphenatedEntryName: shellProbeSecret}))
	defer os.Remove(scriptPath)

	readBackCommand := ". '" + scriptPath + "'; echo \"READBACK=$RESEND_API_KEY\""
	shellOutput := runShell(t, shellPath, "-c", readBackCommand)

	assertNoParserLeak(t, shellOutput, "READBACK="+shellProbeSecret)
}

// buildScriptForShellProbe generates a real injection script for one entry name
// carrying the probe secret, failing the test if generation errors.
func buildScriptForShellProbe(t *testing.T, entryName string) string {
	t.Helper()

	scriptPath, buildErr := BuildInjectionScript(map[string]string{entryName: shellProbeSecret})
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	return scriptPath
}

// writeTempShellScript saves script text to a temp .sh file for sourcing.
func writeTempShellScript(t *testing.T, scriptBody string) string {
	t.Helper()

	scriptFile, createErr := os.CreateTemp(t.TempDir(), "forge-vault-probe-*.sh")
	if createErr != nil {
		t.Fatalf("creating probe script: %v", createErr)
	}
	if _, writeErr := scriptFile.WriteString(scriptBody); writeErr != nil {
		t.Fatalf("writing probe script: %v", writeErr)
	}
	scriptFile.Close()
	return scriptFile.Name()
}

// runShell executes a shell and returns its combined stdout+stderr, which is
// where a parser error would print the offending line.
func runShell(t *testing.T, shellPath string, shellArgs ...string) string {
	t.Helper()

	combinedOutput, _ := exec.Command(shellPath, shellArgs...).CombinedOutput()
	return string(combinedOutput)
}

// assertNoParserLeak checks that the shell produced the expected read-back and
// that the secret appears only there — never in a parser or export error.
func assertNoParserLeak(t *testing.T, shellOutput string, expectedReadBack string) {
	t.Helper()

	if !strings.Contains(shellOutput, expectedReadBack) {
		t.Fatalf("variable did not reach the shell; output was:\n%s", shellOutput)
	}
	// Exactly one occurrence: the deliberate read-back. A second one means the
	// shell echoed a failing assignment line, which is the leak we are preventing.
	if strings.Count(shellOutput, shellProbeSecret) != 1 {
		t.Errorf("secret appears more than once — a failing line was echoed:\n%s", shellOutput)
	}
	for _, errorMarker := range []string{"ParserError", "not a valid identifier", "Unexpected token"} {
		if strings.Contains(shellOutput, errorMarker) {
			t.Errorf("shell reported %q while sourcing the script:\n%s", errorMarker, shellOutput)
		}
	}
}

// findExecutable returns the path of the first named program found on PATH.
func findExecutable(programNames ...string) string {
	for _, programName := range programNames {
		if resolvedPath, lookErr := exec.LookPath(programName); lookErr == nil {
			return resolvedPath
		}
	}
	return ""
}
