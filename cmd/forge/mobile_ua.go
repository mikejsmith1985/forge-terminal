// mobile_ua.go — User-Agent detection for the mobile-first redirect.
//
// When a phone or tablet hits the bare Forge URL (e.g. via a Cloudflare
// tunnel hostname), we want it to land on the Companion PWA at
// /companion/ instead of the auth-protected desktop terminal.  The
// detection is intentionally conservative — only well-known mobile
// User-Agent tokens trigger the redirect so a desktop developer testing
// from devtools (with a custom UA) is not surprised.

package main

import "strings"

// MOBILE_UA_TOKENS lists the User-Agent fragments that indicate a request
// came from a phone or tablet form-factor browser.  Order does not
// matter — we do a case-insensitive contains check across all of them.
//
// Notes on the chosen tokens:
//   - "Mobi" is the official W3C-recommended marker; "Mobile" covers
//     older user agents that emit the long form.
//   - "Android" alone does not always imply mobile (Android tablets
//     omit "Mobile" but identify as Android), so we include it
//     explicitly to catch tablets too.
//   - "iPhone" / "iPad" / "iPod" cover iOS Safari and in-app browsers.
var MOBILE_UA_TOKENS = []string{
	"Mobi",
	"Mobile",
	"Android",
	"iPhone",
	"iPad",
	"iPod",
}

// isMobileUserAgent returns true when the request UA looks like it came
// from a phone or tablet.  An empty UA returns false so server-to-server
// callers (curl, monitoring) keep hitting the desktop UI.
func isMobileUserAgent(userAgent string) bool {
	if userAgent == "" {
		return false
	}
	lowered := strings.ToLower(userAgent)
	for _, token := range MOBILE_UA_TOKENS {
		if strings.Contains(lowered, strings.ToLower(token)) {
			return true
		}
	}
	return false
}
