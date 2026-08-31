// environment_jobs_test.go verifies durable adaptive build job metadata and logs.

package mcp

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type failingEnvironmentJobRunner struct{}

func (runner *failingEnvironmentJobRunner) RunCommand(_ context.Context, _ string, _ []string) (RunOutput, error) {
	return RunOutput{}, errors.New("process could not start")
}

func TestEnvironmentJobStore_PersistsJobMetadataAndLogs(t *testing.T) {
	store := NewEnvironmentJobStore(t.TempDir())
	job, createErr := store.CreateJob(EnvironmentJobCreateOptions{
		Command:              "npm run build",
		RequestedEnvironment: StrategyNative,
		WorkingDirectory:     `C:\ProjectsWin\app`,
		DockerImage:          DefaultDockerImage,
		TimeoutSeconds:       defaultEnvironmentTimeoutSec,
	})
	if createErr != nil {
		t.Fatalf("CreateJob returned error: %v", createErr)
	}

	job.Status = EnvironmentJobStatusCompleted
	job.EnvironmentUsed = StrategyNative
	exitCode := 0
	job.ExitCode = &exitCode
	if saveErr := store.SaveJob(job); saveErr != nil {
		t.Fatalf("SaveJob returned error: %v", saveErr)
	}
	if appendErr := store.AppendLog(job.JobID, "build complete\n"); appendErr != nil {
		t.Fatalf("AppendLog returned error: %v", appendErr)
	}

	reopenedStore := NewEnvironmentJobStore(store.ProjectRoot())
	loadedJob, loadErr := reopenedStore.LoadJob(job.JobID)
	if loadErr != nil {
		t.Fatalf("LoadJob returned error after reopening store: %v", loadErr)
	}
	if loadedJob.Command != "npm run build" {
		t.Fatalf("loaded command = %q, want original command", loadedJob.Command)
	}

	logText, logErr := reopenedStore.ReadLog(job.JobID, 1024)
	if logErr != nil {
		t.Fatalf("ReadLog returned error after reopening store: %v", logErr)
	}
	if !strings.Contains(logText, "build complete") {
		t.Fatalf("log text %q does not contain persisted output", logText)
	}
}

func TestEnvironmentJobManager_StartJobCompletesAndCanBeReadAfterManagerRestart(t *testing.T) {
	store := NewEnvironmentJobStore(t.TempDir())
	runner := newMockCommandRunner(map[string]RunOutput{
		"cmd":  {ExitCode: 0, Stdout: "native build complete"},
		"bash": {ExitCode: 0, Stdout: "native build complete"},
	})
	manager := NewEnvironmentJobManager(runner, store)

	startedJob, startErr := manager.StartJob(EnvironmentJobCreateOptions{
		Command:              "echo build",
		RequestedEnvironment: StrategyNative,
		TimeoutSeconds:       defaultEnvironmentTimeoutSec,
	})
	if startErr != nil {
		t.Fatalf("StartJob returned error: %v", startErr)
	}
	completedJob := waitForEnvironmentJobStatus(t, manager, startedJob.JobID, EnvironmentJobStatusCompleted)
	if completedJob.EnvironmentUsed != StrategyNative {
		t.Fatalf("EnvironmentUsed = %q, want %q", completedJob.EnvironmentUsed, StrategyNative)
	}

	restartedManager := NewEnvironmentJobManager(runner, store)
	loadedJob, logText, readErr := restartedManager.ReadJob(startedJob.JobID, 1024)
	if readErr != nil {
		t.Fatalf("ReadJob after manager restart returned error: %v", readErr)
	}
	if loadedJob.Status != EnvironmentJobStatusCompleted {
		t.Fatalf("loaded status = %q, want completed", loadedJob.Status)
	}
	if !strings.Contains(logText, "native build complete") {
		t.Fatalf("log text %q does not include command output", logText)
	}
}

func TestEnvironmentJobManager_StartJobRequiresCommand(t *testing.T) {
	store := NewEnvironmentJobStore(t.TempDir())
	manager := NewEnvironmentJobManager(newMockCommandRunner(nil), store)

	if _, startErr := manager.StartJob(EnvironmentJobCreateOptions{}); startErr == nil {
		t.Fatalf("StartJob returned nil error for missing command")
	}
}

func TestEnvironmentJobManager_RunErrorPersistsFailureLogWithoutFakeExitCode(t *testing.T) {
	store := NewEnvironmentJobStore(t.TempDir())
	manager := NewEnvironmentJobManager(&failingEnvironmentJobRunner{}, store)

	startedJob, startErr := manager.StartJob(EnvironmentJobCreateOptions{
		Command:              "npm run build",
		RequestedEnvironment: StrategyNative,
		TimeoutSeconds:       defaultEnvironmentTimeoutSec,
	})
	if startErr != nil {
		t.Fatalf("StartJob returned error: %v", startErr)
	}

	failedJob := waitForEnvironmentJobStatus(t, manager, startedJob.JobID, EnvironmentJobStatusFailed)
	if failedJob.ExitCode != nil {
		t.Fatalf("ExitCode = %v, want nil when process never produced an exit code", *failedJob.ExitCode)
	}
	_, logText, readErr := manager.ReadJob(startedJob.JobID, 1024)
	if readErr != nil {
		t.Fatalf("ReadJob returned error: %v", readErr)
	}
	if !strings.Contains(logText, "process could not start") {
		t.Fatalf("log text %q does not include process start error", logText)
	}
}

func waitForEnvironmentJobStatus(t *testing.T, manager *EnvironmentJobManager, jobID, expectedStatus string) *EnvironmentJob {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		job, _, readErr := manager.ReadJob(jobID, 1024)
		if readErr != nil {
			t.Fatalf("ReadJob returned error: %v", readErr)
		}
		if job.Status == expectedStatus {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	job, _, _ := manager.ReadJob(jobID, 1024)
	t.Fatalf("job %s did not reach status %q; last status=%q", jobID, expectedStatus, job.Status)
	return nil
}
