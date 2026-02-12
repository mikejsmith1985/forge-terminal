//go:build !windows

package main

// startPowerEventListener is a no-op on non-Windows platforms.
// On Windows, this creates a hidden window to receive WM_POWERBROADCAST
// messages for sleep/wake detection.
func startPowerEventListener(onSuspend func()) {
	// No-op: power event monitoring is only supported on Windows
}
