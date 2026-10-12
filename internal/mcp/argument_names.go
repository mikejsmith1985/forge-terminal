// argument_names.go — matching an incoming tool argument to the name the tool declared, whatever its spelling.
//
// Some MCP clients rewrite argument keys between snake_case and camelCase on
// the way to the server. A tool that declared `session_id` then received
// `sessionId`, looked up the exact key, found nothing, and told the agent the
// argument was missing — when the agent had sent it correctly. The same happens
// in reverse to tools that declare camelCase names.
//
// Framework-first: the MCP specification has no key-normalisation rule and the
// Go standard library matches map keys exactly, so there is nothing to reuse.
// The tool's own input schema is the authority on what a key should be called,
// so the fix reads it rather than keeping a second list of names that could
// drift from it.
package mcp

import (
	"encoding/json"
	"log"
	"strings"
)

// argumentNameSeparators are the characters clients insert or remove when they
// convert between naming styles. Removing them (and ignoring case) gives the
// spelling-independent form of a name.
const argumentNameSeparators = "_-"

// normalizeArgumentNames returns the arguments with every key the tool declares
// present under its declared spelling, when the client sent it under another.
//
// A key already sent under the declared spelling is never overwritten — the
// exact match is the client saying precisely what it meant. Undeclared keys are
// passed through untouched so tools that read extra keys keep working.
//
// @param inputSchema The tool's JSON Schema, as returned by Definition().
// @param arguments The arguments as the client sent them; not modified.
func normalizeArgumentNames(toolName string, inputSchema json.RawMessage, arguments map[string]any) map[string]any {
	if len(arguments) == 0 {
		return arguments
	}

	normalized := make(map[string]any, len(arguments))
	for key, value := range arguments {
		normalized[key] = value
	}

	for _, declaredName := range readDeclaredArgumentNames(inputSchema) {
		if _, isAlreadyPresent := normalized[declaredName]; isAlreadyPresent {
			continue
		}
		if sentName, wasFound := findDifferentlySpelledArgument(declaredName, arguments); wasFound {
			normalized[declaredName] = arguments[sentName]
			// Names only, never values — an argument can carry a command line.
			log.Printf("[MCP] %s: accepted argument %q as declared name %q", toolName, sentName, declaredName)
		}
	}
	return normalized
}

// readDeclaredArgumentNames lists the property names a tool's input schema declares.
//
// An unreadable schema yields no names, so normalisation is skipped rather than
// failing the call — the tool still receives exactly what the client sent.
func readDeclaredArgumentNames(inputSchema json.RawMessage) []string {
	var schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(inputSchema, &schema); err != nil {
		return nil
	}

	declaredNames := make([]string, 0, len(schema.Properties))
	for propertyName := range schema.Properties {
		declaredNames = append(declaredNames, propertyName)
	}
	return declaredNames
}

// findDifferentlySpelledArgument finds the sent key that names the same
// argument as declaredName under a different style, e.g. sessionId for session_id.
func findDifferentlySpelledArgument(declaredName string, arguments map[string]any) (string, bool) {
	declaredForm := toSpellingIndependentForm(declaredName)
	for sentName := range arguments {
		if sentName != declaredName && toSpellingIndependentForm(sentName) == declaredForm {
			return sentName, true
		}
	}
	return "", false
}

// readAliasedStringArgument returns the first non-empty string argument whose
// name matches any of acceptedNames in any spelling (tab_id, tabId, Session-ID ...).
//
// For arguments that were renamed: the Claude desktop app strips one named
// session_id outright, so the terminal tools now declare tab_id, and this keeps
// every older spelling working for clients and prompts that still send it.
func readAliasedStringArgument(arguments map[string]any, acceptedNames ...string) string {
	for _, acceptedName := range acceptedNames {
		acceptedForm := toSpellingIndependentForm(acceptedName)
		for sentName, sentValue := range arguments {
			stringValue, isString := sentValue.(string)
			if isString && stringValue != "" && toSpellingIndependentForm(sentName) == acceptedForm {
				return stringValue
			}
		}
	}
	return ""
}

// toSpellingIndependentForm lowercases a name and drops word separators, so
// session_id, sessionId, SessionID and session-id all compare equal.
func toSpellingIndependentForm(argumentName string) string {
	withoutSeparators := strings.Map(func(character rune) rune {
		if strings.ContainsRune(argumentNameSeparators, character) {
			return -1
		}
		return character
	}, argumentName)
	return strings.ToLower(withoutSeparators)
}
