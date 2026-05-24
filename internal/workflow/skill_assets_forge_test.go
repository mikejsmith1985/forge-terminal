// skill_assets_forge_test.go verifies that the Forge MCP tool skill files
// are correctly embedded and contain the expected skill identifiers.
// This prevents accidental empty-string or missing-file regressions.
package workflow

import (
	"strings"
	"testing"
)

// TestForgeSkillAssetsAreNonEmpty confirms that each embedded skill file
// was found and compiled into the binary with meaningful content.
func TestForgeSkillAssetsAreNonEmpty(t *testing.T) {
	skillAssets := map[string]string{
		"forge-vault":                  forgeVaultSkill,
		"adaptive-build-environments":  adaptiveBuildEnvSkill,
		"forge-release-process":        forgeReleaseProcessSkill,
		"sequential-tasks":             sequentialTasksSkill,
	}

	for skillName, skillContent := range skillAssets {
		if len(skillContent) == 0 {
			t.Errorf("skill %q embedded as empty string — check assets/skills/%s/SKILL.md", skillName, skillName)
		}
	}
}

// TestForgeSkillAssetsContainFrontmatter verifies that each embedded skill
// begins with YAML frontmatter so Copilot CLI can parse the name/description.
func TestForgeSkillAssetsContainFrontmatter(t *testing.T) {
	skillAssets := map[string]string{
		"forge-vault":                 forgeVaultSkill,
		"adaptive-build-environments": adaptiveBuildEnvSkill,
		"forge-release-process":       forgeReleaseProcessSkill,
		"sequential-tasks":            sequentialTasksSkill,
	}

	for skillName, skillContent := range skillAssets {
		if !strings.HasPrefix(skillContent, "---") {
			t.Errorf("skill %q does not start with YAML frontmatter (---); Copilot CLI may not parse it correctly", skillName)
		}
		if !strings.Contains(skillContent, "name:") {
			t.Errorf("skill %q frontmatter is missing the 'name:' field", skillName)
		}
	}
}

// TestForgeSkillModulesRegisteredInTemplateMap verifies that every new Forge
// MCP module ID has a corresponding entry in the skillTemplates map, which
// the scaffold engine uses when generating SKILL.md files for projects.
func TestForgeSkillModulesRegisteredInTemplateMap(t *testing.T) {
	requiredModules := []ModuleID{
		ModuleForgeVault,
		ModuleAdaptiveBuildEnv,
		ModuleForgeReleaseProcess,
		ModuleSequentialTasks,
	}

	for _, moduleID := range requiredModules {
		content, exists := skillTemplates[moduleID]
		if !exists {
			t.Errorf("module %q is not registered in skillTemplates — RenderSkill will fail for this module", moduleID)
			continue
		}
		if len(content) == 0 {
			t.Errorf("skillTemplates[%q] is empty — check skill_assets_forge.go embed directives", moduleID)
		}
	}
}

// TestForgeSkillModulesInDefaultConfig verifies that the four Forge MCP tool
// modules are enabled by default so every scaffolded project receives them.
func TestForgeSkillModulesInDefaultConfig(t *testing.T) {
	defaultCfg := DefaultConfig()

	requiredModules := []ModuleID{
		ModuleForgeVault,
		ModuleAdaptiveBuildEnv,
		ModuleForgeReleaseProcess,
		ModuleSequentialTasks,
	}

	for _, moduleID := range requiredModules {
		if !defaultCfg.HasModule(moduleID) {
			t.Errorf("module %q is not in DefaultConfig().EnabledModules — new projects will not receive this skill", moduleID)
		}
	}
}
