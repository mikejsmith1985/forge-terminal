package terminal

import (
	"strings"
	"time"
)

// Phone browsers kill background tabs aggressively, so a mobile client is even
// more likely to vanish without meaning to. It gets the same full-day retention
// as the desktop — see sessionGracePeriod for the reasoning.
const mobileGracePeriod = sessionGracePeriod

// IsMobileClient checks if the User-Agent indicates a mobile device.
// Detects iOS (iPhone, iPad, iPod) and Android phones (UA contains "Mobile").
// Android tablets (no "Mobile" token) are treated as desktop clients.
func IsMobileClient(userAgent string) bool {
	ua := strings.ToLower(userAgent)

	// iOS devices — always mobile
	for _, kw := range []string{"iphone", "ipad", "ipod"} {
		if strings.Contains(ua, kw) {
			return true
		}
	}

	// Android: only phones (Chrome on Android phones includes "Mobile")
	if strings.Contains(ua, "android") && strings.Contains(ua, "mobile") {
		return true
	}

	return false
}

// GracePeriodForClient returns the appropriate grace period based on client type.
// Mobile clients get a longer grace period because phone browsers aggressively
// kill background tabs.
func GracePeriodForClient(userAgent string) time.Duration {
	if IsMobileClient(userAgent) {
		return mobileGracePeriod
	}
	return sessionGracePeriod
}
