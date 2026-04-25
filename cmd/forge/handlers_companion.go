// handlers_companion.go — Forge Companion preference API.
//
// Persists which connection method the user wants the companion card to
// default to (named, quick, tailscale).  Stored separately from the
// tunnel/preference.json file so changing the companion default does not
// silently override the global tunnel ranker preference (which can pin
// LAN, etc.).
//
// File: ~/.forge/companion/preference.json
//   { "method": "named" | "quick" | "tailscale", "updatedAt": "..." }
//
// Routes:
//   GET  /api/companion/preference  → { method, methodResolved }
//   POST /api/companion/preference  → { method }   (empty clears)
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// CompanionMethod enumerates the three connection methods the companion
// wizard exposes.  LAN remains accessible from advanced settings, so it
// is intentionally NOT a valid companion preference.
type CompanionMethod string

const (
	CompanionMethodNamed     CompanionMethod = "named"
	CompanionMethodQuick     CompanionMethod = "quick"
	CompanionMethodTailscale CompanionMethod = "tailscale"
)

// validCompanionMethods is the allowlist used when validating POSTs.
var validCompanionMethods = map[CompanionMethod]bool{
	CompanionMethodNamed:     true,
	CompanionMethodQuick:     true,
	CompanionMethodTailscale: true,
}

// CompanionPreference is the on-disk shape of the preference file.
type CompanionPreference struct {
	Method    CompanionMethod `json:"method"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// companionPreferencePath returns ~/.forge/companion/preference.json.
func companionPreferencePath() (string, error) {
	dir := storage.GetForgeDir()
	if dir == "" {
		return "", errors.New("forge data directory unavailable")
	}
	return filepath.Join(dir, "companion", "preference.json"), nil
}

// loadCompanionPreference reads the preference file.  A missing file
// returns an empty preference (caller treats it as "auto-detect").
func loadCompanionPreference() (CompanionPreference, error) {
	path, err := companionPreferencePath()
	if err != nil {
		return CompanionPreference{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return CompanionPreference{}, nil
	}
	if err != nil {
		return CompanionPreference{}, err
	}
	var pref CompanionPreference
	if err := json.Unmarshal(data, &pref); err != nil {
		return CompanionPreference{}, err
	}
	return pref, nil
}

// saveCompanionPreference writes the preference file atomically.  An empty
// method clears the file (back to auto-detect).
func saveCompanionPreference(method CompanionMethod) error {
	path, err := companionPreferencePath()
	if err != nil {
		return err
	}
	if method == "" {
		// Empty method: remove the file so future reads return "auto".
		if rmErr := os.Remove(path); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			return rmErr
		}
		return nil
	}
	if !validCompanionMethods[method] {
		return fmt.Errorf("unknown companion method %q", method)
	}
	if mkErr := os.MkdirAll(filepath.Dir(path), 0o755); mkErr != nil {
		return mkErr
	}
	body, encErr := json.MarshalIndent(CompanionPreference{
		Method:    method,
		UpdatedAt: time.Now().UTC(),
	}, "", "  ")
	if encErr != nil {
		return encErr
	}
	tmp := path + ".tmp"
	if writeErr := os.WriteFile(tmp, body, 0o644); writeErr != nil {
		return writeErr
	}
	return os.Rename(tmp, path)
}

// handleCompanionPreference responds to GET / POST /api/companion/preference.
//
// GET returns { method, updatedAt, methodResolved } where methodResolved
// is what the UI should default to when no explicit preference is set.
// POST accepts { method } and validates against the allowlist.
func handleCompanionPreference(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		pref, err := loadCompanionPreference()
		if err != nil {
			http.Error(w, "load preference: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// methodResolved gives the UI a sensible default even when the
		// user has never picked a method.  It mirrors the preference if
		// set, otherwise falls back to "named" (the recommended option).
		resolved := pref.Method
		if resolved == "" {
			resolved = CompanionMethodNamed
		}
		writeCompanionJSON(w, map[string]any{
			"method":         pref.Method,
			"updatedAt":      pref.UpdatedAt,
			"methodResolved": resolved,
		})
	case http.MethodPost:
		var body struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		method := CompanionMethod(strings.TrimSpace(body.Method))
		if method != "" && !validCompanionMethods[method] {
			http.Error(w, "unknown method (allowed: named, quick, tailscale)", http.StatusBadRequest)
			return
		}
		if err := saveCompanionPreference(method); err != nil {
			http.Error(w, "save preference: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeCompanionJSON(w, map[string]any{"ok": true, "method": string(method)})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// writeCompanionJSON marshals v as JSON with a 200 status.
func writeCompanionJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
