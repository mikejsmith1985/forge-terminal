// release_jobs_test.go verifies that Release Manager background jobs are durable and safe.
package releasejobs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type capturedReleaseCommand struct {
	executable       string
	arguments        []string
	workingDirectory string
}

type capturingReleaseRunner struct {
	output          ProcessOutput
	runError        error
	startedSignal   chan struct{}
	releaseSignal   chan struct{}
	capturedCommand capturedReleaseCommand
}

func (runner *capturingReleaseRunner) RunReleaseCommand(_ context.Context, executable string, arguments []string, workingDirectory string) (ProcessOutput, error) {
	runner.capturedCommand = capturedReleaseCommand{
		executable:       executable,
		arguments:        append([]string{}, arguments...),
		workingDirectory: workingDirectory,
	}
	if runner.startedSignal != nil {
		close(runner.startedSignal)
	}
	if runner.releaseSignal != nil {
		<-runner.releaseSignal
	}
	return runner.output, runner.runError
}

func TestReleaseJobStore_PersistsMetadataAndLogs(t *testing.T) {
	store := NewReleaseJobStore(t.TempDir())
	job, createErr := store.CreateJob(ReleaseJobCreateOptions{
		RepoPath:                  `C:\ProjectsWin\forge-terminal`,
		Version:                   "7.10.24",
		ReleaseNotes:              "Background release manager",
		IncludeUncommittedChanges: true,
		ShouldProceedWithWarnings: true,
		TimeoutSeconds:            DefaultReleaseTimeoutSeconds,
	})
	if createErr != nil {
		t.Fatalf("CreateJob returned error: %v", createErr)
	}

	job.Status = ReleaseJobStatusCompleted
	if saveErr := store.SaveJob(job); saveErr != nil {
		t.Fatalf("SaveJob returned error: %v", saveErr)
	}
	if appendErr := store.AppendLog(job.JobID, "release complete\n"); appendErr != nil {
		t.Fatalf("AppendLog returned error: %v", appendErr)
	}

	reopenedStore := NewReleaseJobStore(store.ProjectRoot())
	loadedJob, loadErr := reopenedStore.LoadJob(job.JobID)
	if loadErr != nil {
		t.Fatalf("LoadJob returned error after reopening store: %v", loadErr)
	}
	if loadedJob.Version != "7.10.24" {
		t.Fatalf("loaded version = %q, want original version", loadedJob.Version)
	}

	logText, logErr := reopenedStore.ReadLog(job.JobID, 1024)
	if logErr != nil {
		t.Fatalf("ReadLog returned error after reopening store: %v", logErr)
	}
	if !strings.Contains(logText, "release complete") {
		t.Fatalf("log text %q does not contain persisted output", logText)
	}
}

func TestReleaseJobManager_StartJobRejectsSecondActiveJobForSameRepo(t *testing.T) {
	releaseSignal := make(chan struct{})
	runner := &capturingReleaseRunner{
		output:        ProcessOutput{ExitCode: 0, Stdout: "done"},
		startedSignal: make(chan struct{}),
		releaseSignal: releaseSignal,
	}
	store := NewReleaseJobStore(t.TempDir())
	manager := NewReleaseJobManager(runner)

	firstJob, startErr := manager.StartJob(store, ReleaseJobCreateOptions{
		RepoPath:     store.ProjectRoot(),
		Version:      "7.10.24",
		ReleaseNotes: "first release",
	})
	if startErr != nil {
		t.Fatalf("StartJob returned error: %v", startErr)
	}

	<-runner.startedSignal
	if _, secondStartErr := manager.StartJob(store, ReleaseJobCreateOptions{
		RepoPath:     store.ProjectRoot(),
		Version:      "7.10.25",
		ReleaseNotes: "second release",
	}); !errors.Is(secondStartErr, ErrActiveReleaseJob) {
		t.Fatalf("second StartJob error = %v, want ErrActiveReleaseJob", secondStartErr)
	}

	close(releaseSignal)
	completedJob := waitForReleaseJobStatus(t, manager, store, firstJob.JobID, ReleaseJobStatusCompleted)
	if completedJob.Status != ReleaseJobStatusCompleted {
		t.Fatalf("status = %q, want completed", completedJob.Status)
	}
}

func TestReleaseJobManager_UsesPowerShellArgumentsSafely(t *testing.T) {
	runner := &capturingReleaseRunner{output: ProcessOutput{ExitCode: 0, Stdout: "published"}}
	store := NewReleaseJobStore(t.TempDir())
	manager := NewReleaseJobManager(runner)

	startedJob, startErr := manager.StartJob(store, ReleaseJobCreateOptions{
		RepoPath:                  store.ProjectRoot(),
		Version:                   "7.10.24",
		ReleaseNotes:              "Line one\nLine two",
		IncludeUncommittedChanges: true,
		ShouldProceedWithWarnings: true,
	})
	if startErr != nil {
		t.Fatalf("StartJob returned error: %v", startErr)
	}
	waitForReleaseJobStatus(t, manager, store, startedJob.JobID, ReleaseJobStatusCompleted)

	arguments := strings.Join(runner.capturedCommand.arguments, "\n")
	for _, expectedArgument := range []string{
		"-File",
		"local-release.ps1",
		"7.10.24",
		"-NonInteractive",
		"-ReleaseNotes",
		"Line one\nLine two",
		"-IncludeUncommittedChanges",
		"-Force",
	} {
		if !strings.Contains(arguments, expectedArgument) {
			t.Fatalf("PowerShell arguments %q do not include %q", arguments, expectedArgument)
		}
	}
	if runner.capturedCommand.workingDirectory != store.ProjectRoot() {
		t.Fatalf("working directory = %q, want repo root", runner.capturedCommand.workingDirectory)
	}
}

func waitForReleaseJobStatus(t *testing.T, manager *ReleaseJobManager, store *ReleaseJobStore, jobID string, expectedStatus string) *ReleaseJob {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		job, _, readErr := manager.ReadJob(store, jobID, 1024)
		if readErr != nil {
			t.Fatalf("ReadJob returned error: %v", readErr)
		}
		if job.Status == expectedStatus {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	job, _, _ := manager.ReadJob(store, jobID, 1024)
	t.Fatalf("job %s did not reach status %q; last status=%q", jobID, expectedStatus, job.Status)
	return nil
}
