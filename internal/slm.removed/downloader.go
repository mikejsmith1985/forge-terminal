// Package slm provides smart language model routing.
// v3.9.1: Embedded SLM removed - Ollama only.
package slm

// DownloadProgress tracks download progress (kept for API compatibility)
type DownloadProgress struct {
	Total      int64
	Downloaded int64
	Percent    float64
	Speed      float64
}

// ProgressCallback is called during download with progress updates
type ProgressCallback func(progress DownloadProgress)
