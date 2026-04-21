// Package license manages Forge Terminal's subscription licensing.
// It checks the local encrypted cache at startup, validates with the
// Cloudflare Worker when stale, and writes a 72-hour grace period on
// repeated network failures.
package license

import (
	"log"
	"time"
)

// WorkerBaseURL is injected at build time:
//
//	go build -ldflags "-X github.com/mikejsmith1985/forge-terminal/internal/license.WorkerBaseURL=https://license.rootlevellabs.tech"
var WorkerBaseURL = "https://license.rootlevellabs.tech"

// Status describes the current license state.
type Status string

const (
	// StatusOK — license is active and validated.
	StatusOK Status = "ok"
	// StatusRequired — no license cache found; activation needed.
	StatusRequired Status = "required"
	// StatusExpired — license was cancelled or expired.
	StatusExpired Status = "expired"
	// StatusGrace — network unreachable; within the 72-hour grace window.
	StatusGrace Status = "grace"
)

// Info holds the cached license details written after a successful activation.
type Info struct {
	Key                string     `json:"key"`
	Token              string     `json:"token"`
	Email              string     `json:"email"`
	ExpiresAt          time.Time  `json:"expiresAt"`
	LastCheck          time.Time  `json:"lastCheck"`
	GracePeriodExpires *time.Time `json:"gracePeriodExpires,omitempty"`

	// Features is the list of add-on feature flags enabled for this license.
	// Populated by the license server based on the user's subscription plan.
	// An empty slice means no add-on features are active.
	// Future: the license Worker will populate this field when plan-based gating is live.
	Features []string `json:"features,omitempty"`
}

// CheckLicense reads the encrypted cache and decides license status.
//
// Decision tree:
//  1. No cache file → StatusRequired
//  2. Grace period active and not expired → StatusGrace
//  3. Grace period expired → StatusExpired
//  4. LastCheck within 24 h → StatusOK (background re-validate)
//  5. Stale cache → live validate; network failure starts grace period
func CheckLicense() (Status, *Info) {
	info, err := readCache()
	if err != nil {
		return StatusRequired, nil
	}

	if info.GracePeriodExpires != nil {
		if time.Now().After(*info.GracePeriodExpires) {
			return StatusExpired, info
		}
		return StatusGrace, info
	}

	if time.Since(info.LastCheck) < 24*time.Hour {
		go backgroundValidate(info)
		return StatusOK, info
	}

	status, err := Validate(info)
	if err != nil {
		log.Printf("[License] Validation failed at startup: %v — starting grace period", err)
		graceEnd := time.Now().Add(72 * time.Hour)
		info.GracePeriodExpires = &graceEnd
		_ = writeCache(info)
		return StatusGrace, info
	}

	return status, info
}

func backgroundValidate(info *Info) {
	if _, err := Validate(info); err != nil {
		log.Printf("[License] Background re-validate failed: %v", err)
	}
}
