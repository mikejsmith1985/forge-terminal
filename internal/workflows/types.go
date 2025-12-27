package workflows

import "time"

// Workflow represents a complete workflow definition
type Workflow struct {
	ID          int              `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Nodes       []WorkflowNode   `json:"nodes"`
	Edges       []WorkflowEdge   `json:"edges"`
	Settings    WorkflowSettings `json:"settings"`
	Projects    []string         `json:"projects"`
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
	Favorite    bool             `json:"favorite"`
	Icon        string           `json:"icon,omitempty"`
	KeyBinding  string           `json:"keyBinding,omitempty"`
}

// WorkflowNode represents a single step in the workflow
type WorkflowNode struct {
	ID              string              `json:"id"`
	Type            string              `json:"type"` // "command", "decision", "start", "end"
	Label           string              `json:"label"`
	Description     string              `json:"description,omitempty"`
	CommandCardID   *int                `json:"commandCardId,omitempty"`
	Position        Position            `json:"position"`
	Status          string              `json:"status"` // "pending", "running", "completed", "failed", "skipped"
	Persona         *string             `json:"persona,omitempty"`
	SuccessCriteria *SuccessCriteria    `json:"successCriteria,omitempty"`
	Metadata        NodeMetadata        `json:"metadata"`
}

// WorkflowEdge represents a connection between nodes
type WorkflowEdge struct {
	ID       string  `json:"id"`
	Source   string  `json:"source"`
	Target   string  `json:"target"`
	Type     string  `json:"type"` // "success" | "failure" | "default"
	Label    *string `json:"label,omitempty"`
	Animated bool    `json:"animated"`
}

// Position represents X, Y coordinates on the canvas
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// WorkflowSettings contains workflow-level configuration
type WorkflowSettings struct {
	AutoAdvance         bool `json:"autoAdvance"`
	RequireConfirmation bool `json:"requireConfirmation"`
}

// SuccessCriteria defines automated validation rules
type SuccessCriteria struct {
	Type      string  `json:"type"`      // "testCoverage", "passRate", "manual", "exitCode"
	Threshold float64 `json:"threshold"` // e.g., 80.0 for 80%
	Operator  string  `json:"operator"`  // ">=", ">", "==", "<"
}

// NodeMetadata contains execution tracking data
type NodeMetadata struct {
	ExecutionTime *int    `json:"executionTime,omitempty"` // milliseconds
	LastExecuted  *string `json:"lastExecuted,omitempty"`  // ISO8601
	RetryCount    int     `json:"retryCount"`
	Output        *string `json:"output,omitempty"` // Last execution snippet
}
