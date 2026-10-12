// argument_names_internal_test.go — the spelling-matching rules, tested without a server.
package mcp

import (
	"encoding/json"
	"testing"
)

// schemaDeclaring builds an input schema that declares the given property names.
func schemaDeclaring(t *testing.T, propertyNames ...string) json.RawMessage {
	t.Helper()
	properties := make(map[string]any, len(propertyNames))
	for _, propertyName := range propertyNames {
		properties[propertyName] = map[string]string{"type": "string"}
	}
	encodedSchema, err := json.Marshal(map[string]any{"type": "object", "properties": properties})
	if err != nil {
		t.Fatal(err)
	}
	return encodedSchema
}

func TestEveryCommonRewriteOfASnakeCaseNameIsRecognised(t *testing.T) {
	for _, sentName := range []string{"sessionId", "SessionID", "session-id", "SESSION_ID"} {
		normalized := normalizeArgumentNames("tool", schemaDeclaring(t, "session_id"), map[string]any{sentName: "tab-1"})
		if normalized["session_id"] != "tab-1" {
			t.Errorf("%q was not accepted as session_id: %v", sentName, normalized)
		}
	}
}

func TestUndeclaredArgumentsPassThroughUntouched(t *testing.T) {
	normalized := normalizeArgumentNames("tool", schemaDeclaring(t, "path"), map[string]any{"extra_flag": true})

	if normalized["extra_flag"] != true {
		t.Errorf("an undeclared argument was dropped: %v", normalized)
	}
}

func TestTheCallersArgumentsAreNotModified(t *testing.T) {
	sentArguments := map[string]any{"sessionId": "tab-1"}

	normalizeArgumentNames("tool", schemaDeclaring(t, "session_id"), sentArguments)

	if _, wasAdded := sentArguments["session_id"]; wasAdded {
		t.Error("the caller's map was mutated")
	}
}

func TestAnUnreadableSchemaLeavesArgumentsAsSent(t *testing.T) {
	normalized := normalizeArgumentNames("tool", json.RawMessage(`not json`), map[string]any{"sessionId": "tab-1"})

	if len(normalized) != 1 || normalized["sessionId"] != "tab-1" {
		t.Errorf("expected the arguments unchanged, got %v", normalized)
	}
}
