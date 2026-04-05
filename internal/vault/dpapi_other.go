// dpapi_other.go — Unix key protection for the Forge Vault.
//
// On non-Windows systems, there is no OS-level key wrapping (DPAPI equivalent).
// Security relies on the vault.key file having 0600 permissions, which restricts
// access to the owning user. The vault.key file is re-chmod'd to 0600 every time
// it is read or created to guard against accidental permission broadening.
//
//go:build !windows

package vault

import (
	"fmt"
	"os"
)

// wrapKeyWithOSCredentials on Unix is a no-op: the key bytes are returned
// unchanged and security depends entirely on the 0600 file permission set
// when the key file is written.
func wrapKeyWithOSCredentials(keyBytes []byte) ([]byte, error) {
	return keyBytes, nil
}

// unwrapKeyFromOSCredentials on Unix is a no-op: the stored bytes are the
// raw key, so they are returned as-is. The 0600 permission on the key file
// is the sole access control mechanism on this platform.
func unwrapKeyFromOSCredentials(wrappedKey []byte) ([]byte, error) {
	return wrappedKey, nil
}

// enforceKeyFilePermissions re-applies 0600 permissions to the vault key file
// to ensure it is never accessible to other users, even if the permission was
// changed externally (e.g., by a backup tool or admin operation).
func enforceKeyFilePermissions(keyFilePath string) error {
	if err := os.Chmod(keyFilePath, 0600); err != nil {
		return fmt.Errorf("enforcing 0600 permissions on vault key file %q: %w", keyFilePath, err)
	}
	return nil
}
