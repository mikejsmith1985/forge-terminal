package files

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// FileAccessMode represents the file access security level
type FileAccessMode string

const (
	FileAccessRestricted   FileAccessMode = "restricted"   // Project-scoped only
	FileAccessUnrestricted FileAccessMode = "unrestricted" // Full filesystem access
)

var (
	fileAccessMode      FileAccessMode = FileAccessRestricted // Default to restricted
	fileAccessModeMutex sync.RWMutex
)

// wslHomeCache caches resolved WSL home directories to avoid spawning WSL processes repeatedly
var (
	wslHomeCache = make(map[string]string)
	wslHomeMutex = sync.RWMutex{}
)

// getFileAccessMode returns true if unrestricted mode is enabled
func getFileAccessMode() bool {
	fileAccessModeMutex.RLock()
	defer fileAccessModeMutex.RUnlock()
	return fileAccessMode == FileAccessUnrestricted
}

// SetFileAccessMode updates the file access mode
func SetFileAccessMode(mode FileAccessMode) {
	fileAccessModeMutex.Lock()
	defer fileAccessModeMutex.Unlock()
	fileAccessMode = mode
	log.Printf("[Files] File access mode set to: %s", mode)
}

// normalizePath handles cross-platform path normalization
// Supports Windows, WSL, and Linux paths
func normalizePath(p string) string {
	if p == "" {
		return ""
	}

	// Convert backslashes to forward slashes for consistent processing
	normalized := strings.ReplaceAll(p, "\\", "/")

	// Remove trailing slashes (except for root paths)
	normalized = strings.TrimRight(normalized, "/")
	if normalized == "" {
		normalized = "/"
	}

	return normalized
}

// resolvePath converts WSL paths to Windows equivalents on Windows,
// and handles path resolution across platforms
func resolvePath(p string) (string, error) {
	return resolvePathWithDistro(p, "")
}

// resolvePathWithDistro converts WSL Linux paths to Windows UNC paths
// when running on Windows with a specific WSL distro
func resolvePathWithDistro(p string, distro string) (string, error) {
	if p == "" || p == "." {
		wd, err := os.Getwd()
		return wd, err
	}

	// On Windows, handle Linux-style paths from WSL
	if runtime.GOOS == "windows" {
		// Handle ~ paths by expanding to /home/username equivalent
		if strings.HasPrefix(p, "~") {
			// If we have a distro, convert to UNC path
			if distro != "" {
				// ~ or ~/path -> \\wsl.localhost\distro\home\username
				// We need to query WSL for the actual home path
				// For now, assume standard /home structure
				remainder := strings.TrimPrefix(p, "~")
				remainder = strings.TrimPrefix(remainder, "/")
				// Build UNC path: \\wsl.localhost\distro\home\user\remainder
				// Since we can't easily get the username, we'll use wsl.exe to resolve
				uncPath := `\\wsl.localhost\` + distro
				if remainder != "" {
					uncPath += `\` + strings.ReplaceAll(remainder, "/", `\`)
				}
				// Try to expand ~ by getting the home directory from WSL
				return resolveWSLHome(distro, remainder)
			}
		}

		// Handle absolute Linux paths like /home/user/projects
		if strings.HasPrefix(p, "/") && !strings.HasPrefix(p, "/mnt/") {
			if distro != "" {
				// /home/user/projects -> \\wsl.localhost\distro\home\user\projects
				linuxPath := strings.TrimPrefix(p, "/")
				uncPath := `\\wsl.localhost\` + distro + `\` + strings.ReplaceAll(linuxPath, "/", `\`)
				return uncPath, nil
			}
		}

		// Handle /mnt/c/... style paths (WSL accessing Windows drives)
		if strings.HasPrefix(p, "/mnt/") && len(p) > 5 {
			parts := strings.Split(p, "/")
			if len(parts) >= 3 {
				// /mnt/c/Users/... -> C:\Users\...
				drive := strings.ToUpper(string(parts[2]))
				remainder := strings.Join(parts[3:], "\\")
				resolved := drive + ":\\" + remainder
				return resolved, nil
			}
		}

		// Handle //wsl.localhost/distro/... style paths
		if strings.HasPrefix(p, "//wsl.localhost/") {
			parts := strings.Split(p, "/")
			if len(parts) > 3 {
				return "\\\\" + "wsl.localhost" + "\\" + strings.Join(parts[3:], "\\"), nil
			}
		}
	}

	// Use filepath.Abs for normal path resolution
	abs, err := filepath.Abs(p)
	if err != nil {
		return p, err
	}
	return abs, nil
}

// resolveWSLHome resolves ~ to the actual WSL home directory
// Caches results to avoid spawning WSL processes repeatedly
func resolveWSLHome(distro, remainder string) (string, error) {
	// Check cache first
	wslHomeMutex.RLock()
	if cachedHome, exists := wslHomeCache[distro]; exists {
		wslHomeMutex.RUnlock()
		
		// Build UNC path from cached home
		fullLinuxPath := cachedHome
		if remainder != "" {
			fullLinuxPath = cachedHome + "/" + remainder
		}
		
		linuxPath := strings.TrimPrefix(fullLinuxPath, "/")
		uncPath := `\\wsl.localhost\` + distro + `\` + strings.ReplaceAll(linuxPath, "/", `\`)
		return uncPath, nil
	}
	wslHomeMutex.RUnlock()

	// Try to get the WSL home directory using wsl.exe (only once per distro)
	// This runs: wsl -d <distro> -e echo $HOME
	cmd := exec.Command("wsl", "-d", distro, "-e", "sh", "-c", "echo $HOME")
	output, err := cmd.Output()
	if err != nil {
		// Fallback: just use ~ as-is, won't work but provides error feedback
		uncPath := `\\wsl.localhost\` + distro
		if remainder != "" {
			uncPath += `\` + strings.ReplaceAll(remainder, "/", `\`)
		}
		return uncPath, nil
	}

	homePath := strings.TrimSpace(string(output))
	// Cache the result for this distro
	wslHomeMutex.Lock()
	wslHomeCache[distro] = homePath
	wslHomeMutex.Unlock()

	// homePath is like "/home/mikej"
	fullLinuxPath := homePath
	if remainder != "" {
		fullLinuxPath = homePath + "/" + remainder
	}

	// Convert to UNC: /home/mikej -> \\wsl.localhost\distro\home\mikej
	linuxPath := strings.TrimPrefix(fullLinuxPath, "/")
	uncPath := `\\wsl.localhost\` + distro + `\` + strings.ReplaceAll(linuxPath, "/", `\`)
	return uncPath, nil
}

// isPathWithinRoot checks if targetPath is within rootPath
// Handles cross-platform paths including WSL on Windows
func isPathWithinRoot(targetPath, rootPath string) (bool, error) {
	// Check if unrestricted mode is enabled
	if getFileAccessMode() {
		log.Printf("[Files] Unrestricted mode: allowing access to %s", targetPath)
		return true, nil
	}

	// UNC paths on Windows: Special handling
	if runtime.GOOS == "windows" && strings.HasPrefix(targetPath, "\\\\") {
		// If root is also UNC, do prefix comparison
		if strings.HasPrefix(rootPath, "\\\\") {
			targetLower := strings.ToLower(filepath.Clean(targetPath))
			rootLower := strings.ToLower(filepath.Clean(rootPath))

			if targetLower == rootLower {
				return true, nil
			}

			// Check if target is under root
			if !strings.HasSuffix(rootLower, string(os.PathSeparator)) {
				rootLower += string(os.PathSeparator)
			}

			allowed := strings.HasPrefix(targetLower, rootLower)
			log.Printf("[Files] UNC validation: target=%s, root=%s, allowed=%v",
				targetPath, rootPath, allowed)
			return allowed, nil
		}

		// UNC target with non-UNC root: Allow UNC paths
		// Rationale: UNC paths (\\wsl.localhost\...) have Windows-level permission checks
		// Users cannot access files they don't have permission for at the OS level
		log.Printf("[Files] UNC path allowed (Windows OS-level permissions apply): %s", targetPath)
		return true, nil
	}

	// Existing validation logic for same-filesystem paths
	// Resolve both paths, handling WSL conversions
	absTarget, err := resolvePath(targetPath)
	if err != nil {
		// Still try to proceed with the original path
		absTarget = filepath.Clean(targetPath)
	}

	absRoot, err := resolvePath(rootPath)
	if err != nil {
		// Still try to proceed with the original path
		absRoot = filepath.Clean(rootPath)
	}

	// Normalize paths for comparison (lowercase on Windows for case-insensitivity)
	if runtime.GOOS == "windows" {
		absTarget = strings.ToLower(absTarget)
		absRoot = strings.ToLower(absRoot)
	}

	// Clean paths
	absTarget = filepath.Clean(absTarget)
	absRoot = filepath.Clean(absRoot)

	// Check if target is root itself or within root
	if absTarget == absRoot {
		return true, nil
	}

	// Ensure the root path ends with separator for prefix comparison
	if !strings.HasSuffix(absRoot, string(os.PathSeparator)) {
		absRoot += string(os.PathSeparator)
	}

	allowed := strings.HasPrefix(absTarget, absRoot)
	log.Printf("[Files] Path validation: target=%s, root=%s, allowed=%v",
		absTarget, absRoot, allowed)
	return allowed, nil
}

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
	Path     string `json:"path"`
	RootPath string `json:"rootPath"`
}

type FileWriteRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	RootPath string `json:"rootPath"`
}

type FileDeleteRequest struct {
	Path     string `json:"path"`
	RootPath string `json:"rootPath"`
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

	rootPath := r.URL.Query().Get("rootPath")
	if rootPath == "" {
		rootPath = "."
	}

	// Get shell type and WSL distro for path resolution
	shellType := r.URL.Query().Get("shell")
	distro := r.URL.Query().Get("distro")

	// Use resolvePathWithDistro to handle WSL paths on Windows
	absPath, err := resolvePathWithDistro(dirPath, distro)
	if err != nil {
		http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Also resolve root path for consistent comparison
	absRootPath, err := resolvePathWithDistro(rootPath, distro)
	if err != nil {
		absRootPath = rootPath // fallback
	}

	// Log for debugging
	if shellType == "wsl" {
		// For WSL, skip the "within root" check since paths may not be directly comparable
		// and we trust the frontend to send valid paths from the current terminal directory
	} else {
		// Validate path is within root if rootPath is specified
		within, err := isPathWithinRoot(absPath, absRootPath)
		if err != nil || !within {
			http.Error(w, "Path is outside allowed root directory", http.StatusForbidden)
			return
		}
	}

	info, err := os.Stat(absPath)
	if err != nil {
		http.Error(w, "Path not found: "+absPath, http.StatusNotFound)
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
		log.Printf("[Files] Failed to decode request: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("[Files] Read request: path=%s, rootPath=%s, runtime=%s, accessMode=%v",
		req.Path, req.RootPath, runtime.GOOS, getFileAccessMode())

	// Default rootPath if not specified
	rootPath := req.RootPath
	if rootPath == "" {
		rootPath = "."
	}

	// Use proper path resolution that handles WSL paths
	// On Windows, UNC paths (\\wsl.localhost\...) are valid and should not be processed with filepath.Abs
	var absPath string
	var err error

	// Check if it's a UNC path (Windows WSL path)
	if runtime.GOOS == "windows" && strings.HasPrefix(req.Path, "\\\\") {
		// It's a UNC path, use as-is
		absPath = req.Path
	} else {
		// Regular path, use absolute path
		absPath, err = filepath.Abs(req.Path)
		if err != nil {
			log.Printf("[Files] Invalid path: %v", err)
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
	}

	log.Printf("[Files] Validating: absPath=%s, rootPath=%s", absPath, rootPath)

	// Validate path is within root
	within, err := isPathWithinRoot(absPath, rootPath)
	if err != nil {
		log.Printf("[Files] Validation error: %v", err)
		http.Error(w, "Path validation error: "+err.Error(), http.StatusForbidden)
		return
	}
	if !within {
		log.Printf("[Files] ACCESS DENIED: absPath=%s not within rootPath=%s", absPath, rootPath)
		http.Error(w, "Access denied: Path is outside allowed directory", http.StatusForbidden)
		return
	}

	log.Printf("[Files] Access granted: reading %s", absPath)

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

	// Default rootPath if not specified
	rootPath := req.RootPath
	if rootPath == "" {
		rootPath = "."
	}

	// Use proper path resolution that handles WSL paths
	var absPath string
	var err error

	// Check if it's a UNC path (Windows WSL path)
	if runtime.GOOS == "windows" && strings.HasPrefix(req.Path, "\\\\") {
		// It's a UNC path, use as-is
		absPath = req.Path
	} else {
		// Regular path, use absolute path
		absPath, err = filepath.Abs(req.Path)
		if err != nil {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
	}

	// Validate path is within root
	within, err := isPathWithinRoot(absPath, rootPath)
	if err != nil || !within {
		http.Error(w, "Path is outside allowed root directory", http.StatusForbidden)
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
		"path":    req.Path,
		"message": "File saved successfully",
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

	// Default rootPath if not specified
	rootPath := req.RootPath
	if rootPath == "" {
		rootPath = "."
	}

	// Use proper path resolution that handles WSL paths
	var absPath string
	var err error

	// Check if it's a UNC path (Windows WSL path)
	if runtime.GOOS == "windows" && strings.HasPrefix(req.Path, "\\\\") {
		// It's a UNC path, use as-is
		absPath = req.Path
	} else {
		// Regular path, use absolute path
		absPath, err = filepath.Abs(req.Path)
		if err != nil {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
	}

	// Validate path is within root
	within, err := isPathWithinRoot(absPath, rootPath)
	if err != nil || !within {
		http.Error(w, "Path is outside allowed root directory", http.StatusForbidden)
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

	rootPath := r.URL.Query().Get("rootPath")
	if rootPath == "" {
		rootPath = "."
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Validate path is within root
	within, err := isPathWithinRoot(absPath, rootPath)
	if err != nil || !within {
		http.Error(w, "Path is outside allowed root directory", http.StatusForbidden)
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
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))

	io.Copy(w, file)
}


// HandleStats returns quick directory statistics for change detection
// Returns count of files and directories without building full tree
func HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "."
	}

	rootPath := r.URL.Query().Get("rootPath")
	if rootPath == "" {
		rootPath = "."
	}

	// Get shell type and WSL distro for path resolution
	shellType := r.URL.Query().Get("shell")
	distro := r.URL.Query().Get("distro")

	// Resolve path with distro support
	absPath, err := resolvePathWithDistro(dirPath, distro)
	if err != nil {
		http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Resolve root path for validation
	absRootPath, err := resolvePathWithDistro(rootPath, distro)
	if err != nil {
		absRootPath = rootPath // fallback
	}

	// Validate path is within root (skip for WSL)
	if shellType != "wsl" {
		within, err := isPathWithinRoot(absPath, absRootPath)
		if err != nil || !within {
			http.Error(w, "Path is outside allowed root directory", http.StatusForbidden)
			return
		}
	}

	// Check if path exists and is a directory
	info, err := os.Stat(absPath)
	if err != nil {
		http.Error(w, "Path not found: "+absPath, http.StatusNotFound)
		return
	}

	if !info.IsDir() {
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	// Read directory entries (1 level only, no recursion)
	entries, err := os.ReadDir(absPath)
	if err != nil {
		http.Error(w, "Failed to read directory", http.StatusInternalServerError)
		return
	}

	// Count files and directories
	fileCount := 0
	dirCount := 0
	for _, entry := range entries {
		if entry.IsDir() {
			dirCount++
		} else {
			fileCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{
		"totalCount": len(entries),
		"fileCount":  fileCount,
		"dirCount":   dirCount,
	})
}

// HandleFileAccessMode gets or sets the file access security mode
func HandleFileAccessMode(w http.ResponseWriter, r *http.Request) {
w.Header().Set("Content-Type", "application/json")

switch r.Method {
case http.MethodGet:
// Return current mode
mode := FileAccessRestricted
if getFileAccessMode() {
mode = FileAccessUnrestricted
}
json.NewEncoder(w).Encode(map[string]string{
"mode": string(mode),
})

case http.MethodPost:
// Set mode
var req struct {
Mode string `json:"mode"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
http.Error(w, "Invalid request", http.StatusBadRequest)
return
}

mode := FileAccessMode(req.Mode)
if mode != FileAccessRestricted && mode != FileAccessUnrestricted {
http.Error(w, "Invalid mode. Use \"restricted\" or \"unrestricted\"", http.StatusBadRequest)
return
}

SetFileAccessMode(mode)
json.NewEncoder(w).Encode(map[string]bool{"success": true})

default:
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}
}

