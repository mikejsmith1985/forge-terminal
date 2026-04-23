package main

import "testing"

// TestResolveSelectedProvider verifies the preference order: explicit user
// choice wins first, then Tailscale if available, then Cloudflare. We test
// the pure decision function because the live probes (detectTailscale /
// detectCloudflare) shell out to real binaries and are covered by manual
// smoke tests rather than unit tests.
func TestResolveSelectedProvider(t *testing.T) {
	cases := []struct {
		name         string
		explicit     string
		tailscaleOK  bool
		cloudflareOK bool
		wantProvider string
		wantExplicit bool
	}{
		{"explicit tailscale wins even when unavailable", "tailscale", false, true, "tailscale", true},
		{"explicit cloudflare-named maps to cloudflare", "cloudflare-named", false, false, "cloudflare", true},
		{"explicit cloudflare literal", "cloudflare", false, false, "cloudflare", true},
		{"auto prefers tailscale when both available", "", true, true, "tailscale", false},
		{"auto falls back to cloudflare when only it is available", "", false, true, "cloudflare", false},
		{"auto returns empty when neither available", "", false, false, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, isExplicit := resolveSelectedProvider(tc.explicit, tc.tailscaleOK, tc.cloudflareOK)
			if got != tc.wantProvider {
				t.Errorf("provider = %q, want %q", got, tc.wantProvider)
			}
			if isExplicit != tc.wantExplicit {
				t.Errorf("explicit = %v, want %v", isExplicit, tc.wantExplicit)
			}
		})
	}
}
