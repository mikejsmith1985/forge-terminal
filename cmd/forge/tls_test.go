package main

import (
	"crypto/tls"
	"crypto/x509"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGenerateSelfSignedCert(t *testing.T) {
	// Use temp dir for test certs
	tmpDir := t.TempDir()

	t.Run("generates valid cert and key files", func(t *testing.T) {
		certPath := filepath.Join(tmpDir, "cert1.pem")
		keyPath := filepath.Join(tmpDir, "key1.pem")
		err := GenerateSelfSignedCert(certPath, keyPath)
		if err != nil {
			t.Fatalf("GenerateSelfSignedCert failed: %v", err)
		}
		if _, err := os.Stat(certPath); os.IsNotExist(err) {
			t.Error("cert file not created")
		}
		if _, err := os.Stat(keyPath); os.IsNotExist(err) {
			t.Error("key file not created")
		}
	})

	t.Run("cert is loadable as TLS keypair", func(t *testing.T) {
		certPath := filepath.Join(tmpDir, "cert2.pem")
		keyPath := filepath.Join(tmpDir, "key2.pem")
		GenerateSelfSignedCert(certPath, keyPath)
		_, err := tls.LoadX509KeyPair(certPath, keyPath)
		if err != nil {
			t.Fatalf("failed to load keypair: %v", err)
		}
	})

	t.Run("cert has correct validity period", func(t *testing.T) {
		certPath := filepath.Join(tmpDir, "cert3.pem")
		keyPath := filepath.Join(tmpDir, "key3.pem")
		GenerateSelfSignedCert(certPath, keyPath)
		pair, _ := tls.LoadX509KeyPair(certPath, keyPath)
		leaf, err := x509.ParseCertificate(pair.Certificate[0])
		if err != nil {
			t.Fatalf("failed to parse cert: %v", err)
		}
		// Should be valid for ~365 days
		duration := leaf.NotAfter.Sub(leaf.NotBefore)
		if duration < 364*24*time.Hour || duration > 366*24*time.Hour {
			t.Errorf("cert validity %v not ~365 days", duration)
		}
	})

	t.Run("cert includes localhost SAN", func(t *testing.T) {
		certPath := filepath.Join(tmpDir, "cert4.pem")
		keyPath := filepath.Join(tmpDir, "key4.pem")
		GenerateSelfSignedCert(certPath, keyPath)
		pair, _ := tls.LoadX509KeyPair(certPath, keyPath)
		leaf, _ := x509.ParseCertificate(pair.Certificate[0])
		hasLocalhost := false
		for _, name := range leaf.DNSNames {
			if name == "localhost" {
				hasLocalhost = true
			}
		}
		if !hasLocalhost {
			t.Error("cert missing localhost SAN")
		}
	})

	t.Run("cert includes IP SANs", func(t *testing.T) {
		certPath := filepath.Join(tmpDir, "cert5.pem")
		keyPath := filepath.Join(tmpDir, "key5.pem")
		GenerateSelfSignedCert(certPath, keyPath)
		pair, _ := tls.LoadX509KeyPair(certPath, keyPath)
		leaf, _ := x509.ParseCertificate(pair.Certificate[0])
		if len(leaf.IPAddresses) == 0 {
			t.Error("cert has no IP SANs (should include 127.0.0.1)")
		}
	})
}
