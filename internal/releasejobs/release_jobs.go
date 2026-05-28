// release_jobs.go runs Release Manager local pipelines as durable background jobs.
//
// The manager avoids terminal token waste by running local-release.ps1 outside the
// active PTY, while metadata and logs remain recoverable under .forge/release-jobs.
package releasejobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	releaseJobsDirectoryName = "release-jobs"
	releaseJobMetadataFile   = "job.json"
	releaseJobLogFile        = "job.log"
	localReleaseScriptPath   = "scripts/local-release.ps1"
)

const (
	// DefaultReleaseTimeoutSeconds gives the full local release pipeline enough
	// time for frontend builds, Go cross-compilation, and gh release upload.
	DefaultReleaseTimeoutSeconds = 3600
)

const (
	// ReleaseJobStatusQueued means Forge accepted the release but has not started it yet.
	ReleaseJobStatusQueued = "queued"
	// ReleaseJobStatusRunning means local-release.ps1 is currently executing.
	ReleaseJobStatusRunning = "running"
	// ReleaseJobStatusCompleted means the release script exited successfully.
	ReleaseJobStatusCompleted = "completed"
	// ReleaseJobStatusFailed means the script failed or could not be started.
	ReleaseJobStatusFailed = "failed"
)

// ErrActiveReleaseJob is returned when a repository already has a queued or running release.
var ErrActiveReleaseJob = errors.New("release job already active for repository")

// ReleaseJobCreateOptions captures the UI choices needed to run local-release.ps1 non-interactively.
type ReleaseJobCreateOptions struct {
	RepoPath                  string
	Version                   string
	ReleaseNotes              string
	IncludeUncommittedChanges bool
	ShouldProceedWithWarnings bool
	TimeoutSeconds            int
}

// ReleaseJob is the durable metadata saved beside each background release log.
type ReleaseJob struct {
	JobID                     string     `json:"job_id"`
	RepoPath                  string     `json:"repo_path"`
	ScriptPath                string     `json:"script_path"`
	Version                   string     `json:"version"`
	ReleaseNotes              string     `json:"release_notes"`
	IncludeUncommittedChanges bool       `json:"include_uncommitted_changes"`
	ShouldProceedWithWarnings bool       `json:"should_proceed_with_warnings"`
	TimeoutSeconds            int        `json:"timeout_seconds"`
	Status                    string     `json:"status"`
	ExitCode                  *int       `json:"exit_code,omitempty"`
	LogPath                   string     `json:"log_path"`
	CreatedAt                 time.Time  `json:"created_at"`
	StartedAt                 *time.Time `json:"started_at,omitempty"`
	FinishedAt                *time.Time `json:"finished_at,omitempty"`
	UpdatedAt                 time.Time  `json:"updated_at"`
	ErrorMessage              string     `json:"error_message,omitempty"`
}

// ProcessOutput is the captured output from one release process execution.
type ProcessOutput struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// ReleaseProcessRunner abstracts process execution so tests never spawn PowerShell.
type ReleaseProcessRunner interface {
	RunReleaseCommand(ctx context.Context, executable string, arguments []string, workingDirectory string) (ProcessOutput, error)
}

// ReleaseJobStore owns on-disk metadata and logs for release jobs in one repository.
type ReleaseJobStore struct {
	projectRoot string
	jobsRoot    string
	mu          sync.RWMutex
}

// NewReleaseJobStore creates a store rooted at <repo>/.forge/release-jobs.
func NewReleaseJobStore(projectRoot string) *ReleaseJobStore {
	cleanProjectRoot := filepath.Clean(projectRoot)
	return &ReleaseJobStore{
		projectRoot: cleanProjectRoot,
		jobsRoot:    filepath.Join(cleanProjectRoot, ".forge", releaseJobsDirectoryName),
	}
}

// ProjectRoot returns the repository root backing this store.
func (store *ReleaseJobStore) ProjectRoot() string {
	return store.projectRoot
}

// CreateJob persists a queued job before the release process starts.
func (store *ReleaseJobStore) CreateJob(options ReleaseJobCreateOptions) (*ReleaseJob, error) {
	normalizedOptions, validateErr := normalizeCreateOptions(options)
	if validateErr != nil {
		return nil, validateErr
	}
	now := time.Now().UTC()
	jobID := uuid.New().String()
	job := &ReleaseJob{
		JobID:                     jobID,
		RepoPath:                  normalizedOptions.RepoPath,
		ScriptPath:                filepath.Join(normalizedOptions.RepoPath, localReleaseScriptPath),
		Version:                   normalizedOptions.Version,
		ReleaseNotes:              normalizedOptions.ReleaseNotes,
		IncludeUncommittedChanges: normalizedOptions.IncludeUncommittedChanges,
		ShouldProceedWithWarnings: normalizedOptions.ShouldProceedWithWarnings,
		TimeoutSeconds:            defaultReleaseTimeout(normalizedOptions.TimeoutSeconds),
		Status:                    ReleaseJobStatusQueued,
		LogPath:                   store.logPath(jobID),
		CreatedAt:                 now,
		UpdatedAt:                 now,
	}
	if saveErr := store.SaveJob(job); saveErr != nil {
		return nil, saveErr
	}
	return job, nil
}

// SaveJob atomically writes job metadata so the UI never reads torn JSON.
func (store *ReleaseJobStore) SaveJob(job *ReleaseJob) error {
	if job == nil {
		return errors.New("cannot save nil release job")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.saveJobLocked(job)
}

// LoadJob reads one persisted job record.
func (store *ReleaseJobStore) LoadJob(jobID string) (*ReleaseJob, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return store.loadJobLocked(jobID)
}

// ListJobs returns all persisted release jobs, newest first.
func (store *ReleaseJobStore) ListJobs() ([]ReleaseJob, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	entries, readErr := os.ReadDir(store.jobsRoot)
	if errors.Is(readErr, os.ErrNotExist) {
		return []ReleaseJob{}, nil
	}
	if readErr != nil {
		return nil, fmt.Errorf("listing release jobs: %w", readErr)
	}

	jobs := make([]ReleaseJob, 0, len(entries))
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

// AppendLog appends process output to the durable job log.
func (store *ReleaseJobStore) AppendLog(jobID string, text string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if mkdirErr := os.MkdirAll(store.jobDir(jobID), 0o755); mkdirErr != nil {
		return fmt.Errorf("creating release job log directory: %w", mkdirErr)
	}
	logFile, openErr := os.OpenFile(store.logPath(jobID), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if openErr != nil {
		return fmt.Errorf("opening release job log: %w", openErr)
	}
	defer logFile.Close()
	if _, writeErr := logFile.WriteString(text); writeErr != nil {
		return fmt.Errorf("writing release job log: %w", writeErr)
	}
	return nil
}

// ReadLog returns the full log or the tail when maxBytes is positive.
func (store *ReleaseJobStore) ReadLog(jobID string, maxBytes int) (string, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	body, readErr := os.ReadFile(store.logPath(jobID))
	if errors.Is(readErr, os.ErrNotExist) {
		return "", nil
	}
	if readErr != nil {
		return "", fmt.Errorf("reading release job log: %w", readErr)
	}
	if maxBytes > 0 && len(body) > maxBytes {
		return string(body[len(body)-maxBytes:]), nil
	}
	return string(body), nil
}

// FindActiveJob returns the newest queued/running job for the repository, if any.
func (store *ReleaseJobStore) FindActiveJob() (*ReleaseJob, error) {
	jobs, listErr := store.ListJobs()
	if listErr != nil {
		return nil, listErr
	}
	for index := range jobs {
		if isActiveReleaseStatus(jobs[index].Status) {
			return &jobs[index], nil
		}
	}
	return nil, nil
}

func (store *ReleaseJobStore) loadJobLocked(jobID string) (*ReleaseJob, error) {
	body, readErr := os.ReadFile(store.metadataPath(jobID))
	if readErr != nil {
		return nil, fmt.Errorf("reading release job %q: %w", jobID, readErr)
	}
	var job ReleaseJob
	if unmarshalErr := json.Unmarshal(body, &job); unmarshalErr != nil {
		return nil, fmt.Errorf("parsing release job %q: %w", jobID, unmarshalErr)
	}
	return &job, nil
}

func (store *ReleaseJobStore) saveJobLocked(job *ReleaseJob) error {
	job.UpdatedAt = time.Now().UTC()
	if mkdirErr := os.MkdirAll(store.jobDir(job.JobID), 0o755); mkdirErr != nil {
		return fmt.Errorf("creating release job directory: %w", mkdirErr)
	}
	body, marshalErr := json.MarshalIndent(job, "", "  ")
	if marshalErr != nil {
		return fmt.Errorf("encoding release job: %w", marshalErr)
	}
	// Write directly so Windows readers never observe a missing job.json between
	// Remove and Rename. The store mutex keeps Forge's own readers serialized.
	if writeErr := os.WriteFile(store.metadataPath(job.JobID), body, 0o644); writeErr != nil {
		return fmt.Errorf("writing release job metadata: %w", writeErr)
	}
	return nil
}

func (store *ReleaseJobStore) jobDir(jobID string) string {
	return filepath.Join(store.jobsRoot, jobID)
}

func (store *ReleaseJobStore) metadataPath(jobID string) string {
	return filepath.Join(store.jobDir(jobID), releaseJobMetadataFile)
}

func (store *ReleaseJobStore) logPath(jobID string) string {
	return filepath.Join(store.jobDir(jobID), releaseJobLogFile)
}

// ReleaseJobManager starts jobs and reads persisted job/log state.
type ReleaseJobManager struct {
	runner ReleaseProcessRunner
	mu     sync.Mutex
}

// NewReleaseJobManager creates a manager with a real process runner unless tests inject one.
func NewReleaseJobManager(runner ReleaseProcessRunner) *ReleaseJobManager {
	if runner == nil {
		runner = &realReleaseProcessRunner{}
	}
	return &ReleaseJobManager{runner: runner}
}

// StartJob persists a queued release job, then runs local-release.ps1 in the background.
func (manager *ReleaseJobManager) StartJob(store *ReleaseJobStore, options ReleaseJobCreateOptions) (*ReleaseJob, error) {
	if store == nil {
		return nil, errors.New("release job store is required")
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()

	activeJob, activeErr := store.FindActiveJob()
	if activeErr != nil {
		return nil, activeErr
	}
	if activeJob != nil {
		return nil, ErrActiveReleaseJob
	}
	job, createErr := store.CreateJob(options)
	if createErr != nil {
		return nil, createErr
	}
	go manager.runJob(store, job)
	return job, nil
}

// ReadJob returns current metadata and log text for one release job.
func (manager *ReleaseJobManager) ReadJob(store *ReleaseJobStore, jobID string, maxLogBytes int) (*ReleaseJob, string, error) {
	if store == nil {
		return nil, "", errors.New("release job store is required")
	}
	job, loadErr := store.LoadJob(jobID)
	if loadErr != nil {
		return nil, "", loadErr
	}
	logText, logErr := store.ReadLog(jobID, maxLogBytes)
	if logErr != nil {
		return nil, "", logErr
	}
	return job, logText, nil
}

// FindActiveJob returns a queued or running release job for resume-on-refresh UI.
func (manager *ReleaseJobManager) FindActiveJob(store *ReleaseJobStore) (*ReleaseJob, error) {
	if store == nil {
		return nil, errors.New("release job store is required")
	}
	return store.FindActiveJob()
}

func (manager *ReleaseJobManager) runJob(store *ReleaseJobStore, job *ReleaseJob) {
	startedAt := time.Now().UTC()
	job.Status = ReleaseJobStatusRunning
	job.StartedAt = &startedAt
	if saveErr := store.SaveJob(job); saveErr != nil {
		logText := fmt.Sprintf("[forge release job error] saving running state: %v\n", saveErr)
		_ = store.AppendLog(job.JobID, logText)
	}

	timeout := time.Duration(defaultReleaseTimeout(job.TimeoutSeconds)) * time.Second
	runContext, cancelRun := context.WithTimeout(context.Background(), timeout)
	defer cancelRun()

	output, runErr := manager.runner.RunReleaseCommand(runContext, releasePowerShellExecutable(), buildReleaseArguments(job), job.RepoPath)
	manager.finishJob(store, job, output, runErr)
}

func (manager *ReleaseJobManager) finishJob(store *ReleaseJobStore, job *ReleaseJob, output ProcessOutput, runErr error) {
	finishedAt := time.Now().UTC()
	job.FinishedAt = &finishedAt
	job.Status = ReleaseJobStatusCompleted
	job.ExitCode = &output.ExitCode
	if runErr != nil || output.ExitCode != 0 {
		job.Status = ReleaseJobStatusFailed
	}
	if runErr != nil {
		job.ErrorMessage = runErr.Error()
	}
	if output.Stdout != "" {
		_ = store.AppendLog(job.JobID, output.Stdout)
	}
	if output.Stderr != "" {
		_ = store.AppendLog(job.JobID, output.Stderr)
	}
	if runErr != nil {
		_ = store.AppendLog(job.JobID, "\n[forge release job error] "+runErr.Error()+"\n")
	}
	_ = store.SaveJob(job)
}

// buildReleaseArguments constructs the PowerShell.exe argument slice for a background release job.
// It switches from -File to -Command so that the command block can introspect the target script's
// declared parameters before passing any named flags. This makes the runner compatible with any
// project's local-release.ps1 — not just forge-terminal's — because forge-specific flags like
// -NonInteractive and -IncludeUncommittedChanges are only injected when the script actually declares them.
func buildReleaseArguments(job *ReleaseJob) []string {
	return []string{
		"-NoProfile",
		"-NonInteractive", // powershell.exe process flag — prevents stdin reads at the host level
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		buildIntrospectingReleaseCommand(job),
	}
}

// buildIntrospectingReleaseCommand returns a semicolon-separated PowerShell command string that:
//  1. Uses Get-Command to read the target script's declared parameters.
//  2. Builds a splat table containing only the parameters the script actually accepts.
//  3. Invokes the script with that table, then exits with the script's own exit code.
//
// User-provided strings (version, notes) are embedded in single-quoted PS literals.
// In PowerShell single-quoted strings the only special character is ', escaped as ''.
func buildIntrospectingReleaseCommand(job *ReleaseJob) string {
	// Escape single quotes in user-provided values so they are safe inside '...' PS literals.
	escapedScriptPath := strings.ReplaceAll(job.ScriptPath, "'", "''")
	escapedVersion := strings.ReplaceAll(job.Version, "'", "''")
	escapedNotes := strings.ReplaceAll(job.ReleaseNotes, "'", "''")

	var commandBuilder strings.Builder
	// Load the script's parameter metadata without executing it.
	commandBuilder.WriteString(fmt.Sprintf("$scriptPath = '%s'; ", escapedScriptPath))
	commandBuilder.WriteString("$availableParameters = (Get-Command $scriptPath).Parameters.Keys; ")
	// Always pass the version as the positional VersionType argument.
	commandBuilder.WriteString(fmt.Sprintf("$scriptArguments = @{ VersionType = '%s' }; ", escapedVersion))
	// Pass optional named parameters only when the target script declares them.
	commandBuilder.WriteString(fmt.Sprintf("if ('ReleaseNotes' -in $availableParameters) { $scriptArguments['ReleaseNotes'] = '%s' }; ", escapedNotes))
	commandBuilder.WriteString("if ('NonInteractive' -in $availableParameters) { $scriptArguments['NonInteractive'] = [switch]$true }; ")
	if job.IncludeUncommittedChanges {
		commandBuilder.WriteString("if ('IncludeUncommittedChanges' -in $availableParameters) { $scriptArguments['IncludeUncommittedChanges'] = [switch]$true }; ")
	}
	if job.ShouldProceedWithWarnings {
		commandBuilder.WriteString("if ('Force' -in $availableParameters) { $scriptArguments['Force'] = [switch]$true }; ")
	}
	// Invoke the script via splatting and propagate its exit code to the parent process.
	commandBuilder.WriteString("& $scriptPath @scriptArguments; exit $LASTEXITCODE")
	return commandBuilder.String()
}

func releasePowerShellExecutable() string {
	if runtime.GOOS == "windows" {
		return "powershell.exe"
	}
	return "pwsh"
}

func normalizeCreateOptions(options ReleaseJobCreateOptions) (ReleaseJobCreateOptions, error) {
	if strings.TrimSpace(options.RepoPath) == "" {
		return options, errors.New("repoPath is required")
	}
	if strings.TrimSpace(options.Version) == "" {
		return options, errors.New("version is required")
	}
	if strings.TrimSpace(options.ReleaseNotes) == "" {
		return options, errors.New("releaseNotes is required for non-interactive releases")
	}
	absoluteRepoPath, absoluteErr := filepath.Abs(options.RepoPath)
	if absoluteErr != nil {
		return options, fmt.Errorf("resolving repo path: %w", absoluteErr)
	}
	options.RepoPath = filepath.Clean(absoluteRepoPath)
	options.Version = strings.TrimPrefix(strings.TrimSpace(options.Version), "v")
	options.ReleaseNotes = strings.TrimSpace(options.ReleaseNotes)
	return options, nil
}

func defaultReleaseTimeout(timeoutSeconds int) int {
	if timeoutSeconds <= 0 {
		return DefaultReleaseTimeoutSeconds
	}
	return timeoutSeconds
}

func isActiveReleaseStatus(status string) bool {
	return status == ReleaseJobStatusQueued || status == ReleaseJobStatusRunning
}
