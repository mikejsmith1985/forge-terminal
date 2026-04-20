// crypto_other.go — Unix key protection for the license cache.
// Security relies on the 0600 file permission on license.key.
//
//go:build !windows

package license

import (
	"fmt"
	"os"
)

func wrapKeyWithOSCredentials(keyBytes []byte) ([]byte, error) {
	return keyBytes, nil
}

func unwrapKeyFromOSCredentials(wrappedKey []byte) ([]byte, error) {
	return wrappedKey, nil
}

func enforceKeyFilePermissions(keyFilePath string) error {
	if err := os.Chmod(keyFilePath, 0600); err != nil {
		return fmt.Errorf("enforcing 0600 permissions on license key file %q: %w", keyFilePath, err)
	}
	return nil
}
