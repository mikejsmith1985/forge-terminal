//go:build !windows

// environment_runner_directory_unix_test.go - the shell command that prints the working directory under bash.
package mcp

// printWorkingDirectoryCommand prints the current directory under bash.
func printWorkingDirectoryCommand() string { return "pwd" }
