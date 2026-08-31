// Package workflow — naming.go: checking that code reads like English.
//
// The failure this catches is subtle. A name like `n` is not incorrect, it is
// *unreadable*: somebody looking at it learns nothing about what they would see
// on screen if that value were displayed. Names carrying no domain meaning are
// why reading code often fails to build understanding even when the reader is
// genuinely trying.
//
// Article IV has mandated these rules since the constitution was written; what
// was missing was anything that checked. Nothing in the existing toolchain
// covers them — `go vet` does not judge naming style, and oxlint governs the
// frontend but not this rule set — so this is a documented gap rather than a
// rebuild of something already available.
//
// It stops at mechanical rules deliberately. A name can satisfy every rule
// below and still mean nothing at all, and no checker can tell the difference.
// That judgement goes to the change brief, where a person makes it.
package workflow

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
)

// Rule identifies which naming rule a finding came from.
type Rule string

const (
	// RuleSingleLetter marks an identifier too short to carry meaning.
	RuleSingleLetter Rule = "single-letter-name"

	// RuleBooleanPrefix marks a boolean that does not read as a question.
	RuleBooleanPrefix Rule = "boolean-prefix"

	// RuleVerbFirstFunction marks a function that does not begin with an action.
	RuleVerbFirstFunction Rule = "verb-first-function"
)

// permittedLoopIterators are conventional enough that renaming them would make
// code harder to read, not easier. The rule serves readability; applying it
// here would work against it.
var permittedLoopIterators = map[string]bool{"i": true, "j": true, "k": true}

// permittedHandlerParameters are the Go HTTP handler convention, universally
// understood by anyone who has read a Go web service.
var permittedHandlerParameters = map[string]bool{"w": true, "r": true}

// booleanPrefixes are the prefixes that make a boolean read as a question the
// value answers, so `if isReady` reads as a sentence rather than a lookup.
var booleanPrefixes = []string{"is", "has", "can", "should", "was", "will", "must"}

// commonVerbs open a function name with an action, so a call site reads as an
// instruction rather than a noun.
var commonVerbs = []string{
	"add", "apply", "build", "calculate", "call", "cancel", "check", "clear",
	"close", "collect", "compare", "compute", "convert", "copy", "count",
	"create", "decode", "delete", "detect", "encode", "ensure", "evaluate",
	"execute", "extract", "fetch", "filter", "find", "format", "gather",
	"generate", "get", "handle", "has", "init", "insert", "is", "list", "load",
	"lock", "log", "make", "mark", "merge", "must", "new", "normalise",
	"normalize", "open", "parse", "persist", "poll", "prepare", "process",
	"publish", "read", "record", "refresh", "register", "reject", "release",
	"remove", "render", "report", "reset", "resolve", "restore", "run", "save",
	"scan", "send", "serve", "set", "should", "show", "skip", "sort", "split",
	"start", "stop", "store", "submit", "sync", "test", "to", "toggle", "track",
	"trim", "unlock", "update", "validate", "verify", "wait", "with", "wrap",
	"write",
	// Added after the first run reported sumAll, which is verb-first and was
	// rejected only because the list was short. A checker that rejects good
	// names teaches the developer to bypass it, so the list errs towards
	// accepting rather than towards catching every possible offender.
	"accept", "append", "assert", "attach", "bind", "cache", "clean", "clone",
	"commit", "connect", "consume", "drain", "drop", "emit", "enable",
	"disable", "fill", "flush", "join", "listen", "match", "measure",
	"mount", "move", "notify", "observe", "pick", "print", "prune", "push",
	"rename", "replace", "require", "resume", "retry", "reverse", "revoke",
	"rotate", "route", "seed", "select", "spawn", "sum", "swap", "take",
	"tally", "throttle", "trace", "transform", "trigger", "truncate",
	"unwrap", "upload", "use", "walk", "warn", "watch", "yield",
}

// IsBlocking reports whether a rule is certain enough to refuse a commit over.
//
// Only rules that can be decided mechanically block. Verb-first cannot: it is
// recognised from a list of verbs, and a list of verbs is never complete —
// run against this repository the first version rejected Archive, Search,
// Subscribe, Migrate, Infer and Heal, four hundred findings of which almost all
// were good names. A checker that rejects good names does not teach better
// naming; it teaches the developer to reach for the bypass, and then nothing is
// enforced at all.
//
// So verb-first is still reported — it is surfaced for a person to judge, in
// the same way FR-019 sends a name that satisfies every rule and still means
// nothing to the brief rather than pretending a checker could catch it.
func (rule Rule) IsBlocking() bool {
	switch rule {
	case RuleSingleLetter, RuleBooleanPrefix:
		return true
	default:
		return false
	}
}

// BlockingFindings keeps only the findings certain enough to refuse a commit.
func BlockingFindings(findings []NamingFinding) []NamingFinding {
	blocking := make([]NamingFinding, 0, len(findings))
	for _, finding := range findings {
		if finding.Rule.IsBlocking() {
			blocking = append(blocking, finding)
		}
	}
	return blocking
}

// NamingFinding is one violation, carrying enough for the developer to act.
//
// A finding that says only "something is wrong" makes the developer hunt, and
// hunting is how a check becomes something to bypass rather than to satisfy.
type NamingFinding struct {
	// Path is the file the violation is in.
	Path string

	// Line is where to look.
	Line int

	// Identifier is the offending name.
	Identifier string

	// Rule says which rule was broken.
	Rule Rule

	// Suggestion says what to do instead.
	Suggestion string
}

// CheckNaming reports naming violations in one Go source file.
//
// Returns nothing for non-Go files and for source that will not parse:
// half-written code is the ordinary state during editing, and reporting it as a
// naming problem would blame the developer for the wrong thing.
//
// @param path The file's repository-relative path, used in findings.
// @param source The file's contents.
func CheckNaming(path, source string) []NamingFinding {
	if !strings.HasSuffix(strings.ToLower(path), ".go") {
		return nil
	}

	fileSet := token.NewFileSet()
	parsed, err := parser.ParseFile(fileSet, path, source, 0)
	if err != nil {
		return nil
	}

	var findings []NamingFinding

	ast.Inspect(parsed, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.FuncDecl:
			findings = append(findings, checkFunctionName(path, fileSet, typed)...)
		case *ast.AssignStmt:
			findings = append(findings, checkAssignment(path, fileSet, typed)...)
		}
		return true
	})

	return findings
}

// checkFunctionName reports a function that does not begin with an action.
func checkFunctionName(path string, fileSet *token.FileSet, function *ast.FuncDecl) []NamingFinding {
	if function.Name == nil {
		return nil
	}

	name := function.Name.Name
	if isVerbFirst(name) {
		return nil
	}

	return []NamingFinding{{
		Path:       path,
		Line:       fileSet.Position(function.Pos()).Line,
		Identifier: name,
		Rule:       RuleVerbFirstFunction,
		Suggestion: "start the name with what it does, e.g. validateUser rather than userValidation",
	}}
}

// checkAssignment reports unreadable names introduced by a short assignment.
//
// Only `:=` is examined, because that is where a name is introduced. Reassigning
// an existing name is not the developer's choice to make again.
func checkAssignment(path string, fileSet *token.FileSet, assignment *ast.AssignStmt) []NamingFinding {
	if assignment.Tok != token.DEFINE {
		return nil
	}

	var findings []NamingFinding

	for index, target := range assignment.Lhs {
		identifier, isIdentifier := target.(*ast.Ident)
		if !isIdentifier || identifier.Name == "_" {
			continue
		}

		line := fileSet.Position(identifier.Pos()).Line

		if isTooShortToMean(identifier.Name) {
			findings = append(findings, NamingFinding{
				Path:       path,
				Line:       line,
				Identifier: identifier.Name,
				Rule:       RuleSingleLetter,
				Suggestion: "name it after what a reader would see on screen, e.g. matchCount rather than n",
			})
			continue
		}

		if index < len(assignment.Rhs) && isBooleanLiteral(assignment.Rhs[index]) && !hasBooleanPrefix(identifier.Name) {
			findings = append(findings, NamingFinding{
				Path:       path,
				Line:       line,
				Identifier: identifier.Name,
				Rule:       RuleBooleanPrefix,
				Suggestion: "prefix it so it reads as a question, e.g. isReady rather than ready",
			})
		}
	}

	return findings
}

// isTooShortToMean reports whether a name is too short to tell a reader anything.
func isTooShortToMean(name string) bool {
	if len(name) > 1 {
		return false
	}
	// The two conventional exceptions. Both are so widely understood that a
	// longer name would read as unfamiliar rather than clearer.
	return !permittedLoopIterators[name] && !permittedHandlerParameters[name]
}

// hasBooleanPrefix reports whether a name reads as a question.
func hasBooleanPrefix(name string) bool {
	lowered := strings.ToLower(name)
	for _, prefix := range booleanPrefixes {
		if strings.HasPrefix(lowered, prefix) {
			return true
		}
	}
	return false
}

// isBooleanLiteral reports whether an expression is a plain true or false.
//
// Deliberately narrow: inferring the type of an arbitrary expression needs the
// type checker, and a naming rule that fires on a guess would produce findings
// the developer cannot trust. A literal is unambiguous.
func isBooleanLiteral(expression ast.Expr) bool {
	identifier, isIdentifier := expression.(*ast.Ident)
	if !isIdentifier {
		return false
	}
	return identifier.Name == "true" || identifier.Name == "false"
}

// isVerbFirst reports whether a function name opens with an action.
func isVerbFirst(name string) bool {
	lowered := strings.ToLower(name)

	// Test functions carry a framework-imposed shape that is not the
	// developer's to choose.
	if strings.HasPrefix(name, "Test") || strings.HasPrefix(name, "Benchmark") ||
		strings.HasPrefix(name, "Example") || strings.HasPrefix(name, "Fuzz") {
		return true
	}

	// Go's own entry points, whose names are not the developer's to choose.
	if name == "main" || name == "init" {
		return true
	}

	for _, verb := range commonVerbs {
		if startsWithWord(name, lowered, verb) {
			return true
		}
	}
	return false
}

// startsWithWord reports whether a name opens with a verb as a whole word.
//
// A plain prefix test is not enough, and the difference is not academic: "use"
// is a prefix of "userValidation", so a loose test accepted the exact name this
// rule exists to reject. The verb has to end at a camelCase boundary, or be the
// entire name.
func startsWithWord(name, loweredName, verb string) bool {
	if !strings.HasPrefix(loweredName, verb) {
		return false
	}
	if len(name) == len(verb) {
		return true
	}

	// The character after the verb starts the next word, so it must be a
	// capital — or the "verb" was only the first few letters of a longer word.
	next := rune(name[len(verb)])
	return next >= 'A' && next <= 'Z'
}

// CheckChangedFile checks one file, skipping anything nobody wrote by hand.
//
// Reporting a generated or vendored file blames the developer for names they
// did not choose, and a check that blames the wrong person is a check that gets
// ignored — after which the real findings go unread too.
func CheckChangedFile(path, source string) []NamingFinding {
	normalised := strings.ToLower(strings.ReplaceAll(path, "\\", "/"))
	if isGenerated(normalised) {
		return nil
	}
	return CheckNaming(path, source)
}
