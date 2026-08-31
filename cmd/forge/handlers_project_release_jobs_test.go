package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/releasejobs"
)

type fakeProjectReleaseJobService struct {
	startedOptions releasejobs.ReleaseJobCreateOptions
	startErr       error
	job            *releasejobs.ReleaseJob
	logText        string
}

func (service *fakeProjectReleaseJobService) StartJob(_ *releasejobs.ReleaseJobStore, options releasejobs.ReleaseJobCreateOptions) (*releasejobs.ReleaseJob, error) {
	service.startedOptions = options
	if service.startErr != nil {
		return nil, service.startErr
	}
	return service.job, nil
}

func (service *fakeProjectReleaseJobService) ReadJob(_ *releasejobs.ReleaseJobStore, jobID string, _ int) (*releasejobs.ReleaseJob, string, error) {
	if service.job == nil || service.job.JobID != jobID {
		return nil, "", errors.New("job not found")
	}
	return service.job, service.logText, nil
}

func (service *fakeProjectReleaseJobService) FindActiveJob(_ *releasejobs.ReleaseJobStore) (*releasejobs.ReleaseJob, error) {
	return service.job, nil
}

func TestHandleProjectReleaseJobs_StartsBackgroundJob(t *testing.T) {
	originalService := projectReleaseJobService
	defer func() { projectReleaseJobService = originalService }()

	fakeService := &fakeProjectReleaseJobService{
		job: &releasejobs.ReleaseJob{JobID: "job-123", Status: releasejobs.ReleaseJobStatusQueued},
	}
	projectReleaseJobService = fakeService

	body := `{"repoPath":"C:\\ProjectsWin\\forge-terminal","version":"7.10.24","releaseNotes":"Ship background releases","includeUncommittedChanges":true,"shouldProceedWithWarnings":true}`
	request := httptest.NewRequest(http.MethodPost, "/api/project/release-jobs", strings.NewReader(body))
	response := httptest.NewRecorder()

	handleProjectReleaseJobs(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", response.Code)
	}
	if fakeService.startedOptions.Version != "7.10.24" {
		t.Fatalf("version = %q, want 7.10.24", fakeService.startedOptions.Version)
	}
	if !fakeService.startedOptions.IncludeUncommittedChanges {
		t.Fatal("IncludeUncommittedChanges was not forwarded to release job service")
	}
	var payload map[string]any
	if decodeErr := json.NewDecoder(response.Body).Decode(&payload); decodeErr != nil {
		t.Fatalf("response JSON decode failed: %v", decodeErr)
	}
	if payload["status"] != releasejobs.ReleaseJobStatusQueued {
		t.Fatalf("response status = %v, want queued", payload["status"])
	}
}

func TestHandleProjectReleaseJobs_RejectsSecondActiveJob(t *testing.T) {
	originalService := projectReleaseJobService
	defer func() { projectReleaseJobService = originalService }()

	projectReleaseJobService = &fakeProjectReleaseJobService{startErr: releasejobs.ErrActiveReleaseJob}

	body := `{"repoPath":"C:\\ProjectsWin\\forge-terminal","version":"7.10.24","releaseNotes":"Ship background releases"}`
	request := httptest.NewRequest(http.MethodPost, "/api/project/release-jobs", strings.NewReader(body))
	response := httptest.NewRecorder()

	handleProjectReleaseJobs(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", response.Code)
	}
}
