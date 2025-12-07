package llm

import "testing"

func TestDetectCommand(t *testing.T) {
tests := []struct {
input    string
expected bool
provider Provider
}{
{"copilot", true, ProviderGitHubCopilot},
{"claude", true, ProviderClaude},
{"copilot --help", false, ProviderUnknown},
{"gh copilot", false, ProviderUnknown},
{"ls -la", false, ProviderUnknown},
{"cd /home", false, ProviderUnknown},
{"  copilot  ", true, ProviderGitHubCopilot}, // with whitespace
{"  claude  ", true, ProviderClaude},
}

for _, tt := range tests {
t.Run(tt.input, func(t *testing.T) {
result := DetectCommand(tt.input)
if result.Detected != tt.expected {
t.Errorf("DetectCommand(%q).Detected = %v, want %v", 
tt.input, result.Detected, tt.expected)
}
if result.Detected && result.Provider != tt.provider {
t.Errorf("DetectCommand(%q).Provider = %v, want %v", 
tt.input, result.Provider, tt.provider)
}
})
}
}
