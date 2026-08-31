// detector_ptyquiet.go — completion detection for the phases that write no feature artifact
// (Validate = /speckit-analyze, Implement = /speckit-implement). They cannot be observed by
// the file watcher, so instead the orchestrator — which just injected the phase's command —
// waits for the terminal to go quiet (the command finished) and then gates the phase.
//
// This is the inverse of file detection (detector.go): file phases are pulled in by the
// watcher; pty-quiet phases are pushed from the advance path. The real waiter reuses the
// macro subsystem's `waitForPTYQuiet`. NOTE: for a long, interactive Implement run, "quiet
// for N seconds" is a best-effort heuristic for "the agent finished," not a guarantee.
package sdd

// CompletionWaiter blocks until a pty-quiet phase's command has run and the terminal has
// settled. Production wires this to the PTY quiet-detection used by the macro injector; unit
// tests supply a mock.
type CompletionWaiter interface {
	WaitForPhase(sessionID string, phase PhaseName)
}

// WaiterFunc adapts a plain function to CompletionWaiter so main.go can wire a closure.
type WaiterFunc func(sessionID string, phase PhaseName)

// WaitForPhase calls the wrapped function.
func (fn WaiterFunc) WaitForPhase(sessionID string, phase PhaseName) { fn(sessionID, phase) }
