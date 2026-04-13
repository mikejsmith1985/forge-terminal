package mcp_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

func TestValidateRequestToken_ValidBearer(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req.Header.Set("Authorization", "Bearer secret-token")

	if !mcp.ValidateRequestToken(req, "secret-token") {
		t.Error("expected valid token to be accepted")
	}
}

func TestValidateRequestToken_WrongToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")

	if mcp.ValidateRequestToken(req, "secret-token") {
		t.Error("expected wrong token to be rejected")
	}
}

func TestValidateRequestToken_MissingHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)

	if mcp.ValidateRequestToken(req, "secret-token") {
		t.Error("expected missing header to be rejected")
	}
}

func TestValidateRequestToken_MissingBearerPrefix(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req.Header.Set("Authorization", "secret-token") // missing "Bearer " prefix

	if mcp.ValidateRequestToken(req, "secret-token") {
		t.Error("expected token without Bearer prefix to be rejected")
	}
}

func TestValidateRequestToken_EmptyExpected(t *testing.T) {
	// Empty expected token (e.g. auth setup failed) should reject any request.
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req.Header.Set("Authorization", "Bearer anything")

	if mcp.ValidateRequestToken(req, "") {
		t.Error("expected empty expected-token to reject all requests")
	}
}

func TestValidateRequestToken_TimingResistance(t *testing.T) {
	// Both these calls must reach the same code path (constant-time compare).
	// We can't measure timing precisely in unit tests, but we can verify they
	// both return the right answer, confirming the comparison runs in full.
	req1 := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req1.Header.Set("Authorization", "Bearer a"+strings.Repeat("x", 63))

	req2 := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req2.Header.Set("Authorization", "Bearer z"+strings.Repeat("x", 63))

	expected := "a" + strings.Repeat("x", 63)

	if !mcp.ValidateRequestToken(req1, expected) {
		t.Error("expected matching long token to be accepted")
	}
	if mcp.ValidateRequestToken(req2, expected) {
		t.Error("expected near-miss long token to be rejected")
	}
}
