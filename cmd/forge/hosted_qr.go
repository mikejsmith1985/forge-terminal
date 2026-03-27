package main

import (
	"fmt"
	"io"
)

// BuildHostedURL constructs the full access URL with optional token param.
func BuildHostedURL(baseURL, token string) string {
	if token == "" {
		return baseURL
	}
	return baseURL + "?token=" + token
}

// PrintHostedAccessInfo prints the QR code and access info to the given writer.
func PrintHostedAccessInfo(w io.Writer, tunnelURL, token string) {
	fullURL := BuildHostedURL(tunnelURL, token)

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
		fmt.Fprintf(w, "  Full URL (with auth): %s\n", fullURL)
	}
	fmt.Fprintf(w, "\n")
	fmt.Fprintf(w, "  Scan the QR code or open the URL on your phone.\n")
	fmt.Fprintf(w, "\n")
}
