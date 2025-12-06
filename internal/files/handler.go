package files

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type FileNode struct {
	Name         string      `json:"name"`
	Path         string      `json:"path"`
	IsDir        bool        `json:"isDir"`
	Size         int64       `json:"size"`
	ModTime      int64       `json:"modTime"`
	IsGitIgnored bool        `json:"isGitIgnored"`
	Children     []*FileNode `json:"children,omitempty"`
}

type FileReadRequest struct {
	Path string `json:"path"`
}

type FileWriteRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type FileDeleteRequest struct {
	Path string `json:"path"`
}

// HandleList returns directory tree structure
func HandleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "."
	}

	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		http.Error(w, "Path not found", http.StatusNotFound)
		return
	}

	if !info.IsDir() {
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	gitignorePatterns := loadGitignorePatterns(absPath)
	tree := buildFileTree(absPath, gitignorePatterns, 0, 3)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree)
}

// HandleRead returns file contents
func HandleRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req FileReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if info.Size() > 10*1024*1024 {
		http.Error(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"path":    req.Path,
		"content": string(content),
	})
}

// HandleWrite saves file contents
func HandleWrite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req FileWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(absPath, []byte(req.Content), 0644); err != nil {
		http.Error(w, "Failed to write file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"path":   req.Path,
	})
}

// HandleDelete removes a file or directory
func HandleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req FileDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	if err := os.RemoveAll(absPath); err != nil {
		http.Error(w, "Failed to delete", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"path":   req.Path,
	})
}

func buildFileTree(dirPath string, gitignorePatterns []string, depth, maxDepth int) *FileNode {
	info, err := os.Stat(dirPath)
	if err != nil {
		return nil
	}

	node := &FileNode{
		Name:         filepath.Base(dirPath),
		Path:         dirPath,
		IsDir:        info.IsDir(),
		Size:         info.Size(),
		ModTime:      info.ModTime().Unix(),
		IsGitIgnored: matchesGitignore(dirPath, gitignorePatterns),
	}

	if !info.IsDir() || depth >= maxDepth {
		return node
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return node
	}

	for _, entry := range entries {
		childPath := filepath.Join(dirPath, entry.Name())
		child := buildFileTree(childPath, gitignorePatterns, depth+1, maxDepth)
		if child != nil {
			node.Children = append(node.Children, child)
		}
	}

	sort.Slice(node.Children, func(i, j int) bool {
		if node.Children[i].IsDir != node.Children[j].IsDir {
			return node.Children[i].IsDir
		}
		return node.Children[i].Name < node.Children[j].Name
	})

	return node
}

func loadGitignorePatterns(dirPath string) []string {
	gitignorePath := filepath.Join(dirPath, ".gitignore")
	data, err := os.ReadFile(gitignorePath)
	if err != nil {
		return []string{}
	}

	lines := strings.Split(string(data), "\n")
	patterns := []string{}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			patterns = append(patterns, line)
		}
	}
	return patterns
}

func matchesGitignore(path string, patterns []string) bool {
	basename := filepath.Base(path)
	for _, pattern := range patterns {
		if matched, _ := filepath.Match(pattern, basename); matched {
			return true
		}
		if strings.HasPrefix(basename, strings.TrimSuffix(pattern, "*")) {
			return true
		}
	}
	return false
}

// HandleReadStream returns file contents as a stream for large files
func HandleReadStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, "Missing path parameter", http.StatusBadRequest)
		return
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	file, err := os.Open(absPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	info, _ := file.Stat()
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Length", string(info.Size()))

	io.Copy(w, file)
}
