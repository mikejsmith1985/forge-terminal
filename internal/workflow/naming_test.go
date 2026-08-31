// Package workflow — naming_test.go: the rules that make code read like English.
//
// The failure this prevents is subtle. `n` is not wrong, it is *unreadable*: a
// person looking at it learns nothing about what they would see on screen if
// that value were shown. Names that carry no domain meaning are why reading
// code fails to build understanding even when the reader is trying.
//
// The checker stops at mechanical rules on purpose. A name can satisfy every
// rule here and still mean nothing, and no checker can judge that — which is
// why the brief carries the meaningless-but-legal case to a human instead.
package workflow

import (
	"strings"
	"testing"
)

func TestSingleLetterNamesAreRejected(t *testing.T) {
	source := `package demo

func countMatches() int {
	n := 0
	return n
}
`
	findings := CheckNaming("demo.go", source)

	if len(findings) == 0 {
		t.Fatal("a single-letter name should be reported: it tells the reader nothing")
	}
	if !strings.Contains(findings[0].Identifier, "n") {
		t.Errorf("the finding should name the identifier, got: %+v", findings[0])
	}
	if findings[0].Line == 0 {
		t.Error("the finding should carry a line number so it can be found")
	}
}

func TestLoopIteratorsArePermitted(t *testing.T) {
	// i, j and k as loop counters are so conventional that renaming them makes
	// code harder to read, not easier. The rule exists to serve readability,
	// not to be applied against it.
	source := `package demo

func sumAll(values []int) int {
	total := 0
	for i := 0; i < len(values); i++ {
		total += values[i]
	}
	return total
}
`
	if findings := CheckNaming("demo.go", source); len(findings) != 0 {
		t.Errorf("a loop iterator should be permitted, got: %+v", findings)
	}
}

func TestHTTPHandlerParametersArePermitted(t *testing.T) {
	source := `package demo

import "net/http"

func handleThing(w http.ResponseWriter, r *http.Request) {
	_ = w
	_ = r
}
`
	if findings := CheckNaming("demo.go", source); len(findings) != 0 {
		t.Errorf("w and r in a handler should be permitted, got: %+v", findings)
	}
}

func TestUnprefixedBooleansAreRejected(t *testing.T) {
	source := `package demo

func check() {
	ready := true
	_ = ready
}
`
	findings := CheckNaming("demo.go", source)

	if len(findings) == 0 {
		t.Fatal("a boolean without is/has/can/should/was should be reported")
	}
	if findings[0].Rule != RuleBooleanPrefix {
		t.Errorf("want the boolean-prefix rule, got: %s", findings[0].Rule)
	}
}

func TestPrefixedBooleansArePermitted(t *testing.T) {
	source := `package demo

func check() {
	isReady := true
	hasResults := false
	canRetry := true
	shouldStop := false
	wasFound := true
	_, _, _, _, _ = isReady, hasResults, canRetry, shouldStop, wasFound
}
`
	if findings := CheckNaming("demo.go", source); len(findings) != 0 {
		t.Errorf("prefixed booleans should be permitted, got: %+v", findings)
	}
}

func TestFunctionsMustBeVerbFirst(t *testing.T) {
	source := `package demo

func userValidation() bool {
	return true
}
`
	findings := CheckNaming("demo.go", source)

	if len(findings) == 0 {
		t.Fatal("a function that is not verb-first should be reported")
	}
	if findings[0].Rule != RuleVerbFirstFunction {
		t.Errorf("want the verb-first rule, got: %s", findings[0].Rule)
	}
}

func TestVerbFirstFunctionsArePermitted(t *testing.T) {
	source := `package demo

func createSession() {}
func validateToken() {}
func handleRequest() {}
func buildReport() {}
`
	if findings := CheckNaming("demo.go", source); len(findings) != 0 {
		t.Errorf("verb-first functions should be permitted, got: %+v", findings)
	}
}

func TestOnlyGoFilesAreChecked(t *testing.T) {
	// The rules are expressed against Go syntax. Applying them to other
	// languages would produce findings the developer cannot act on, and a
	// checker that cries wolf is a checker that gets bypassed.
	source := "const n = 1;"

	if findings := CheckNaming("script.js", source); len(findings) != 0 {
		t.Errorf("a non-Go file should not be checked, got: %+v", findings)
	}
}

func TestUnparseableSourceReportsNothing(t *testing.T) {
	// Half-written code is the normal state during editing. Refusing to parse
	// it must not be reported as a naming violation, which would be blaming the
	// developer for the wrong thing.
	if findings := CheckNaming("demo.go", "package demo\nfunc broken( {"); len(findings) != 0 {
		t.Errorf("unparseable source should report nothing, got: %+v", findings)
	}
}

func TestFindingsCarryEnoughToActOn(t *testing.T) {
	source := `package demo

func countThings() int {
	n := 0
	return n
}
`
	findings := CheckNaming("internal/demo/counter.go", source)

	if len(findings) == 0 {
		t.Fatal("expected a finding")
	}
	finding := findings[0]

	if finding.Path != "internal/demo/counter.go" {
		t.Errorf("the finding should name the file, got %q", finding.Path)
	}
	if finding.Suggestion == "" {
		t.Error("the finding should say what to do instead, not merely that something is wrong")
	}
}

func TestOnlyMechanicallyCertainRulesBlockACommit(t *testing.T) {
	// Verb-first is recognised from a list of verbs, and a list of verbs is
	// never complete. Run against this repository, the first version rejected
	// Archive, Search, Subscribe, Migrate, Infer and Heal — four hundred
	// findings, almost all of them good names. Blocking on that would teach the
	// developer to reach for the bypass, after which nothing is enforced.
	if !RuleSingleLetter.IsBlocking() {
		t.Error("a single-letter name is decidable and should block")
	}
	if !RuleBooleanPrefix.IsBlocking() {
		t.Error("a missing boolean prefix is decidable and should block")
	}
	if RuleVerbFirstFunction.IsBlocking() {
		t.Error("verb-first cannot be decided from a word list and must not block")
	}
}

func TestBlockingFindingsDropsTheAdvisoryOnes(t *testing.T) {
	source := `package demo

func userValidation() bool {
	n := 0
	_ = n
	return true
}
`
	all := CheckNaming("demo.go", source)
	blocking := BlockingFindings(all)

	if len(all) <= len(blocking) {
		t.Fatalf("the advisory verb-first finding should still be reported: all=%d blocking=%d", len(all), len(blocking))
	}
	for _, finding := range blocking {
		if finding.Rule == RuleVerbFirstFunction {
			t.Error("verb-first must not appear among blocking findings")
		}
	}
}

func TestGeneratedAndVendoredFilesAreSkipped(t *testing.T) {
	// Nobody chose these names, so reporting them blames the developer for
	// something they did not write and trains them to ignore the output.
	source := `package demo

func thing() {
	n := 0
	_ = n
}
`
	skipped := []string{
		"node_modules/pkg/index.go",
		"vendor/github.com/example/thing.go",
		"frontend/dist/bundle.go",
		"cmd/forge/web/assets/generated.go",
	}

	for _, path := range skipped {
		t.Run(path, func(t *testing.T) {
			if findings := CheckChangedFile(path, source); len(findings) != 0 {
				t.Errorf("%s should be skipped, got: %+v", path, findings)
			}
		})
	}
}

func TestHandWrittenSourceIsStillChecked(t *testing.T) {
	source := `package demo

func thing() {
	n := 0
	_ = n
}
`
	if findings := CheckChangedFile("internal/workflow/thing.go", source); len(findings) == 0 {
		t.Error("hand-written source should still be checked")
	}
}
