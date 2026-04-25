package main

import (
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
