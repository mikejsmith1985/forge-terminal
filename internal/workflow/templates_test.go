// Template tests guard the per-tool context files the SDD pipeline generates.
// FR-011 (cross-tool SDD): a tool's context file must route to the tool-agnostic
// constitution and never route that tool through another tool's instruction file.
package workflow

import (
	"strings"
	"testing"
)

// TestRenderClaudeMD_RoutesToConstitutionNotCopilotInstructions guards FR-011 /
// SC-007: the generated CLAUDE.md (Claude Code's session-start context file) must
// import the tool-agnostic constitution and must NOT import Copilot's
// .github/copilot-instructions.md. Routing Claude through Copilot's file is the
// cross-tool contamination removed from the session macros in PR #162; the
// generated context file must not reintroduce it.
func TestRenderClaudeMD_RoutesToConstitutionNotCopilotInstructions(t *testing.T) {
	config := DefaultConfig()
	config.ProjectName = "Test Project"

	rendered, err := RenderClaudeMD(config)
	if err != nil {
		t.Fatalf("RenderClaudeMD returned an error: %v", err)
	}

	if !strings.Contains(rendered, ".specify/memory/constitution.md") {
		t.Errorf("CLAUDE.md must import the tool-agnostic constitution; got:\n%s", rendered)
	}
	if strings.Contains(rendered, "copilot-instructions") {
		t.Errorf("CLAUDE.md must NOT route Claude through Copilot's instruction file; got:\n%s", rendered)
	}
}

// TestRenderClaudeMD_IncludesAgentContextMarkers guards SC-007: the generated
// CLAUDE.md must carry the SPECKIT marker block that the agent-context update
// step writes into after planning. Without the markers, that pipeline step is
// silently inert in every scaffolded project — the regression this test prevents.
func TestRenderClaudeMD_IncludesAgentContextMarkers(t *testing.T) {
	config := DefaultConfig()
	config.ProjectName = "Test Project"

	rendered, err := RenderClaudeMD(config)
	if err != nil {
		t.Fatalf("RenderClaudeMD returned an error: %v", err)
	}

	for _, marker := range []string{"<!-- SPECKIT START -->", "<!-- SPECKIT END -->"} {
		if !strings.Contains(rendered, marker) {
			t.Errorf("CLAUDE.md must contain the agent-context marker %q so the post-plan update has a target; got:\n%s", marker, rendered)
		}
	}
}
