// envvarname_test.go — unit tests for shell-safe variable name handling.
//
// The regression these guard: a vault entry named RESEND-API-KEY produced
// "$env:RESEND-API-KEY = 're_...'", which PowerShell cannot parse. PowerShell
// echoes the failing line in its parser error, so a bad name printed the secret
// to the terminal. Every test here asserts a name is rendered in a form the
// shell can parse, or is not paired with a value at all.
package vault

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

// hyphenatedEntryName is the real-world name that triggered the bug: a vault
// entry mirroring the label shown on the provider's dashboard.
const hyphenatedEntryName = "RESEND-API-KEY"

// TestBuildInjectionScriptNeverEmitsUnparsableAssignment is the core regression
// test: a hyphenated entry name must never be paired with its value in syntax
// the target shell rejects, because the rejection prints the value.
func TestBuildInjectionScriptNeverEmitsUnparsableAssignment(t *testing.T) {
	const secretValue = "re_test_value_do_not_log"

	scriptPath, buildErr := BuildInjectionScript(map[string]string{hyphenatedEntryName: secretValue})
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	scriptBytes, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("reading injection script: %v", readErr)
	}
	scriptContent := string(scriptBytes)

	if runtime.GOOS == "windows" {
		// The bare $env:NAME shorthand stops at the first hyphen and fails to parse.
		if strings.Contains(scriptContent, "$env:"+hyphenatedEntryName) {
			t.Errorf("script uses the unbraced $env: shorthand, which PowerShell cannot parse:\n%s", scriptContent)
		}
		if !strings.Contains(scriptContent, "${env:"+hyphenatedEntryName+"}") {
			t.Errorf("script must reference the name in the braced ${env:NAME} form:\n%s", scriptContent)
		}
		return
	}

	// No POSIX shell can export a non-identifier name, so the literal pairing
	// must be absent entirely.
	if strings.Contains(scriptContent, "export "+hyphenatedEntryName+"=") {
		t.Errorf("script exports a non-identifier name, which every POSIX shell rejects:\n%s", scriptContent)
	}
}

// TestIsPosixEnvVarName covers the identifier rule the POSIX export builtin enforces.
func TestIsPosixEnvVarName(t *testing.T) {
	testCases := []struct {
		candidateName string
		isValid       bool
	}{
		{"RESEND_API_KEY", true},
		{"_LEADING_UNDERSCORE", true},
		{"MIXED_case_123", true},
		{"RESEND-API-KEY", false},
		{"HAS SPACE", false},
		{"HAS.DOT", false},
		{"1LEADING_DIGIT", false},
		{"", false},
	}

	for _, testCase := range testCases {
		if got := IsPosixEnvVarName(testCase.candidateName); got != testCase.isValid {
			t.Errorf("IsPosixEnvVarName(%q) = %v, want %v", testCase.candidateName, got, testCase.isValid)
		}
	}
}

// TestNormalizeEnvVarName verifies the suggested underscore form matches what the
// vault UI derives, so the fallback name is never a surprise to the user.
func TestNormalizeEnvVarName(t *testing.T) {
	testCases := []struct {
		rawName        string
		normalizedName string
	}{
		{"RESEND-API-KEY", "RESEND_API_KEY"},
		{"smithbros-claude-api-key", "SMITHBROS_CLAUDE_API_KEY"},
		{"DBAI-TestBot", "DBAI_TESTBOT"},
		{"My Secret  Name", "MY_SECRET_NAME"},
		{"1Password Token", "_1PASSWORD_TOKEN"},
		{"ALREADY_FINE", "ALREADY_FINE"},
		{"---", ""},
		{"", ""},
	}

	for _, testCase := range testCases {
		got := NormalizeEnvVarName(testCase.rawName)
		if got != testCase.normalizedName {
			t.Errorf("NormalizeEnvVarName(%q) = %q, want %q", testCase.rawName, got, testCase.normalizedName)
		}
		if got != "" && !IsPosixEnvVarName(got) {
			t.Errorf("NormalizeEnvVarName(%q) produced %q, which is still not a valid POSIX name", testCase.rawName, got)
		}
	}
}

// TestPosixBodyExportsDerivedNameForInvalidEntry verifies the POSIX branch on any
// host OS: a hyphenated entry is exported under its underscore form, with a
// warning that names both forms and never the value.
func TestPosixBodyExportsDerivedNameForInvalidEntry(t *testing.T) {
	const secretValue = "re_test_value_do_not_log"

	scriptBody := buildPosixShellScriptBody(map[string]string{hyphenatedEntryName: secretValue})

	if strings.Contains(scriptBody, "export "+hyphenatedEntryName+"=") {
		t.Errorf("POSIX body exports a name no shell accepts:\n%s", scriptBody)
	}
	if !strings.Contains(scriptBody, "export RESEND_API_KEY='"+secretValue+"'") {
		t.Errorf("POSIX body must export the derived underscore name:\n%s", scriptBody)
	}
	warningLine := firstLineContaining(scriptBody, "printf")
	if !strings.Contains(warningLine, hyphenatedEntryName) || !strings.Contains(warningLine, "RESEND_API_KEY") {
		t.Errorf("warning must name both the entry and the variable it became, got: %s", warningLine)
	}
	if strings.Contains(warningLine, secretValue) {
		t.Error("warning line leaks the secret value")
	}
}

// TestPosixBodyLeavesValidNamesUntouched guards against the fix changing the
// behaviour of the ordinary, already-correct case.
func TestPosixBodyLeavesValidNamesUntouched(t *testing.T) {
	scriptBody := buildPosixShellScriptBody(map[string]string{"RESEND_API_KEY": "plain_value"})

	if !strings.Contains(scriptBody, "export RESEND_API_KEY='plain_value'") {
		t.Errorf("a valid name must be exported verbatim:\n%s", scriptBody)
	}
	if strings.Contains(scriptBody, "printf") {
		t.Errorf("a valid name must not produce a warning:\n%s", scriptBody)
	}
}

// TestPosixBodySkipsCollidingDerivedName verifies that deriving a fallback name
// never clobbers a different entry that already owns that exact name.
func TestPosixBodySkipsCollidingDerivedName(t *testing.T) {
	scriptBody := buildPosixShellScriptBody(map[string]string{
		"RESEND_API_KEY":    "the_real_one",
		hyphenatedEntryName: "the_colliding_one",
	})

	if !strings.Contains(scriptBody, "export RESEND_API_KEY='the_real_one'") {
		t.Errorf("the entry that legitimately owns the name must survive:\n%s", scriptBody)
	}
	if strings.Contains(scriptBody, "the_colliding_one") {
		t.Errorf("the colliding entry must be skipped, not silently overwrite the other:\n%s", scriptBody)
	}
	if !strings.Contains(scriptBody, "collide") {
		t.Errorf("the collision must be reported to the user:\n%s", scriptBody)
	}
}

// TestPosixBodySkipsUnusableName covers an entry name with nothing salvageable:
// it must be reported and omitted, never paired with its value.
func TestPosixBodySkipsUnusableName(t *testing.T) {
	scriptBody := buildPosixShellScriptBody(map[string]string{"---": "unreachable_value"})

	if strings.Contains(scriptBody, "unreachable_value") {
		t.Errorf("an undeliverable entry must not have its value written anywhere:\n%s", scriptBody)
	}
	if !strings.Contains(scriptBody, "skipped") {
		t.Errorf("an undeliverable entry must be reported:\n%s", scriptBody)
	}
}

// TestPowerShellBodyEscapesBraceAndBacktickInName verifies that a name carrying
// PowerShell's own metacharacters cannot break out of the ${env:...} reference.
func TestPowerShellBodyEscapesBraceAndBacktickInName(t *testing.T) {
	scriptBody := buildPowerShellScriptBody(map[string]string{"WEIRD}NAME`X": "value"})

	if !strings.Contains(scriptBody, "${env:WEIRD`}NAME``X}") {
		t.Errorf("brace and backtick in a name must be backtick-escaped:\n%s", scriptBody)
	}
}

// firstLineContaining returns the first line of text holding the given marker,
// or an empty string when no line matches.
func firstLineContaining(text string, marker string) string {
	for _, line := range strings.Split(text, "\n") {
		if strings.Contains(line, marker) {
			return line
		}
	}
	return ""
}
