package assistant

import (
	"strings"
	"testing"
)

func TestNewKnowledgeBase(t *testing.T) {
	kb := NewKnowledgeBase()

	if kb == nil {
		t.Fatal("NewKnowledgeBase returned nil")
	}

	if kb.Version != "1.21.7" {
		t.Errorf("Expected version 1.21.7, got %s", kb.Version)
	}

	if len(kb.Features) == 0 {
		t.Fatal("Knowledge base has no features")
	}

	if kb.SystemPrompt == "" {
		t.Fatal("System prompt is empty")
	}
}

func TestKnowledgeBaseFeatures(t *testing.T) {
	kb := NewKnowledgeBase()

	tests := []struct {
		featureName string
		shouldExist bool
	}{
		{"Full PTY Terminal", true},
		{"Multi-Tab Support", true},
		{"Command Cards", true},
		{"Forge Assistant", true},
		{"Vision Detection", true},
		{"AM (Artificial Memory)", true},
		{"NonexistentFeature", false},
	}

	for _, test := range tests {
		feature := kb.GetFeature(test.featureName)
		if test.shouldExist && feature == nil {
			t.Errorf("Expected to find feature %q but didn't", test.featureName)
		}
		if !test.shouldExist && feature != nil {
			t.Errorf("Expected not to find feature %q but did", test.featureName)
		}
	}
}

func TestGetFeatureCaseInsensitive(t *testing.T) {
	kb := NewKnowledgeBase()

	// Test case-insensitive lookup
	feature := kb.GetFeature("full pty terminal")
	if feature == nil {
		t.Error("Case-insensitive lookup failed for 'full pty terminal'")
	}

	feature2 := kb.GetFeature("FULL PTY TERMINAL")
	if feature2 == nil {
		t.Error("Case-insensitive lookup failed for 'FULL PTY TERMINAL'")
	}
}

func TestListFeaturesByCategory(t *testing.T) {
	kb := NewKnowledgeBase()

	tests := []struct {
		category       string
		minExpected    int
		expectedFeatures []string
	}{
		{"Core Terminal", 4, []string{"Full PTY Terminal", "Multi-Tab Support"}},
		{"Command Cards", 5, []string{"Command Cards", "Keyboard Shortcuts for Cards"}},
		{"Theming", 4, []string{"10 Color Themes"}},
		{"Experimental Features", 3, []string{"Forge Assistant", "Vision Detection"}},
	}

	for _, test := range tests {
		features := kb.ListFeaturesByCategory(test.category)
		if len(features) < test.minExpected {
			t.Errorf("Category %q: expected at least %d features, got %d",
				test.category, test.minExpected, len(features))
		}

		// Check that some expected features are in the list
		for _, expected := range test.expectedFeatures {
			found := false
			for _, f := range features {
				if f.Name == expected {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("Category %q: expected to find feature %q", test.category, expected)
			}
		}
	}
}

func TestGetCategories(t *testing.T) {
	kb := NewKnowledgeBase()

	categories := kb.GetCategories()
	if len(categories) == 0 {
		t.Fatal("GetCategories returned empty list")
	}

	// Verify known categories exist
	knownCategories := map[string]bool{
		"Core Terminal":              false,
		"Command Cards":              false,
		"Theming":                    false,
		"Experimental Features":      false,
		"Windows Features":           false,
		"Quality of Life":            false,
		"Security & File Access":     false,
	}

	for _, cat := range categories {
		if _, ok := knownCategories[cat]; ok {
			knownCategories[cat] = true
		}
	}

	for cat, found := range knownCategories {
		if !found {
			t.Errorf("Expected category %q not found", cat)
		}
	}
}

func TestSystemPromptContent(t *testing.T) {
	kb := NewKnowledgeBase()
	prompt := kb.GetSystemPrompt()

	// Verify key sections exist
	checks := []struct {
		section string
		content string
	}{
		{"Title", "Forge Assistant"},
		{"Version", "1.21.7"},
		{"Features", "CORE FEATURES"},
		{"Shortcuts", "Ctrl+T"},
		{"Workflows", "Creating a Command Card"},
		{"Troubleshooting", "TROUBLESHOOTING"},
		{"Guidelines", "BEHAVIOR GUIDELINES"},
	}

	for _, check := range checks {
		if !strings.Contains(prompt, check.content) {
			t.Errorf("System prompt missing %q section (should contain %q)", check.section, check.content)
		}
	}
}

func TestSystemPromptMentionsForgeFeatures(t *testing.T) {
	kb := NewKnowledgeBase()
	prompt := kb.GetSystemPrompt()

	// Verify major features are mentioned
	features := []string{
		"Command Cards",
		"Session Persistence",
		"Terminal Search",
		"Auto-Updates",
		"AM (Artificial Memory)",
		"Vision Detection",
		"Forge Assistant",
	}

	for _, feature := range features {
		if !strings.Contains(prompt, feature) {
			t.Errorf("System prompt doesn't mention feature: %q", feature)
		}
	}
}

func TestFeatureHasDescription(t *testing.T) {
	kb := NewKnowledgeBase()

	for _, feature := range kb.Features {
		if feature.Name == "" {
			t.Error("Feature with empty name found")
		}
		if feature.Description == "" {
			t.Errorf("Feature %q has empty description", feature.Name)
		}
		if feature.Category == "" {
			t.Errorf("Feature %q has empty category", feature.Name)
		}
	}
}

func TestKnowledgeBaseCoverage(t *testing.T) {
	kb := NewKnowledgeBase()

	if len(kb.Features) < 20 {
		t.Errorf("Knowledge base should have at least 20 features, has %d", len(kb.Features))
	}

	// Verify we have features from each major category
	categories := kb.GetCategories()
	if len(categories) < 5 {
		t.Errorf("Should have at least 5 categories, have %d", len(categories))
	}
}

func BenchmarkNewKnowledgeBase(b *testing.B) {
	for i := 0; i < b.N; i++ {
		NewKnowledgeBase()
	}
}

func BenchmarkGetSystemPrompt(b *testing.B) {
	kb := NewKnowledgeBase()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = kb.GetSystemPrompt()
	}
}
