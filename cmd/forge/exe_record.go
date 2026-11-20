// exe_record.go — records where this Forge binary lives so outside tools can start it.
//
// Why: Forge is often run straight from a download folder rather than an
// installer, so there is no fixed install path. The Claude Desktop MCP bridge
// (mcp-forge-vault) reads this record to launch Forge when it is not running.
package main

import (
	"errors"
	"log"
	"os"
	"path/filepath"
)

// executableRecordFilename is the file under ~/.forge holding the binary's path.
const executableRecordFilename = "forge-exe"

// executableRecordPermissions lets the user read and write the record; others read only.
const executableRecordPermissions = 0644

// recordExecutablePath writes executablePath into forgeDir so the MCP bridge can
// find and start this exact binary later. It replaces any older record.
func recordExecutablePath(forgeDir string, executablePath string) error {
	if executablePath == "" {
		return errors.New("executable path is empty")
	}
	recordPath := filepath.Join(forgeDir, executableRecordFilename)
	return os.WriteFile(recordPath, []byte(executablePath+"\n"), executableRecordPermissions)
}

// recordRunningExecutable records the running binary's resolved path, skipping
// dev builds so a throwaway build never becomes the one the bridge launches.
func recordRunningExecutable(forgeDir string, isDevMode bool) {
	if isDevMode {
		return
	}
	executablePath, pathErr := os.Executable()
	if pathErr != nil {
		log.Printf("[Forge] Could not resolve own executable for the MCP bridge: %v", pathErr)
		return
	}
	if resolvedPath, resolveErr := filepath.EvalSymlinks(executablePath); resolveErr == nil {
		executablePath = resolvedPath
	}
	if recordErr := recordExecutablePath(forgeDir, executablePath); recordErr != nil {
		log.Printf("[Forge] Could not record executable path for the MCP bridge: %v", recordErr)
	}
}
