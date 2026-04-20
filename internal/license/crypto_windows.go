// crypto_windows.go — Windows DPAPI key protection for the license cache.
// Mirrors internal/vault/dpapi_windows.go: the master key is wrapped with
// CryptProtectData, tying it to the current Windows user account.
//
//go:build windows

package license

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

type windowsDataBlob struct {
	cbData uint32
	pbData *byte
}

func newWindowsDataBlob(data []byte) *windowsDataBlob {
	if len(data) == 0 {
		return &windowsDataBlob{}
	}
	return &windowsDataBlob{
		cbData: uint32(len(data)),
		pbData: &data[0],
	}
}

func (blob *windowsDataBlob) toByteSlice() []byte {
	if blob.cbData == 0 {
		return []byte{}
	}
	return unsafe.Slice(blob.pbData, blob.cbData)
}

func wrapKeyWithOSCredentials(keyBytes []byte) ([]byte, error) {
	inputBlob := newWindowsDataBlob(keyBytes)
	var outputBlob windowsDataBlob

	returnCode, _, lastError := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(inputBlob)),
		0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(&outputBlob)),
	)
	if returnCode == 0 {
		return nil, fmt.Errorf("CryptProtectData failed: %w", lastError)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outputBlob.pbData)))

	wrapped := make([]byte, outputBlob.cbData)
	copy(wrapped, outputBlob.toByteSlice())
	return wrapped, nil
}

func unwrapKeyFromOSCredentials(wrappedKey []byte) ([]byte, error) {
	inputBlob := newWindowsDataBlob(wrappedKey)
	var outputBlob windowsDataBlob

	returnCode, _, lastError := procCryptUnprotect.Call(
		uintptr(unsafe.Pointer(inputBlob)),
		0, 0, 0, 0, 0,
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
