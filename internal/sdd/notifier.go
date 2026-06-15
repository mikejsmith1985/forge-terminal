// notifier.go — best-effort phase-completion notifications to the local AzureWorkflowPOC
// service (FR-011/012). Delivery is fire-and-forget on a background goroutine; failures are
// logged and never propagated, so a down or slow service cannot block or delay the decision
// card. It subscribes to the orchestrator's shared completion seam, independently of the card.
package sdd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Notifier fires one best-effort POST per phase completion. The send function is injectable
// so unit tests run without a real HTTP server.
type Notifier struct {
	send func(NotificationEvent) error
	now  func() time.Time
}

// NewNotifier builds a Notifier targeting the configured endpoint with a short timeout.
func NewNotifier() *Notifier {
	url := notifyURL()
	client := &http.Client{Timeout: notifyTimeout}
	return &Notifier{
		now:  time.Now,
		send: func(event NotificationEvent) error { return postNotification(client, url, event) },
	}
}

// Notify fires the notification on a background goroutine and returns immediately, so the
// caller (the completion seam) is never blocked by a slow or unreachable service (FR-012).
func (n *Notifier) Notify(feature string, phase PhaseName, artifactPath string) {
	event := n.buildEvent(feature, phase, artifactPath)
	go func() {
		if err := n.send(event); err != nil {
			log.Printf("[sdd] notification failed for %s: %v", phase, err)
		}
	}()
}

// buildEvent assembles the notification payload with an RFC3339 timestamp.
func (n *Notifier) buildEvent(feature string, phase PhaseName, artifactPath string) NotificationEvent {
	return NotificationEvent{
		Feature:      feature,
		Phase:        string(phase),
		ArtifactPath: artifactPath,
		Timestamp:    n.now().UTC().Format(time.RFC3339),
	}
}

// postNotification performs the actual HTTP POST; any non-2xx response is treated as an error.
func postNotification(client *http.Client, url string, event NotificationEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("notify endpoint returned %d", resp.StatusCode)
	}
	return nil
}
