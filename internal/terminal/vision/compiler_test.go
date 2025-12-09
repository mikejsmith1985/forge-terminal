package vision

import (
	"testing"
)

func TestCompilerErrorDetector_Go(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantLang  string
		wantFile  string
		wantLine  int
		wantCol   int
	}{
		{
			name:      "Go undefined function",
			input:     "./main.go:10:5: undefined: fmt.Printl",
			wantMatch: true,
			wantLang:  "go",
			wantFile:  "main.go",
			wantLine:  10,
			wantCol:   5,
		},
		{
			name:      "Go invalid syntax",
			input:     "./parser.go:42:15: expected '}' after statement",
			wantMatch: true,
			wantLang:  "go",
			wantFile:  "parser.go",
			wantLine:  42,
			wantCol:   15,
		},
		{
			name:      "Go type mismatch",
			input:     "./app.go:7:10: cannot use strconv.Atoi(\"123\") (type (int, error)) as type int in assignment",
			wantMatch: true,
			wantLang:  "go",
			wantFile:  "app.go",
			wantLine:  7,
			wantCol:   10,
		},
		{
			name:      "Go package not found",
			input:     "./main.go:3:2: no required module provides package github.com/nonexistent",
			wantMatch: true,
			wantLang:  "go",
			wantFile:  "main.go",
			wantLine:  3,
			wantCol:   2,
		},
		{
			name:      "No error - normal go output",
			input:     "$ go run main.go\nHello, World!",
			wantMatch: false,
		},
		{
			name:      "No error - go success",
			input:     "ok  	github.com/user/project	0.002s",
			wantMatch: false,
		},
	}

	detector := NewCompilerErrorDetector()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := detector.Detect([]byte(tt.input))

			if tt.wantMatch && match == nil {
				t.Errorf("Expected match, got nil")
				return
			}

			if !tt.wantMatch && match != nil {
				t.Errorf("Expected no match, got %v", match)
				return
			}

			if !tt.wantMatch {
				return
			}

			if match.Type != "COMPILER_ERROR" {
				t.Errorf("Expected type COMPILER_ERROR, got %s", match.Type)
			}

			lang := match.Payload["language"].(string)
			if lang != tt.wantLang {
				t.Errorf("Expected language %s, got %s", tt.wantLang, lang)
			}

			file := match.Payload["file"].(string)
			if file != tt.wantFile {
				t.Errorf("Expected file %s, got %s", tt.wantFile, file)
			}

			line := match.Payload["line"].(int)
			if line != tt.wantLine {
				t.Errorf("Expected line %d, got %d", tt.wantLine, line)
			}

			col := match.Payload["column"].(int)
			if col != tt.wantCol {
				t.Errorf("Expected column %d, got %d", tt.wantCol, col)
			}

			message := match.Payload["message"].(string)
			if message == "" {
				t.Errorf("Expected non-empty message")
			}
		})
	}
}

func TestCompilerErrorDetector_Rust(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantLang  string
		wantCode  string
	}{
		{
			name: "Rust undefined variable",
			input: "error[E0425]: cannot find value `x` in this scope\n --> src/lib.rs:2:5\n  |\n2 |     x\n  |     ^ not found in this scope",
			wantMatch: true,
			wantLang:  "rust",
			wantCode:  "E0425",
		},
		{
			name: "Rust type mismatch",
			input: "error[E0308]: mismatched types\n --> src/main.rs:10:10\n  |\n10 |     let x: i32 = \"hello\";\n  |                   ^^^^^^^ expected i32, found &str",
			wantMatch: true,
			wantLang:  "rust",
			wantCode:  "E0308",
		},
		{
			name:      "No error - cargo success",
			input:     "Finished `dev` profile [unoptimized + debuginfo]",
			wantMatch: false,
		},
	}

	detector := NewCompilerErrorDetector()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := detector.Detect([]byte(tt.input))

			if tt.wantMatch && match == nil {
				t.Errorf("Expected match, got nil")
				return
			}

			if !tt.wantMatch && match != nil {
				t.Errorf("Expected no match, got %v", match)
				return
			}

			if !tt.wantMatch {
				return
			}

			lang := match.Payload["language"].(string)
			if lang != tt.wantLang {
				t.Errorf("Expected language %s, got %s", tt.wantLang, lang)
			}

			code := match.Payload["errorCode"].(string)
			if code != tt.wantCode {
				t.Errorf("Expected error code %s, got %s", tt.wantCode, code)
			}
		})
	}
}

func TestCompilerErrorDetector_TypeScript(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantCode  string
	}{
		{
			name:      "TypeScript type error",
			input:     "src/app.ts:10:5 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
			wantMatch: true,
			wantCode:  "TS2345",
		},
		{
			name:      "TypeScript undefined property",
			input:     "src/index.ts:5:3 - error TS2339: Property 'foo' does not exist on type 'Bar'.",
			wantMatch: true,
			wantCode:  "TS2339",
		},
		{
			name:      "No error - tsc success",
			input:     "Successfully compiled 15 files with tsc",
			wantMatch: false,
		},
	}

	detector := NewCompilerErrorDetector()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := detector.Detect([]byte(tt.input))

			if tt.wantMatch && match == nil {
				t.Errorf("Expected match, got nil")
				return
			}

			if !tt.wantMatch && match != nil {
				t.Errorf("Expected no match, got %v", match)
				return
			}

			if !tt.wantMatch {
				return
			}

			code := match.Payload["errorCode"].(string)
			if code != tt.wantCode {
				t.Errorf("Expected error code %s, got %s", tt.wantCode, code)
			}
		})
	}
}

func TestCompilerErrorDetector_Python(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		wantMatch  bool
		wantLang   string
		wantExc    string
	}{
		{
			name: "Python ZeroDivisionError",
			input: "Traceback (most recent call last):\n  File \"test.py\", line 5, in <module>\n    result = divide(10, 0)\n  File \"test.py\", line 2, in divide\n    return a / b\nZeroDivisionError: division by zero",
			wantMatch: true,
			wantLang:  "python",
			wantExc:   "ZeroDivisionError",
		},
		{
			name: "Python NameError",
			input: "Traceback (most recent call last):\n  File \"script.py\", line 10, in process\n    print(undefined_var)\nNameError: name 'undefined_var' is not defined",
			wantMatch: true,
			wantLang:  "python",
			wantExc:   "NameError",
		},
		{
			name:      "No error - python script output",
			input:     "Hello, World!\nProcessing complete",
			wantMatch: false,
		},
	}

	detector := NewCompilerErrorDetector()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := detector.Detect([]byte(tt.input))

			if tt.wantMatch && match == nil {
				t.Errorf("Expected match, got nil")
				return
			}

			if !tt.wantMatch && match != nil {
				t.Errorf("Expected no match, got %v", match)
				return
			}

			if !tt.wantMatch {
				return
			}

			lang := match.Payload["language"].(string)
			if lang != tt.wantLang {
				t.Errorf("Expected language %s, got %s", tt.wantLang, lang)
			}

			exc := match.Payload["exception"].(string)
			if exc != tt.wantExc {
				t.Errorf("Expected exception %s, got %s", tt.wantExc, exc)
			}
		})
	}
}

func TestCompilerErrorDetector_Java(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantLang  string
		wantExc   string
	}{
		{
			name: "Java NPE",
			input: "Exception in thread \"main\" java.lang.NullPointerException\n\tat MyClass.doSomething(MyClass.java:58)\n\tat MyClass.main(MyClass.java:10)",
			wantMatch: true,
			wantLang:  "java",
			wantExc:   "NullPointerException",
		},
		{
			name: "Java NumberFormatException",
			input: "Exception in thread \"main\" java.lang.NumberFormatException: For input string: \"abc\"\n\tat java.lang.NumberFormatException.forInputString(NumberFormatException.java:65)\n\tat java.lang.Integer.parseInt(Integer.java:580)",
			wantMatch: true,
			wantLang:  "java",
			wantExc:   "NumberFormatException",
		},
	}

	detector := NewCompilerErrorDetector()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := detector.Detect([]byte(tt.input))

			if tt.wantMatch && match == nil {
				t.Errorf("Expected match, got nil")
				return
			}

			if !tt.wantMatch && match != nil {
				t.Errorf("Expected no match, got %v", match)
				return
			}

			if !tt.wantMatch {
				return
			}

			lang := match.Payload["language"].(string)
			if lang != tt.wantLang {
				t.Errorf("Expected language %s, got %s", tt.wantLang, lang)
			}

			exc := match.Payload["exception"].(string)
			if exc != tt.wantExc {
				t.Errorf("Expected exception %s, got %s", tt.wantExc, exc)
			}
		})
	}
}

func TestCompilerErrorDetector_EnableDisable(t *testing.T) {
	detector := NewCompilerErrorDetector()

	// Should be enabled by default
	if !detector.Enabled() {
		t.Error("Expected detector to be enabled by default")
	}

	// Disable it
	detector.SetEnabled(false)
	if detector.Enabled() {
		t.Error("Expected detector to be disabled")
	}

	// Should not detect when disabled
	match := detector.Detect([]byte("./main.go:10:5: undefined: fmt.Printl"))
	if match != nil {
		t.Error("Expected no match when detector disabled")
	}

	// Re-enable and verify detection works
	detector.SetEnabled(true)
	match = detector.Detect([]byte("./main.go:10:5: undefined: fmt.Printl"))
	if match == nil {
		t.Error("Expected match when detector enabled")
	}
}

func TestCompilerErrorDetector_MultipleErrors(t *testing.T) {
	detector := NewCompilerErrorDetector()

	// When multiple errors present, should return first
	input := `./file1.go:5:2: undefined: x
./file2.go:10:3: undefined: y
./file3.go:15:4: undefined: z`

	match := detector.Detect([]byte(input))

	if match == nil {
		t.Error("Expected to detect first error")
	}

	file := match.Payload["file"].(string)
	if file != "file1.go" {
		t.Errorf("Expected first file (file1.go), got %s", file)
	}

	line := match.Payload["line"].(int)
	if line != 5 {
		t.Errorf("Expected first line (5), got %d", line)
	}
}
