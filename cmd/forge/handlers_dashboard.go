package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var (
	gitRootMu sync.Mutex
	gitRoot   string
)

// detectGitRoot finds the git repository root.
// Unlike a sync.Once approach, this retries on each call until a root is found,
// because the working directory may change after the binary starts (e.g., when
// double-clicked from Explorer vs launched from a project directory in the shell).
func detectGitRoot() string {
	gitRootMu.Lock()
	defer gitRootMu.Unlock()

	// Return the cached value if we already found it.
	if gitRoot != "" {
		return gitRoot
	}

	tryDir := func(dir string) string {
		cmd := exec.Command("git", "rev-parse", "--show-toplevel")
		cmd.Dir = dir
		hideWindow(cmd)
		if out, err := cmd.Output(); err == nil {
			return strings.TrimSpace(string(out))
		}
		return ""
	}

	if cwd, err := os.Getwd(); err == nil {
		if root := tryDir(cwd); root != "" {
			gitRoot = root
			return gitRoot
		}
	}
	if exe, err := os.Executable(); err == nil {
		if root := tryDir(filepath.Dir(exe)); root != "" {
			gitRoot = root
		}
	}
	return gitRoot
}

// gitCmd builds a hidden, repo-rooted git command.
func gitCmd(args ...string) *exec.Cmd {
	cmd := exec.Command("git", args...)
	cmd.Dir = detectGitRoot()
	hideWindow(cmd)
	return cmd
}

var serverStartTime = time.Now()

type dashboardStats struct {
	// Git
	GitBranch     string         `json:"gitBranch"`
	GitCommits    int            `json:"gitCommitsToday"`
	GitChanged    int            `json:"gitChangedFiles"`
	GitLastCommit string         `json:"gitLastCommit"`
	GitWeekly     map[string]int `json:"gitWeekly"` // "Mon"->3, "Tue"->5, ...

	// Sessions
	ActiveSessions int `json:"activeSessions"`

	// System
	UptimeSec    float64 `json:"uptimeSec"`
	MemAllocMB   float64 `json:"memAllocMB"`
	MemSysMB     float64 `json:"memSysMB"`
	Goroutines   int     `json:"goroutines"`
	NumGC        uint32  `json:"numGC"`
	GoVersion    string  `json:"goVersion"`
	OS           string  `json:"os"`
	Arch         string  `json:"arch"`
	NumCPU       int     `json:"numCPU"`
}

// gitCmdInDir builds a hidden git command rooted at dir (or falls back to detectGitRoot).
func gitCmdInDir(dir string, args ...string) *exec.Cmd {
	if dir == "" {
		dir = detectGitRoot()
	}
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	hideWindow(cmd)
	return cmd
}

func handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Allow frontend to specify the project directory so git commands run in
	// the user's active project, not the forge binary's own working directory.
	projectDir := r.URL.Query().Get("dir")
	if projectDir != "" {
		// Resolve git root from the provided directory
		cmd := exec.Command("git", "rev-parse", "--show-toplevel")
		cmd.Dir = projectDir
		hideWindow(cmd)
		if out, err := cmd.Output(); err == nil {
			projectDir = strings.TrimSpace(string(out))
		}
		// If git rev-parse fails, use the raw dir as-is (may not be a git repo)
	}

	stats := dashboardStats{
		UptimeSec:  time.Since(serverStartTime).Seconds(),
		Goroutines: runtime.NumGoroutine(),
		GoVersion:  runtime.Version(),
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		NumCPU:     runtime.NumCPU(),
		GitWeekly:  make(map[string]int),
	}

	// Memory stats
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	stats.MemAllocMB = float64(m.Alloc) / 1024 / 1024
	stats.MemSysMB = float64(m.Sys) / 1024 / 1024
	stats.NumGC = m.NumGC

	// Active terminal sessions
	if termHandler != nil {
		count := 0
		termHandler.RangeSessions(func(id string) bool {
			count++
			return true
		})
		stats.ActiveSessions = count
	}

	// Git branch
	if out, err := gitCmdInDir(projectDir, "rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		stats.GitBranch = strings.TrimSpace(string(out))
	}

	// Git commits today — use an explicit ISO 8601 date+time instead of --since=midnight
	// because "midnight" is locale-dependent and fails in some Git distributions on Windows.
	todayStart := time.Now().Format("2006-01-02") + "T00:00:00"
	if out, err := gitCmdInDir(projectDir, "log", "--oneline", "--all", "--since="+todayStart).Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitCommits = len(strings.Split(lines, "\n"))
		}
	}

	// Git changed files (unstaged + staged)
	if out, err := gitCmdInDir(projectDir, "status", "--porcelain").Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitChanged = len(strings.Split(lines, "\n"))
		}
	}

	// Last commit message + relative time (across all branches)
	if out, err := gitCmdInDir(projectDir, "log", "-1", "--all", "--format=%s (%ar)").Output(); err == nil {
		stats.GitLastCommit = strings.TrimSpace(string(out))
	}

	// Weekly commits (last 7 days, grouped by day-of-week, across all branches)
	for i := 6; i >= 0; i-- {
		date := time.Now().AddDate(0, 0, -i)
		dayStart := date.Format("2006-01-02") + "T00:00:00"
		dayEnd := date.Format("2006-01-02") + "T23:59:59"
		label := date.Format("Mon")
		if out, err := gitCmdInDir(projectDir, "log", "--oneline", "--all", "--since="+dayStart, "--until="+dayEnd).Output(); err == nil {
			lines := strings.TrimSpace(string(out))
			if lines != "" {
				stats.GitWeekly[label] = len(strings.Split(lines, "\n"))
			} else {
				stats.GitWeekly[label] = 0
			}
		} else {
			stats.GitWeekly[label] = 0
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stats); err != nil {
		http.Error(w, fmt.Sprintf("encode error: %v", err), http.StatusInternalServerError)
	}
}
