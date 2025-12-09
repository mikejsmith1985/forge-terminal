package vision

import (
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// CompilerErrorDetector detects compiler/interpreter errors in terminal output
type CompilerErrorDetector struct {
	mu       sync.RWMutex
	enabled  bool
	patterns map[string]*regexp.Regexp
}

// NewCompilerErrorDetector creates a new compiler error detector
func NewCompilerErrorDetector() *CompilerErrorDetector {
	return &CompilerErrorDetector{
		enabled: true,
		patterns: map[string]*regexp.Regexp{
			// Go: ./file.go:10:5: error message
			"go": regexp.MustCompile(`^\s*\./([\w/.\-]+\.go):(\d+):(\d+):\s+(.+?)(?:\n|$)`),

			// Rust: error[E0425]: message\n --> src/file.rs:2:5
			"rust": regexp.MustCompile(`^error\[([^\]]+)\]:\s+(.+?)\n\s*-->\s+([\w/.\-]+\.rs):(\d+):(\d+)`),

			// TypeScript: src/file.ts:10:5 - error TS2345: message
			"typescript": regexp.MustCompile(`([\w/.\-]+\.ts):(\d+):(\d+)\s+-\s+error\s+TS(\d+):\s+(.+?)(?:\n|$)`),

			// Python: File "file.py", line 10, in function
			"python": regexp.MustCompile(`File "([^"]+\.py)",\s+line\s+(\d+),\s+in\s+(\w+)`),

			// Java: Exception in thread\npackage.Class.method(File.java:123)
			"java": regexp.MustCompile(`([\w.]+\.java):(\d+)\)`),

			// Generic compiler: pattern://file:line:col: message
			"generic": regexp.MustCompile(`([^:\s]+\.(?:go|rs|ts|js|py|java)):(\d+):(\d+):\s+(.+?)(?:\n|$)`),
		},
	}
}

func (c *CompilerErrorDetector) Name() string {
	return "compiler_error"
}

func (c *CompilerErrorDetector) Enabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *CompilerErrorDetector) SetEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.enabled = enabled
}

// Detect analyzes buffer for compiler errors
func (c *CompilerErrorDetector) Detect(buffer []byte) *Match {
	// Check if enabled
	if !c.Enabled() {
		return nil
	}

	text := string(buffer)
	cleanText := stripAnsi(text)

	// Try Go pattern first (most specific)
	if match := c.detectGo(cleanText); match != nil {
		return match
	}

	// Try Rust pattern
	if match := c.detectRust(cleanText); match != nil {
		return match
	}

	// Try TypeScript pattern
	if match := c.detectTypeScript(cleanText); match != nil {
		return match
	}

	// Try Python pattern
	if match := c.detectPython(cleanText); match != nil {
		return match
	}

	// Try Java pattern
	if match := c.detectJava(cleanText); match != nil {
		return match
	}

	return nil
}

// detectGo finds Go compiler errors
func (c *CompilerErrorDetector) detectGo(text string) *Match {
	pattern := c.patterns["go"]
	matches := pattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		return nil
	}

	// Get the first (most relevant) error
	idx := matches[0]
	submatch := pattern.FindAllStringSubmatch(text, -1)[0]

	if len(submatch) < 5 {
		return nil
	}

	filePath := submatch[1]
	line, _ := strconv.Atoi(submatch[2])
	col, _ := strconv.Atoi(submatch[3])
	message := strings.TrimSpace(submatch[4])

	return &Match{
		Type: "COMPILER_ERROR",
		Payload: map[string]interface{}{
			"language": "go",
			"file":     filePath,
			"line":     line,
			"column":   col,
			"message":  message,
			"fullPath": resolveFullPath(filePath),
		},
		Offset: idx[0],
		Length: idx[1] - idx[0],
	}
}

// detectRust finds Rust compiler errors
func (c *CompilerErrorDetector) detectRust(text string) *Match {
	pattern := c.patterns["rust"]
	matches := pattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		return nil
	}

	// Get the first error
	submatch := pattern.FindAllStringSubmatch(text, -1)[0]

	if len(submatch) < 6 {
		return nil
	}

	errorCode := submatch[1]
	message := strings.TrimSpace(submatch[2])
	filePath := submatch[3]
	line, _ := strconv.Atoi(submatch[4])
	col, _ := strconv.Atoi(submatch[5])

	return &Match{
		Type: "COMPILER_ERROR",
		Payload: map[string]interface{}{
			"language": "rust",
			"file":     filePath,
			"line":     line,
			"column":   col,
			"message":  message,
			"errorCode": errorCode,
			"fullPath": resolveFullPath(filePath),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectTypeScript finds TypeScript compiler errors
func (c *CompilerErrorDetector) detectTypeScript(text string) *Match {
	pattern := c.patterns["typescript"]
	matches := pattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		return nil
	}

	// Get the first error
	submatch := pattern.FindAllStringSubmatch(text, -1)[0]

	if len(submatch) < 6 {
		return nil
	}

	filePath := submatch[1]
	line, _ := strconv.Atoi(submatch[2])
	col, _ := strconv.Atoi(submatch[3])
	errorCode := "TS" + submatch[4]
	message := strings.TrimSpace(submatch[5])

	return &Match{
		Type: "COMPILER_ERROR",
		Payload: map[string]interface{}{
			"language": "typescript",
			"file":     filePath,
			"line":     line,
			"column":   col,
			"message":  message,
			"errorCode": errorCode,
			"fullPath": resolveFullPath(filePath),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectPython finds Python interpreter errors
func (c *CompilerErrorDetector) detectPython(text string) *Match {
	pattern := c.patterns["python"]
	matches := pattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		return nil
	}

	// Get the first error
	submatch := pattern.FindAllStringSubmatch(text, -1)[0]

	if len(submatch) < 4 {
		return nil
	}

	filePath := submatch[1]
	line, _ := strconv.Atoi(submatch[2])
	function := submatch[3]

	// Look for the exception type (e.g., ZeroDivisionError)
	exceptionPattern := regexp.MustCompile(`(?:^|\n)([A-Za-z]+Error):\s+(.+?)(?:\n|$)`)
	exceptionMatch := exceptionPattern.FindStringSubmatch(text)

	exceptionType := "Error"
	message := "Python error"
	if len(exceptionMatch) > 2 {
		exceptionType = exceptionMatch[1]
		message = exceptionMatch[2]
	}

	return &Match{
		Type: "COMPILER_ERROR",
		Payload: map[string]interface{}{
			"language":  "python",
			"file":      filePath,
			"line":      line,
			"function":  function,
			"exception": exceptionType,
			"message":   message,
			"fullPath":  resolveFullPath(filePath),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectJava finds Java runtime errors
func (c *CompilerErrorDetector) detectJava(text string) *Match {
	pattern := c.patterns["java"]
	matches := pattern.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		return nil
	}

	// Check if this looks like a Java stack trace
	if !strings.Contains(text, "at ") && !strings.Contains(text, "Exception") {
		return nil
	}

	// Extract exception type (more reliable pattern)
	exceptionPattern := regexp.MustCompile(`java\.lang\.(\w+Exception)`)
	exceptionMatch := exceptionPattern.FindStringSubmatch(text)

	exceptionType := "JavaException"
	message := "Java error"
	if len(exceptionMatch) > 1 {
		exceptionType = exceptionMatch[1]
		// Extract message if present
		msgPattern := regexp.MustCompile(exceptionType + `:\s+(.+?)(?:\n|$)`)
		msgMatch := msgPattern.FindStringSubmatch(text)
		if len(msgMatch) > 1 {
			message = msgMatch[1]
		}
	}

	// Get the first Java file reference
	submatch := pattern.FindAllStringSubmatch(text, -1)[0]

	if len(submatch) < 3 {
		return nil
	}

	filePath := submatch[1]
	line, _ := strconv.Atoi(submatch[2])

	return &Match{
		Type: "COMPILER_ERROR",
		Payload: map[string]interface{}{
			"language":  "java",
			"file":      filePath,
			"line":      line,
			"exception": exceptionType,
			"message":   message,
			"fullPath":  resolveFullPath(filePath),
		},
		Offset: 0,
		Length: len(text),
	}
}
