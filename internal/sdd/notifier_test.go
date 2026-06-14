// notifier_test.go — verifies the notifier builds the right payload and that Notify is
// non-blocking and swallows errors (FR-012), using an injected send (no real HTTP).
package sdd

import (
	"errors"
	"testing"
	"time"
)

func TestNotifier_BuildEvent(t *testing.T) {
	notifier := &Notifier{now: func() time.Time { return time.Unix(1700000000, 0) }}

	event := notifier.buildEvent("003-sdd-phase-orchestrator", PhasePlan, "plan.md")

	if event.Feature != "003-sdd-phase-orchestrator" || event.Phase != "plan" || event.ArtifactPath != "plan.md" {
		t.Errorf("event = %+v", event)
	}
	if event.Timestamp == "" {
		t.Errorf("timestamp must be set")
	}
}

func TestNotifier_NotifyIsNonBlockingAndSwallowsError(t *testing.T) {
	delivered := make(chan NotificationEvent, 1)
	notifier := &Notifier{
		now: func() time.Time { return time.Unix(1700000000, 0) },
		send: func(event NotificationEvent) error {
			delivered <- event
			return errors.New("service down") // a failure must be swallowed, never propagated
		},
	}

	// Must return immediately and not panic despite the send error.
	notifier.Notify("003-demo", PhaseValidate, "")

	select {
	case event := <-delivered:
		if event.Feature != "003-demo" || event.Phase != "validate" {
			t.Errorf("delivered event = %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("Notify did not invoke send within 1s")
	}
}
