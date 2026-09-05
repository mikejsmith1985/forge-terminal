// templates_testgate_test.go — guards the scaffolded pre-commit "test file gate"
// against the documented bug where only Go and JS/TS test conventions were
// understood. A C#, Java, Python, or Rust source file could NEVER satisfy the
// gate (it computed a JS-style "Foo.test.cs" expected name), so every commit in
// those repos was false-flagged and forced `git commit --no-verify`.
package workflow

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// preCommitRenderers runs each assertion against both rendered hook variants.
var preCommitRenderers = map[string]func(WorkflowConfig) (string, error){
	"pre-commit.ps1": RenderPreCommitPS1,
	"pre-commit.sh":  RenderPreCommitSH,
}

// TestPreCommitGate_RecognizesNonJSTestConventions asserts the rendered hooks
// know the test-file naming conventions of every language they treat as source,
// not just Go and JS/TS.
func TestPreCommitGate_RecognizesNonJSTestConventions(t *testing.T) {
	for name, render := range preCommitRenderers {
		script, err := render(DefaultConfig())
		if err != nil {
			t.Fatalf("%s: render failed: %v", name, err)
		}
		// C# tests are <Name>Tests.cs / <Name>Test.cs — never <Name>.test.cs.
		if !strings.Contains(script, "Tests.cs") {
			t.Errorf("%s: gate does not recognize the C# *Tests.cs convention", name)
		}
		// Python's dominant convention is the test_ prefix.
		if !strings.Contains(script, "test_") {
			t.Errorf("%s: gate does not recognize the Python test_ prefix convention", name)
		}
		// Java tests are <Name>Test.java.
		if !strings.Contains(script, "Test.java") {
			t.Errorf("%s: gate does not recognize the Java *Test.java convention", name)
		}
		// Rust unit tests are frequently inline via #[cfg(test)].
		if !strings.Contains(script, "cfg(test)") {
			t.Errorf("%s: gate does not honor Rust inline #[cfg(test)] tests", name)
		}
	}
}

// TestPreCommitGate_BashBehaviour_CSharp executes the real rendered Bash hook in
// a throwaway git repo and proves the behaviour end-to-end: a lone C# source
// file is flagged, and adding the conventional <Name>Tests.cs satisfies the gate.
func TestPreCommitGate_BashBehaviour_CSharp(t *testing.T) {
	bash, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available — skipping behavioural hook test")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available — skipping behavioural hook test")
	}

	script, err := RenderPreCommitSH(DefaultConfig())
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}

	dir := t.TempDir()
	hookPath := filepath.Join(dir, "pre-commit")
	if err := os.WriteFile(hookPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write hook: %v", err)
	}

	gitInit(t, dir)

	// Case A — a lone C# source file must be flagged for a missing test.
	writeFile(t, dir, "Calculator.cs", "namespace App; public class Calculator {}")
	gitRun(t, dir, "add", "Calculator.cs")
	out := runHook(t, bash, hookPath, dir)
	if !strings.Contains(out, "TEST FILE") || !strings.Contains(out, "Calculator.cs") {
		t.Fatalf("expected a TEST FILE violation for a lone Calculator.cs, got:\n%s", out)
	}

	// Case B — adding the conventional CalculatorTests.cs must satisfy the gate.
	writeFile(t, dir, "CalculatorTests.cs", "namespace App.Tests; public class CalculatorTests {}")
	gitRun(t, dir, "add", "CalculatorTests.cs")
	out = runHook(t, bash, hookPath, dir)
	if strings.Contains(out, "TEST FILE: New source file 'Calculator.cs'") {
		t.Fatalf("CalculatorTests.cs should satisfy the gate for Calculator.cs, got:\n%s", out)
	}
}

// ── test helpers ─────────────────────────────────────────────────────────────

func gitInit(t *testing.T, dir string) {
	t.Helper()
	gitRun(t, dir, "init", "-q")
	gitRun(t, dir, "config", "user.email", "test@example.com")
	gitRun(t, dir, "config", "user.name", "test")
	gitRun(t, dir, "checkout", "-q", "-b", "feature/test-gate")
}

func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
}

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func runHook(t *testing.T, bash, hookPath, dir string) string {
	t.Helper()
	cmd := exec.Command(bash, hookPath)
	cmd.Dir = dir
	// These tests exercise the scaffold's own gates. Blank FORGE_BIN so the
	// runtime ledger gate at the top of the hook stands down: inside a Forge
	// tab it would otherwise run a real preflight against this temp repo.
	cmd.Env = append(os.Environ(), "FORGE_BIN=")
	out, _ := cmd.CombinedOutput() // non-zero exit is expected when violations exist
	return string(out)
}
