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
