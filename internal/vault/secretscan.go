// secretscan.go — heuristic detection of secret material accidentally pasted into
// non-secret fields (notably a vault entry's Description).
//
// This is a best-effort NUDGE, not a security boundary: it warns the user when a
// description looks like it holds a credential so they can move the value into the
// encrypted secret field and rotate it. It never blocks a write, and false
// positives are acceptable because the only consequence is a dismissible warning.
package vault

import (
	"math"
	"net/url"
	"strings"
)

const (
	// minSecretTokenLength is the shortest whitespace-delimited run treated as a
	// candidate high-entropy secret. Real API keys and tokens are comfortably
	// longer than this; the floor avoids flagging ordinary words.
	minSecretTokenLength = 24

	// minSecretEntropyBitsPerChar is the Shannon-entropy threshold (bits per
	// character) above which a base64/hex-shaped token is considered secret-like.
	// Random tokens sit near 4-6 bits/char; natural language sits well below.
	minSecretEntropyBitsPerChar = 3.5

	// minCharsAfterPrefix requires a few characters beyond a known key prefix so a
	// bare prefix mention ("the sk- keys") is not mistaken for an actual key.
	minCharsAfterPrefix = 3
)

// secretKeyPrefixes are well-known credential prefixes. A token starting with any
// of these almost certainly holds a real secret.
var secretKeyPrefixes = []string{
	"sk-",         // OpenAI / Stripe secret keys
	"ghp_",        // GitHub personal access token
	"gho_",        // GitHub OAuth token
	"github_pat_", // GitHub fine-grained PAT
	"xoxb-",       // Slack bot token
	"xoxp-",       // Slack user token
	"AKIA",        // AWS access key id
	"AIza",        // Google API key
}

// suspiciousQueryKeys are URL query-parameter names that carry a password or
// secret value (e.g. ServiceNow login URLs use user_password).
var suspiciousQueryKeys = []string{
	"password", "passwd", "pwd", "user_password", "secret", "token", "api_key", "apikey",
}

// ScanForSecretInText reports whether text appears to contain secret material and,
// if so, a short human-readable reason suitable for a UI warning. It is a
// heuristic; callers must treat a positive result as advisory, never as a hard
// validation failure.
func ScanForSecretInText(text string) (bool, string) {
	trimmedText := strings.TrimSpace(text)
	if trimmedText == "" {
		return false, ""
	}

	// A PEM private key block is unambiguous.
	if strings.Contains(trimmedText, "-----BEGIN") && strings.Contains(trimmedText, "PRIVATE KEY") {
		return true, "description appears to contain a private key"
	}

	// A URL carrying credentials (userinfo or a password query parameter).
	if reason, wasFound := scanURLCredentials(trimmedText); wasFound {
		return true, reason
	}

	// Token-level checks: known key prefixes, then high-entropy blobs.
	for _, token := range strings.Fields(trimmedText) {
		for _, prefix := range secretKeyPrefixes {
			if strings.HasPrefix(token, prefix) && len(token) > len(prefix)+minCharsAfterPrefix {
				return true, "description appears to contain an API key or token"
			}
		}
		if looksLikeHighEntropySecret(token) {
			return true, "description appears to contain a high-entropy secret (key or token)"
		}
	}

	return false, ""
}

// scanURLCredentials looks for any URL in text that embeds a username/password in
// its userinfo or a password-like query parameter.
func scanURLCredentials(text string) (string, bool) {
	for _, token := range strings.Fields(text) {
		if !strings.Contains(token, "://") {
			continue
		}
		parsedURL, parseErr := url.Parse(token)
		if parseErr != nil {
			continue
		}
		if parsedURL.User != nil {
			_, hasPassword := parsedURL.User.Password()
			if hasPassword || parsedURL.User.Username() != "" {
				return "description appears to contain a login URL with embedded credentials", true
			}
		}
		queryValues := parsedURL.Query()
		for _, key := range suspiciousQueryKeys {
			if queryValues.Get(key) != "" {
				return "description appears to contain a password in a URL", true
			}
		}
	}
	return "", false
}

// looksLikeHighEntropySecret reports whether token is a long, base64/hex-shaped run
// with high Shannon entropy — the shape of a random API key or token. It excludes
// anything containing URL or path punctuation so ordinary URLs do not trip it.
func looksLikeHighEntropySecret(token string) bool {
	if len(token) < minSecretTokenLength {
		return false
	}
	if !isBase64OrHexAlphabet(token) {
		return false
	}
	return shannonEntropyBitsPerChar(token) > minSecretEntropyBitsPerChar
}

// isBase64OrHexAlphabet reports whether every character of token is in the
// base64url/hex alphabet [A-Za-z0-9+/=_-]. URLs (with ':' '.' '/') and prose (with
// spaces, already split out) therefore fail this check.
func isBase64OrHexAlphabet(token string) bool {
	for _, char := range token {
		isAlphaNumeric := (char >= 'A' && char <= 'Z') ||
			(char >= 'a' && char <= 'z') ||
			(char >= '0' && char <= '9')
		isAllowedSymbol := char == '+' || char == '/' || char == '=' || char == '_' || char == '-'
		if !isAlphaNumeric && !isAllowedSymbol {
			return false
		}
	}
	return true
}

// shannonEntropyBitsPerChar returns the Shannon entropy of token in bits per
// character — a measure of randomness. Random tokens approach the alphabet's
// maximum; repetitive or natural-language strings score much lower.
func shannonEntropyBitsPerChar(token string) float64 {
	if token == "" {
		return 0
	}
	characterFrequency := make(map[rune]float64)
	for _, char := range token {
		characterFrequency[char]++
	}

	tokenLength := float64(len(token))
	entropy := 0.0
	for _, count := range characterFrequency {
		probability := count / tokenLength
		entropy -= probability * math.Log2(probability)
	}
	return entropy
}
