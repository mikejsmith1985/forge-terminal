package license

import (
	"log"
	"time"
)

const (
	heartbeatInterval      = 60 * time.Minute
	gracePeriodDuration    = 72 * time.Hour
	maxConsecutiveFailures = 3
)

// StartHeartbeat runs a background goroutine that re-validates the license every
// 60 minutes. After 3 consecutive network failures the grace period begins.
// After the grace window expires the next launch blocks with StatusExpired.
func StartHeartbeat(info *Info) {
	go runHeartbeat(info)
}

func runHeartbeat(info *Info) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	consecutive := 0

	for range ticker.C {
		status, err := Validate(info)
		if err != nil {
			consecutive++
			log.Printf("[License] Heartbeat failed (%d/%d): %v", consecutive, maxConsecutiveFailures, err)

			if consecutive >= maxConsecutiveFailures && info.GracePeriodExpires == nil {
				graceEnd := time.Now().Add(gracePeriodDuration)
				info.GracePeriodExpires = &graceEnd
				if cacheErr := writeCache(info); cacheErr != nil {
					log.Printf("[License] Failed to persist grace period: %v", cacheErr)
				}
				log.Printf("[License] Grace period started, expires %s", graceEnd.Format(time.RFC3339))
			}
			continue
		}

		consecutive = 0

		if status != StatusOK && status != StatusGrace {
			log.Printf("[License] Heartbeat: status=%s", status)
		}
	}
}
