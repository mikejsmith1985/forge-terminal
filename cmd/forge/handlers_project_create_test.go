package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleProjectCreate_RejectsNonPost(t *testing.T) {
	for _, method := range []string{"GET", "PUT", "DELETE", "PATCH"} {
		req := httptest.NewRequest(method, "/api/project/create", nil)
		rec := httptest.NewRecorder()
		handleProjectCreate(rec, req)
		if rec.Code != 405 {
			t.Errorf("method %s: want 405, got %d", method, rec.Code)
		}
	}
}

func TestHandleProjectCreate_RejectsBadJSON(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for malformed body, got %d", rec.Code)
	}
}

func TestHandleProjectCreate_RejectsEmptyName(t *testing.T) {
	body := `{"name":"","rootPath":"/tmp"}`
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for empty name, got %d", rec.Code)
	}
}

func TestHandleProjectCreate_RejectsPathSeparatorsInName(t *testing.T) {
	cases := []string{"my/project", `my\project`, "../escape"}
	for _, name := range cases {
		body := `{"name":"` + name + `","rootPath":"/tmp"}`
		req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handleProjectCreate(rec, req)
		if rec.Code != 400 {
			t.Errorf("name %q: want 400 (path traversal guard), got %d", name, rec.Code)
		}
	}
}

func TestHandleProjectCreate_RejectsMissingRootPath(t *testing.T) {
	body := `{"name":"my-project","rootPath":""}`
	req := httptest.NewRequest("POST", "/api/project/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleProjectCreate(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400 for missing rootPath, got %d", rec.Code)
	}
}

// TestHandleProjectCreate_ErrorResponsesAreJSON verifies that all validation
// error paths return a JSON body with an "error" key, not plain text.
// Without this guarantee the frontend's res.json() call throws a SyntaxError,
// which masks the real failure message entirely.
func TestHandleProjectCreate_ErrorResponsesAreJSON(t *testing.T) {
	cases := []struct {
		description    string
		method         string
		body           string
		wantStatusCode int
	}{
		{
			description:    "non-POST method",
			method:         "GET",
			body:           "",
			wantStatusCode: 405,
		},
		{
			description:    "malformed JSON body",
			method:         "POST",
			body:           "{not valid json",
			wantStatusCode: 400,
		},
		{
			description:    "empty project name",
			method:         "POST",
			body:           `{"name":"","rootPath":"/tmp"}`,
			wantStatusCode: 400,
		},
		{
			description:    "missing rootPath",
			method:         "POST",
			body:           `{"name":"my-project","rootPath":""}`,
			wantStatusCode: 400,
		},
		{
			description:    "path traversal attempt in name",
			method:         "POST",
			body:           `{"name":"../escape","rootPath":"/tmp"}`,
			wantStatusCode: 400,
		},
	}

	for _, tc := range cases {
		t.Run(tc.description, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/project/create", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			handleProjectCreate(rec, req)

			if rec.Code != tc.wantStatusCode {
				t.Fatalf("want HTTP %d, got %d", tc.wantStatusCode, rec.Code)
			}

			contentType := rec.Header().Get("Content-Type")
			if !strings.Contains(contentType, "application/json") {
				t.Errorf("want Content-Type application/json, got %q — plain-text errors break frontend JSON parsing", contentType)
			}

			var errorResponse map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&errorResponse); err != nil {
				t.Fatalf("error response body is not valid JSON: %v", err)
			}
			if errorResponse["error"] == "" {
				t.Error("error response JSON must contain a non-empty 'error' field")
			}
		})
	}
}
