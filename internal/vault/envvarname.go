// envvarname.go — Turns a vault entry name into a variable reference the target
// shell is guaranteed to parse.
//
// A vault entry name is free text. Users legitimately write RESEND-API-KEY so the
// entry mirrors the label shown on the provider's dashboard. The operating system
// has no objection: a process environment is just a list of NAME=value strings,
// which is exactly why auto-inject — which writes those strings straight into the
// child process environment — has always worked with hyphenated names.
//
// Shells are stricter, and each is strict in a different way:
//
//	PowerShell  accepts any name, but only through the braced ${env:NAME} form.
//	            The bare $env:NAME shorthand stops at the first hyphen, so
//	            "$env:RESEND-API-KEY = '...'" is a parse error.
//	POSIX sh    cannot express a non-identifier name at all. "export A-B=..." is
//	            rejected by every POSIX shell; there is no quoting that rescues it.
//
// Both failures print the offending line back to the terminal — secret included.
// That is why this file exists: a name must only ever be emitted in a form the
// target shell can parse, so a bad name can never turn into a leaked value.
package vault

import "strings"

// IsPosixEnvVarName reports whether a name can be used with the POSIX `export`
// builtin. POSIX requires a name to start with a letter or underscore and to
// contain only letters, digits, and underscores.
func IsPosixEnvVarName(candidateName string) bool {
	if candidateName == "" {
		return false
	}
	for characterIndex, nameRune := range candidateName {
		isLetter := (nameRune >= 'a' && nameRune <= 'z') || (nameRune >= 'A' && nameRune <= 'Z')
		isDigit := nameRune >= '0' && nameRune <= '9'
		isUnderscore := nameRune == '_'

		if isLetter || isUnderscore {
			continue
		}
		// A digit is allowed anywhere except the first position.
		if isDigit && characterIndex > 0 {
			continue
		}
		return false
	}
	return true
}

// NormalizeEnvVarName converts a free-text entry name into the nearest valid
// POSIX identifier: "RESEND-API-KEY" becomes "RESEND_API_KEY". This mirrors the
// derivation the vault UI applies when it suggests a name, so the result is the
// name a user would have picked anyway rather than an invented one.
//
// Returns an empty string when the input contains nothing usable (for example
// "---"), which callers must treat as "this entry cannot be delivered".
func NormalizeEnvVarName(rawName string) string {
	var normalizedBuilder strings.Builder
	wasPreviousCharacterSeparator := false

	for _, nameRune := range strings.ToUpper(rawName) {
		isLetter := nameRune >= 'A' && nameRune <= 'Z'
		isDigit := nameRune >= '0' && nameRune <= '9'

		if isLetter || isDigit {
			normalizedBuilder.WriteRune(nameRune)
			wasPreviousCharacterSeparator = false
			continue
		}
		// Collapse every run of unusable characters into a single underscore.
		if !wasPreviousCharacterSeparator && normalizedBuilder.Len() > 0 {
			normalizedBuilder.WriteRune('_')
			wasPreviousCharacterSeparator = true
		}
	}

	normalizedName := strings.Trim(normalizedBuilder.String(), "_")
	if normalizedName == "" {
		return ""
	}
	// A leading digit is legal in the middle of a name but not at the start,
	// so "1PASSWORD_TOKEN" is prefixed rather than rejected outright.
	if normalizedName[0] >= '0' && normalizedName[0] <= '9' {
		return "_" + normalizedName
	}
	return normalizedName
}

// quotePowerShellVariableName renders an environment variable reference in the
// braced ${env:NAME} form, which is the only PowerShell syntax that accepts a
// name containing hyphens, dots, or spaces.
//
// Inside braces a backtick is PowerShell's escape character and a closing brace
// ends the name, so both are escaped to keep the reference intact.
func quotePowerShellVariableName(rawName string) string {
	escapedName := strings.ReplaceAll(rawName, "`", "``")
	escapedName = strings.ReplaceAll(escapedName, "}", "`}")
	return "${env:" + escapedName + "}"
}

// quotePosixSingleQuoted wraps text for safe use inside a POSIX single-quoted
// string by closing the quote, emitting an escaped quote, and reopening it.
// Used for diagnostic messages so a hostile entry name cannot become a command.
func quotePosixSingleQuoted(rawText string) string {
	return "'" + strings.ReplaceAll(rawText, "'", `'"'"'`) + "'"
}
