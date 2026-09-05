// mcp_project_path.go — telling MCP tools which project the developer is in.
//
// Forge binds every terminal session to its repository already, for the SDD
// pipeline. That binding is the answer to a question the MCP layer had been
// answering badly: which project should a tool write to?
//
// It had been answering "the Forge process's working directory", which is where
// Forge was *launched* rather than where the developer is *working*. Opened from
// a Windows shortcut that is C:\WINDOWS\system32, so the gate ledger and the
// brief store both tried to write there and were refused by the operating
// system. The agent saw "Access is denied" and had no way to know the real
// problem was Forge pointing somewhere else entirely.
//
// Nothing new is tracked here. The bindings already exist; this reads them.
package main

import (
	"os"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

// anyBoundRepository returns a repository some terminal session is bound to.
//
// Returns empty when nothing is bound, which is the ordinary state before the
// developer opens a tab in a project. The caller falls back rather than failing.
//
// When several sessions are bound to different repositories this picks one of
// them, and that is a genuine limitation rather than an oversight: the MCP
// request carries no session, so there is nothing to disambiguate with. It is
// still a large improvement on the previous answer, which was a directory no
// developer ever works in. The narrower fix — carrying the session on the
// request — is worth doing separately and is noted in the CHANGELOG.
func anyBoundRepository() string {
	var boundRepoRoot string

	sddPipelines.Range(func(_, value any) bool {
		pipeline, isPipeline := value.(*sddPipeline)
		if !isPipeline || pipeline.repoRoot == "" {
			return true
		}
		boundRepoRoot = pipeline.repoRoot
		return false // one is enough
	})

	return boundRepoRoot
}

// sessionBoundRepository returns the repository one specific tab is bound to.
//
// This is the disambiguation anyBoundRepository cannot do. Every tab sitting
// in a repository is bound to it by the frontend, keyed by the same id Forge
// exports into that tab as FORGE_SESSION_ID — so an agent that passes its
// session names its project exactly, however many are open.
func sessionBoundRepository(sessionID string) string {
	pipeline, isBound := sddPipelineFor(sessionID)
	if !isBound {
		return ""
	}
	return pipeline.repoRoot
}

// newMcpSessionProjectPathResolver builds the session-aware resolver the
// project-writing tools call, falling back to the session-blind one.
func newMcpSessionProjectPathResolver() func(sessionID string) string {
	return mcp.NewSessionProjectPathResolver(sessionBoundRepository, newMcpProjectPathResolver())
}

// resolveProjectPathForSession answers, for one request, which project a tab
// is working in. Built fresh per call because the process directory it falls
// back to is read at construction.
func resolveProjectPathForSession(sessionID string) string {
	return newMcpSessionProjectPathResolver()(sessionID)
}

// newMcpProjectPathResolver builds what MCP tools call to find their project.
//
// Wired at startup, asked at call time — the developer changes tabs, and the
// right project changes with them.
func newMcpProjectPathResolver() func() string {
	processDirectory, err := os.Getwd()
	if err != nil {
		processDirectory = ""
	}

	return mcp.NewProjectPathResolver(anyBoundRepository, processDirectory)
}
