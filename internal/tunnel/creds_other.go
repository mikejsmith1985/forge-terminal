//go:build !windows

package tunnel

// hardenWindowsACL is a no-op on non-Windows platforms.
// POSIX file-mode bits are applied by HardenTunnelDir directly.
func hardenWindowsACL(dir string) error {
	_ = dir
	return nil
}
