//go:build windows

package main

import (
	"log"
	"syscall"
	"unsafe"
)

// Windows power management constants
const (
	WM_POWERBROADCAST      = 0x0218
	PBT_APMSUSPEND         = 0x0004
	PBT_APMRESUMEAUTOMATIC = 0x0012
	PBT_APMRESUMESUSPEND   = 0x0007
	WM_DESTROY             = 0x0002
)

// Window class constants
const (
	CS_HREDRAW = 0x0002
	CS_VREDRAW = 0x0001
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

// WNDCLASSEXW represents the Windows WNDCLASSEX structure
type wndClassExW struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   syscall.Handle
	Icon       syscall.Handle
	Cursor     syscall.Handle
	Background syscall.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     syscall.Handle
}

// MSG represents the Windows MSG structure
type msg struct {
	Hwnd    syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

type point struct {
	X, Y int32
}

// onSuspend is called when the system is about to suspend (sleep/hibernate)
var onSuspendCallback func()

// powerWindowProc handles Windows messages for the hidden power event window
func powerWindowProc(hwnd syscall.Handle, uMsg uint32, wParam, lParam uintptr) uintptr {
	switch uMsg {
	case WM_POWERBROADCAST:
		switch wParam {
		case PBT_APMSUSPEND:
			log.Println("[Power] ⚡ System suspending (sleep/hibernate) - closing sessions gracefully")
			if onSuspendCallback != nil {
				onSuspendCallback()
			}
			return 1 // TRUE - allow suspend
		case PBT_APMRESUMEAUTOMATIC:
			log.Println("[Power] ⚡ System resumed from sleep (automatic)")
			return 1
		case PBT_APMRESUMESUSPEND:
			log.Println("[Power] ⚡ System resumed from sleep (user-initiated)")
			return 1
		}
	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}
	ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(uMsg), wParam, lParam)
	return ret
}

// startPowerEventListener creates a hidden window to receive WM_POWERBROADCAST messages.
// The onSuspend callback is called when the system is about to sleep/hibernate.
// This function blocks and should be called in a goroutine.
func startPowerEventListener(onSuspend func()) {
	onSuspendCallback = onSuspend

	className, _ := syscall.UTF16PtrFromString("ForgePowerEventWindow")

	hInstance, _, _ := procGetModuleHandleW.Call(0)

	wc := wndClassExW{
		Style:     CS_HREDRAW | CS_VREDRAW,
		WndProc:   syscall.NewCallback(powerWindowProc),
		Instance:  syscall.Handle(hInstance),
		ClassName: className,
	}
	wc.Size = uint32(unsafe.Sizeof(wc))

	ret, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if ret == 0 {
		log.Printf("[Power] Failed to register window class: %v", err)
		return
	}

	windowName, _ := syscall.UTF16PtrFromString("Forge Power Events")

	hwnd, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowName)),
		0, // Not visible
		0, 0, // x, y position (doesn't matter for hidden window)
		0, 0, // width, height (doesn't matter for hidden window)
		0, 0,
		hInstance,
		0,
	)
	if hwnd == 0 {
		log.Printf("[Power] Failed to create power event window: %v", err)
		return
	}

	log.Println("[Power] ⚡ Power event listener started (monitoring sleep/wake)")

	// Message loop - blocks until WM_QUIT
	var m msg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if ret == 0 { // WM_QUIT
			break
		}
		if int32(ret) == -1 { // Error
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	log.Println("[Power] Power event listener stopped")
}
