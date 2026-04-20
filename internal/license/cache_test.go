package license

import (
	"bytes"
	"crypto/rand"
	"testing"
	"time"
)

// makeTestKey generates a fresh 32-byte AES key for tests.
func makeTestKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, masterKeyLengthBytes)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating test key: %v", err)
	}
	return key
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := makeTestKey(t)
	expires := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)

	original := &Info{
		Key:       "FORGE-TEST-KEY-1234",
		Token:     "tok_abc123",
		Email:     "user@example.com",
		ExpiresAt: expires,
		LastCheck: time.Now().UTC().Truncate(time.Second),
	}

	blob, err := encryptCache(original, key)
	if err != nil {
		t.Fatalf("encryptCache: %v", err)
	}
	if len(blob) <= gcmNonceLengthBytes {
		t.Fatalf("encrypted blob too short: %d bytes", len(blob))
	}

	recovered, err := decryptCache(blob, key)
	if err != nil {
		t.Fatalf("decryptCache: %v", err)
	}

	if recovered.Key != original.Key {
		t.Errorf("Key: got %q, want %q", recovered.Key, original.Key)
	}
	if recovered.Token != original.Token {
		t.Errorf("Token: got %q, want %q", recovered.Token, original.Token)
	}
	if recovered.Email != original.Email {
		t.Errorf("Email: got %q, want %q", recovered.Email, original.Email)
	}
	if !recovered.ExpiresAt.Equal(original.ExpiresAt) {
		t.Errorf("ExpiresAt: got %v, want %v", recovered.ExpiresAt, original.ExpiresAt)
	}
}

func TestDecryptCache_TooShort(t *testing.T) {
	key := makeTestKey(t)
	shortBlob := make([]byte, gcmNonceLengthBytes-1)

	_, err := decryptCache(shortBlob, key)
	if err == nil {
		t.Error("expected error for blob shorter than nonce, got nil")
	}
}

func TestDecryptCache_TamperedCiphertext(t *testing.T) {
	key := makeTestKey(t)
	info := &Info{Key: "k", Token: "t", Email: "e@e.com", LastCheck: time.Now()}

	blob, err := encryptCache(info, key)
	if err != nil {
		t.Fatalf("encryptCache: %v", err)
	}

	// Flip a byte in the ciphertext portion (after nonce)
	blob[gcmNonceLengthBytes] ^= 0xFF

	_, err = decryptCache(blob, key)
	if err == nil {
		t.Error("expected authentication error for tampered ciphertext, got nil")
	}
}

func TestDecryptCache_WrongKey(t *testing.T) {
	key1 := makeTestKey(t)
	key2 := makeTestKey(t)
	info := &Info{Key: "k", Token: "t", Email: "e@e.com", LastCheck: time.Now()}

	blob, err := encryptCache(info, key1)
	if err != nil {
		t.Fatalf("encryptCache: %v", err)
	}

	_, err = decryptCache(blob, key2)
	if err == nil {
		t.Error("expected decryption failure with wrong key, got nil")
	}
}

func TestEncryptProducesDifferentNonceEachTime(t *testing.T) {
	key := makeTestKey(t)
	info := &Info{Key: "k", Token: "t", Email: "e@e.com", LastCheck: time.Now()}

	blob1, _ := encryptCache(info, key)
	blob2, _ := encryptCache(info, key)

	// First gcmNonceLengthBytes are the nonce — should differ due to crypto/rand
	if bytes.Equal(blob1[:gcmNonceLengthBytes], blob2[:gcmNonceLengthBytes]) {
		t.Error("two encryptions produced identical nonces — crypto/rand may be broken")
	}
}

func TestReadWriteCache_RoundTrip(t *testing.T) {
	// Redirect HOME so file I/O stays in a temp dir and doesn't touch the real cache
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	expires := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)
	original := &Info{
		Key:       "FORGE-ROUNDTRIP-KEY",
		Token:     "tok_roundtrip",
		Email:     "roundtrip@example.com",
		ExpiresAt: expires,
		LastCheck: time.Now().UTC().Truncate(time.Second),
	}

	if err := writeCache(original); err != nil {
		t.Fatalf("writeCache: %v", err)
	}

	recovered, err := readCache()
	if err != nil {
		t.Fatalf("readCache: %v", err)
	}

	if recovered.Key != original.Key {
		t.Errorf("Key: got %q, want %q", recovered.Key, original.Key)
	}
	if recovered.Email != original.Email {
		t.Errorf("Email: got %q, want %q", recovered.Email, original.Email)
	}
	if !recovered.ExpiresAt.Equal(original.ExpiresAt) {
		t.Errorf("ExpiresAt: got %v, want %v", recovered.ExpiresAt, original.ExpiresAt)
	}
}

func TestReadCache_MissingFile(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	_, err := readCache()
	if err == nil {
		t.Error("expected error when cache file does not exist, got nil")
	}
}
