package license

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

// Activate registers this machine for the given license key.
// Writes the returned Info to the encrypted cache before returning.
func Activate(key string) (*Info, error) {
	body, _ := json.Marshal(map[string]string{
		"key":         key,
		"machineId":   MachineID(),
		"machineName": MachineName(),
	})

	resp, err := httpClient.Post(WorkerBaseURL+"/license/activate", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("contacting license server: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		// continue
	case http.StatusPaymentRequired:
		return nil, fmt.Errorf("machine limit reached — deactivate another machine first")
	case http.StatusNotFound:
		return nil, fmt.Errorf("license key not found")
	case http.StatusForbidden:
		return nil, fmt.Errorf("license is suspended or expired")
	default:
		return nil, fmt.Errorf("license server error (HTTP %d)", resp.StatusCode)
	}

	var ar struct {
		Token     string    `json:"token"`
		Email     string    `json:"email"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ar); err != nil {
		return nil, fmt.Errorf("parsing activate response: %w", err)
	}

	info := &Info{
		Key:       key,
		Token:     ar.Token,
		Email:     ar.Email,
		ExpiresAt: ar.ExpiresAt,
		LastCheck: time.Now(),
	}

	if err := writeCache(info); err != nil {
		return nil, fmt.Errorf("saving license cache: %w", err)
	}

	return info, nil
}

// Validate checks the current license status with the Worker and refreshes the cache.
func Validate(info *Info) (Status, error) {
	body, _ := json.Marshal(map[string]string{
		"key":       info.Key,
		"machineId": MachineID(),
	})

	req, _ := http.NewRequest("POST", WorkerBaseURL+"/license/validate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+info.Token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return StatusGrace, fmt.Errorf("contacting license server: %w", err)
	}
	defer resp.Body.Close()

	var vr struct {
		Status    Status    `json:"status"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&vr); err != nil {
		return StatusGrace, fmt.Errorf("parsing validate response: %w", err)
	}

	info.LastCheck = time.Now()
	info.ExpiresAt = vr.ExpiresAt
	if vr.Status == StatusOK {
		info.GracePeriodExpires = nil
	}
	_ = writeCache(info)

	return vr.Status, nil
}

// Deactivate removes this machine from the license and clears the local cache.
func Deactivate(info *Info) error {
	body, _ := json.Marshal(map[string]string{
		"key":       info.Key,
		"machineId": MachineID(),
	})

	req, _ := http.NewRequest("POST", WorkerBaseURL+"/license/deactivate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+info.Token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("contacting license server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("deactivation failed (HTTP %d)", resp.StatusCode)
	}

	return clearCache()
}

// SignedDownloadURL obtains a short-lived signed download URL from the Worker.
// The Worker validates the license token and issues a 15-minute download token.
func SignedDownloadURL(info *Info, version, platform string) (string, error) {
	url := fmt.Sprintf("%s/download?version=%s&platform=%s", WorkerBaseURL, version, platform)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+info.Token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("contacting license server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", fmt.Errorf("license token invalid or expired")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download URL request failed (HTTP %d)", resp.StatusCode)
	}

	var result struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("parsing download URL response: %w", err)
	}

	return result.URL, nil
}
