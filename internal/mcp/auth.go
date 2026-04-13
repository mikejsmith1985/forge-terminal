// auth.go manages MCP bearer token authentication for the Forge Terminal MCP server.
//
// Each Forge instance is protected by a unique token stored at ~/.forge/mcp-token.
// The token is generated automatically on first startup using 32 bytes of
// cryptographically random data (256-bit entropy). It is never stored in forge.toml
// or any file that might be committed to version control.
//
// Every inbound MCP request must include: Authorization: Bearer <token>
// Missing or incorrect tokens receive a 401-equivalent JSON-RPC error.
package mcp

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

const (
	// tokenFilename is the name of the file inside ~/.forge/ where the token is saved.
	tokenFilename = "mcp-token"

	// tokenByteLength controls how many random bytes the generator uses.
	// 32 bytes = 256-bit entropy, well beyond any realistic brute-force budget.
	tokenByteLength = 32

	// bearerPrefix is the expected prefix of the HTTP Authorization header value.
	bearerPrefix = "Bearer "

	// tokenFilePermissions restricts the token file to owner-read/write only.
	tokenFilePermissions = 0600

	// forgeDirPermissions is used when creating ~/.forge/ if it is absent.
	forgeDirPermissions = 0700
)

// LoadOrCreateToken reads the MCP bearer token from ~/.forge/mcp-token.
// If the file does not exist yet, a new random token is generated and saved.
// The returned token is the single source of truth for auth validation.
func LoadOrCreateToken() (string, error) {
	tokenPath := filepath.Join(storage.GetForgeDir(), tokenFilename)

	existingBytes, readErr := os.ReadFile(tokenPath)
	if readErr == nil {
		trimmedToken := strings.TrimSpace(string(existingBytes))
		if len(trimmedToken) > 0 {
			return trimmedToken, nil
		}
	}

	return generateAndSaveToken(tokenPath)
}

// generateAndSaveToken creates a new random token and writes it to disk.
// It is called exactly once — the first time LoadOrCreateToken runs on a new instance.
func generateAndSaveToken(tokenPath string) (string, error) {
	rawBytes := make([]byte, tokenByteLength)
	if _, err := rand.Read(rawBytes); err != nil {
		return "", fmt.Errorf("generating MCP token entropy: %w", err)
	}

	newToken := hex.EncodeToString(rawBytes)

	forgeDir := filepath.Dir(tokenPath)
	if err := os.MkdirAll(forgeDir, forgeDirPermissions); err != nil {
		return "", fmt.Errorf("creating forge dir for MCP token: %w", err)
	}

	if err := os.WriteFile(tokenPath, []byte(newToken), tokenFilePermissions); err != nil {
		return "", fmt.Errorf("saving MCP token to disk: %w", err)
	}

	log.Printf("[MCP] Generated new auth token, saved to: %s", tokenPath)
	return newToken, nil
}

// ValidateRequestToken returns true only if the request carries the correct bearer token.
// Uses constant-time byte comparison to prevent timing side-channel attacks.
func ValidateRequestToken(r *http.Request, expectedToken string) bool {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return false
	}

	providedToken := strings.TrimPrefix(authHeader, bearerPrefix)

	// subtle.ConstantTimeCompare prevents attackers from learning the token length
	// or character values by measuring how long the comparison takes.
	isMatch := subtle.ConstantTimeCompare(
		[]byte(providedToken),
		[]byte(expectedToken),
	) == 1

	return isMatch
}
