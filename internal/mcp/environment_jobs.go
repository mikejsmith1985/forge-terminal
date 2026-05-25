// environment_jobs.go provides persistent, recoverable records for adaptive build jobs.
//
// The job manager lets an MCP request return immediately while Forge continues the
// build in-process and writes metadata plus logs under the project .forge folder.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	environmentJobsDirectoryName = "adaptive-build-jobs"
	environmentJobMetadataFile   = "job.json"
	environmentJobLogFile        = "job.log"
)

const (
	// EnvironmentJobStatusQueued means Forge accepted the job but has not started execution yet.
	EnvironmentJobStatusQueued = "queued"
	// EnvironmentJobStatusRunning means the command is currently executing.
	EnvironmentJobStatusRunning = "running"
	// EnvironmentJobStatusCompleted means the command ran and returned exit code 0.
	EnvironmentJobStatusCompleted = "completed"
	// EnvironmentJobStatusFailed means the command ran but returned non-zero or could not start.
	EnvironmentJobStatusFailed = "failed"
)

// EnvironmentJobCreateOptions captures the caller-provided command details that
// must be persisted before a resumable adaptive build job starts.
type EnvironmentJobCreateOptions struct {
	Command              string
	RequestedEnvironment string
	WorkingDirectory     string
	DockerImage          string
	TimeoutSeconds       int
}

// EnvironmentJob is the durable metadata shape saved beside each adaptive build log.
type EnvironmentJob struct {
	JobID                string     `json:"job_id"`
	Command              string     `json:"command"`
	RequestedEnvironment string     `json:"requested_environment"`
	EnvironmentUsed      string     `json:"environment_used,omitempty"`
	WorkingDirectory     string     `json:"cwd,omitempty"`
	DockerImage          string     `json:"image,omitempty"`
	TimeoutSeconds       int        `json:"timeout_seconds"`
	Status               string     `json:"status"`
	ExitCode             *int       `json:"exit_code,omitempty"`
	LogPath              string     `json:"log_path"`
	CreatedAt            time.Time  `json:"created_at"`
	StartedAt            *time.Time `json:"started_at,omitempty"`
	FinishedAt           *time.Time `json:"finished_at,omitempty"`
	UpdatedAt            time.Time  `json:"updated_at"`
	ErrorMessage         string     `json:"error_message,omitempty"`
}

// EnvironmentJobStore owns on-disk metadata and logs for adaptive build jobs.
type EnvironmentJobStore struct {
	projectRoot string
	jobsRoot    string
	mu          sync.RWMutex
}

// NewEnvironmentJobStore creates a store rooted at <project>/.forge/adaptive-build-jobs.
func NewEnvironmentJobStore(projectRoot string) *EnvironmentJobStore {
	jobsRoot := filepath.Join(projectRoot, ".forge", environmentJobsDirectoryName)
	return &EnvironmentJobStore{projectRoot: projectRoot, jobsRoot: jobsRoot}
}

// ProjectRoot returns the root path backing the store, primarily for restart tests.
func (store *EnvironmentJobStore) ProjectRoot() string {
	return store.projectRoot
}

// CreateJob persists an initial queued job record before execution begins.
func (store *EnvironmentJobStore) CreateJob(options EnvironmentJobCreateOptions) (*EnvironmentJob, error) {
	now := time.Now().UTC()
	jobID := uuid.New().String()
	job := &EnvironmentJob{
		JobID:                jobID,
		Command:              options.Command,
		RequestedEnvironment: defaultJobEnvironment(options.RequestedEnvironment),
		WorkingDirectory:     options.WorkingDirectory,
		DockerImage:          defaultJobDockerImage(options.DockerImage),
		TimeoutSeconds:       defaultJobTimeout(options.TimeoutSeconds),
		Status:               EnvironmentJobStatusQueued,
		LogPath:              store.logPath(jobID),
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if saveErr := store.SaveJob(job); saveErr != nil {
		return nil, saveErr
	}
	return job, nil
}

// SaveJob atomically writes a job metadata file so resumed sessions never read torn JSON.
func (store *EnvironmentJobStore) SaveJob(job *EnvironmentJob) error {
	if job == nil {
		return errors.New("cannot save nil environment job")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.saveJobLocked(job)
}

// LoadJob reads one persisted job record by ID.
func (store *EnvironmentJobStore) LoadJob(jobID string) (*EnvironmentJob, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return store.loadJobLocked(jobID)
}

func (store *EnvironmentJobStore) loadJobLocked(jobID string) (*EnvironmentJob, error) {
	body, readErr := os.ReadFile(store.metadataPath(jobID))
	if readErr != nil {
		return nil, fmt.Errorf("reading environment job %q: %w", jobID, readErr)
	}
	var job EnvironmentJob
	if unmarshalErr := json.Unmarshal(body, &job); unmarshalErr != nil {
		return nil, fmt.Errorf("parsing environment job %q: %w", jobID, unmarshalErr)
	}
	return &job, nil
}

// ListJobs returns all persisted jobs that can be parsed from disk.
func (store *EnvironmentJobStore) ListJobs() ([]EnvironmentJob, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	entries, readErr := os.ReadDir(store.jobsRoot)
	if errors.Is(readErr, os.ErrNotExist) {
		return []EnvironmentJob{}, nil
	}
	if readErr != nil {
		return nil, fmt.Errorf("listing environment jobs: %w", readErr)
	}

	jobs := make([]EnvironmentJob, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		job, loadErr := store.loadJobLocked(entry.Name())
		if loadErr != nil {
			return nil, loadErr
		}
		jobs = append(jobs, *job)
	}
	sort.Slice(jobs, func(leftIndex, rightIndex int) bool {
		return jobs[leftIndex].CreatedAt.After(jobs[rightIndex].CreatedAt)
	})
	return jobs, nil
}

// AppendLog appends text to the job log, creating parent directories as needed.
func (store *EnvironmentJobStore) AppendLog(jobID string, text string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if mkdirErr := os.MkdirAll(store.jobDir(jobID), 0o755); mkdirErr != nil {
		return fmt.Errorf("creating environment job log directory: %w", mkdirErr)
	}
	logFile, openErr := os.OpenFile(store.logPath(jobID), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if openErr != nil {
		return fmt.Errorf("opening environment job log: %w", openErr)
	}
	defer logFile.Close()
	if _, writeErr := logFile.WriteString(text); writeErr != nil {
		return fmt.Errorf("writing environment job log: %w", writeErr)
	}
	return nil
}

// ReadLog returns the whole log or the tail when maxBytes is positive.
func (store *EnvironmentJobStore) ReadLog(jobID string, maxBytes int) (string, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	body, readErr := os.ReadFile(store.logPath(jobID))
	if errors.Is(readErr, os.ErrNotExist) {
		return "", nil
	}
	if readErr != nil {
		return "", fmt.Errorf("reading environment job log: %w", readErr)
	}
	if maxBytes > 0 && len(body) > maxBytes {
		return string(body[len(body)-maxBytes:]), nil
	}
	return string(body), nil
}

func (store *EnvironmentJobStore) saveJobLocked(job *EnvironmentJob) error {
	job.UpdatedAt = time.Now().UTC()
	if mkdirErr := os.MkdirAll(store.jobDir(job.JobID), 0o755); mkdirErr != nil {
		return fmt.Errorf("creating environment job directory: %w", mkdirErr)
	}
	body, marshalErr := json.MarshalIndent(job, "", "  ")
	if marshalErr != nil {
		return fmt.Errorf("encoding environment job: %w", marshalErr)
	}
	metadataPath := store.metadataPath(job.JobID)
	temporaryPath := metadataPath + ".tmp"
	if writeErr := os.WriteFile(temporaryPath, body, 0o644); writeErr != nil {
		return fmt.Errorf("writing environment job metadata: %w", writeErr)
	}
	if removeErr := os.Remove(metadataPath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return fmt.Errorf("replacing environment job metadata: %w", removeErr)
	}
	if renameErr := os.Rename(temporaryPath, metadataPath); renameErr != nil {
		return fmt.Errorf("moving environment job metadata into place: %w", renameErr)
	}
	return nil
}

func (store *EnvironmentJobStore) jobDir(jobID string) string {
	return filepath.Join(store.jobsRoot, jobID)
}

func (store *EnvironmentJobStore) metadataPath(jobID string) string {
	return filepath.Join(store.jobDir(jobID), environmentJobMetadataFile)
}

func (store *EnvironmentJobStore) logPath(jobID string) string {
	return filepath.Join(store.jobDir(jobID), environmentJobLogFile)
}

// EnvironmentJobManager starts jobs and reads persisted job/log state.
type EnvironmentJobManager struct {
	runner CommandRunner
	store  *EnvironmentJobStore
}

// NewEnvironmentJobManager creates a manager using the provided process runner and store.
func NewEnvironmentJobManager(runner CommandRunner, store *EnvironmentJobStore) *EnvironmentJobManager {
	if runner == nil {
		runner = &realCommandRunner{}
	}
	if store == nil {
		store = NewEnvironmentJobStore("")
	}
	return &EnvironmentJobManager{runner: runner, store: store}
}

// StartJob persists a queued record, then runs the adaptive command in the background.
func (manager *EnvironmentJobManager) StartJob(options EnvironmentJobCreateOptions) (*EnvironmentJob, error) {
	if options.Command == "" {
		return nil, errors.New("environment job command is required")
	}
	job, createErr := manager.store.CreateJob(options)
	if createErr != nil {
		return nil, createErr
	}
	go manager.runJob(job)
	return job, nil
}

// ReadJob returns the current metadata and log text for a persisted job.
func (manager *EnvironmentJobManager) ReadJob(jobID string, maxLogBytes int) (*EnvironmentJob, string, error) {
	job, loadErr := manager.store.LoadJob(jobID)
	if loadErr != nil {
		return nil, "", loadErr
	}
	logText, logErr := manager.store.ReadLog(jobID, maxLogBytes)
	if logErr != nil {
		return nil, "", logErr
	}
	return job, logText, nil
}

// ListJobs exposes persisted job metadata for recovery after an agent resumes.
func (manager *EnvironmentJobManager) ListJobs() ([]EnvironmentJob, error) {
	return manager.store.ListJobs()
}

func (manager *EnvironmentJobManager) runJob(job *EnvironmentJob) {
	startedAt := time.Now().UTC()
	job.Status = EnvironmentJobStatusRunning
	job.StartedAt = &startedAt
	if saveErr := manager.store.SaveJob(job); saveErr != nil {
		logEnvironmentJobStoreError(job.JobID, "marking job running", saveErr)
	}

	timeout := time.Duration(defaultJobTimeout(job.TimeoutSeconds)) * time.Second
	runCtx, cancelRun := context.WithTimeout(context.Background(), timeout)
	defer cancelRun()

	runResult, runErr := runInEnvironment(runCtx, manager.runner, RunOptions{
		Command:          job.Command,
		Environment:      job.RequestedEnvironment,
		WorkingDirectory: job.WorkingDirectory,
		DockerImage:      job.DockerImage,
	})
	manager.finishJob(job, runResult, runErr)
}

func (manager *EnvironmentJobManager) finishJob(job *EnvironmentJob, runResult EnvironmentRunResult, runErr error) {
	finishedAt := time.Now().UTC()
	job.FinishedAt = &finishedAt
	job.Status = EnvironmentJobStatusCompleted
	if runErr == nil {
		job.EnvironmentUsed = runResult.EnvironmentUsed
		job.ExitCode = &runResult.ExitCode
	}
	if runErr != nil || runResult.ExitCode != 0 {
		job.Status = EnvironmentJobStatusFailed
	}
	if runErr != nil {
		job.ErrorMessage = runErr.Error()
	}
	if appendErr := manager.store.AppendLog(job.JobID, runResult.Stdout); appendErr != nil {
		logEnvironmentJobStoreError(job.JobID, "appending stdout", appendErr)
	}
	if appendErr := manager.store.AppendLog(job.JobID, runResult.Stderr); appendErr != nil {
		logEnvironmentJobStoreError(job.JobID, "appending stderr", appendErr)
	}
	if runErr != nil {
		if appendErr := manager.store.AppendLog(job.JobID, "\n[forge adaptive job error] "+runErr.Error()+"\n"); appendErr != nil {
			logEnvironmentJobStoreError(job.JobID, "appending error message", appendErr)
		}
	}
	if saveErr := manager.store.SaveJob(job); saveErr != nil {
		logEnvironmentJobStoreError(job.JobID, "marking job finished", saveErr)
	}
}

func defaultJobEnvironment(environment string) string {
	if environment == "" {
		return StrategyAuto
	}
	return environment
}

func defaultJobDockerImage(dockerImage string) string {
	if dockerImage == "" {
		return DefaultDockerImage
	}
	return dockerImage
}

func defaultJobTimeout(timeoutSeconds int) int {
	if timeoutSeconds == 0 {
		return defaultEnvironmentTimeoutSec
	}
	return clampTimeout(timeoutSeconds)
}

func logEnvironmentJobStoreError(jobID string, action string, err error) {
	log.Printf("[MCP] environment job %s: %s failed: %v", jobID, action, err)
}
