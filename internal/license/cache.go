// cache.go — AES-256-GCM encrypted license cache.
// Replicates the two-layer security model from internal/vault/crypto.go:
//   - 32-byte master key wrapped by OS credentials (DPAPI on Windows, 0600 file on Unix)
//   - Cache data encrypted with AES-256-GCM, fresh 12-byte nonce per write
package license

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

const (
	masterKeyLengthBytes = 32
	gcmNonceLengthBytes  = 12
)

func readCache() (*Info, error) {
	masterKey, err := loadOrCreateMasterKey()
	if err != nil {
		return nil, fmt.Errorf("loading license key: %w", err)
	}
	defer clearSensitiveBytes(masterKey)

	encryptedBlob, err := os.ReadFile(storage.GetLicenseCachePath())
	if err != nil {
		return nil, fmt.Errorf("reading license cache: %w", err)
	}

	return decryptCache(encryptedBlob, masterKey)
}

func writeCache(info *Info) error {
	if err := os.MkdirAll(filepath.Dir(storage.GetLicenseCachePath()), 0700); err != nil {
		return fmt.Errorf("creating license dir: %w", err)
	}

	masterKey, err := loadOrCreateMasterKey()
	if err != nil {
		return fmt.Errorf("loading license key: %w", err)
	}
	defer clearSensitiveBytes(masterKey)

	blob, err := encryptCache(info, masterKey)
	if err != nil {
		return err
	}

	return os.WriteFile(storage.GetLicenseCachePath(), blob, 0600)
}

func clearCache() error {
	_ = os.Remove(storage.GetLicenseCachePath())
	_ = os.Remove(storage.GetLicenseKeyPath())
	return nil
}

func loadOrCreateMasterKey() ([]byte, error) {
	keyPath := storage.GetLicenseKeyPath()
	if pathExists(keyPath) {
		return readMasterKey(keyPath)
	}
	return generateAndSaveMasterKey(keyPath)
}

func generateAndSaveMasterKey(keyPath string) ([]byte, error) {
	if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
		return nil, fmt.Errorf("creating license dir: %w", err)
	}

	masterKey := make([]byte, masterKeyLengthBytes)
	if _, err := io.ReadFull(rand.Reader, masterKey); err != nil {
		return nil, fmt.Errorf("generating license master key: %w", err)
	}

	wrapped, err := wrapKeyWithOSCredentials(masterKey)
	if err != nil {
		clearSensitiveBytes(masterKey)
		return nil, fmt.Errorf("wrapping license key: %w", err)
	}

	if err := os.WriteFile(keyPath, wrapped, 0600); err != nil {
		clearSensitiveBytes(masterKey)
		return nil, fmt.Errorf("saving license key file: %w", err)
	}

	return masterKey, nil
}

func readMasterKey(keyPath string) ([]byte, error) {
	wrapped, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("reading license key file: %w", err)
	}
	return unwrapKeyFromOSCredentials(wrapped)
}

func encryptCache(info *Info, masterKey []byte) ([]byte, error) {
	plaintext, err := json.Marshal(info)
	if err != nil {
		return nil, fmt.Errorf("marshaling license info: %w", err)
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

	nonce := make([]byte, gcmNonceLengthBytes)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generating nonce: %w", err)
	}

	// Seal returns: nonce || ciphertext || auth_tag
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func decryptCache(encryptedBlob []byte, masterKey []byte) (*Info, error) {
	if len(encryptedBlob) < gcmNonceLengthBytes {
		return nil, fmt.Errorf("license cache blob is too short")
	}

	aesCipher, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(aesCipher)
	if err != nil {
		return nil, fmt.Errorf("creating GCM cipher: %w", err)
	}

	nonce := encryptedBlob[:gcmNonceLengthBytes]
	ciphertext := encryptedBlob[gcmNonceLengthBytes:]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting license cache (key mismatch or corrupted): %w", err)
	}
	defer clearSensitiveBytes(plaintext)

	var info Info
	if err := json.Unmarshal(plaintext, &info); err != nil {
		return nil, fmt.Errorf("parsing license cache: %w", err)
	}

	return &info, nil
}

func clearSensitiveBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

func pathExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
