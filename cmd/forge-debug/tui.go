// forge-debug TUI — interactive console interface for the diagnostic tool.
// Uses bubbletea for a clean terminal UI with live-updating status display,
// phase transitions, and key commands (L=launch, C=copy report, Q=quit).
package main

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ── Application phases ──────────────────────────────────────────────────────────

// AppPhase represents which stage of the diagnostic workflow the user is in.
type AppPhase int

const (
	PhaseWelcome    AppPhase = iota // Showing welcome + requesting permission
	PhasePreChecks                  // Running pre-launch environment checks
	PhaseReady                      // Pre-checks done, waiting for user to launch
	PhaseMonitoring                 // fterm.exe running, actively monitoring
	PhaseStopped                    // fterm.exe exited or user stopped it
)

// ── Tick message for live updates ───────────────────────────────────────────────

const MonitorRefreshIntervalMs = 500

type tickMsg time.Time

func createTickCommand() tea.Cmd {
	return tea.Tick(MonitorRefreshIntervalMs*time.Millisecond, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

// ── Phase transition messages ───────────────────────────────────────────────────

type preChecksCompleteMsg struct{ results []CheckResult }
type processLaunchedMsg struct{}
type processExitedMsg struct{ exitError string }
type reportCopiedMsg struct{ isSuccess bool; errorDetail string }

// ── Styles ──────────────────────────────────────────────────────────────────────

var (
	styleTitle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00d4ff")).
			MarginBottom(1)

	styleSubtitle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888"))

	stylePass = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#22c55e"))

	styleFail = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ef4444"))

	styleWarn = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#facc15"))

	styleKey = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00d4ff"))

	styleDim = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#555555"))

	styleSection = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#a855f7")).
			MarginTop(1)

	styleBorder = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#333333")).
			Padding(0, 1)
)

// ── Model ───────────────────────────────────────────────────────────────────────

// TUIModel holds the entire state of the diagnostic tool's terminal interface.
type TUIModel struct {
	phase            AppPhase
	preCheckResults  []CheckResult
	launcher         *ProcessLauncher
	monitor          *MonitorTimeline
	port             int
	hasUserConsented bool
	copyMessage      string
	copyMessageTimer int // countdown ticks before clearing the copy message
	statusMessage    string
	lastError        string
}

// createInitialModel builds the starting state for the TUI application.
func createInitialModel(port int) TUIModel {
	return TUIModel{
		phase: PhaseWelcome,
		port:  port,
	}
}

// ── Init ────────────────────────────────────────────────────────────────────────

func (model TUIModel) Init() tea.Cmd {
	return nil
}

// ── Update ──────────────────────────────────────────────────────────────────────

func (model TUIModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		return model.handleKeyPress(msg)

	case tickMsg:
		return model.handleTick()

	case preChecksCompleteMsg:
		model.preCheckResults = msg.results
		model.phase = PhaseReady
		model.statusMessage = "Pre-checks complete. Press L to launch Forge Terminal."
		return model, nil

	case processLaunchedMsg:
		model.phase = PhaseMonitoring
		model.statusMessage = "Monitoring fterm.exe — press C to copy report, S to stop, Q to quit."
		return model, createTickCommand()

	case processExitedMsg:
		model.phase = PhaseStopped
		if msg.exitError != "" {
			model.statusMessage = fmt.Sprintf("fterm.exe exited: %s", msg.exitError)
		} else {
			model.statusMessage = "fterm.exe has exited. Press C to copy report, Q to quit."
		}
		return model, nil

	case reportCopiedMsg:
		if msg.isSuccess {
			model.copyMessage = "✅ Report copied to clipboard!"
		} else {
			model.copyMessage = fmt.Sprintf("❌ Clipboard error: %s", msg.errorDetail)
		}
		model.copyMessageTimer = 10 // clear after ~5 seconds (10 ticks at 500ms)
		return model, nil
	}

	return model, nil
}

// handleKeyPress processes user keyboard input based on the current phase.
func (model TUIModel) handleKeyPress(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return model.handleQuit()

	case "y", "Y":
		if model.phase == PhaseWelcome && !model.hasUserConsented {
			model.hasUserConsented = true
			model.phase = PhasePreChecks
			model.statusMessage = "Running pre-launch checks..."
			return model, model.runPreChecksCommand()
		}

	case "n", "N":
		if model.phase == PhaseWelcome && !model.hasUserConsented {
			return model, tea.Quit
		}

	case "l", "L":
		if model.phase == PhaseReady {
			return model.handleLaunch()
		}

	case "c", "C":
		if model.phase == PhaseMonitoring || model.phase == PhaseStopped || model.phase == PhaseReady {
			return model, model.copyReportCommand()
		}

	case "s", "S":
		if model.phase == PhaseMonitoring {
			return model.handleStop()
		}
	}

	return model, nil
}

// handleQuit cleanly shuts down the process and monitor before exiting.
func (model TUIModel) handleQuit() (tea.Model, tea.Cmd) {
	if model.monitor != nil {
		model.monitor.stopMonitoring()
	}
	if model.launcher != nil && model.launcher.isProcessRunning() {
		_ = model.launcher.stopProcess()
	}
	return model, tea.Quit
}

// handleLaunch starts fterm.exe and begins monitoring.
func (model TUIModel) handleLaunch() (tea.Model, tea.Cmd) {
	model.launcher = createProcessLauncher("", model.port)
	model.monitor = createMonitorTimeline(model.port)
	model.statusMessage = "Launching fterm.exe..."

	return model, func() tea.Msg {
		execPath, findError := model.launcher.findExecutable()
		if findError != nil {
			return processExitedMsg{exitError: fmt.Sprintf("Cannot find fterm.exe: %v", findError)}
		}
		model.launcher.executablePath = execPath

		if launchError := model.launcher.launchProcess(); launchError != nil {
			return processExitedMsg{exitError: fmt.Sprintf("Failed to launch: %v", launchError)}
		}

		// Wait briefly for the process to start binding its port
		time.Sleep(1 * time.Second)
		model.monitor.startMonitoring()

		// Watch for process exit in background
		go func() {
			<-model.launcher.doneChan
		}()

		return processLaunchedMsg{}
	}
}

// handleStop stops fterm.exe and the monitor.
func (model TUIModel) handleStop() (tea.Model, tea.Cmd) {
	if model.monitor != nil {
		model.monitor.stopMonitoring()
	}
	if model.launcher != nil {
		_ = model.launcher.stopProcess()
	}
	model.phase = PhaseStopped
	model.statusMessage = "Stopped. Press C to copy report, Q to quit."
	return model, nil
}

// handleTick updates the display on each refresh interval.
func (model TUIModel) handleTick() (tea.Model, tea.Cmd) {
	// Clear copy message after countdown
	if model.copyMessageTimer > 0 {
		model.copyMessageTimer--
		if model.copyMessageTimer == 0 {
			model.copyMessage = ""
		}
	}

	// Check if process exited while we were monitoring
	if model.phase == PhaseMonitoring && model.launcher != nil && !model.launcher.isProcessRunning() {
		model.phase = PhaseStopped
		if model.monitor != nil {
			model.monitor.stopMonitoring()
		}
		model.statusMessage = fmt.Sprintf("fterm.exe exited (code %d). Press C to copy report.", model.launcher.exitCode)
		return model, nil
	}

	// Keep ticking while monitoring
	if model.phase == PhaseMonitoring {
		return model, createTickCommand()
	}
	return model, nil
}

// runPreChecksCommand creates a tea.Cmd that runs all pre-launch checks.
func (model TUIModel) runPreChecksCommand() tea.Cmd {
	return func() tea.Msg {
		results := runAllPreLaunchChecks(model.port)
		return preChecksCompleteMsg{results: results}
	}
}

// copyReportCommand creates a tea.Cmd that builds and copies the report.
func (model TUIModel) copyReportCommand() tea.Cmd {
	launcher := model.launcher
	monitor := model.monitor
	preChecks := model.preCheckResults
	port := model.port

	return func() tea.Msg {
		report := buildDiagnosticReport(preChecks, monitor, launcher, port)
		if copyError := copyReportToClipboard(report); copyError != nil {
			return reportCopiedMsg{isSuccess: false, errorDetail: copyError.Error()}
		}
		return reportCopiedMsg{isSuccess: true}
	}
}

// ── View ────────────────────────────────────────────────────────────────────────

func (model TUIModel) View() string {
	var viewBuilder strings.Builder

	viewBuilder.WriteString(renderHeader())
	viewBuilder.WriteString("\n")

	switch model.phase {
	case PhaseWelcome:
		viewBuilder.WriteString(renderWelcomeScreen())
	case PhasePreChecks:
		viewBuilder.WriteString(renderPreChecksRunning())
	case PhaseReady:
		viewBuilder.WriteString(renderPreCheckResults(model.preCheckResults))
		viewBuilder.WriteString(renderReadyPrompt(model.port))
	case PhaseMonitoring:
		viewBuilder.WriteString(renderPreCheckResults(model.preCheckResults))
		viewBuilder.WriteString(renderMonitoringStatus(model.monitor, model.launcher))
	case PhaseStopped:
		viewBuilder.WriteString(renderPreCheckResults(model.preCheckResults))
		viewBuilder.WriteString(renderStoppedStatus(model.monitor, model.launcher))
	}

	if model.copyMessage != "" {
		viewBuilder.WriteString("\n  " + model.copyMessage + "\n")
	}

	viewBuilder.WriteString("\n")
	viewBuilder.WriteString(renderStatusBar(model.statusMessage))
	viewBuilder.WriteString(renderKeyHints(model.phase))

	return viewBuilder.String()
}

// ── Render helpers ──────────────────────────────────────────────────────────────

func renderHeader() string {
	title := styleTitle.Render("⚡ Forge Terminal Diagnostic Tool v" + DebugToolVersion)
	subtitle := styleSubtitle.Render("Diagnoses why terminal sessions won't connect")
	return fmt.Sprintf("\n  %s\n  %s\n", title, subtitle)
}

func renderWelcomeScreen() string {
	var welcomeBuilder strings.Builder
	welcomeBuilder.WriteString(styleSection.Render("  📋 Permission Request") + "\n\n")
	welcomeBuilder.WriteString("  This tool will:\n")
	welcomeBuilder.WriteString("    • Check your system environment (OS, RAM, ports, firewall)\n")
	welcomeBuilder.WriteString("    • Launch fterm.exe and capture its output\n")
	welcomeBuilder.WriteString("    • Test HTTP and WebSocket connectivity\n")
	welcomeBuilder.WriteString("    • Generate a diagnostic report for troubleshooting\n\n")
	welcomeBuilder.WriteString("  No data is sent anywhere — the report stays on your clipboard.\n\n")
	welcomeBuilder.WriteString(fmt.Sprintf("  %s / %s to continue\n",
		styleKey.Render("[Y]es"), styleKey.Render("[N]o")))
	return welcomeBuilder.String()
}

func renderPreChecksRunning() string {
	return "\n  ⏳ Running pre-launch checks...\n"
}

func renderPreCheckResults(checks []CheckResult) string {
	if len(checks) == 0 {
		return ""
	}

	var checksBuilder strings.Builder
	checksBuilder.WriteString(styleSection.Render("  🔍 Pre-Launch Checks") + "\n")

	for _, check := range checks {
		statusIcon := formatCheckStatusIcon(check.Status)
		checksBuilder.WriteString(fmt.Sprintf("  %s %-24s %s\n", statusIcon, check.Name, styleDim.Render(check.Detail)))
		if check.Suggestion != "" {
			checksBuilder.WriteString(fmt.Sprintf("    → %s\n", styleWarn.Render(check.Suggestion)))
		}
	}

	return checksBuilder.String()
}

// formatCheckStatusIcon returns a colored pass/fail/warn indicator for a check result.
func formatCheckStatusIcon(status string) string {
	switch status {
	case "pass":
		return stylePass.Render("✅")
	case "fail":
		return styleFail.Render("❌")
	case "warn":
		return styleWarn.Render("⚠️")
	default:
		return styleDim.Render("○")
	}
}

func renderReadyPrompt(port int) string {
	var readyBuilder strings.Builder
	readyBuilder.WriteString("\n")
	readyBuilder.WriteString(styleSection.Render("  🚀 Ready to Launch") + "\n")
	readyBuilder.WriteString(fmt.Sprintf("  Will start fterm.exe on port %d\n", port))
	readyBuilder.WriteString(fmt.Sprintf("  Press %s to launch, %s to copy pre-check report\n",
		styleKey.Render("[L]aunch"), styleKey.Render("[C]opy")))
	return readyBuilder.String()
}

func renderMonitoringStatus(timeline *MonitorTimeline, launcher *ProcessLauncher) string {
	var monitorBuilder strings.Builder
	monitorBuilder.WriteString("\n")
	monitorBuilder.WriteString(styleSection.Render("  📡 Live Monitoring") + "\n")

	if launcher != nil {
		uptime := launcher.getProcessUptime().Round(time.Second)
		monitorBuilder.WriteString(fmt.Sprintf("  Process: %s | Uptime: %s\n",
			stylePass.Render("Running"), styleDim.Render(uptime.String())))
	}

	if timeline != nil {
		isPortOpen, isHTTPHealthy, isWSConnected := timeline.getLatestStatus()
		monitorBuilder.WriteString(fmt.Sprintf("  Port:      %s\n", formatBoolStatus(isPortOpen)))
		monitorBuilder.WriteString(fmt.Sprintf("  HTTP:      %s\n", formatBoolStatus(isHTTPHealthy)))
		monitorBuilder.WriteString(fmt.Sprintf("  WebSocket: %s\n", formatBoolStatus(isWSConnected)))

		httpRate, wsRate := timeline.getSuccessRates()
		monitorBuilder.WriteString(fmt.Sprintf("  Rates:     HTTP %.0f%% | WS %.0f%%\n", httpRate, wsRate))
	}

	// Show recent process output
	if launcher != nil {
		recentLines := launcher.getRecentLogLines(5)
		if len(recentLines) > 0 {
			monitorBuilder.WriteString("\n" + styleSection.Render("  📝 Recent Output") + "\n")
			for _, logLine := range recentLines {
				timestamp := logLine.Timestamp.Format("15:04:05")
				truncatedText := truncateString(logLine.Text, 80)
				monitorBuilder.WriteString(fmt.Sprintf("  %s [%s] %s\n",
					styleDim.Render(timestamp), logLine.Stream, truncatedText))
			}
		}
	}

	return monitorBuilder.String()
}

func renderStoppedStatus(timeline *MonitorTimeline, launcher *ProcessLauncher) string {
	var stoppedBuilder strings.Builder
	stoppedBuilder.WriteString("\n")
	stoppedBuilder.WriteString(styleSection.Render("  ⏹  Process Stopped") + "\n")

	if launcher != nil {
		stoppedBuilder.WriteString(fmt.Sprintf("  Exit code: %d\n", launcher.exitCode))
		if launcher.exitError != "" {
			stoppedBuilder.WriteString(fmt.Sprintf("  Error: %s\n", styleFail.Render(launcher.exitError)))
		}
	}

	if timeline != nil {
		httpRate, wsRate := timeline.getSuccessRates()
		stoppedBuilder.WriteString(fmt.Sprintf("  Final rates: HTTP %.0f%% | WS %.0f%%\n", httpRate, wsRate))
	}

	stoppedBuilder.WriteString(fmt.Sprintf("\n  Press %s to copy full report\n", styleKey.Render("[C]opy")))
	return stoppedBuilder.String()
}

// formatBoolStatus renders a boolean as a colored pass/fail indicator.
func formatBoolStatus(isHealthy bool) string {
	if isHealthy {
		return stylePass.Render("● Connected")
	}
	return styleFail.Render("○ Not connected")
}

func renderStatusBar(message string) string {
	if message == "" {
		return ""
	}
	return fmt.Sprintf("  %s\n", styleDim.Render(message))
}

func renderKeyHints(phase AppPhase) string {
	var hints string
	switch phase {
	case PhaseWelcome:
		hints = "[Y] Accept  [N] Decline"
	case PhasePreChecks:
		hints = "Running checks..."
	case PhaseReady:
		hints = "[L] Launch  [C] Copy Report  [Q] Quit"
	case PhaseMonitoring:
		hints = "[C] Copy Report  [S] Stop  [Q] Quit"
	case PhaseStopped:
		hints = "[C] Copy Report  [Q] Quit"
	}
	return fmt.Sprintf("\n  %s\n", styleDim.Render(hints))
}

// truncateString shortens a string to maxLength, appending "..." if truncated.
func truncateString(text string, maxLength int) string {
	if len(text) <= maxLength {
		return text
	}
	return text[:maxLength-3] + "..."
}
