package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/mikejsmith1985/forge-terminal/internal/releasejobs"
)

const defaultReleaseJobLogTailBytes = 20000

type projectReleaseJobServiceInterface interface {
	StartJob(store *releasejobs.ReleaseJobStore, options releasejobs.ReleaseJobCreateOptions) (*releasejobs.ReleaseJob, error)
	ReadJob(store *releasejobs.ReleaseJobStore, jobID string, maxLogBytes int) (*releasejobs.ReleaseJob, string, error)
	FindActiveJob(store *releasejobs.ReleaseJobStore) (*releasejobs.ReleaseJob, error)
}

type releaseJobStartRequest struct {
	RepoPath                  string `json:"repoPath"`
	Version                   string `json:"version"`
	ReleaseNotes              string `json:"releaseNotes"`
	IncludeUncommittedChanges bool   `json:"includeUncommittedChanges"`
	ShouldProceedWithWarnings bool   `json:"shouldProceedWithWarnings"`
}

type releaseJobResponse struct {
	JobID  string                  `json:"job_id,omitempty"`
	Status string                  `json:"status,omitempty"`
	Job    *releasejobs.ReleaseJob `json:"job,omitempty"`
	Log    string                  `json:"log,omitempty"`
	Error  string                  `json:"error,omitempty"`
}

var projectReleaseJobService projectReleaseJobServiceInterface = releasejobs.NewReleaseJobManager(nil)

// handleProjectReleaseJobs starts and reads background local release jobs.
func handleProjectReleaseJobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		handleProjectReleaseJobStart(w, r)
	case http.MethodGet:
		handleProjectReleaseJobRead(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleProjectReleaseJobStart(w http.ResponseWriter, r *http.Request) {
	var request releaseJobStartRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&request); decodeErr != nil {
		writeReleaseJobJSON(w, http.StatusBadRequest, releaseJobResponse{Error: "invalid release job request"})
		return
	}
	store := releasejobs.NewReleaseJobStore(request.RepoPath)
	job, startErr := projectReleaseJobService.StartJob(store, releasejobs.ReleaseJobCreateOptions{
		RepoPath:                  request.RepoPath,
		Version:                   request.Version,
		ReleaseNotes:              request.ReleaseNotes,
		IncludeUncommittedChanges: request.IncludeUncommittedChanges,
		ShouldProceedWithWarnings: request.ShouldProceedWithWarnings,
	})
	if startErr != nil {
		handleReleaseJobStartError(w, startErr)
		return
	}
	writeReleaseJobJSON(w, http.StatusAccepted, releaseJobResponse{
		JobID:  job.JobID,
		Status: job.Status,
		Job:    job,
	})
}

func handleProjectReleaseJobRead(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("repoPath")
	if repoPath == "" {
		writeReleaseJobJSON(w, http.StatusBadRequest, releaseJobResponse{Error: "repoPath is required"})
		return
	}
	store := releasejobs.NewReleaseJobStore(repoPath)
	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		activeJob, activeErr := projectReleaseJobService.FindActiveJob(store)
		if activeErr != nil {
			writeReleaseJobJSON(w, http.StatusInternalServerError, releaseJobResponse{Error: activeErr.Error()})
			return
		}
		writeReleaseJobJSON(w, http.StatusOK, releaseJobResponse{Job: activeJob})
		return
	}

	maxLogBytes := parseReleaseJobLogLimit(r.URL.Query().Get("maxLogBytes"))
	job, logText, readErr := projectReleaseJobService.ReadJob(store, jobID, maxLogBytes)
	if readErr != nil {
		writeReleaseJobJSON(w, http.StatusNotFound, releaseJobResponse{Error: readErr.Error()})
		return
	}
	writeReleaseJobJSON(w, http.StatusOK, releaseJobResponse{
		JobID:  job.JobID,
		Status: job.Status,
		Job:    job,
		Log:    logText,
	})
}

func handleReleaseJobStartError(w http.ResponseWriter, startErr error) {
	if errors.Is(startErr, releasejobs.ErrActiveReleaseJob) {
		writeReleaseJobJSON(w, http.StatusConflict, releaseJobResponse{Error: startErr.Error()})
		return
	}
	writeReleaseJobJSON(w, http.StatusBadRequest, releaseJobResponse{Error: startErr.Error()})
}

func parseReleaseJobLogLimit(rawLimit string) int {
	limit, parseErr := strconv.Atoi(rawLimit)
	if parseErr != nil || limit <= 0 {
		return defaultReleaseJobLogTailBytes
	}
	return limit
}

func writeReleaseJobJSON(w http.ResponseWriter, statusCode int, payload releaseJobResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
