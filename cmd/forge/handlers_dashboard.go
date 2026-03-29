package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

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
	if out, err := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		stats.GitBranch = strings.TrimSpace(string(out))
	}

	// Git commits today
	today := time.Now().Format("2006-01-02")
	if out, err := exec.Command("git", "log", "--oneline", "--since="+today+"T00:00:00").Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitCommits = len(strings.Split(lines, "\n"))
		}
	}

	// Git changed files (unstaged + staged)
	if out, err := exec.Command("git", "status", "--porcelain").Output(); err == nil {
		lines := strings.TrimSpace(string(out))
		if lines != "" {
			stats.GitChanged = len(strings.Split(lines, "\n"))
		}
	}

	// Last commit message + relative time
	if out, err := exec.Command("git", "log", "-1", "--format=%s (%ar)").Output(); err == nil {
		stats.GitLastCommit = strings.TrimSpace(string(out))
	}

	// Weekly commits (last 7 days, grouped by day-of-week)
	for i := 6; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i)
		since := d.Format("2006-01-02") + "T00:00:00"
		until := d.Format("2006-01-02") + "T23:59:59"
		label := d.Format("Mon")
		if out, err := exec.Command("git", "log", "--oneline", "--since="+since, "--until="+until).Output(); err == nil {
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
