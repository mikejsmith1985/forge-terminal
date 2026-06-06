// templates_prepush_test.go — verifies the generated pre-push hook builds every
// package (entrypoint-agnostic) and regenerates templ output, so scaffolded repos
// never inherit a hook hardcoded to Forge Terminal's own cmd/forge entrypoint.
package workflow

import (
	"strings"
	"testing"
)

// prePushRenderers maps a human-readable hook name to its renderer, so each
// assertion runs against both the Bash and PowerShell pre-push templates.
var prePushRenderers = map[string]func(WorkflowConfig) (string, error){
	"pre-push.ps1": RenderPrePushPS1,
	"pre-push":     RenderPrePushSH,
}

// TestPrePushHooks_BuildEveryPackageNotForgeEntrypoint guards against the regression
// where the scaffold emitted `go build ./cmd/forge/` into every repo's pre-push hook.
// cmd/forge only exists in Forge Terminal itself, so the hook false-failed on every
// other scaffolded project and forced `git push --no-verify`. The hook must build the
// whole module with `go build ./...` instead.
func TestPrePushHooks_BuildEveryPackageNotForgeEntrypoint(t *testing.T) {
	for name, render := range prePushRenderers {
		script, err := render(WorkflowConfig{})
		if err != nil {
			t.Fatalf("%s: render failed: %v", name, err)
		}
		if strings.Contains(script, "cmd/forge") {
			t.Errorf("%s: hook still hardcodes Forge Terminal's entrypoint (cmd/forge); it must build ./...", name)
		}
		if !strings.Contains(script, "go build ./...") {
			t.Errorf("%s: hook does not build every package with 'go build ./...'", name)
		}
	}
}

// TestPrePushHooks_RegenerateTemplBeforeBuild ensures the hook regenerates the
// gitignored *_templ.go files before building — but only when the project actually
// wires templ as a Go tool dependency. Without the guard, a non-templ project would
// run a meaningless command; without the step, a clean checkout of a templ project
// fails the build on missing generated source.
func TestPrePushHooks_RegenerateTemplBeforeBuild(t *testing.T) {
	for name, render := range prePushRenderers {
		script, err := render(WorkflowConfig{})
		if err != nil {
			t.Fatalf("%s: render failed: %v", name, err)
		}
		if !strings.Contains(script, "go tool templ generate") {
			t.Errorf("%s: hook does not regenerate templ output before building", name)
		}
		if !strings.Contains(script, "tool github.com/a-h/templ") {
			t.Errorf("%s: templ regeneration is not guarded on the go.mod templ tool directive", name)
		}
	}
}
