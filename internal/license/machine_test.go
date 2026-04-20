package license

import (
	"encoding/hex"
	"testing"
)

func TestMachineID_Is32HexChars(t *testing.T) {
	id := MachineID()
	if len(id) != 32 {
		t.Errorf("MachineID length = %d, want 32", len(id))
	}
	if _, err := hex.DecodeString(id); err != nil {
		t.Errorf("MachineID %q is not valid hex: %v", id, err)
	}
}

func TestMachineID_Consistent(t *testing.T) {
	a := MachineID()
	b := MachineID()
	if a != b {
		t.Errorf("MachineID not consistent: %q != %q", a, b)
	}
}

func TestMachineName_NonEmpty(t *testing.T) {
	name := MachineName()
	if name == "" {
		t.Error("MachineName returned empty string")
	}
}

func TestMachineName_NoDotsFromHostname(t *testing.T) {
	// MachineName truncates at the first dot (FQDN → short name)
	name := MachineName()
	for _, ch := range name {
		if ch == '.' {
			t.Errorf("MachineName %q contains a dot; expected only the short hostname", name)
		}
	}
}
