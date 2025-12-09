package vision

import (
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// StackFrame represents a single frame in a stack trace
type StackFrame struct {
	Function string `json:"function"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	IsUser   bool   `json:"isUser"` // true if not stdlib/internal
}

// StackTraceDetector detects stack traces and panics in terminal output
type StackTraceDetector struct {
	mu       sync.RWMutex
	enabled  bool
	patterns map[string]*regexp.Regexp
}

// NewStackTraceDetector creates a new stack trace detector
func NewStackTraceDetector() *StackTraceDetector {
	return &StackTraceDetector{
		enabled: true,
		patterns: map[string]*regexp.Regexp{
			// Go panic: "panic: " followed by message
			"go_panic": regexp.MustCompile(`^panic:\s+(.+?)(?:\n|$)`),

			// Go stack frame: function name followed by file:line
			"go_frame": regexp.MustCompile(`^\s+([^\s]+)\(\)\s+/([^:]+):(\d+)`),

			// Python traceback: "Traceback (most recent call last):"
			"python_start": regexp.MustCompile(`^Traceback \(most recent call last\):`),

			// Python frame: File "path", line N, in function
			"python_frame": regexp.MustCompile(`File "([^"]+)",\s+line\s+(\d+),\s+in\s+(.+?)$`),

			// Python exception: ExceptionType: message
			"python_exception": regexp.MustCompile(`^(\w+Error):\s+(.+?)$`),

			// Java stack trace: "Exception in thread"
			"java_start": regexp.MustCompile(`^Exception in thread "([^"]+)"`),

			// Java exception line: ExceptionType: message (optional)
			"java_exception": regexp.MustCompile(`([\w.]+Exception)(?::\s+(.+))?$`),

			// Java frame: at package.Class.method(File.java:123)
			"java_frame": regexp.MustCompile(`at\s+([\w.]+)\(([^:]+):(\d+)\)`),

			// JavaScript error: "Error: " or "TypeError: "
			"js_error": regexp.MustCompile(`^(\w+Error):\s+(.+?)(?:\n|$)`),

			// JavaScript frame: "at functionName (path/file.js:10:5)"
			"js_frame": regexp.MustCompile(`at\s+([^\s]+)\s+\(([^:]+):(\d+):\d+\)`),
		},
	}
}

func (s *StackTraceDetector) Name() string {
	return "stack_trace"
}

func (s *StackTraceDetector) Enabled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.enabled
}

func (s *StackTraceDetector) SetEnabled(enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.enabled = enabled
}

// Detect analyzes buffer for stack traces
func (s *StackTraceDetector) Detect(buffer []byte) *Match {
	// Check if enabled
	if !s.Enabled() {
		return nil
	}

	text := string(buffer)
	cleanText := stripAnsi(text)

	// Try Go stack trace first (most specific)
	if match := s.detectGo(cleanText); match != nil {
		return match
	}

	// Try Python stack trace
	if match := s.detectPython(cleanText); match != nil {
		return match
	}

	// Try Java stack trace
	if match := s.detectJava(cleanText); match != nil {
		return match
	}

	// Try JavaScript stack trace
	if match := s.detectJavaScript(cleanText); match != nil {
		return match
	}

	return nil
}

// detectGo finds Go panic stack traces using line-by-line parsing
func (s *StackTraceDetector) detectGo(text string) *Match {
	lines := strings.Split(text, "\n")

	// Find panic line
	panicIdx := -1
	var panicMessage string
	for i, line := range lines {
		if strings.HasPrefix(line, "panic:") {
			panicMessage = strings.TrimPrefix(line, "panic:")
			panicMessage = strings.TrimSpace(panicMessage)
			panicIdx = i
			break
		}
	}

	if panicIdx == -1 {
		return nil
	}

	// Parse frames after "goroutine" line
	frames := make([]StackFrame, 0)
	for i := panicIdx + 1; i < len(lines)-1; i++ {
		line := lines[i]
		nextLine := lines[i+1]

		// Function line looks like "main.funcName()"
		if strings.Contains(line, "()") && !strings.HasPrefix(strings.TrimSpace(line), "/") {
			function := strings.TrimSpace(strings.TrimSuffix(line, "()"))

			// Next line has file info: "\t/path/to/file.go:123 +0xABC"
			nextTrimmed := strings.TrimSpace(nextLine)
			if strings.Contains(nextTrimmed, ".go:") {
				parts := strings.Split(nextTrimmed, ":")
				if len(parts) >= 2 {
					file := parts[0]
					lineStr := parts[1]
					// Remove " +0x..." suffix
					lineStr = strings.Split(lineStr, " ")[0]

					lineNum, _ := strconv.Atoi(lineStr)
					frames = append(frames, StackFrame{
						Function: function,
						File:     file,
						Line:     lineNum,
						IsUser:   isUserCode(file),
					})
				}
			}
		}
	}

	if len(frames) == 0 {
		return nil
	}

	// Find root cause
	rootFrame := frames[0]
	for _, frame := range frames {
		if frame.IsUser {
			rootFrame = frame
			break
		}
	}

	return &Match{
		Type: "STACK_TRACE",
		Payload: map[string]interface{}{
			"language":   "go",
			"errorType":  "panic",
			"message":    panicMessage,
			"frames":     frames,
			"rootFrame":  rootFrame,
			"frameCount": len(frames),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectPython finds Python stack traces using line-by-line parsing
func (s *StackTraceDetector) detectPython(text string) *Match {
	// Check for Traceback
	if !strings.Contains(text, "Traceback") {
		return nil
	}

	lines := strings.Split(text, "\n")

	// Extract frames
	frames := make([]StackFrame, 0)
	exceptionType := "Exception"
	exceptionMessage := "Python exception"

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// File line: File "path", line 10, in function
		if strings.HasPrefix(line, "File ") && strings.Contains(line, "line ") {
			parts := strings.Split(line, ",")
			if len(parts) >= 3 {
				// Extract file
				filePart := strings.TrimPrefix(parts[0], "File ")
				filePart = strings.Trim(filePart, "\"")

				// Extract line number
				linePart := parts[1]
				lineStr := strings.TrimSpace(strings.TrimPrefix(linePart, "line"))
				lineNum, _ := strconv.Atoi(lineStr)

				// Extract function
				funcPart := strings.TrimSpace(parts[2])
				funcPart = strings.TrimPrefix(funcPart, "in ")

				frames = append(frames, StackFrame{
					Function: funcPart,
					File:     filePart,
					Line:     lineNum,
					IsUser:   isUserCode(filePart),
				})
			}
		}

		// Exception line at the end: ExceptionType: message
		if strings.Contains(line, "Error:") || strings.HasSuffix(line, "Error") {
			parts := strings.Split(line, ":")
			if len(parts) >= 1 {
				exceptionType = parts[0]
				if len(parts) >= 2 {
					exceptionMessage = strings.TrimSpace(parts[1])
				}
			}
		}
	}

	if len(frames) == 0 {
		return nil
	}

	// Find root cause (last frame is usually the error location in Python)
	rootFrame := frames[len(frames)-1]

	return &Match{
		Type: "STACK_TRACE",
		Payload: map[string]interface{}{
			"language":   "python",
			"errorType":  exceptionType,
			"message":    exceptionMessage,
			"frames":     frames,
			"rootFrame":  rootFrame,
			"frameCount": len(frames),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectJava finds Java stack traces using line-by-line parsing
func (s *StackTraceDetector) detectJava(text string) *Match {
	// Check for "Exception in thread"
	if !strings.Contains(text, "Exception in thread") {
		return nil
	}

	lines := strings.Split(text, "\n")

	// Extract exception from first line
	exceptionType := "JavaException"
	exceptionMessage := "Java exception"
	for _, line := range lines {
		if strings.Contains(line, "Exception") {
			// Extract full exception type (e.g., "java.lang.NullPointerException")
			parts := strings.Fields(line)
			for i, part := range parts {
				if strings.Contains(part, "Exception") {
					// Remove trailing colon if present
					exceptionType = strings.TrimSuffix(part, ":")
					// Keep short name
					if idx := strings.LastIndex(exceptionType, "."); idx != -1 {
						exceptionType = exceptionType[idx+1:]
					}
					// Check for message on same line
					if i+1 < len(parts) {
						exceptionMessage = strings.Join(parts[i+1:], " ")
					}
					break
				}
			}
			break
		}
	}

	// Extract frames
	frames := make([]StackFrame, 0)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Frame line: at package.Class.method(File.java:123)
		if strings.HasPrefix(line, "at ") && strings.Contains(line, ".java:") {
			// Parse: at className.methodName(FileName.java:lineNumber)
			atPart := strings.TrimPrefix(line, "at ")
			// Split on last occurrence of "("
			pIdx := strings.LastIndex(atPart, "(")
			if pIdx == -1 {
				continue
			}

			function := atPart[:pIdx]
			filePart := atPart[pIdx+1:]
			filePart = strings.TrimSuffix(filePart, ")")

			// Extract file and line
			colonIdx := strings.LastIndex(filePart, ":")
			if colonIdx == -1 {
				continue
			}

			file := filePart[:colonIdx]
			lineStr := filePart[colonIdx+1:]
			lineNum, _ := strconv.Atoi(lineStr)

			frames = append(frames, StackFrame{
				Function: function,
				File:     file,
				Line:     lineNum,
				IsUser:   isUserCode(file),
			})
		}
	}

	if len(frames) == 0 {
		return nil
	}

	// Find root cause
	rootFrame := frames[0]
	for _, frame := range frames {
		if frame.IsUser {
			rootFrame = frame
			break
		}
	}

	return &Match{
		Type: "STACK_TRACE",
		Payload: map[string]interface{}{
			"language":   "java",
			"errorType":  exceptionType,
			"message":    exceptionMessage,
			"frames":     frames,
			"rootFrame":  rootFrame,
			"frameCount": len(frames),
		},
		Offset: 0,
		Length: len(text),
	}
}

// detectJavaScript finds JavaScript/Node.js stack traces
func (s *StackTraceDetector) detectJavaScript(text string) *Match {
	// Check for error pattern
	if !strings.Contains(text, "Error:") && !strings.Contains(text, "at ") {
		return nil
	}

	lines := strings.Split(text, "\n")

	// Extract error type and message from first error line
	errorType := "Error"
	errorMessage := "JavaScript error"
	for _, line := range lines {
		if strings.Contains(line, "Error:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) >= 1 {
				errorType = strings.TrimSpace(parts[0])
				if len(parts) >= 2 {
					errorMessage = strings.TrimSpace(parts[1])
				}
			}
			break
		}
	}

	// Extract frames
	frames := make([]StackFrame, 0)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Frame line: at functionName (path/file.js:10:5)
		if strings.HasPrefix(line, "at ") {
			// Parse: at name (file.js:line:col)
			atPart := strings.TrimPrefix(line, "at ")

			// Find parentheses
			pIdx := strings.Index(atPart, "(")
			if pIdx == -1 {
				continue
			}

			function := strings.TrimSpace(atPart[:pIdx])
			filePart := atPart[pIdx+1:]
			filePart = strings.TrimSuffix(filePart, ")")

			// Extract file and line (ignore column)
			colonIdx := strings.Index(filePart, ":")
			if colonIdx == -1 {
				continue
			}

			file := filePart[:colonIdx]
			rest := filePart[colonIdx+1:]
			// Could have col after second colon, ignore it
			lineStr := strings.Split(rest, ":")[0]
			lineNum, _ := strconv.Atoi(lineStr)

			frames = append(frames, StackFrame{
				Function: function,
				File:     file,
				Line:     lineNum,
				IsUser:   isUserCode(file),
			})
		}
	}

	if len(frames) == 0 {
		return nil
	}

	// Find root cause
	rootFrame := frames[0]
	for _, frame := range frames {
		if frame.IsUser {
			rootFrame = frame
			break
		}
	}

	return &Match{
		Type: "STACK_TRACE",
		Payload: map[string]interface{}{
			"language":   "javascript",
			"errorType":  errorType,
			"message":    errorMessage,
			"frames":     frames,
			"rootFrame":  rootFrame,
			"frameCount": len(frames),
		},
		Offset: 0,
		Length: len(text),
	}
}

// isUserCode determines if a file path is user code (not stdlib/vendor)
func isUserCode(filePath string) bool {
	// Filter out standard library paths
	stdlibIndicators := []string{
		"/usr/lib/",
		"/System/Library/",
		"java/lang/",
		"java/util/",
		"node_modules/",
		"vendor/",
		"/opt/",
		"internal/",
		"stdlib",
		"runtime",
	}

	for _, indicator := range stdlibIndicators {
		if strings.Contains(filePath, indicator) {
			return false
		}
	}

	return true
}
