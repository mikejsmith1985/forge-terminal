package license

import (
	"crypto/sha256"
	"fmt"
	"net"
	"os"
	"strings"
)

// MachineID returns a stable anonymous identifier for this machine.
// Computed as sha256(hostname|primaryMAC|username), truncated to 32 hex chars.
// The hash is one-way so no personal data is transmitted to the license server.
func MachineID() string {
	hostname, _ := os.Hostname()
	mac := primaryMAC()
	username := os.Getenv("USER")
	if username == "" {
		username = os.Getenv("USERNAME")
	}

	h := sha256.Sum256([]byte(hostname + "|" + mac + "|" + username))
	return fmt.Sprintf("%x", h[:16])
}

// MachineName returns a short human-readable name for display in the license dashboard.
func MachineName() string {
	hostname, _ := os.Hostname()
	parts := strings.SplitN(hostname, ".", 2)
	return parts[0]
}

func primaryMAC() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "unknown"
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		mac := iface.HardwareAddr.String()
		if mac != "" && mac != "00:00:00:00:00:00" {
			return mac
		}
	}

	return "unknown"
}
