// skill_assets_forge.go embeds the Forge MCP Tool skill files at compile time.
// These skills teach AI agents how to use Forge Terminal's built-in MCP tools
// (Forge Vault credential access, adaptive build environments, the local release
// pipeline, and sequential-task discipline). They are included in every project
// scaffolded by the workflow engine so agents are always aware of Forge tooling.
package workflow

import _ "embed"

//go:embed assets/skills/forge-vault/SKILL.md
var forgeVaultSkill string

//go:embed assets/skills/adaptive-build-environments/SKILL.md
var adaptiveBuildEnvSkill string

//go:embed assets/skills/forge-release-process/SKILL.md
var forgeReleaseProcessSkill string

//go:embed assets/skills/sequential-tasks/SKILL.md
var sequentialTasksSkill string
