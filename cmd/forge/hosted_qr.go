package main

import (
	"fmt"
	"io"
	"net/url"
	"strings"
)

// BuildHostedURL constructs the full access URL with optional token param.
func BuildHostedURL(baseURL, token string) string {
	if token == "" {
		return baseURL
	}
	return baseURL + "?token=" + token
}

// BuildCompanionDeepLink returns the full companion PWA URL with the
// Forge URL + token encoded in the hash fragment, matching the format
// the companion service worker consumes.
//
// Shape: <tunnelURL>/companion/#forge=<url-encoded-tunnel>&token=<url-encoded-token>
//
// Why the hash fragment:
//   - It never traverses the network (browsers don't send it to servers),
//     so the token isn't captured in Cloudflare / Render access logs.
//   - A page refresh inside the companion keeps the credentials alive
//     without needing a second QR scan.
//
// tunnelURL should be a bare origin ("https://forge.example.com" or
// "https://abc.trycloudflare.com") — not already suffixed with a path.
// Empty tunnelURL returns "" so callers can fall back to plain QR.
func BuildCompanionDeepLink(tunnelURL, token string) string {
	if tunnelURL == "" {
		return ""
	}
	base := strings.TrimRight(tunnelURL, "/") + "/companion/"
	if token == "" {
		return base + "#forge=" + url.QueryEscape(tunnelURL)
	}
	return base + "#forge=" + url.QueryEscape(tunnelURL) +
		"&token=" + url.QueryEscape(token)
}

// BuildPlainForgeURL returns just the tunnel origin (optionally with
// ?token=...). Suitable for the desktop-browser "Copy URL" button when
// the user wants to open Forge in a normal tab rather than the PWA.
func BuildPlainForgeURL(tunnelURL, token string) string {
	return BuildHostedURL(tunnelURL, token)
}

// PrintHostedAccessInfo prints the QR code and access info to the given writer.
func PrintHostedAccessInfo(w io.Writer, tunnelURL, token string) {
	// The QR encodes the companion deep-link so scanning opens the PWA
	// with credentials pre-loaded. Desktop users who prefer a plain
	// browser tab still get the hostname printed below for copy-paste.
	fullURL := BuildCompanionDeepLink(tunnelURL, token)
	if fullURL == "" {
		fullURL = BuildHostedURL(tunnelURL, token)
	}

	fmt.Fprintf(w, "\n")
	fmt.Fprintf(w, "╔══════════════════════════════════════════╗\n")
	fmt.Fprintf(w, "║     📱 Forge Mobile Access Ready         ║\n")
	fmt.Fprintf(w, "╚══════════════════════════════════════════╝\n")
	fmt.Fprintf(w, "\n")

	// Generate and print QR code
	qr, err := GenerateTerminalQR(fullURL)
	if err == nil {
		fmt.Fprint(w, qr)
		fmt.Fprintf(w, "\n")
	}

	fmt.Fprintf(w, "  URL: %s\n", tunnelURL)
	if token != "" {
		fmt.Fprintf(w, "  Token: %s\n", token)
		fmt.Fprintf(w, "  Companion deep link: %s\n", fullURL)
	}
	fmt.Fprintf(w, "\n")
	fmt.Fprintf(w, "  Scan the QR code or open the URL on your phone.\n")
	fmt.Fprintf(w, "\n")
}
