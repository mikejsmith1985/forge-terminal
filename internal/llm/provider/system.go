// Package provider implements dynamic LLM provider discovery and verification.
// It provides real-time CLI tool detection and authentication status checking.
package provider

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Provider represents an LLM CLI tool that can be used for code assistance.
type Provider interface {
	// Name returns the provider identifier (e.g., "copilot", "claude").
	Name() string

	// DisplayName returns a human-readable name for UI display.
	DisplayName() string

	// IsInstalled checks if the CLI binary exists in PATH.
	IsInstalled() bool

	// IsAuthenticated runs the auth status check and returns whether the user is logged in.
	// Returns (authenticated, error) where error indicates a check failure, not auth failure.
	IsAuthenticated(ctx context.Context) (bool, error)

	// ListModels returns available models for this provider.
	// Should only be called if IsAuthenticated returns true.
	ListModels(ctx context.Context) ([]ModelInfo, error)

	// GetAuthInstructions returns instructions for the user to authenticate.
	GetAuthInstructions() string

	// GetBinaryName returns the primary CLI binary name.
	GetBinaryName() string
}

// ModelInfo contains information about an available model.
type ModelInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ProviderStatus represents the current status of a provider.
type ProviderStatus struct {
	Name          string      `json:"name"`
	DisplayName   string      `json:"displayName"`
	Installed     bool        `json:"installed"`
	Authenticated bool        `json:"authenticated"`
	AuthError     string      `json:"authError,omitempty"`
	Models        []ModelInfo `json:"models,omitempty"`
	Instructions  string      `json:"instructions,omitempty"`
	BinaryPath    string      `json:"binaryPath,omitempty"`
	Version       string      `json:"version,omitempty"`
}

// Registry manages all available providers.
type Registry struct {
	mu        sync.RWMutex
	providers map[string]Provider
}

// NewRegistry creates a new provider registry with all supported providers.
func NewRegistry() *Registry {
	r := &Registry{
		providers: make(map[string]Provider),
	}

	// Register all supported providers
	r.Register(NewCopilotProvider())
	r.Register(NewClaudeProvider())

	return r
}

// Register adds a provider to the registry.
func (r *Registry) Register(p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Name()] = p
}

// Get returns a provider by name.
func (r *Registry) Get(name string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[strings.ToLower(name)]
	return p, ok
}

// List returns all registered providers.
func (r *Registry) List() []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	providers := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		providers = append(providers, p)
	}
	return providers
}

// GetStatus returns the full status for a provider.
func (r *Registry) GetStatus(ctx context.Context, name string) (*ProviderStatus, error) {
	p, ok := r.Get(name)
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", name)
	}

	status := &ProviderStatus{
		Name:        p.Name(),
		DisplayName: p.DisplayName(),
		Installed:   p.IsInstalled(),
	}

	if !status.Installed {
		status.Instructions = p.GetAuthInstructions()
		return status, nil
	}

	// Find binary path
	if path, err := exec.LookPath(p.GetBinaryName()); err == nil {
		status.BinaryPath = path
	}

	// Check authentication with timeout
	authCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	authenticated, err := p.IsAuthenticated(authCtx)
	status.Authenticated = authenticated
	if err != nil {
		status.AuthError = err.Error()
	}

	if !authenticated {
		status.Instructions = p.GetAuthInstructions()
		return status, nil
	}

	// Get models if authenticated
	modelCtx, modelCancel := context.WithTimeout(ctx, 10*time.Second)
	defer modelCancel()

	models, err := p.ListModels(modelCtx)
	if err == nil {
		status.Models = models
	}

	return status, nil
}

// VerifyAll checks all providers and returns their statuses.
func (r *Registry) VerifyAll(ctx context.Context) map[string]*ProviderStatus {
	providers := r.List()
	results := make(map[string]*ProviderStatus)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, p := range providers {
		wg.Add(1)
		go func(provider Provider) {
			defer wg.Done()
			status, _ := r.GetStatus(ctx, provider.Name())
			mu.Lock()
			results[provider.Name()] = status
			mu.Unlock()
		}(p)
	}

	wg.Wait()
	return results
}

// Global registry instance
var globalRegistry *Registry
var registryOnce sync.Once

// GetRegistry returns the global provider registry.
func GetRegistry() *Registry {
	registryOnce.Do(func() {
		globalRegistry = NewRegistry()
	})
	return globalRegistry
}

// execCommand is a helper to execute commands with timeout and proper Windows handling.
func execCommand(ctx context.Context, name string, args ...string) (string, error) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// On Windows, use cmd /c to properly resolve commands
		cmdArgs := append([]string{"/c", name}, args...)
		cmd = exec.CommandContext(ctx, "cmd", cmdArgs...)
	} else {
		cmd = exec.CommandContext(ctx, name, args...)
	}

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow: true,
		}
	}

	output, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(output)), err
}

// checkBinaryExists checks if a binary exists in PATH.
func checkBinaryExists(name string) bool {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Use 'where' on Windows to find the binary
		cmd = exec.Command("cmd", "/c", "where", name)
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow: true,
		}
	} else {
		cmd = exec.Command("which", name)
	}

	return cmd.Run() == nil
}
