package main

import "testing"

func TestIsHookBypass_BlocksCommitNoVerify(t *testing.T) {
	cases := []struct {
		name   string
		args   []string
		expect bool
	}{
		{"commit --no-verify", []string{"commit", "--no-verify", "-m", "msg"}, true},
		{"commit -n shorthand", []string{"commit", "-n", "-m", "msg"}, true},
		{"push --no-verify", []string{"push", "--no-verify", "origin", "main"}, true},
		{"push -n is dry-run, not blocked", []string{"push", "-n", "origin", "main"}, false},
		{"normal commit passes", []string{"commit", "-m", "feat: add thing"}, false},
		{"normal push passes", []string{"push", "origin", "main"}, false},
		{"status is never blocked", []string{"status"}, false},
		{"--no-verify without commit/push passes", []string{"tag", "--no-verify", "v1"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isHookBypass(tc.args)
			if got != tc.expect {
				t.Errorf("isHookBypass(%v) = %v, want %v", tc.args, got, tc.expect)
			}
		})
	}
}

func TestFirstSubcommand(t *testing.T) {
	cases := []struct {
		args   []string
		expect string
	}{
		{[]string{"commit", "-m", "msg"}, "commit"},
		{[]string{"push", "origin", "main"}, "push"},
		{[]string{"status"}, "status"},
		{[]string{}, ""},
	}

	for _, tc := range cases {
		got := firstSubcommand(tc.args)
		if got != tc.expect {
			t.Errorf("firstSubcommand(%v) = %q, want %q", tc.args, got, tc.expect)
		}
	}
}
