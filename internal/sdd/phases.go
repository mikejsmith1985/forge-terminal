// phases.go — the fixed five-phase pipeline table and lookups. Validate and Implement
// produce no feature artifact, so they complete via PTY-quiet (see research R3).
package sdd

// phaseTable is the ordered, authoritative pipeline definition.
var phaseTable = []Phase{
	{Name: PhaseSpecify, Order: 1, StartCommand: "/speckit-specify", CompletionSignal: signalArtifactExists, ExpectedArtifact: "spec.md"},
	{Name: PhaseClarify, Order: 2, StartCommand: "/speckit-clarify", CompletionSignal: signalContentMarker, ExpectedArtifact: "spec.md"},
	{Name: PhasePlan, Order: 3, StartCommand: "/speckit-plan", CompletionSignal: signalArtifactExists, ExpectedArtifact: "plan.md"},
	{Name: PhaseTasksGenerate, Order: 4, StartCommand: "/speckit-tasks", CompletionSignal: signalArtifactExists, ExpectedArtifact: "tasks.md"},
	{Name: PhaseValidate, Order: 5, StartCommand: "/speckit-analyze", CompletionSignal: signalPTYQuiet, ExpectedArtifact: ""},
	{Name: PhaseImplement, Order: 6, StartCommand: "/speckit-implement", CompletionSignal: signalPTYQuiet, ExpectedArtifact: "", IsTerminal: true},
}

// PhaseTable returns an ordered copy of all five pipeline phases. Callers must
// not mutate the returned slice; it is a defensive copy of the package-level table.
func PhaseTable() []Phase {
	out := make([]Phase, len(phaseTable))
	copy(out, phaseTable)
	return out
}

// PhaseByName returns the phase definition for a name, or false if unknown.
func PhaseByName(name PhaseName) (Phase, bool) {
	for _, phase := range phaseTable {
		if phase.Name == name {
			return phase, true
		}
	}
	return Phase{}, false
}

// NextPhaseAfter returns the phase that follows the given one, or false if it is terminal.
func NextPhaseAfter(name PhaseName) (Phase, bool) {
	current, found := PhaseByName(name)
	if !found || current.IsTerminal {
		return Phase{}, false
	}
	for _, phase := range phaseTable {
		if phase.Order == current.Order+1 {
			return phase, true
		}
	}
	return Phase{}, false
}
