// tools_files.go implements the three Forge MCP file tools:
//
//   - file_read  — read a file's contents (with a 1 MiB cap)
//   - file_write — write content to a file (restricted to project root)
//   - file_list  — list a directory's children
//
// All three tools enforce a path safety check: the resolved absolute path must
// remain inside the configured project root. This prevents path traversal
// attacks that could expose or overwrite files outside the project.
package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ── Constants ────────────────────────────────────────────────────────────────

const (
	// fileReadSizeCap limits how many bytes file_read returns.
	// 1 MiB is generous for tool output but prevents reading multi-GB binary files.
	fileReadSizeCap = 1 * 1024 * 1024
)

// ── file_read ────────────────────────────────────────────────────────────────

// fileReadTool reads a file and returns its contents.
type fileReadTool struct {
	projectRoot string
}

func newFileReadTool(projectRoot string) ToolHandler {
	return &fileReadTool{projectRoot: projectRoot}
}

func (t *fileReadTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "file_read",
		Description: "Read the contents of a file inside the Forge Terminal project root. The path may be relative or absolute (must stay inside the root).",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"path": {
					"type": "string",
					"description": "Path to the file to read, relative to the project root or absolute."
				}
			},
			"required": ["path"]
		}`),
	}
}

func (t *fileReadTool) Execute(args map[string]any) (*CallToolResult, error) {
	safePath, err := resolveAndValidatePath(t.projectRoot, args)
	if err != nil {
		return errorContent(err.Error()), nil
	}

	info, statErr := os.Stat(safePath)
	if statErr != nil {
		return errorContent(fmt.Sprintf("cannot stat %q: %v", safePath, statErr)), nil
	}
	if info.IsDir() {
		return errorContent(fmt.Sprintf("%q is a directory — use file_list to browse it", safePath)), nil
	}
	if info.Size() > fileReadSizeCap {
		return errorContent(fmt.Sprintf(
			"file is too large (%d bytes) — maximum is %d bytes", info.Size(), fileReadSizeCap,
		)), nil
	}

	raw, readErr := os.ReadFile(safePath)
	if readErr != nil {
		return errorContent(fmt.Sprintf("reading %q: %v", safePath, readErr)), nil
	}

	return textContent(string(raw)), nil
}

// ── file_write ───────────────────────────────────────────────────────────────

// fileWriteTool writes content to a file, creating intermediate directories.
type fileWriteTool struct {
	projectRoot string
}

func newFileWriteTool(projectRoot string) ToolHandler {
	return &fileWriteTool{projectRoot: projectRoot}
}

func (t *fileWriteTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "file_write",
		Description: "Write content to a file inside the Forge Terminal project root. Creates parent directories if needed. Overwrites existing content.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"path": {
					"type": "string",
					"description": "Destination path, relative to the project root or absolute."
				},
				"content": {
					"type": "string",
					"description": "The text content to write."
				}
			},
			"required": ["path", "content"]
		}`),
	}
}

func (t *fileWriteTool) Execute(args map[string]any) (*CallToolResult, error) {
	safePath, err := resolveAndValidatePath(t.projectRoot, args)
	if err != nil {
		return errorContent(err.Error()), nil
	}

	rawContent, ok := args["content"]
	if !ok {
		return errorContent("content is required"), nil
	}
	contentStr, ok := rawContent.(string)
	if !ok {
		return errorContent("content must be a string"), nil
	}

	if mkdirErr := os.MkdirAll(filepath.Dir(safePath), 0755); mkdirErr != nil {
		return errorContent(fmt.Sprintf("creating parent directories for %q: %v", safePath, mkdirErr)), nil
	}

	if writeErr := os.WriteFile(safePath, []byte(contentStr), 0644); writeErr != nil {
		return errorContent(fmt.Sprintf("writing %q: %v", safePath, writeErr)), nil
	}

	return textContent(fmt.Sprintf("Written %d bytes to %s", len(contentStr), safePath)), nil
}

// ── file_list ────────────────────────────────────────────────────────────────

// fileListTool lists the contents of a directory.
type fileListTool struct {
	projectRoot string
}

func newFileListTool(projectRoot string) ToolHandler {
	return &fileListTool{projectRoot: projectRoot}
}

func (t *fileListTool) Definition() ToolDefinition {
	return ToolDefinition{
		Name:        "file_list",
		Description: "List the files and directories inside a given directory within the Forge Terminal project root.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"path": {
					"type": "string",
					"description": "Directory to list, relative to the project root or absolute. Defaults to project root if omitted."
				}
			},
			"required": []
		}`),
	}
}

func (t *fileListTool) Execute(args map[string]any) (*CallToolResult, error) {
	// path is optional for file_list — default to project root.
	if _, hasPath := args["path"]; !hasPath {
		args["path"] = "."
	}

	safePath, err := resolveAndValidatePath(t.projectRoot, args)
	if err != nil {
		return errorContent(err.Error()), nil
	}

	entries, readErr := os.ReadDir(safePath)
	if readErr != nil {
		return errorContent(fmt.Sprintf("listing %q: %v", safePath, readErr)), nil
	}

	type fileEntry struct {
		Name  string `json:"name"`
		IsDir bool   `json:"isDir"`
		Size  int64  `json:"size,omitempty"`
	}

	listing := make([]fileEntry, 0, len(entries))
	for _, entry := range entries {
		fe := fileEntry{Name: entry.Name(), IsDir: entry.IsDir()}
		if !entry.IsDir() {
			if info, infoErr := entry.Info(); infoErr == nil {
				fe.Size = info.Size()
			}
		}
		listing = append(listing, fe)
	}

	output, marshalErr := json.MarshalIndent(listing, "", "  ")
	if marshalErr != nil {
		return errorContent("serialising directory listing: " + marshalErr.Error()), nil
	}
	return textContent(string(output)), nil
}

// ── Shared Path Utilities ─────────────────────────────────────────────────────

// resolveAndValidatePath extracts the "path" key from args, resolves it to an
// absolute path, and verifies it stays inside the project root.
// Returns the safe absolute path or an error describing the rejection reason.
func resolveAndValidatePath(projectRoot string, args map[string]any) (string, error) {
	rawPath, ok := args["path"]
	if !ok {
		return "", fmt.Errorf("path is required")
	}
	pathStr, ok := rawPath.(string)
	if !ok {
		return "", fmt.Errorf("path must be a string")
	}

	// Resolve relative paths against the project root.
	if !filepath.IsAbs(pathStr) {
		pathStr = filepath.Join(projectRoot, pathStr)
	}

	cleanedPath := filepath.Clean(pathStr)
	cleanedRoot := filepath.Clean(projectRoot)

	if !strings.HasPrefix(cleanedPath, cleanedRoot+string(filepath.Separator)) &&
		cleanedPath != cleanedRoot {
		return "", fmt.Errorf(
			"path %q is outside the project root %q — access denied",
			cleanedPath, cleanedRoot,
		)
	}

	return cleanedPath, nil
}
