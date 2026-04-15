// main_test.go — Unit tests for the main entry point utility functions.
package main

import "testing"

func TestSplitLines_Unix(t *testing.T) {
	result := splitLines("a\nb\nc")
	if len(result) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(result))
	}
}

func TestSplitLines_Windows(t *testing.T) {
	result := splitLines("a\r\nb\r\nc")
	if len(result) != 3 || result[0] != "a" {
		t.Errorf("unexpected: %v", result)
	}
}

func TestSplitLines_Empty(t *testing.T) {
	if len(splitLines("")) != 0 {
		t.Error("expected 0 lines for empty input")
	}
}

func TestTrimWhitespace_Cases(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  hello  ", "hello"},
		{"\thello\t", "hello"},
		{"", ""},
	}
	for _, c := range cases {
		if got := trimWhitespace(c.in); got != c.want {
			t.Errorf("trimWhitespace(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIndexOf_Found(t *testing.T) {
	if indexOf("key=val", '=') != 3 {
		t.Error("expected index 3")
	}
}

func TestIndexOf_NotFound(t *testing.T) {
	if indexOf("keyval", '=') != -1 {
		t.Error("expected -1")
	}
}
