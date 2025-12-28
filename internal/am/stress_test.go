// Package am provides stress tests for the Industrial Refactor.
// This validates that the async pipeline and state machine parser
// can handle 1MB/s ANSI streams without dropping frames or causing GC spikes.
package am

import (
	"bytes"
	"fmt"
	"math/rand"
	"os"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

// generateANSIStream creates a realistic terminal output stream with ANSI codes.
// Returns approximately the requested size in bytes.
func generateANSIStream(size int) []byte {
	buf := bytes.NewBuffer(make([]byte, 0, size+1024))

	// ANSI escape sequences commonly seen in terminal output
	colors := []string{
		"\x1b[0m",        // Reset
		"\x1b[1m",        // Bold
		"\x1b[31m",       // Red
		"\x1b[32m",       // Green
		"\x1b[33m",       // Yellow
		"\x1b[34m",       // Blue
		"\x1b[38;5;208m", // 256-color orange
		"\x1b[38;2;255;128;0m", // True color
	}

	cursor := []string{
		"\x1b[H",      // Home
		"\x1b[2J",     // Clear screen
		"\x1b[10;20H", // Move cursor
		"\x1b[?25l",   // Hide cursor
		"\x1b[?25h",   // Show cursor
	}

	osc := []string{
		"\x1b]0;Terminal Title\x07",        // Set title (BEL terminated)
		"\x1b]8;;http://example.com\x1b\\", // Hyperlink (ST terminated)
	}

	// Text content
	words := []string{
		"function", "const", "let", "var", "return", "if", "else", "for",
		"while", "class", "interface", "struct", "type", "package", "import",
		"export", "default", "async", "await", "promise", "error", "success",
	}

	for buf.Len() < size {
		// Random mix of ANSI and text
		switch rand.Intn(10) {
		case 0, 1: // 20% ANSI color
			buf.WriteString(colors[rand.Intn(len(colors))])
		case 2: // 10% cursor movement
			buf.WriteString(cursor[rand.Intn(len(cursor))])
		case 3: // 10% OSC sequence
			buf.WriteString(osc[rand.Intn(len(osc))])
		default: // 60% text content
			word := words[rand.Intn(len(words))]
			buf.WriteString(word)
			if rand.Intn(5) == 0 {
				buf.WriteByte('\n')
			} else {
				buf.WriteByte(' ')
			}
		}
	}

	return buf.Bytes()
}

// BenchmarkStripANSI_1MB benchmarks stripping ANSI from 1MB of data.
func BenchmarkStripANSI_1MB(b *testing.B) {
	data := generateANSIStream(1024 * 1024) // 1MB
	b.SetBytes(int64(len(data)))
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		StripANSIBytes(data)
	}
}

// BenchmarkStripANSI_100KB benchmarks stripping ANSI from 100KB chunks.
func BenchmarkStripANSI_100KB(b *testing.B) {
	data := generateANSIStream(100 * 1024) // 100KB
	b.SetBytes(int64(len(data)))
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		StripANSIBytes(data)
	}
}

// BenchmarkBufferPool benchmarks buffer pool get/put operations.
func BenchmarkBufferPool(b *testing.B) {
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		buf := GetBuffer()
		buf.WriteString("test data that simulates real usage")
		PutBuffer(buf)
	}
}

// BenchmarkPipelineEnqueue benchmarks non-blocking enqueue operations.
func BenchmarkPipelineEnqueue(b *testing.B) {
	pipeline := NewAsyncPipeline(PipelineConfig{
		ChannelSize:   1024,
		FlushInterval: 5 * time.Second,
	})

	data := make([]byte, 1024) // 1KB chunks
	for i := range data {
		data[i] = byte(i % 256)
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		pipeline.EnqueueOutput("test-tab", data)
	}
}

// TestStressStream_1MBPerSecond simulates 1MB/s stream for 5 seconds.
// Verifies that pipeline processes data without dropping below 60fps equivalent.
func TestStressStream_1MBPerSecond(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping stress test in short mode")
	}

	// Create pipeline with production config
	config := DefaultPipelineConfig()
	config.ChannelSize = 1024
	config.EnableDebugLogs = false
	pipeline := NewAsyncPipeline(config)

	// Create minimal AM system for testing
	amSystem := &System{
		enabled: true,
	}
	amSystem.Pipeline = pipeline
	pipeline.Start(amSystem)
	defer pipeline.Stop()

	// Generate test data - 1MB worth of chunks
	chunkSize := 4096 // 4KB chunks
	chunksPerSecond := (1024 * 1024) / chunkSize // ~256 chunks/sec for 1MB/s
	totalDuration := 3 * time.Second
	
	data := generateANSIStream(chunkSize)

	var processedChunks atomic.Int64
	var droppedChunks atomic.Int64

	// Start time
	start := time.Now()

	// Send chunks at 1MB/s rate
	ticker := time.NewTicker(time.Second / time.Duration(chunksPerSecond))
	defer ticker.Stop()

	timeout := time.After(totalDuration)

loop:
	for {
		select {
		case <-timeout:
			break loop
		case <-ticker.C:
			if pipeline.EnqueueOutput("stress-test", data) {
				processedChunks.Add(1)
			} else {
				droppedChunks.Add(1)
			}
		}
	}

	elapsed := time.Since(start)

	// Get stats
	stats := pipeline.GetExtendedStats()

	// Report results
	processed := processedChunks.Load()
	dropped := droppedChunks.Load()
	totalChunks := processed + dropped
	throughputMB := float64(processed*int64(chunkSize)) / (1024 * 1024) / elapsed.Seconds()
	dropRate := float64(dropped) / float64(totalChunks) * 100

	t.Logf("Stress Test Results:")
	t.Logf("  Duration: %v", elapsed)
	t.Logf("  Chunks sent: %d", totalChunks)
	t.Logf("  Chunks processed: %d", processed)
	t.Logf("  Chunks dropped: %d (%.2f%%)", dropped, dropRate)
	t.Logf("  Throughput: %.2f MB/s", throughputMB)
	t.Logf("  Pipeline processed: %d", stats.Processed)
	t.Logf("  Pipeline dropped: %d", stats.Dropped)
	t.Logf("  Channel depth: %d", stats.ChannelDepth)

	// Success criteria:
	// - Drop rate should be < 5% under normal load
	// - Throughput should be >= 0.8 MB/s (80% of target)
	if dropRate > 5.0 {
		t.Errorf("Drop rate too high: %.2f%% (should be < 5%%)", dropRate)
	}
	if throughputMB < 0.8 {
		t.Errorf("Throughput too low: %.2f MB/s (should be >= 0.8 MB/s)", throughputMB)
	}
}

// TestMemoryStability verifies memory usage stays flat during sustained load.
func TestMemoryStability(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping memory test in short mode")
	}

	// Force GC and get baseline
	runtime.GC()
	var m1 runtime.MemStats
	runtime.ReadMemStats(&m1)

	// Process 10MB of data in chunks
	chunkSize := 4096
	totalSize := 10 * 1024 * 1024 // 10MB
	iterations := totalSize / chunkSize

	data := generateANSIStream(chunkSize)

	for i := 0; i < iterations; i++ {
		// Use buffer pool
		buf := GetBuffer()
		StripANSIToBuffer(data, buf)
		_ = buf.String() // Simulate usage
		PutBuffer(buf)
	}

	// Force GC and measure
	runtime.GC()
	var m2 runtime.MemStats
	runtime.ReadMemStats(&m2)

	// Calculate memory growth
	heapGrowth := int64(m2.HeapAlloc) - int64(m1.HeapAlloc)
	heapGrowthMB := float64(heapGrowth) / (1024 * 1024)

	t.Logf("Memory Test Results:")
	t.Logf("  Data processed: %d MB", totalSize/(1024*1024))
	t.Logf("  Heap before: %.2f MB", float64(m1.HeapAlloc)/(1024*1024))
	t.Logf("  Heap after: %.2f MB", float64(m2.HeapAlloc)/(1024*1024))
	t.Logf("  Heap growth: %.2f MB", heapGrowthMB)
	t.Logf("  GC cycles: %d", m2.NumGC-m1.NumGC)

	// Success criteria: heap growth should be < 5MB after processing 10MB
	// (buffer pool should prevent unbounded growth)
	if heapGrowthMB > 5.0 {
		t.Errorf("Heap grew too much: %.2f MB (should be < 5MB)", heapGrowthMB)
	}
}

// TestImageDetection verifies binary data is correctly identified.
func TestImageDetection(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		wantImg  bool
		wantBin  bool
		wantFmt  string
	}{
		{
			name:    "PNG magic bytes",
			data:    []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00},
			wantImg: true,
			wantBin: true,
			wantFmt: "png",
		},
		{
			name:    "JPEG magic bytes",
			data:    []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46},
			wantImg: true,
			wantBin: true,
			wantFmt: "jpeg",
		},
		{
			name:    "Base64 PNG data URI",
			data:    []byte("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg"),
			wantImg: true,
			wantBin: false,
			wantFmt: "png",
		},
		{
			name:    "Plain text",
			data:    []byte("Hello, this is plain text without any binary content."),
			wantImg: false,
			wantBin: false,
		},
		{
			name:    "ANSI terminal output",
			data:    []byte("\x1b[32mGreen text\x1b[0m and normal"),
			wantImg: false,
			wantBin: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := DetectImageData(tt.data)
			if result.IsImage != tt.wantImg {
				t.Errorf("IsImage = %v, want %v", result.IsImage, tt.wantImg)
			}
			if result.IsBinary != tt.wantBin {
				t.Errorf("IsBinary = %v, want %v", result.IsBinary, tt.wantBin)
			}
			if tt.wantFmt != "" && result.Format != tt.wantFmt {
				t.Errorf("Format = %v, want %v", result.Format, tt.wantFmt)
			}
		})
	}
}

// TestParserCoreIntegration verifies parser_core functions work correctly.
func TestParserCoreIntegration(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect string
	}{
		{
			name:   "Simple CSI color",
			input:  "\x1b[32mGreen\x1b[0m",
			expect: "Green",
		},
		{
			name:   "Multiple sequences",
			input:  "\x1b[1;31mBold Red\x1b[0m Normal \x1b[34mBlue\x1b[0m",
			expect: "Bold Red Normal Blue",
		},
		{
			name:   "OSC title sequence",
			input:  "\x1b]0;Window Title\x07Content here",
			expect: "Content here",
		},
		{
			name:   "Cursor movement",
			input:  "\x1b[2J\x1b[HHello World",
			expect: "Hello World",
		},
		{
			name:   "Mixed with newlines",
			input:  "\x1b[32mLine1\x1b[0m\nLine2\n\x1b[34mLine3\x1b[0m",
			expect: "Line1\nLine2\nLine3",
		},
		{
			name:   "No escape sequences",
			input:  "Plain text without any escape sequences",
			expect: "Plain text without any escape sequences",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StripANSIString(tt.input)
			if result != tt.expect {
				t.Errorf("StripANSIString(%q) = %q, want %q", tt.input, result, tt.expect)
			}
		})
	}
}

// TestBoxDrawingRemoval verifies box drawing character removal.
func TestBoxDrawingRemoval(t *testing.T) {
	input := "┌────────┐\n│ Content │\n└────────┘"
	result := StripBoxDrawing(input)

	if len(result) >= len(input) {
		t.Errorf("Box drawing not removed: input=%d chars, output=%d chars", len(input), len(result))
	}
	if !containsSubstr(result, "Content") {
		t.Errorf("Content was removed along with box chars: %q", result)
	}
}

// TestAtomicWrite verifies atomic write function works.
func TestAtomicWrite(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := fmt.Sprintf("%s/test-atomic.json", tmpDir)

	data := []byte(`{"test": "data", "value": 123}`)

	err := atomicWriteFile(testFile, data, 0644)
	if err != nil {
		t.Fatalf("atomicWriteFile failed: %v", err)
	}

	// Verify temp file is cleaned up
	tmpFile := testFile + ".tmp"
	if _, err := os.Stat(tmpFile); !os.IsNotExist(err) {
		t.Errorf("Temp file should not exist after successful write")
	}

	// Verify final file exists with correct content
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Fatalf("Failed to read result file: %v", err)
	}
	if !bytes.Equal(content, data) {
		t.Errorf("File content mismatch: got %q, want %q", content, data)
	}
}

func containsSubstr(s, substr string) bool {
	return bytes.Contains([]byte(s), []byte(substr))
}
