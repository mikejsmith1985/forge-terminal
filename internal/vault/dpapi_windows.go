// dpapi_windows.go — Windows DPAPI key protection for the Forge Vault.
//
// On Windows, the master encryption key is wrapped with CryptProtectData from
// crypt32.dll. This ties the key to the current Windows user account: the same
// blob cannot be decrypted on a different machine or by a different user, even
// if they obtain a copy of vault.enc and vault.key.
//
//go:build windows

package vault

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	modCrypt32           = syscall.NewLazyDLL("crypt32.dll")
	modKernel32          = syscall.NewLazyDLL("kernel32.dll")
	procCryptProtectData = modCrypt32.NewProc("CryptProtectData")
	procCryptUnprotect   = modCrypt32.NewProc("CryptUnprotectData")
	procLocalFree        = modKernel32.NewProc("LocalFree")
)

// windowsDataBlob matches the Windows DATA_BLOB structure expected by DPAPI.
type windowsDataBlob struct {
	cbData uint32 // byte count of the data
	pbData *byte  // pointer to the first byte
}

// newWindowsDataBlob creates a windowsDataBlob pointing at the provided slice.
func newWindowsDataBlob(data []byte) *windowsDataBlob {
	if len(data) == 0 {
		return &windowsDataBlob{}
	}
	return &windowsDataBlob{
		cbData: uint32(len(data)),
		pbData: &data[0],
	}
}

// toByteSlice copies the DATA_BLOB's contents into a Go-managed byte slice.
func (blob *windowsDataBlob) toByteSlice() []byte {
	if blob.cbData == 0 {
		return []byte{}
	}
	return unsafe.Slice(blob.pbData, blob.cbData)
}

// wrapKeyWithOSCredentials encrypts keyBytes using the current user's Windows
// DPAPI credentials. The resulting blob can only be unwrapped on the same
// machine by the same Windows user.
func wrapKeyWithOSCredentials(keyBytes []byte) ([]byte, error) {
	inputBlob := newWindowsDataBlob(keyBytes)
	var outputBlob windowsDataBlob

	// CryptProtectData with flag=0 protects data for the current user only
	// (as opposed to CRYPTPROTECT_LOCAL_MACHINE=0x4 which any local user could decrypt).
	returnCode, _, lastError := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(inputBlob)),
		0, // szDataDescr — no description label needed
		0, // pOptionalEntropy — no additional entropy
		0, // pvReserved — must be NULL per MSDN
		0, // pPromptStruct — no UI prompts
		0, // dwFlags — current-user scope (default)
		uintptr(unsafe.Pointer(&outputBlob)),
	)
	if returnCode == 0 {
		return nil, fmt.Errorf("CryptProtectData failed: %w", lastError)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outputBlob.pbData)))

	wrappedKey := make([]byte, outputBlob.cbData)
	copy(wrappedKey, outputBlob.toByteSlice())
	return wrappedKey, nil
}

// unwrapKeyFromOSCredentials decrypts a DPAPI-protected key blob back to the
// original master key bytes. Returns an error if called by a different user
// or on a different machine than the one that encrypted it.
func unwrapKeyFromOSCredentials(wrappedKey []byte) ([]byte, error) {
	inputBlob := newWindowsDataBlob(wrappedKey)
	var outputBlob windowsDataBlob

	returnCode, _, lastError := procCryptUnprotect.Call(
		uintptr(unsafe.Pointer(inputBlob)),
		0, // ppszDataDescr — not needed
		0, // pOptionalEntropy — must match what was used during protect
		0, // pvReserved — must be NULL
		0, // pPromptStruct — no UI prompts
		0, // dwFlags
		uintptr(unsafe.Pointer(&outputBlob)),
	)
	if returnCode == 0 {
		return nil, fmt.Errorf("CryptUnprotectData failed: %w", lastError)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outputBlob.pbData)))

	masterKey := make([]byte, outputBlob.cbData)
	copy(masterKey, outputBlob.toByteSlice())
	return masterKey, nil
}
