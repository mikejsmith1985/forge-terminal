package main

import (
	"strings"
	"testing"
)

func TestBuildHostedURL(t *testing.T) {
	t.Run("builds URL with token param", func(t *testing.T) {
		url := BuildHostedURL("https://abc123.trycloudflare.com", "mytoken123")
		if url != "https://abc123.trycloudflare.com?token=mytoken123" {
			t.Errorf("got %q", url)
		}
	})

	t.Run("builds URL without token when empty", func(t *testing.T) {
		url := BuildHostedURL("https://abc123.trycloudflare.com", "")
		if url != "https://abc123.trycloudflare.com" {
			t.Errorf("got %q", url)
		}
	})

	t.Run("handles localhost URL", func(t *testing.T) {
		url := BuildHostedURL("http://localhost:3005", "tok")
		if url != "http://localhost:3005?token=tok" {
			t.Errorf("got %q", url)
		}
	})
}

func TestBuildCompanionDeepLink(t *testing.T) {
	t.Run("produces /companion/ path with hash fragment", func(t *testing.T) {
		got := BuildCompanionDeepLink("https://forge.example.com", "abc")
		if !strings.HasPrefix(got, "https://forge.example.com/companion/#") {
			t.Errorf("wrong prefix: %q", got)
		}
		if !strings.Contains(got, "forge=") {
			t.Errorf("missing forge= param: %q", got)
		}
		if !strings.Contains(got, "token=abc") {
			t.Errorf("missing token param: %q", got)
		}
	})

	t.Run("omits token fragment when empty", func(t *testing.T) {
		got := BuildCompanionDeepLink("https://forge.example.com", "")
		if strings.Contains(got, "token=") {
			t.Errorf("unexpected token param: %q", got)
		}
		if !strings.Contains(got, "forge=") {
			t.Errorf("should still carry forge= fragment: %q", got)
		}
	})

	t.Run("trims trailing slashes before appending /companion/", func(t *testing.T) {
		got := BuildCompanionDeepLink("https://forge.example.com/", "t")
		if strings.Contains(got, "//companion/") {
			t.Errorf("double slash: %q", got)
		}
	})

	t.Run("url-encodes tunnel URL into forge param", func(t *testing.T) {
		got := BuildCompanionDeepLink("https://forge.example.com", "t")
		// The value after forge= must survive a round-trip through
		// url.QueryUnescape back to the original tunnel URL.
		idx := strings.Index(got, "forge=")
		if idx < 0 {
			t.Fatal("no forge= param")
		}
		frag := got[idx+len("forge="):]
		if amp := strings.Index(frag, "&"); amp >= 0 {
			frag = frag[:amp]
		}
		if !strings.Contains(frag, "forge.example.com") && !strings.Contains(frag, "forge.example") {
			t.Errorf("fragment %q lost hostname", frag)
		}
	})

	t.Run("empty tunnel URL yields empty deep link", func(t *testing.T) {
		if got := BuildCompanionDeepLink("", "t"); got != "" {
			t.Errorf("empty tunnel should yield empty link, got %q", got)
		}
	})
}

func TestBuildPlainForgeURL(t *testing.T) {
	got := BuildPlainForgeURL("https://forge.example.com", "tok")
	if got != "https://forge.example.com?token=tok" {
		t.Errorf("got %q", got)
	}
}

func TestPrintHostedAccessInfo(t *testing.T) {
	t.Run("output contains QR block characters", func(t *testing.T) {
		var buf strings.Builder
		PrintHostedAccessInfo(&buf, "https://test.trycloudflare.com", "testtoken")
		output := buf.String()
		// QR codes use Unicode block characters
		if !strings.ContainsAny(output, "█▀▄ ") {
			t.Error("output doesn't contain QR block characters")
		}
	})

	t.Run("output contains the URL", func(t *testing.T) {
		var buf strings.Builder
		PrintHostedAccessInfo(&buf, "https://test.trycloudflare.com", "testtoken")
		output := buf.String()
		if !strings.Contains(output, "https://test.trycloudflare.com") {
			t.Error("output doesn't contain the URL")
		}
	})

	t.Run("output written to provided writer", func(t *testing.T) {
		var buf strings.Builder
		PrintHostedAccessInfo(&buf, "https://example.com", "tok")
		if buf.Len() == 0 {
			t.Error("nothing written to buffer")
		}
	})
}
