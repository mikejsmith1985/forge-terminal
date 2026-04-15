// checks.go — Pre-launch diagnostic checks for the forge-debug tool.
// This module runs environment checks BEFORE fterm.exe is launched, helping
// users diagnose connectivity, resource, and configuration issues that would
// prevent Forge Terminal from starting or accepting connections.
package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// ── Constants ──────────────────────────────────────────────────────────────────
// NOTE: DefaultForgePort is defined in main.go (shared across the package).

// HealthCheckPath is the HTTP endpoint used to verify the backend is alive.
const HealthCheckPath = "/api/version"

// WebSocketPath is the endpoint where xterm.js opens its terminal WebSocket.
const WebSocketPath = "/ws"

// MinimumAvailableRAMBytes is the threshold below which we warn the user that
// the system may not have enough free memory to run Forge Terminal reliably.
// 512 MB expressed in bytes.
const MinimumAvailableRAMBytes = 512 * 1024 * 1024

// portDialTimeout is how long we wait when probing whether a port is in use.
const portDialTimeout = 2 * time.Second

// bytesPerMegabyte converts raw byte counts into human-readable megabyte values.
const bytesPerMegabyte = 1024 * 1024

// ── Types ──────────────────────────────────────────────────────────────────────

// CheckResult holds the outcome of a single diagnostic check.
type CheckResult struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // "pass", "fail", "warn"
	Detail     string `json:"detail"`
	Suggestion string `json:"suggestion,omitempty"`
}

// memoryStatusEx mirrors the Windows MEMORYSTATUSEX struct used by the
// kernel32 GlobalMemoryStatusEx syscall to retrieve physical RAM statistics.
type memoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

// runAllPreLaunchChecks executes every pre-launch diagnostic and returns the
// collected results. The portNumber argument controls which TCP port the
// availability check probes. Checks run sequentially because several depend on
// system-wide state (processes, ports) that could change between calls.
func runAllPreLaunchChecks(portNumber int) []CheckResult {
	results := []CheckResult{
		checkOperatingSystem(),
		checkSystemResources(),
		checkExistingProcesses(),
		checkPortAvailability(portNumber),
		checkForgeDirectory(),
		checkFirewallStatus(),
		checkProxySettings(),
		checkAntivirusProcesses(),
	}
	return results
}

// ── Individual Checks ──────────────────────────────────────────────────────────

// checkOperatingSystem collects OS and architecture details so support staff
// can quickly identify the user's environment. On Windows it also captures the
// build number via `cmd /c ver`.
func checkOperatingSystem() CheckResult {
	osDetail := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
	windowsBuild := fetchWindowsBuildString()
	if windowsBuild != "" {
		osDetail = fmt.Sprintf("%s — %s", osDetail, windowsBuild)
	}
	return CheckResult{
		Name:   "Operating System",
		Status: "pass",
		Detail: osDetail,
	}
}

// fetchWindowsBuildString runs `cmd /c ver` on Windows and returns the trimmed
// output (e.g. "Microsoft Windows [Version 10.0.22631.5189]"). Returns an
// empty string on non-Windows systems or if the command fails.
func fetchWindowsBuildString() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	verOutput, execErr := exec.Command("cmd", "/c", "ver").Output()
	if execErr != nil {
		return ""
	}
	return strings.TrimSpace(string(verOutput))
}

// checkSystemResources reports CPU count and physical RAM availability.
// On Windows it calls GlobalMemoryStatusEx via kernel32.dll; on other
// platforms it reports CPU count only.
func checkSystemResources() CheckResult {
	cpuCount := runtime.NumCPU()
	totalRAMMB, availableRAMMB, isRAMAvailable := fetchWindowsRAMStats()

	if !isRAMAvailable {
		return CheckResult{
			Name:   "System Resources",
			Status: "pass",
			Detail: fmt.Sprintf("CPUs: %d — RAM info unavailable (non-Windows or syscall failed)", cpuCount),
		}
	}

	detail := fmt.Sprintf("CPUs: %d — RAM: %d MB available / %d MB total", cpuCount, availableRAMMB, totalRAMMB)
	isRAMLow := (availableRAMMB * bytesPerMegabyte) < MinimumAvailableRAMBytes
	if isRAMLow {
		return CheckResult{
			Name:       "System Resources",
			Status:     "warn",
			Detail:     detail,
			Suggestion: "Available RAM is below 512 MB. Close unused applications before launching Forge.",
		}
	}

	return CheckResult{
		Name:   "System Resources",
		Status: "pass",
		Detail: detail,
	}
}

// fetchWindowsRAMStats calls GlobalMemoryStatusEx on Windows and returns
// (totalMB, availableMB, ok). Returns (0, 0, false) on non-Windows or on
// syscall failure.
func fetchWindowsRAMStats() (uint64, uint64, bool) {
	if runtime.GOOS != "windows" {
		return 0, 0, false
	}

	kernel32 := newLazyDLL("kernel32.dll")
	globalMemoryStatusExProc := kernel32.NewProc("GlobalMemoryStatusEx")

	memStatus := memoryStatusEx{dwLength: uint32(unsafe.Sizeof(memoryStatusEx{}))}
	returnCode, _, _ := globalMemoryStatusExProc.Call(uintptr(unsafe.Pointer(&memStatus)))

	// GlobalMemoryStatusEx returns non-zero on success
	isCallSuccessful := returnCode != 0
	if !isCallSuccessful {
		return 0, 0, false
	}

	totalMB := memStatus.ullTotalPhys / uint64(bytesPerMegabyte)
	availableMB := memStatus.ullAvailPhys / uint64(bytesPerMegabyte)
	return totalMB, availableMB, true
}

// checkExistingProcesses looks for already-running fterm.exe instances that
// could cause port conflicts or session confusion.
func checkExistingProcesses() CheckResult {
	if runtime.GOOS != "windows" {
		return CheckResult{
			Name:   "Existing Processes",
			Status: "pass",
			Detail: "Process check skipped (non-Windows)",
		}
	}

	tasklistOutput, execErr := exec.Command(
		"tasklist", "/FI", "IMAGENAME eq fterm.exe", "/FO", "CSV", "/NH",
	).Output()
	if execErr != nil {
		return CheckResult{
			Name:   "Existing Processes",
			Status: "warn",
			Detail: fmt.Sprintf("Could not query process list: %v", execErr),
		}
	}

	trimmedOutput := strings.TrimSpace(string(tasklistOutput))
	isProcessFound := trimmedOutput != "" && !strings.Contains(trimmedOutput, "no tasks")
	if isProcessFound {
		lineCount := len(strings.Split(trimmedOutput, "\n"))
		return CheckResult{
			Name:       "Existing Processes",
			Status:     "warn",
			Detail:     fmt.Sprintf("Found %d existing fterm.exe process(es)", lineCount),
			Suggestion: "Close existing Forge Terminal instances to avoid port conflicts.",
		}
	}

	return CheckResult{
		Name:   "Existing Processes",
		Status: "pass",
		Detail: "No existing fterm.exe processes detected",
	}
}

// checkPortAvailability probes whether the given TCP port is already in use
// on localhost. A refused connection means the port is free (good); a
// successful connection means something else is listening (bad).
func checkPortAvailability(portNumber int) CheckResult {
	targetAddress := fmt.Sprintf("127.0.0.1:%d", portNumber)
	connection, dialErr := net.DialTimeout("tcp", targetAddress, portDialTimeout)

	// Connection refused → port is free → that's what we want
	if dialErr != nil {
		return CheckResult{
			Name:   "Port Availability",
			Status: "pass",
			Detail: fmt.Sprintf("Port %d is available", portNumber),
		}
	}

	// Connection succeeded → something is already listening on this port
	connection.Close()
	return CheckResult{
		Name:       "Port Availability",
		Status:     "fail",
		Detail:     fmt.Sprintf("Port %d is already in use", portNumber),
		Suggestion: fmt.Sprintf("Another process is listening on port %d. Stop it or configure Forge to use a different port.", portNumber),
	}
}

// checkForgeDirectory verifies that the ~/.forge/ configuration directory
// exists and is writable. Forge stores session data, vault keys, and config
// files here; if it's missing or read-only the server will fail on startup.
func checkForgeDirectory() CheckResult {
	homeDirectory, homeErr := os.UserHomeDir()
	if homeErr != nil {
		return CheckResult{
			Name:       "Forge Directory",
			Status:     "fail",
			Detail:     fmt.Sprintf("Cannot determine home directory: %v", homeErr),
			Suggestion: "Ensure the HOME or USERPROFILE environment variable is set.",
		}
	}

	forgeDirectoryPath := filepath.Join(homeDirectory, ".forge")
	directoryInfo, statErr := os.Stat(forgeDirectoryPath)
	if statErr != nil || !directoryInfo.IsDir() {
		return CheckResult{
			Name:       "Forge Directory",
			Status:     "fail",
			Detail:     fmt.Sprintf("Directory does not exist: %s", forgeDirectoryPath),
			Suggestion: "Run Forge Terminal once to auto-create ~/.forge, or create it manually.",
		}
	}

	// Verify write access by creating and immediately removing a probe file
	isWritable, writeCheckDetail := probeDirectoryWriteAccess(forgeDirectoryPath)
	contentsSummary := summarizeDirectoryContents(forgeDirectoryPath)

	if !isWritable {
		return CheckResult{
			Name:       "Forge Directory",
			Status:     "fail",
			Detail:     fmt.Sprintf("Directory exists but is not writable: %s — %s", forgeDirectoryPath, writeCheckDetail),
			Suggestion: "Check file permissions on the ~/.forge directory.",
		}
	}

	return CheckResult{
		Name:   "Forge Directory",
		Status: "pass",
		Detail: fmt.Sprintf("Directory OK: %s — contents: %s", forgeDirectoryPath, contentsSummary),
	}
}

// probeDirectoryWriteAccess creates a temporary probe file in the target
// directory and removes it immediately. Returns (true, "") on success or
// (false, errorDetail) on failure.
func probeDirectoryWriteAccess(directoryPath string) (bool, string) {
	probePath := filepath.Join(directoryPath, ".forge-debug-write-probe")
	probeFile, createErr := os.Create(probePath)
	if createErr != nil {
		return false, fmt.Sprintf("create failed: %v", createErr)
	}
	probeFile.Close()
	os.Remove(probePath)
	return true, ""
}

// summarizeDirectoryContents reads the entries in the given directory and
// returns a brief summary string like "5 items (config.toml, vault.db, ...)".
func summarizeDirectoryContents(directoryPath string) string {
	entries, readErr := os.ReadDir(directoryPath)
	if readErr != nil {
		return "unable to list contents"
	}
	if len(entries) == 0 {
		return "empty"
	}

	const maxEntriesToShow = 5
	entryNames := make([]string, 0, maxEntriesToShow)
	for idx, entry := range entries {
		if idx >= maxEntriesToShow {
			break
		}
		entryNames = append(entryNames, entry.Name())
	}

	summary := fmt.Sprintf("%d items (%s", len(entries), strings.Join(entryNames, ", "))
	if len(entries) > maxEntriesToShow {
		summary += ", ..."
	}
	summary += ")"
	return summary
}

// checkFirewallStatus queries the Windows Firewall state for the current
// network profile. This is informational — the check always passes, but
// the detail helps support staff understand the user's network environment.
func checkFirewallStatus() CheckResult {
	if runtime.GOOS != "windows" {
		return CheckResult{
			Name:   "Firewall Status",
			Status: "pass",
			Detail: "Firewall check skipped (non-Windows)",
		}
	}

	netshOutput, execErr := exec.Command(
		"netsh", "advfirewall", "show", "currentprofile", "state",
	).Output()
	if execErr != nil {
		return CheckResult{
			Name:   "Firewall Status",
			Status: "pass",
			Detail: fmt.Sprintf("Could not query firewall status: %v", execErr),
		}
	}

	outputText := strings.TrimSpace(string(netshOutput))
	isFirewallEnabled := strings.Contains(strings.ToLower(outputText), "on")

	stateLabel := "OFF"
	if isFirewallEnabled {
		stateLabel = "ON"
	}

	return CheckResult{
		Name:   "Firewall Status",
		Status: "pass",
		Detail: fmt.Sprintf("Windows Firewall is %s", stateLabel),
	}
}

// checkProxySettings detects HTTP/HTTPS proxy configuration from environment
// variables and Windows system proxy settings. Proxies can interfere with
// WebSocket connections, so we flag them as warnings.
func checkProxySettings() CheckResult {
	detectedProxies := collectProxyEnvironmentVars()
	systemProxy := fetchWindowsSystemProxy()
	if systemProxy != "" {
		detectedProxies = append(detectedProxies, fmt.Sprintf("System: %s", systemProxy))
	}

	hasProxyConfigured := len(detectedProxies) > 0
	if hasProxyConfigured {
		return CheckResult{
			Name:       "Proxy Settings",
			Status:     "warn",
			Detail:     fmt.Sprintf("Proxy detected: %s", strings.Join(detectedProxies, "; ")),
			Suggestion: "Proxies may interfere with WebSocket connections. Ensure localhost is excluded via NO_PROXY.",
		}
	}

	return CheckResult{
		Name:   "Proxy Settings",
		Status: "pass",
		Detail: "No proxy configuration detected",
	}
}

// collectProxyEnvironmentVars reads the standard proxy environment variables
// and returns a slice of "NAME=value" strings for any that are set.
func collectProxyEnvironmentVars() []string {
	proxyVarNames := []string{"HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"}
	detectedVars := make([]string, 0, len(proxyVarNames))

	for _, varName := range proxyVarNames {
		varValue := os.Getenv(varName)
		if varValue == "" {
			// Also check the lowercase variant (e.g. http_proxy)
			varValue = os.Getenv(strings.ToLower(varName))
		}
		if varValue != "" {
			detectedVars = append(detectedVars, fmt.Sprintf("%s=%s", varName, varValue))
		}
	}
	return detectedVars
}

// fetchWindowsSystemProxy queries the Windows system proxy via `netsh winhttp
// show proxy`. Returns the proxy address string, or empty if none is configured
// or the command fails.
func fetchWindowsSystemProxy() string {
	if runtime.GOOS != "windows" {
		return ""
	}

	netshOutput, execErr := exec.Command("netsh", "winhttp", "show", "proxy").Output()
	if execErr != nil {
		return ""
	}

	outputText := string(netshOutput)
	// If "Direct access" appears, no system proxy is configured
	isDirectAccess := strings.Contains(outputText, "Direct access")
	if isDirectAccess {
		return ""
	}

	// Extract the proxy server line if present
	for _, line := range strings.Split(outputText, "\n") {
		trimmedLine := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmedLine), "proxy server") {
			return trimmedLine
		}
	}
	return strings.TrimSpace(outputText)
}

// checkAntivirusProcesses scans running processes for known antivirus
// executables. AV software can slow down or block Forge Terminal's file
// system and network operations. This is informational only.
func checkAntivirusProcesses() CheckResult {
	if runtime.GOOS != "windows" {
		return CheckResult{
			Name:   "Antivirus Detection",
			Status: "pass",
			Detail: "AV check skipped (non-Windows)",
		}
	}

	tasklistOutput, execErr := exec.Command("tasklist", "/FO", "CSV", "/NH").Output()
	if execErr != nil {
		return CheckResult{
			Name:   "Antivirus Detection",
			Status: "pass",
			Detail: fmt.Sprintf("Could not query process list: %v", execErr),
		}
	}

	detectedProducts := matchAntivirusProducts(string(tasklistOutput))

	if len(detectedProducts) == 0 {
		return CheckResult{
			Name:   "Antivirus Detection",
			Status: "pass",
			Detail: "No known antivirus processes detected",
		}
	}

	return CheckResult{
		Name:   "Antivirus Detection",
		Status: "pass",
		Detail: fmt.Sprintf("Active AV: %s", strings.Join(detectedProducts, ", ")),
	}
}

// knownAntivirusSignatures maps process executable names (lowercase) to their
// human-readable product names for the antivirus detection check.
var knownAntivirusSignatures = map[string]string{
	"msmpeng.exe":        "Windows Defender",
	"mpcmdrun.exe":       "Windows Defender CLI",
	"avp.exe":            "Kaspersky",
	"avpui.exe":          "Kaspersky UI",
	"avgnt.exe":          "Avira",
	"avscan.exe":         "Avira Scanner",
	"mbam.exe":           "Malwarebytes",
	"mbamservice.exe":    "Malwarebytes Service",
	"norton.exe":         "Norton",
	"ns.exe":             "Norton Security",
	"mcshield.exe":       "McAfee",
	"mcafeefire.exe":     "McAfee Firewall",
	"bdagent.exe":        "Bitdefender",
	"bdservicehost.exe":  "Bitdefender Service",
	"ekrn.exe":           "ESET",
	"egui.exe":           "ESET GUI",
	"sophoshealth.exe":   "Sophos",
	"savservice.exe":     "Sophos AV",
	"clamav.exe":         "ClamAV",
	"freshclam.exe":      "ClamAV Updater",
	"crowdstrike.exe":    "CrowdStrike Falcon",
	"csfalconservice.exe": "CrowdStrike Falcon Service",
}

// matchAntivirusProducts scans tasklist CSV output against known AV process
// signatures and returns a deduplicated list of detected product names.
func matchAntivirusProducts(tasklistOutput string) []string {
	loweredOutput := strings.ToLower(tasklistOutput)
	seenProducts := make(map[string]bool)
	detectedProducts := make([]string, 0)

	for processName, productLabel := range knownAntivirusSignatures {
		if strings.Contains(loweredOutput, processName) {
			// Deduplicate by product label (e.g. multiple Defender processes)
			if !seenProducts[productLabel] {
				seenProducts[productLabel] = true
				detectedProducts = append(detectedProducts, productLabel)
			}
		}
	}
	return detectedProducts
}

// newLazyDLL is a thin wrapper around syscall.NewLazyDLL, extracted to keep
// the calling code concise while remaining explicit about the DLL being loaded.
func newLazyDLL(dllName string) *syscall.LazyDLL {
	return syscall.NewLazyDLL(dllName)
}
