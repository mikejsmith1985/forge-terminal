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
	gitRootOnce sync.Once
	gitRoot     string
)

// detectGitRoot finds the git repository root, caching the result.
// It tries os.Getwd() first, then falls back to the executable's directory.
func detectGitRoot() string {
	gitRootOnce.Do(func() {
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
				return
			}
		}
		if exe, err := os.Executable(); err == nil {
			if root := tryDir(filepath.Dir(exe)); root != "" {
				gitRoot = root
			}
		}
	})
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

func handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
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
	if out, err := gitCmd("rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		stats.GitBranch = strings.TrimSpace(string(out))
	}

	// Git commits today (author-date, local timezone)
	today := time.Now().Format("2006-01-02")
	if out, err := gitCmd("log", "--oneline", "--after="+today+" 00:00:00", "--before="+today+" 23:59:59").Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitCommits = len(strings.Split(lines, "\n"))
		}
	}

	// Git changed files (unstaged + staged)
	if out, err := gitCmd("status", "--porcelain").Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitChanged = len(strings.Split(lines, "\n"))
		}
	}

	// Last commit message + relative time
	if out, err := gitCmd("log", "-1", "--format=%s (%ar)").Output(); err == nil {
		stats.GitLastCommit = strings.TrimSpace(string(out))
	}

	// Weekly commits (last 7 days, grouped by day-of-week)
	for i := 6; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i)
		dateStr := d.Format("2006-01-02")
		label := d.Format("Mon")
		if out, err := gitCmd("log", "--oneline", "--after="+dateStr+" 00:00:00", "--before="+dateStr+" 23:59:59").Output(); err == nil {
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
