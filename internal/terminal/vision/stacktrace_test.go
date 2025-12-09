package vision

import (
	"testing"
)

func TestStackTraceDetector_Go(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantLang  string
		wantMsg   string
	}{
		{
			name: "Go panic - index out of range",
			input: "panic: runtime error: index out of range [10] with length 5\n\ngoroutine 1 [running]:\nmain.main()\n\t/home/user/code/main.go:15 +0x38\nmain.getData()\n\t/home/user/code/main.go:8 +0x10",
			wantMatch: true,
			wantLang:  "go",
			wantMsg:   "runtime error: index out of range [10] with length 5",
		},
		{
			name: "Go panic - nil pointer dereference",
			input: "panic: runtime error: invalid memory address or nil pointer dereference\n\ngoroutine 1 [running]:\nmain.processData()\n\t/home/user/code/process.go:42 +0x1a8",
			wantMatch: true,
			wantLang:  "go",
			wantMsg:   "runtime error: invalid memory address or nil pointer dereference",
		},
		{
			name: "Go panic - custom message",
			input: "panic: database connection failed: timeout\n\ngoroutine 1 [running]:\nmain.connectDB()\n\t/home/user/app/db.go:10 +0x50",
			wantMatch: true,
			wantLang:  "go",
			wantMsg:   "database connection failed: timeout",
		},
		{
			name:      "No panic - normal go output",
			input:     "Hello, World!\nProgram finished successfully",
			wantMatch: false,
		},
	}

	detector := NewStackTraceDetector()

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

			if match.Type != "STACK_TRACE" {
				t.Errorf("Expected type STACK_TRACE, got %s", match.Type)
			}

			lang := match.Payload["language"].(string)
			if lang != tt.wantLang {
				t.Errorf("Expected language %s, got %s", tt.wantLang, lang)
			}

			msg := match.Payload["message"].(string)
			if msg != tt.wantMsg {
				t.Errorf("Expected message %s, got %s", tt.wantMsg, msg)
			}

			frames := match.Payload["frames"].([]StackFrame)
			if len(frames) == 0 {
				t.Errorf("Expected at least one frame")
			}
		})
	}
}

func TestStackTraceDetector_Python(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantExc   string
	}{
		{
			name: "Python ZeroDivisionError",
			input: "Traceback (most recent call last):\n  File \"test.py\", line 5, in <module>\n    result = divide(10, 0)\n  File \"test.py\", line 2, in divide\n    return a / b\nZeroDivisionError: division by zero",
			wantMatch: true,
			wantExc:   "ZeroDivisionError",
		},
		{
			name: "Python NameError",
			input: "Traceback (most recent call last):\n  File \"script.py\", line 10, in process\n    print(undefined_var)\nNameError: name 'undefined_var' is not defined",
			wantMatch: true,
			wantExc:   "NameError",
		},
		{
			name: "Python TypeError",
			input: "Traceback (most recent call last):\n  File \"app.py\", line 20, in main\n    result = concat(\"hello\", 123)\n  File \"app.py\", line 15, in concat\n    return a + b\nTypeError: can only concatenate str (not \"int\") to str",
			wantMatch: true,
			wantExc:   "TypeError",
		},
		{
			name:      "No traceback - normal python output",
			input:     "Processing...\nDone!",
			wantMatch: false,
		},
	}

	detector := NewStackTraceDetector()

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

			exc := match.Payload["errorType"].(string)
			if exc != tt.wantExc {
				t.Errorf("Expected exception %s, got %s", tt.wantExc, exc)
			}

			frames := match.Payload["frames"].([]StackFrame)
			if len(frames) == 0 {
				t.Errorf("Expected at least one frame")
			}
		})
	}
}

func TestStackTraceDetector_Java(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantExc   string
	}{
		{
			name: "Java NullPointerException",
			input: "Exception in thread \"main\" java.lang.NullPointerException\n\tat MyClass.doSomething(MyClass.java:58)\n\tat MyClass.main(MyClass.java:10)",
			wantMatch: true,
			wantExc:   "NullPointerException",
		},
		{
			name: "Java ArrayIndexOutOfBoundsException",
			input: "Exception in thread \"main\" java.lang.ArrayIndexOutOfBoundsException: 10\n\tat MyClass.processArray(MyClass.java:42)\n\tat MyClass.main(MyClass.java:20)",
			wantMatch: true,
			wantExc:   "ArrayIndexOutOfBoundsException",
		},
		{
			name:      "No exception - normal java output",
			input:     "Program started\nProcessing complete",
			wantMatch: false,
		},
	}

	detector := NewStackTraceDetector()

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

			exc := match.Payload["errorType"].(string)
			if exc != tt.wantExc {
				t.Errorf("Expected exception %s, got %s", tt.wantExc, exc)
			}

			frames := match.Payload["frames"].([]StackFrame)
			if len(frames) == 0 {
				t.Errorf("Expected at least one frame")
			}
		})
	}
}

func TestStackTraceDetector_JavaScript(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantMatch bool
		wantErr   string
	}{
		{
			name: "Node.js TypeError",
			input: "TypeError: Cannot read property 'name' of undefined\n    at Object.getUser (/home/user/app.js:10:23)\n    at Object.<anonymous> (/home/user/app.js:20:5)",
			wantMatch: true,
			wantErr:   "TypeError",
		},
		{
			name: "Node.js ReferenceError",
			input: "ReferenceError: x is not defined\n    at processData (/home/user/index.js:15:10)\n    at Object.<anonymous> (/home/user/index.js:25:3)",
			wantMatch: true,
			wantErr:   "ReferenceError",
		},
		{
			name:      "No error - normal node output",
			input:     "Server started on port 3000\nListening...",
			wantMatch: false,
		},
	}

	detector := NewStackTraceDetector()

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

			err := match.Payload["errorType"].(string)
			if err != tt.wantErr {
				t.Errorf("Expected error %s, got %s", tt.wantErr, err)
			}

			frames := match.Payload["frames"].([]StackFrame)
			if len(frames) == 0 {
				t.Errorf("Expected at least one frame")
			}
		})
	}
}

func TestStackTraceDetector_RootCauseIdentification(t *testing.T) {
	// Go panic with mixed stdlib and user code
	input := "panic: test error\n\ngoroutine 1 [running]:\nruntime.panic()\n\t/usr/lib/go/src/runtime/panic.go:123 +0x1a\nmain.userFunc()\n\t/home/user/main.go:10 +0x38\nmain.main()\n\t/home/user/main.go:5 +0x10"

	detector := NewStackTraceDetector()
	match := detector.Detect([]byte(input))

	if match == nil {
		t.Fatalf("Expected match, got nil")
	}

	rootFrame := match.Payload["rootFrame"].(StackFrame)

	// Root cause should be the first user frame, not stdlib
	if !rootFrame.IsUser {
		t.Errorf("Root frame should be user code, got stdlib")
	}

	if rootFrame.Function != "main.userFunc" {
		t.Errorf("Expected root frame to be main.userFunc, got %s", rootFrame.Function)
	}
}

func TestStackTraceDetector_FrameCount(t *testing.T) {
	input := "panic: error\n\ngoroutine 1 [running]:\nmain.a()\n\t/a.go:1 +0x1\nmain.b()\n\t/b.go:2 +0x2\nmain.c()\n\t/c.go:3 +0x3"

	detector := NewStackTraceDetector()
	match := detector.Detect([]byte(input))

	if match == nil {
		t.Fatalf("Expected match, got nil")
	}

	count := match.Payload["frameCount"].(int)
	if count != 3 {
		t.Errorf("Expected 3 frames, got %d", count)
	}

	frames := match.Payload["frames"].([]StackFrame)
	if len(frames) != 3 {
		t.Errorf("Expected 3 frames in array, got %d", len(frames))
	}
}

func TestStackTraceDetector_EnableDisable(t *testing.T) {
	detector := NewStackTraceDetector()

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
	match := detector.Detect([]byte("panic: error\n\ngoroutine 1 [running]:\nmain.main()\n\t/main.go:10 +0x1"))
	if match != nil {
		t.Error("Expected no match when detector disabled")
	}

	// Re-enable and verify detection works
	detector.SetEnabled(true)
	match = detector.Detect([]byte("panic: error\n\ngoroutine 1 [running]:\nmain.main()\n\t/main.go:10 +0x1"))
	if match == nil {
		t.Error("Expected match when detector enabled")
	}
}

func TestIsUserCode(t *testing.T) {
	tests := []struct {
		path     string
		wantUser bool
	}{
		{"/home/user/main.go", true},
		{"/home/user/project/src/app.go", true},
		{"/usr/lib/go/src/runtime/panic.go", false},
		{"/System/Library/Frameworks/Go.framework", false},
		{"java/lang/Object.java", false},
		{"java/util/ArrayList.java", false},
		{"/home/user/node_modules/pkg/index.js", false},
		{"/home/user/vendor/github.com/pkg/pkg.go", false},
		{"/home/user/src/internal/util.go", false},
		{"/opt/go/src/sync.go", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := isUserCode(tt.path)
			if got != tt.wantUser {
				t.Errorf("isUserCode(%s) = %v, want %v", tt.path, got, tt.wantUser)
			}
		})
	}
}
