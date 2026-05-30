// secretscan_test.go — tests for heuristic secret detection in free-text fields.
package vault

import "testing"

// TestScanForSecretInText_Positives covers inputs that should be flagged as
// likely containing a secret.
func TestScanForSecretInText_Positives(t *testing.T) {
	positiveCases := []struct {
		name string
		text string
	}{
		{name: "login URL with embedded password query", text: "https://dev.service-now.com/login.do?user_name=admin&user_password=Hunter2!"},
		{name: "URL with userinfo credentials", text: "connect at https://admin:s3cr3tP%40ss@db.internal/login"},
		{name: "OpenAI-style secret key", text: "key is sk-abcdEFGH1234ijklMNOP5678qrst"},
		{name: "GitHub personal access token", text: "ghp_ABCDEFghijkl0123456789MNOPqrstuvwx"},
		{name: "raw 40-char hex blob", text: "0123456789abcdef0123456789abcdef01234567"},
		{name: "PEM private key header", text: "-----BEGIN RSA PRIVATE KEY-----"},
	}

	for _, testCase := range positiveCases {
		t.Run(testCase.name, func(t *testing.T) {
			isSuspicious, reason := ScanForSecretInText(testCase.text)
			if !isSuspicious {
				t.Errorf("expected %q to be flagged as secret-like", testCase.text)
			}
			if reason == "" {
				t.Error("a flagged input must include a human-readable reason")
			}
		})
	}
}

// TestScanForSecretInText_Negatives covers ordinary descriptions that must NOT be
// flagged, so the warning stays useful and low-noise.
func TestScanForSecretInText_Negatives(t *testing.T) {
	negativeCases := []struct {
		name string
		text string
	}{
		{name: "ordinary description", text: "Used for code generation tasks"},
		{name: "short label", text: "ServiceNow dev admin"},
		{name: "plain login URL without credentials", text: "https://service.example.com/login"},
		{name: "empty string", text: ""},
		{name: "whitespace only", text: "   "},
	}

	for _, testCase := range negativeCases {
		t.Run(testCase.name, func(t *testing.T) {
			isSuspicious, _ := ScanForSecretInText(testCase.text)
			if isSuspicious {
				t.Errorf("expected %q NOT to be flagged", testCase.text)
			}
		})
	}
}
