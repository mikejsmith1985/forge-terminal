// main_git_version_test validates git tag version selection for release workflows.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeSemverGitTag_SupportsOptionalVPrefix(t *testing.T) {
	testCases := []struct {
		name             string
		rawTag           string
		expectedTag      string
		expectedIsUsable bool
	}{
		{
			name:             "normalizes tag without v prefix",
			rawTag:           "0.13.2",
			expectedTag:      "v0.13.2",
			expectedIsUsable: true,
		},
		{
			name:             "keeps tag with v prefix",
			rawTag:           "v0.13.2",
			expectedTag:      "v0.13.2",
			expectedIsUsable: true,
		},
		{
			name:             "rejects non semver format",
			rawTag:           "release-0.13.2",
			expectedTag:      "",
			expectedIsUsable: false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			normalizedTag, isUsable := normalizeSemverGitTag(testCase.rawTag)
			if isUsable != testCase.expectedIsUsable {
				t.Fatalf("expected usability %t for %q, got %t", testCase.expectedIsUsable, testCase.rawTag, isUsable)
			}
			if normalizedTag != testCase.expectedTag {
				t.Fatalf("expected normalized tag %q, got %q", testCase.expectedTag, normalizedTag)
			}
		})
	}
}

func TestGetHighestSemverGitTagForPath_FindsTagOutsideHeadAncestry(t *testing.T) {
	if _, lookupError := exec.LookPath("git"); lookupError != nil {
		t.Skipf("git not available: %v", lookupError)
	}

	repositoryPath := t.TempDir()
	initializeGitRepository(t, repositoryPath)

	defaultBranch := runGitCommand(t, repositoryPath, "branch", "--show-current")
	runGitCommand(t, repositoryPath, "tag", "v0.12.47")

	runGitCommand(t, repositoryPath, "checkout", "-b", "feature/external-release-tag")
	writeFileAndCommit(t, repositoryPath, "release.txt", "feature release tag marker")
	runGitCommand(t, repositoryPath, "tag", "0.13.2")

	runGitCommand(t, repositoryPath, "checkout", defaultBranch)
	describeTagFromHead := runGitCommand(t, repositoryPath, "describe", "--tags", "--abbrev=0")
	if describeTagFromHead != "v0.12.47" {
		t.Fatalf("expected git describe to return reachable older tag v0.12.47, got %q", describeTagFromHead)
	}

	latestGlobalTag, latestTagError := getHighestSemverGitTagForPath(repositoryPath)
	if latestTagError != nil {
		t.Fatalf("expected global highest tag query to succeed, got error: %v", latestTagError)
	}
	if latestGlobalTag != "v0.13.2" {
		t.Fatalf("expected global highest semver tag v0.13.2, got %q", latestGlobalTag)
	}
}

func initializeGitRepository(t *testing.T, repositoryPath string) {
	t.Helper()

	runGitCommand(t, repositoryPath, "init")
	runGitCommand(t, repositoryPath, "config", "user.email", "forge-test@example.com")
	runGitCommand(t, repositoryPath, "config", "user.name", "Forge Test")
	writeFileAndCommit(t, repositoryPath, "README.md", "initial content")
}

func writeFileAndCommit(t *testing.T, repositoryPath, fileName, fileContents string) {
	t.Helper()

	filePath := filepath.Join(repositoryPath, fileName)
	writeError := os.WriteFile(filePath, []byte(fileContents), 0644)
	if writeError != nil {
		t.Fatalf("failed to write %s: %v", filePath, writeError)
	}

	runGitCommand(t, repositoryPath, "add", fileName)
	runGitCommand(t, repositoryPath, "commit", "-m", fmt.Sprintf("add %s", fileName))
}

func runGitCommand(t *testing.T, repositoryPath string, arguments ...string) string {
	t.Helper()

	command := exec.Command("git", arguments...)
	command.Dir = repositoryPath
	commandOutput, commandError := command.CombinedOutput()
	if commandError != nil {
		t.Fatalf("git %s failed: %v\noutput: %s", strings.Join(arguments, " "), commandError, strings.TrimSpace(string(commandOutput)))
	}

	return strings.TrimSpace(string(commandOutput))
}
