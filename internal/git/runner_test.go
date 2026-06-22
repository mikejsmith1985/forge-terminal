// Unit tests for the git Client construction and Runner seam (specs/011). These
// assert the dependency-injection wiring without shelling out to real git.
package git

import "testing"

func TestNewReturnsUsableClient(t *testing.T) {
	if New() == nil {
		t.Fatal("New() returned nil; want a usable Client backed by the real git binary")
	}
}

func TestNewWithRunnerRoutesThroughInjectedRunner(t *testing.T) {
	fake := newFakeRunner()
	fake.outputs["rev-parse --show-toplevel"] = "C:/sentinel"
	client := NewWithRunner(fake)

	got, err := client.Toplevel("C:/anywhere")
	if err != nil {
		t.Fatalf("Toplevel via injected runner errored: %v", err)
	}
	if got != "C:/sentinel" {
		t.Errorf("Toplevel = %q, want the injected runner's output 'C:/sentinel'", got)
	}
	if len(fake.calls) != 1 {
		t.Fatalf("injected runner saw %d calls, want exactly 1", len(fake.calls))
	}
}
