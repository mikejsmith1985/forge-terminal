// gate.go — the two outward-facing ports the orchestrator drives: injecting the next
// phase command into the terminal, and broadcasting a decision card to the frontend.
// Both are interfaces so unit tests use mocks and production wires them to existing Forge
// subsystems (the macro-injection path and the WebSocket hub) in cmd/forge.
package sdd

// CommandInjector advances the pipeline by issuing the next phase's command into the
// bound terminal session. Production wires this to the macro-injection path.
type CommandInjector interface {
	InjectCommand(sessionID, text string) error
}

// GateBroadcaster pushes a decision card to the frontend. Production wires this to the
// per-session WebSocket hub's broadcastJSON.
type GateBroadcaster interface {
	BroadcastGate(card DecisionCard) error
}

// InjectorFunc adapts a plain function to CommandInjector so main.go can wire a closure.
type InjectorFunc func(sessionID, text string) error

// InjectCommand calls the wrapped function.
func (fn InjectorFunc) InjectCommand(sessionID, text string) error { return fn(sessionID, text) }

// BroadcasterFunc adapts a plain function to GateBroadcaster.
type BroadcasterFunc func(card DecisionCard) error

// BroadcastGate calls the wrapped function.
func (fn BroadcasterFunc) BroadcastGate(card DecisionCard) error { return fn(card) }
