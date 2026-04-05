// crypto.go — AES-256-GCM encryption for the Forge Vault.
//
// The vault uses a two-layer security model:
//   1. A 32-byte random master key is generated on first run.
//   2. The master key is wrapped by the OS credential store (Windows DPAPI
//      on Windows, or a 0600-permission file on Unix) so it can only be
//      unwrapped by the same OS user on the same machine.
//   3. The vault data file is encrypted with AES-256-GCM using the master key,
//      with a fresh random 12-byte nonce on every write.
//
// This means that even a stolen copy of vault.enc is useless without the
// OS-protected key file, and the key file is useless without the OS session.
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const (
	// MasterKeyLengthBytes is the size of the AES-256 master key.
	MasterKeyLengthBytes = 32
	// GCMNonceLengthBytes is the standard nonce size for AES-GCM.
	GCMNonceLengthBytes = 12
	// vaultKeyFileName is the name of the file holding the OS-protected master key.
	vaultKeyFileName = "vault.key"
)

// loadOrCreateMasterKey loads the vault master key from the key file at vaultDir,
// generating and saving a new random key if none exists yet.
// The key is protected by the OS credential store (DPAPI on Windows).
func loadOrCreateMasterKey(vaultDir string) ([]byte, error) {
	keyFilePath := filepath.Join(vaultDir, vaultKeyFileName)

	if pathExists(keyFilePath) {
		return readMasterKey(keyFilePath)
	}
	return generateAndSaveMasterKey(keyFilePath)
}

// generateAndSaveMasterKey creates a cryptographically random 32-byte key,
// wraps it with the OS credential store, and writes it to keyFilePath.
func generateAndSaveMasterKey(keyFilePath string) ([]byte, error) {
	masterKey := make([]byte, MasterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, masterKey); err != nil {
		return nil, fmt.Errorf("generating vault master key: %w", err)
	}

	wrappedKey, wrapErr := wrapKeyWithOSCredentials(masterKey)
	if wrapErr != nil {
		clearSensitiveBytes(masterKey)
		return nil, fmt.Errorf("wrapping vault key with OS credentials: %w", wrapErr)
	}

	if writeErr := os.WriteFile(keyFilePath, wrappedKey, 0600); writeErr != nil {
		clearSensitiveBytes(masterKey)
		return nil, fmt.Errorf("saving vault key file: %w", writeErr)
	}

	return masterKey, nil
}

// readMasterKey loads and unwraps the master key from keyFilePath.
// Returns an error if the file is corrupt or belongs to a different OS user.
func readMasterKey(keyFilePath string) ([]byte, error) {
	wrappedKey, readErr := os.ReadFile(keyFilePath)
	if readErr != nil {
		return nil, fmt.Errorf("reading vault key file: %w", readErr)
	}

	masterKey, unwrapErr := unwrapKeyFromOSCredentials(wrappedKey)
	if unwrapErr != nil {
		return nil, fmt.Errorf("unwrapping vault key from OS credentials: %w", unwrapErr)
	}

	return masterKey, nil
}

// encryptVaultContents marshals contents to JSON and encrypts the result
// with AES-256-GCM. The returned blob is: [12-byte nonce | ciphertext | 16-byte tag].
func encryptVaultContents(contents *diskContents, masterKey []byte) ([]byte, error) {
	plaintext, marshalErr := json.Marshal(contents)
	if marshalErr != nil {
		return nil, fmt.Errorf("marshaling vault contents: %w", marshalErr)
	}
	defer clearSensitiveBytes(plaintext)

	aesCipher, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(aesCipher)
	if err != nil {
		return nil, fmt.Errorf("creating GCM cipher: %w", err)
	}

	nonce := make([]byte, GCMNonceLengthBytes)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generating encryption nonce: %w", err)
	}

	// Seal returns: nonce || ciphertext || auth_tag
	encryptedBlob := gcm.Seal(nonce, nonce, plaintext, nil)
	return encryptedBlob, nil
}

// decryptVaultContents decrypts an AES-256-GCM blob produced by encryptVaultContents
// and unmarshals it into diskContents. Fails if the key is wrong or data is corrupted.
func decryptVaultContents(encryptedBlob []byte, masterKey []byte) (*diskContents, error) {
	if len(encryptedBlob) < GCMNonceLengthBytes {
		return nil, fmt.Errorf("encrypted vault blob is too short to contain a valid nonce")
	}

	aesCipher, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(aesCipher)
	if err != nil {
		return nil, fmt.Errorf("creating GCM cipher: %w", err)
	}

	nonce := encryptedBlob[:GCMNonceLengthBytes]
	ciphertext := encryptedBlob[GCMNonceLengthBytes:]

	plaintext, decryptErr := gcm.Open(nil, nonce, ciphertext, nil)
	if decryptErr != nil {
		return nil, fmt.Errorf("decrypting vault (key mismatch or corrupted data): %w", decryptErr)
	}
	defer clearSensitiveBytes(plaintext)

	var contents diskContents
	if unmarshalErr := json.Unmarshal(plaintext, &contents); unmarshalErr != nil {
		return nil, fmt.Errorf("parsing decrypted vault contents: %w", unmarshalErr)
	}

	return &contents, nil
}

// clearSensitiveBytes zeroes a byte slice immediately after use to prevent
// secret values from lingering in memory longer than necessary.
func clearSensitiveBytes(sensitiveData []byte) {
	for idx := range sensitiveData {
		sensitiveData[idx] = 0
	}
}

// pathExists returns true when the given path exists as a regular file.
func pathExists(filePath string) bool {
	info, err := os.Stat(filePath)
	return err == nil && !info.IsDir()
}
