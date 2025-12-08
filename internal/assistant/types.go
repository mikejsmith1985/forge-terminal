// Package assistant provides AI assistant types and interfaces.
package assistant

// ChatRequest represents a request to chat with the assistant.
type ChatRequest struct {
	Message        string `json:"message"`
	TabID          string `json:"tabId"`
	IncludeContext bool   `json:"includeContext"`
}

// ChatResponse represents the assistant's response.
type ChatResponse struct {
	Message          string            `json:"message"`
	SuggestedCommand *SuggestedCommand `json:"suggestedCommand,omitempty"`
	Reasoning        string            `json:"reasoning,omitempty"`
}

// SuggestedCommand represents a command suggestion from the assistant.
type SuggestedCommand struct {
	Command     string `json:"command"`
	Description string `json:"description"`
	Safe        bool   `json:"safe"`
}

// TerminalContext represents the current state of a terminal session.
type TerminalContext struct {
	WorkingDirectory string   `json:"workingDirectory"`
	RecentCommands   []string `json:"recentCommands"`
	RecentOutput     string   `json:"recentOutput"`
	SessionID        string   `json:"sessionId"`
}

// ExecuteCommandRequest represents a request to execute a command.
type ExecuteCommandRequest struct {
	Command string `json:"command"`
	TabID   string `json:"tabId"`
}

// ExecuteCommandResponse represents the result of command execution.
type ExecuteCommandResponse struct {
	Success bool   `json:"success"`
	Output  string `json:"output,omitempty"`
	Error   string `json:"error,omitempty"`
}

// OllamaStatusResponse represents Ollama availability status.
type OllamaStatusResponse struct {
	Available    bool        `json:"available"`
	Models       []ModelInfo `json:"models,omitempty"`
	CurrentModel string      `json:"currentModel"`
	Error        string      `json:"error,omitempty"`
}

// ModelInfo provides detailed information about an Ollama model.
type ModelInfo struct {
	Name          string  `json:"name"`
	FriendlyName  string  `json:"friendlyName"`
	Size          int64   `json:"size"`
	SizeFormatted string  `json:"sizeFormatted"`
	Performance   string  `json:"performance"`
	Quality       string  `json:"quality"`
	BestFor       string  `json:"bestFor"`
	Family        string  `json:"family"`
}

// SetModelRequest represents a request to change the current model.
type SetModelRequest struct {
	Model string `json:"model"`
}

// SetModelResponse represents the response from changing models.
type SetModelResponse struct {
	Success bool   `json:"success"`
	Model   string `json:"model"`
	Error   string `json:"error,omitempty"`
}
