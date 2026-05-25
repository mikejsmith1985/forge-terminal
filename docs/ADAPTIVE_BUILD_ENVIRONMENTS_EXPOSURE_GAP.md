# Adaptive Build Environments: MCP Tool Exposure

## Status: Resolved for Forge Terminal Copilot CLI sessions

Forge's adaptive environment tools are implemented in the MCP server with raw
names (`environment_detect`, `environment_run`) and are callable from Copilot CLI
through the configured MCP server namespace (`forge-vault-environment_detect`,
`forge-vault-environment_run`).

## Callable names

| Context | Detection tool | Run tool |
|---------|----------------|----------|
| Copilot CLI in Forge Terminal | `forge-vault-environment_detect` | `forge-vault-environment_run` |
| Raw MCP request to `POST /api/mcp` | `environment_detect` | `environment_run` |
| No MCP tool surface | `forge-env` CLI fallback | `forge-env` CLI fallback |

Agents must use the names shown in their current tool surface. Missing short
aliases do not mean the feature is unavailable when the `forge-vault-*` tools
are present.

## Fallback

When neither namespaced nor raw MCP adaptive tools are available, use the
standalone `forge-env` command:

```powershell
forge-env --command "npm install && npm run build" --environment auto --cwd "C:\ProjectsWin\my-site\website" --timeout 480
```

## Relevant implementation

- `internal/mcp/tools_environment.go` registers `environment_detect` and `environment_run`.
- `mcp-forge-vault/index.js` bridges Copilot-compatible stdio MCP clients to Forge's HTTP MCP server.
- `.mcp.json` names that bridge `forge-vault`, which is why Copilot CLI exposes namespaced callable tools.
- `.github/skills/adaptive-build-environments/SKILL.md` and `internal/workflow/assets/skills/adaptive-build-environments/SKILL.md` document both the namespaced tool names and the `forge-env` fallback.
