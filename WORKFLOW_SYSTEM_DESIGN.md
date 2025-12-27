# Forge Terminal Workflow System - Design Specification v1.0

**Created:** 2025-12-27  
**Status:** Ready for Implementation  
**Phase:** 1 - Manual Execution with Visual Planning

---

## Executive Summary

Visual workflow orchestration system for multi-step software development processes. Workflows are command card containers with flowchart-style execution paths, success criteria validation, and project association.

**Key Design Decisions:**
1. ✅ Global workflows with optional project associations (shared across projects)
2. ✅ Manual execution with "Next" button progression
3. ✅ Configurable success criteria (test coverage %, pass rate, etc.)
4. ✅ Success/failure path arrows for conditional flows
5. ✅ Full-screen canvas mode + dedicated "Workflows" sidebar tab

---

## 1. Data Structures

### File: `frontend/src/types/workflow.js`

```javascript
/**
 * WorkflowNode - Represents a single step in the workflow
 */
export const WorkflowNode = {
  id: String,                    // Unique ID: "node-{uuid}"
  type: String,                  // "command" | "decision" | "start" | "end"
  label: String,                 // Plain English: "Define Requirement"
  description: String,           // Optional longer explanation
  commandCardId: Number | null,  // References Command.id (null for decision/start/end)
  position: { x: Number, y: Number },
  status: String,                // "pending" | "running" | "completed" | "failed" | "skipped"
  persona: String | null,        // Future Phase 2: "dev-agent", "qa-agent"
  successCriteria: {
    type: String | null,         // "testCoverage" | "passRate" | "manual" | "exitCode"
    threshold: Number | null,    // e.g., 80 (for 80%), 0 (for 100%)
    operator: String | null      // ">=" | ">" | "==" | "<"
  } | null,
  metadata: {
    executionTime: Number | null,     // milliseconds
    lastExecuted: String | null,      // ISO8601
    retryCount: Number,
    output: String | null             // Last execution output snippet
  }
};

/**
 * WorkflowEdge - Represents connection between nodes
 */
export const WorkflowEdge = {
  id: String,                    // "edge-{uuid}"
  source: String,                // WorkflowNode.id
  target: String,                // WorkflowNode.id
  type: String,                  // "success" | "failure" | "default"
  label: String | null,          // Display text: "Tests Pass", "PR Approved"
  animated: Boolean              // Animate arrow for active path
};

/**
 * Workflow - Container for entire workflow definition
 */
export const Workflow = {
  id: Number,                    // Like Command.id
  name: String,                  // "Feature Development Cycle"
  description: String,
  nodes: Array<WorkflowNode>,
  edges: Array<WorkflowEdge>,
  settings: {
    autoAdvance: Boolean,        // Show "Next" button vs manual click per step
    requireConfirmation: Boolean // Dialog before each step execution
  },
  projects: Array<String>,       // Project associations: ["forge-terminal", "my-app"]
  createdAt: String,             // ISO8601
  updatedAt: String,             // ISO8601
  favorite: Boolean,
  icon: String | null,           // lucide icon name or emoji-*
  keyBinding: String | null      // e.g., "Ctrl+Shift+W"
};

/**
 * WorkflowExecution - Runtime state tracking
 */
export const WorkflowExecution = {
  workflowId: Number,
  currentNodeId: String | null,  // Which step is active
  startedAt: String,             // ISO8601
  history: Array<{
    nodeId: String,
    startTime: String,           // ISO8601
    endTime: String | null,      // ISO8601
    status: String,              // "completed" | "failed" | "skipped"
    output: String | null,       // Terminal output capture
    criteriaResult: {
      met: Boolean,
      actual: Number | null,     // Actual value measured
      expected: Number | null    // Expected threshold
    } | null
  }>,
  variables: Object              // Future: Pass data between steps
};
```

---

## 2. File Structure

```
frontend/src/
├── components/
│   ├── workflow/
│   │   ├── WorkflowCanvas.jsx           # Full-screen canvas with React Flow
│   │   ├── WorkflowCanvasToolbar.jsx    # Add node, connect, zoom controls
│   │   ├── WorkflowNode.jsx             # Custom node renderer with status badges
│   │   ├── WorkflowEdge.jsx             # Custom edge with success/failure colors
│   │   ├── WorkflowCard.jsx             # Sidebar card (like SortableCommandCard)
│   │   ├── WorkflowExecutor.jsx         # Execution panel with Next button
│   │   ├── WorkflowExecutorStep.jsx     # Individual step display component
│   │   ├── NodeConfigModal.jsx          # Edit node properties (success criteria)
│   │   ├── SuccessCriteriaEditor.jsx    # Configure pass rates, coverage, etc.
│   │   └── ProjectAssociationModal.jsx  # Associate workflow with projects
│   ├── WorkflowCards.jsx                # List of workflow cards (sidebar tab)
│   └── CommandCards.jsx                 # Keep existing
├── hooks/
│   ├── useWorkflowManager.js            # CRUD operations for workflows
│   ├── useWorkflowExecution.js          # Runtime execution state machine
│   └── useProjectDetection.js           # Detect current project from cwd
└── types/
    └── workflow.js                      # Type definitions (from above)

internal/
├── workflows/
│   ├── storage.go                       # Persistence layer
│   ├── types.go                         # Go structs matching JS types
│   └── criteria.go                      # Success criteria evaluation (future)
└── commands/
    └── storage.go                       # Already exists

cmd/forge/
└── main.go                              # Add workflow API routes
```

---

## 3. Backend API Endpoints

### File: `internal/workflows/types.go`

```go
package workflows

import "time"

type Workflow struct {
    ID          int              `json:"id"`
    Name        string           `json:"name"`
    Description string           `json:"description"`
    Nodes       []WorkflowNode   `json:"nodes"`
    Edges       []WorkflowEdge   `json:"edges"`
    Settings    WorkflowSettings `json:"settings"`
    Projects    []string         `json:"projects"`     // NEW: Project associations
    CreatedAt   time.Time        `json:"createdAt"`
    UpdatedAt   time.Time        `json:"updatedAt"`
    Favorite    bool             `json:"favorite"`
    Icon        string           `json:"icon,omitempty"`
    KeyBinding  string           `json:"keyBinding,omitempty"`
}

type WorkflowNode struct {
    ID              string              `json:"id"`
    Type            string              `json:"type"` // "command", "decision", "start", "end"
    Label           string              `json:"label"`
    Description     string              `json:"description,omitempty"`
    CommandCardID   *int                `json:"commandCardId,omitempty"`
    Position        Position            `json:"position"`
    Status          string              `json:"status"` // "pending", "running", "completed", "failed", "skipped"
    Persona         *string             `json:"persona,omitempty"`
    SuccessCriteria *SuccessCriteria    `json:"successCriteria,omitempty"` // NEW
    Metadata        NodeMetadata        `json:"metadata"`
}

type WorkflowEdge struct {
    ID       string  `json:"id"`
    Source   string  `json:"source"`
    Target   string  `json:"target"`
    Type     string  `json:"type"` // "success" | "failure" | "default"
    Label    *string `json:"label,omitempty"`
    Animated bool    `json:"animated"` // NEW: For active path highlighting
}

type Position struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
}

type WorkflowSettings struct {
    AutoAdvance         bool `json:"autoAdvance"`
    RequireConfirmation bool `json:"requireConfirmation"`
}

// NEW: Success criteria for automated validation
type SuccessCriteria struct {
    Type      string  `json:"type"`      // "testCoverage", "passRate", "manual", "exitCode"
    Threshold float64 `json:"threshold"` // e.g., 80.0 for 80%
    Operator  string  `json:"operator"`  // ">=", ">", "==", "<"
}

type NodeMetadata struct {
    ExecutionTime *int    `json:"executionTime,omitempty"` // milliseconds
    LastExecuted  *string `json:"lastExecuted,omitempty"`  // ISO8601
    RetryCount    int     `json:"retryCount"`
    Output        *string `json:"output,omitempty"`        // Last execution snippet
}
```

### File: `internal/workflows/storage.go`

```go
package workflows

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "time"
    
    "github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// GetWorkflowsPath returns the path to workflows.json
func GetWorkflowsPath() string {
    return filepath.Join(storage.GetTerminalDir(), "workflows.json")
}

// LoadWorkflows loads all workflows from disk
func LoadWorkflows() ([]Workflow, error) {
    path := GetWorkflowsPath()
    
    // Return empty array if file doesn't exist
    if _, err := os.Stat(path); os.IsNotExist(err) {
        return []Workflow{}, nil
    }
    
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("failed to read workflows: %w", err)
    }
    
    var workflows []Workflow
    if err := json.Unmarshal(data, &workflows); err != nil {
        return nil, fmt.Errorf("failed to parse workflows: %w", err)
    }
    
    return workflows, nil
}

// SaveWorkflows persists workflows to disk
func SaveWorkflows(workflows []Workflow) error {
    path := GetWorkflowsPath()
    
    // Ensure directory exists
    dir := filepath.Dir(path)
    if err := os.MkdirAll(dir, 0755); err != nil {
        return fmt.Errorf("failed to create directory: %w", err)
    }
    
    // Update timestamps
    now := time.Now()
    for i := range workflows {
        if workflows[i].CreatedAt.IsZero() {
            workflows[i].CreatedAt = now
        }
        workflows[i].UpdatedAt = now
    }
    
    data, err := json.MarshalIndent(workflows, "", "  ")
    if err != nil {
        return fmt.Errorf("failed to serialize workflows: %w", err)
    }
    
    if err := os.WriteFile(path, data, 0644); err != nil {
        return fmt.Errorf("failed to write workflows: %w", err)
    }
    
    return nil
}

// GetWorkflowsByProject filters workflows associated with a project
func GetWorkflowsByProject(projectName string) ([]Workflow, error) {
    workflows, err := LoadWorkflows()
    if err != nil {
        return nil, err
    }
    
    var filtered []Workflow
    for _, wf := range workflows {
        // Include if no projects specified (global) or matches project
        if len(wf.Projects) == 0 {
            filtered = append(filtered, wf)
            continue
        }
        
        for _, proj := range wf.Projects {
            if proj == projectName {
                filtered = append(filtered, wf)
                break
            }
        }
    }
    
    return filtered, nil
}
```

### File: `cmd/forge/main.go` (add after command routes ~line 180)

```go
// Workflow management endpoints
http.HandleFunc("GET /api/workflows", handleGetWorkflows)
http.HandleFunc("POST /api/workflows", handleSaveWorkflows)
http.HandleFunc("PUT /api/workflows/{id}", handleUpdateWorkflow)
http.HandleFunc("DELETE /api/workflows/{id}", handleDeleteWorkflow)
http.HandleFunc("GET /api/workflows/project/{name}", handleGetWorkflowsByProject)

// Handler implementations
func handleGetWorkflows(w http.ResponseWriter, r *http.Request) {
    workflows, err := workflows.LoadWorkflows()
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(workflows)
}

func handleSaveWorkflows(w http.ResponseWriter, r *http.Request) {
    var wfs []workflows.Workflow
    if err := json.NewDecoder(r.Body).Decode(&wfs); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    if err := workflows.SaveWorkflows(wfs); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

func handleUpdateWorkflow(w http.ResponseWriter, r *http.Request) {
    // Extract ID from path
    idStr := r.PathValue("id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "Invalid workflow ID", http.StatusBadRequest)
        return
    }
    
    var updated workflows.Workflow
    if err := json.NewDecoder(r.Body).Decode(&updated); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    wfs, err := workflows.LoadWorkflows()
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    found := false
    for i := range wfs {
        if wfs[i].ID == id {
            wfs[i] = updated
            found = true
            break
        }
    }
    
    if !found {
        http.Error(w, "Workflow not found", http.StatusNotFound)
        return
    }
    
    if err := workflows.SaveWorkflows(wfs); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

func handleDeleteWorkflow(w http.ResponseWriter, r *http.Request) {
    idStr := r.PathValue("id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "Invalid workflow ID", http.StatusBadRequest)
        return
    }
    
    wfs, err := workflows.LoadWorkflows()
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    filtered := make([]workflows.Workflow, 0)
    for _, wf := range wfs {
        if wf.ID != id {
            filtered = append(filtered, wf)
        }
    }
    
    if err := workflows.SaveWorkflows(filtered); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

func handleGetWorkflowsByProject(w http.ResponseWriter, r *http.Request) {
    projectName := r.PathValue("name")
    
    wfs, err := workflows.GetWorkflowsByProject(projectName)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(wfs)
}
```

---

## 4. Frontend Components

### File: `frontend/src/components/workflow/WorkflowCanvas.jsx`

**Purpose:** Full-screen flowchart editor using React Flow

**Dependencies:**
```bash
npm install @xyflow/react
```

**Key Features:**
- Full-screen overlay (like modal but fills entire window)
- Drag nodes from toolbar onto canvas
- Click node to select, right-click for context menu
- Draw edges by dragging from node handle
- Edge color coding: Green (success), Red (failure), Gray (default)
- Save/Cancel buttons in top-right corner
- Minimap in bottom-right corner

**Props:**
```javascript
WorkflowCanvas({
  workflow: Workflow | null,        // null = new workflow
  onSave: (workflow: Workflow) => void,
  onClose: () => void,
  commandCards: Array<Command>      // For linking to nodes
})
```

**Interface Structure:**
```jsx
<div className="workflow-canvas-fullscreen">
  <WorkflowCanvasToolbar 
    onAddNode={handleAddNode}
    onSave={handleSave}
    onClose={onClose}
  />
  <ReactFlow
    nodes={nodes}
    edges={edges}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    onConnect={onConnect}
    nodeTypes={nodeTypes}
    edgeTypes={edgeTypes}
  >
    <Background />
    <Controls />
    <MiniMap />
  </ReactFlow>
  {showNodeConfig && (
    <NodeConfigModal 
      node={selectedNode}
      commandCards={commandCards}
      onSave={handleNodeConfigSave}
      onClose={() => setShowNodeConfig(false)}
    />
  )}
</div>
```

---

### File: `frontend/src/components/workflow/NodeConfigModal.jsx`

**Purpose:** Configure node properties (command assignment, success criteria)

**Form Fields:**
- **Label:** Text input (e.g., "Run Tests")
- **Description:** Textarea (optional)
- **Type:** Dropdown (Command | Decision | Start | End)
- **Command Card:** Dropdown (filtered by shellType if needed)
- **Success Criteria Section:**
  - Type: Dropdown (Manual | Exit Code | Test Coverage % | Pass Rate %)
  - Operator: Dropdown (>= | > | == | <)
  - Threshold: Number input (0-100 for percentages)

**Example Success Criteria:**
- **Manual:** User clicks "Mark Complete" button
- **Exit Code == 0:** Auto-advance if command returns 0
- **Test Coverage >= 80:** Parse coverage report, advance if >= 80%
- **Pass Rate >= 100:** Require 100% test pass rate

**Validation:**
- Command nodes require commandCardId
- Decision nodes cannot have commandCardId
- Success criteria threshold must be 0-100 for percentages

---

### File: `frontend/src/components/workflow/WorkflowExecutor.jsx`

**Purpose:** Runtime execution panel with step-by-step progress

**Layout:**
```
┌─────────────────────────────────────────┐
│  🔄 Feature Development Cycle           │
│  ────────────────────────────────────── │
│  [✓] 1. Define Requirement              │
│  [▶] 2. AI Architecture  ← Current      │
│  [ ] 3. Developer Execute               │
│  [ ] 4. QE Agent Test                   │
│  [ ] 5. Commit & Push                   │
│  [ ] 6. PR Review                       │
│  ────────────────────────────────────── │
│  [Execute Step 2]  [Skip]  [Abort]      │
└─────────────────────────────────────────┘
```

**Behavior:**
1. User clicks "Execute Step 2"
2. Finds associated command card (commandCardId)
3. Calls `onExecute(commandCard)` → Terminal runs command
4. Monitors terminal output for completion
5. **If autoAdvance enabled:** Shows "Next" button after 2 seconds
6. **If success criteria defined:** Evaluates criteria
   - Green checkmark if met
   - Red X if failed → Shows failure path options
7. User clicks "Next" → Advances to Step 3
8. Repeat until workflow complete

**Edge Traversal Logic:**
- From command node with success → Follow "success" edge if criteria met
- From command node with failure → Follow "failure" edge if criteria failed
- From decision node → User manually selects which edge to follow

**Props:**
```javascript
WorkflowExecutor({
  workflow: Workflow,
  execution: WorkflowExecution,
  onExecuteStep: (nodeId: String) => void,
  onAdvanceToNext: (edgeType: String) => void,  // "success" | "failure"
  onAbort: () => void,
  commandCards: Array<Command>
})
```

---

### File: `frontend/src/components/workflow/SuccessCriteriaEditor.jsx`

**Purpose:** Visual editor for defining success criteria

**Presets:**
```javascript
const CRITERIA_PRESETS = [
  { label: 'Manual Confirmation', type: 'manual', operator: null, threshold: null },
  { label: 'Exit Code Success', type: 'exitCode', operator: '==', threshold: 0 },
  { label: 'Test Coverage ≥ 80%', type: 'testCoverage', operator: '>=', threshold: 80 },
  { label: 'Test Pass Rate = 100%', type: 'passRate', operator: '==', threshold: 100 },
  { label: 'Custom...', type: 'custom', operator: '>=', threshold: 0 }
];
```

**Output Format:**
```javascript
{
  type: "passRate",
  operator: ">=",
  threshold: 100
}
```

**Validation Rules:**
- Percentages: 0-100
- Exit codes: 0-255
- Manual: No operator/threshold needed

---

### File: `frontend/src/components/workflow/WorkflowCard.jsx`

**Purpose:** Sidebar card for workflow (like SortableCommandCard)

**Visual Design:**
```
┌───────────────────────────────┐
│ 🔄 Feature Dev Cycle          │
│ 6 steps • 2 projects          │
│ ───────────────────────────   │
│ [▶ Run] [✏ Edit] [🗑 Delete]  │
└───────────────────────────────┘
```

**Actions:**
- **Run:** Opens WorkflowExecutor panel
- **Edit:** Opens WorkflowCanvas in edit mode
- **Delete:** Confirmation dialog → Delete workflow

**Props:**
```javascript
WorkflowCard({
  workflow: Workflow,
  onRun: (workflow: Workflow) => void,
  onEdit: (workflow: Workflow) => void,
  onDelete: (workflowId: Number) => void
})
```

---

### File: `frontend/src/components/WorkflowCards.jsx`

**Purpose:** Container for workflow card list (new sidebar tab)

**Structure:**
```jsx
<div className="workflow-cards-container">
  {workflows.length > 0 ? (
    workflows.map(wf => (
      <WorkflowCard 
        key={wf.id}
        workflow={wf}
        onRun={handleRun}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    ))
  ) : (
    <div className="workflow-cards-empty">
      <p>No workflows yet. Click + to create one.</p>
    </div>
  )}
  <button 
    className="btn-new-workflow"
    onClick={onNewWorkflow}
  >
    + New Workflow
  </button>
</div>
```

---

## 5. Sidebar Tab Reorganization

### File: `frontend/src/App.jsx` (modify sidebar state)

**Current Tabs:** `cards`, `files`, `debug`  
**New Tabs:** `cards`, `workflows`, `files`

**Changes:**
```javascript
// Update initial state (around line 100)
const [sidebarTab, setSidebarTab] = useState('cards');

// Remove debug tab, add workflows tab (around line 1400)
<div className="sidebar-tabs">
  <button 
    className={sidebarTab === 'cards' ? 'active' : ''}
    onClick={() => setSidebarTab('cards')}
  >
    📋 Cards
  </button>
  <button 
    className={sidebarTab === 'workflows' ? 'active' : ''}
    onClick={() => setSidebarTab('workflows')}
  >
    🔄 Workflows
  </button>
  <button 
    className={sidebarTab === 'files' ? 'active' : ''}
    onClick={() => setSidebarTab('files')}
  >
    📁 Files
  </button>
</div>

// Update sidebar content rendering
{sidebarTab === 'cards' && (
  <CommandCards {...cardProps} />
)}
{sidebarTab === 'workflows' && (
  <WorkflowCards 
    workflows={workflows}
    onRun={handleRunWorkflow}
    onEdit={handleEditWorkflow}
    onDelete={handleDeleteWorkflow}
  />
)}
{sidebarTab === 'files' && (
  <FileExplorer {...fileProps} />
)}
```

**CSS Updates (`web/index.css`):**
```css
.sidebar-tabs {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-tabs button {
  padding: 8px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  transition: all 0.2s;
}

.sidebar-tabs button.active {
  color: var(--text-primary);
  border-bottom: 2px solid var(--primary-color);
}

.sidebar-tabs button:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}
```

---

## 6. Hooks Implementation

### File: `frontend/src/hooks/useWorkflowManager.js`

```javascript
import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

export function useWorkflowManager() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load workflows on mount
  useEffect(() => {
    loadWorkflows();
  }, []);
  
  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/workflows');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      setWorkflows(data);
      setError(null);
      logger.workflows('Workflows loaded', { count: data.length });
    } catch (err) {
      logger.workflows('Failed to load workflows', { error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  const createWorkflow = useCallback(async (workflow) => {
    try {
      // Generate new ID
      const maxId = workflows.reduce((max, wf) => Math.max(max, wf.id), 0);
      const newWorkflow = { 
        ...workflow, 
        id: maxId + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const updated = [...workflows, newWorkflow];
      
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      setWorkflows(updated);
      logger.workflows('Workflow created', { id: newWorkflow.id, name: newWorkflow.name });
      return { success: true, workflow: newWorkflow };
    } catch (err) {
      logger.workflows('Failed to create workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);
  
  const updateWorkflow = useCallback(async (workflowId, updates) => {
    try {
      const updated = workflows.map(wf => 
        wf.id === workflowId 
          ? { ...wf, ...updates, updatedAt: new Date().toISOString() }
          : wf
      );
      
      const workflow = updated.find(wf => wf.id === workflowId);
      
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      setWorkflows(updated);
      logger.workflows('Workflow updated', { id: workflowId });
      return { success: true };
    } catch (err) {
      logger.workflows('Failed to update workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);
  
  const deleteWorkflow = useCallback(async (workflowId) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const updated = workflows.filter(wf => wf.id !== workflowId);
      setWorkflows(updated);
      logger.workflows('Workflow deleted', { id: workflowId });
      return { success: true };
    } catch (err) {
      logger.workflows('Failed to delete workflow', { error: err.message });
      return { success: false, error: err.message };
    }
  }, [workflows]);
  
  return {
    workflows,
    loading,
    error,
    loadWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow
  };
}
```

### File: `frontend/src/hooks/useWorkflowExecution.js`

```javascript
import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';

export function useWorkflowExecution(workflow) {
  const [execution, setExecution] = useState(null);
  
  const startExecution = useCallback(() => {
    if (!workflow) return;
    
    // Find start node
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) {
      logger.workflows('No start node found', { workflowId: workflow.id });
      return;
    }
    
    // Find first connected node
    const firstEdge = workflow.edges.find(e => e.source === startNode.id);
    const firstNodeId = firstEdge ? firstEdge.target : null;
    
    const newExecution = {
      workflowId: workflow.id,
      currentNodeId: firstNodeId,
      startedAt: new Date().toISOString(),
      history: [],
      variables: {}
    };
    
    setExecution(newExecution);
    logger.workflows('Execution started', { 
      workflowId: workflow.id, 
      firstNode: firstNodeId 
    });
  }, [workflow]);
  
  const advanceToNext = useCallback((edgeType = 'success') => {
    if (!execution || !execution.currentNodeId) return;
    
    // Find outgoing edge of specified type
    const edge = workflow.edges.find(e => 
      e.source === execution.currentNodeId && e.type === edgeType
    );
    
    if (!edge) {
      // Try default edge
      const defaultEdge = workflow.edges.find(e => 
        e.source === execution.currentNodeId && e.type === 'default'
      );
      
      if (!defaultEdge) {
        logger.workflows('No outgoing edge found', { 
          nodeId: execution.currentNodeId, 
          edgeType 
        });
        return;
      }
      
      setExecution(prev => ({
        ...prev,
        currentNodeId: defaultEdge.target
      }));
      return;
    }
    
    setExecution(prev => ({
      ...prev,
      currentNodeId: edge.target
    }));
    
    logger.workflows('Advanced to next node', { 
      from: execution.currentNodeId,
      to: edge.target,
      edgeType
    });
  }, [execution, workflow]);
  
  const markStepComplete = useCallback((nodeId, status, output = null) => {
    setExecution(prev => ({
      ...prev,
      history: [
        ...prev.history,
        {
          nodeId,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          status,
          output,
          criteriaResult: null
        }
      ]
    }));
    
    logger.workflows('Step marked complete', { nodeId, status });
  }, []);
  
  const abortExecution = useCallback(() => {
    setExecution(null);
    logger.workflows('Execution aborted', { workflowId: workflow?.id });
  }, [workflow]);
  
  const loopBackTo = useCallback((nodeId) => {
    setExecution(prev => ({
      ...prev,
      currentNodeId: nodeId
    }));
    
    logger.workflows('Looped back to node', { nodeId });
  }, []);
  
  return {
    execution,
    startExecution,
    advanceToNext,
    markStepComplete,
    abortExecution,
    loopBackTo
  };
}
```

### File: `frontend/src/hooks/useProjectDetection.js`

```javascript
import { useState, useEffect } from 'react';

export function useProjectDetection(currentDirectory) {
  const [projectName, setProjectName] = useState(null);
  
  useEffect(() => {
    if (!currentDirectory) return;
    
    // Extract project name from path
    // Examples:
    //   /Users/mike/projects/forge-terminal -> "forge-terminal"
    //   C:\ProjectsWin\my-app\src -> "my-app"
    
    const parts = currentDirectory.replace(/\\/g, '/').split('/');
    const filtered = parts.filter(p => p.length > 0);
    
    // Look for common project root indicators
    const projectRootIndex = filtered.findIndex(part => 
      part === 'projects' || 
      part === 'ProjectsWin' || 
      part === 'workspace' ||
      part === 'repos'
    );
    
    if (projectRootIndex !== -1 && projectRootIndex < filtered.length - 1) {
      setProjectName(filtered[projectRootIndex + 1]);
    } else if (filtered.length > 0) {
      // Fallback: Use last directory name
      setProjectName(filtered[filtered.length - 1]);
    }
  }, [currentDirectory]);
  
  return projectName;
}
```

---

## 7. User Interaction Flows

### Creating a Workflow

1. User clicks "Workflows" tab in sidebar
2. Clicks "+ New Workflow" button
3. WorkflowCanvas opens in full-screen mode
4. User drags "Start" node from toolbar
5. User drags "Command" node, clicks to configure:
   - Label: "Define Requirement"
   - Type: Command
   - Command Card: "Design Command" (dropdown)
   - Success Criteria: Manual
6. User draws edge from Start → Command node
7. User adds more nodes (Dev Execute, QE Test, etc.)
8. **For QE Test node:**
   - Type: Command
   - Command Card: "Run Tests"
   - Success Criteria: Pass Rate >= 100%
9. User draws two edges from QE Test:
   - **Success edge** (green) → "Commit & Push" node
   - **Failure edge** (red) → "Dev Execute" node (loop back)
10. User clicks "Save" → Workflow persisted
11. Workflow card appears in sidebar

### Executing a Workflow

1. User clicks "Run" on workflow card
2. WorkflowExecutor panel opens on right side of screen
3. Shows step list with Step 1 highlighted
4. User clicks "Execute Step 1"
5. Associated command card executes in terminal
6. User reviews terminal output
7. **If autoAdvance = true:** "Next" button appears after 2 sec
8. User clicks "Next" → Advances to Step 2
9. Repeat steps 4-8 for each node
10. **At QE Test step:**
    - Tests run in terminal
    - Success criteria evaluates: `passRate >= 100`
    - If criteria met → "Next" button enabled
    - If criteria failed → Shows "Loop Back to Dev" and "Skip" options
11. User clicks "Loop Back to Dev"
12. Executor jumps to Dev Execute step
13. User fixes code, re-runs tests
14. Eventually tests pass → Continues to Commit step
15. Workflow completes → Success message shown

### Associating Workflows with Projects

1. User opens WorkflowCanvas (edit mode)
2. Clicks "Projects" button in toolbar
3. ProjectAssociationModal opens
4. Shows current associations: ["forge-terminal"]
5. User adds "my-other-app" to list
6. Clicks "Save"
7. Now workflow appears in sidebar for both projects
8. **Filtering Logic:**
   - If user in `/projects/forge-terminal/` → Shows workflow
   - If user in `/projects/unrelated-project/` → Workflow hidden
   - Workflows with empty projects array → Always shown (global)

---

## 8. Edge Cases & Error Handling

| **Case** | **Handling** |
|----------|--------------|
| **Disconnected node** | Validate on save: "Node 'X' has no incoming edges" |
| **Orphaned edge** | Auto-delete edge if source/target node deleted |
| **Circular loop** | Allow (intentional for Dev↔QE cycle) |
| **Deleted command card** | Show warning badge on node: "⚠ Command card missing" |
| **Command execution fails** | Mark step as "failed", show failure edge options |
| **Multiple success edges** | Not allowed - validation error on save |
| **Multiple failure edges** | Not allowed - validation error on save |
| **Success criteria not met** | Enable failure path, disable success path |
| **No success criteria** | Default to manual confirmation |
| **Workflow name collision** | Allow (like command cards) |
| **Page refresh during execution** | Execution state lost (Phase 1 limitation) |
| **Project name changes** | Manual update required in ProjectAssociationModal |

---

## 9. CSS Styling Requirements

### File: `frontend/web/index.css` (add to existing file)

```css
/* Workflow Canvas Full-Screen */
.workflow-canvas-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  z-index: 10000;
  display: flex;
  flex-direction: column;
}

/* React Flow Container */
.react-flow {
  flex: 1;
  background: var(--bg-secondary);
}

/* Custom Node Styling */
.workflow-node {
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  min-width: 180px;
}

.workflow-node.type-start {
  border-color: var(--success-color);
  background: rgba(34, 197, 94, 0.1);
}

.workflow-node.type-end {
  border-color: var(--error-color);
  background: rgba(239, 68, 68, 0.1);
}

.workflow-node.type-command {
  border-color: var(--primary-color);
}

.workflow-node.type-decision {
  border-color: var(--warning-color);
  background: rgba(251, 191, 36, 0.1);
}

.workflow-node.status-completed {
  border-color: var(--success-color);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
}

.workflow-node.status-failed {
  border-color: var(--error-color);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
}

.workflow-node.status-running {
  border-color: var(--primary-color);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); }
  50% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.8); }
}

/* Custom Edge Styling */
.react-flow__edge-path.edge-success {
  stroke: var(--success-color);
  stroke-width: 3;
}

.react-flow__edge-path.edge-failure {
  stroke: var(--error-color);
  stroke-width: 3;
  stroke-dasharray: 5, 5;
}

.react-flow__edge-path.edge-default {
  stroke: var(--border-color);
  stroke-width: 2;
}

/* Workflow Executor Panel */
.workflow-executor {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 400px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.2);
}

.workflow-executor-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.workflow-executor-steps {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.workflow-executor-step {
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: var(--card-bg);
  display: flex;
  align-items: center;
  gap: 12px;
}

.workflow-executor-step.current {
  background: rgba(59, 130, 246, 0.15);
  border: 2px solid var(--primary-color);
}

.workflow-executor-step.completed {
  opacity: 0.7;
}

.workflow-executor-step-icon {
  font-size: 20px;
}

.workflow-executor-controls {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
}

/* Workflow Card */
.workflow-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.workflow-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.workflow-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.workflow-card-title {
  font-weight: 600;
  font-size: 14px;
}

.workflow-card-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.workflow-card-actions {
  display: flex;
  gap: 8px;
}
```

---

## 10. Implementation Order (Sprints)

### Sprint 1: Backend Foundation (Days 1-3)
- [ ] Create `internal/workflows/types.go`
- [ ] Create `internal/workflows/storage.go`
- [ ] Add API routes in `cmd/forge/main.go`
- [ ] Test with curl: Create, read, update, delete workflows
- [ ] Build Go backend: `go build -o forge.exe cmd/forge/main.go`

### Sprint 2: Data Layer (Days 4-5)
- [ ] Create `frontend/src/types/workflow.js`
- [ ] Create `frontend/src/hooks/useWorkflowManager.js`
- [ ] Create `frontend/src/hooks/useWorkflowExecution.js`
- [ ] Create `frontend/src/hooks/useProjectDetection.js`
- [ ] Write unit tests for hooks

### Sprint 3: Sidebar Integration (Days 6-7)
- [ ] Add "Workflows" tab to sidebar in `App.jsx`
- [ ] Remove "Debug" tab
- [ ] Create `frontend/src/components/WorkflowCards.jsx`
- [ ] Create `frontend/src/components/workflow/WorkflowCard.jsx`
- [ ] Wire up "+ New Workflow" button

### Sprint 4: Canvas Editor (Days 8-12)
- [ ] Install `@xyflow/react` dependency
- [ ] Create `frontend/src/components/workflow/WorkflowCanvas.jsx`
- [ ] Create `frontend/src/components/workflow/WorkflowNode.jsx`
- [ ] Create `frontend/src/components/workflow/WorkflowEdge.jsx`
- [ ] Create `frontend/src/components/workflow/WorkflowCanvasToolbar.jsx`
- [ ] Implement node drag-and-drop
- [ ] Implement edge drawing
- [ ] Add save/cancel functionality

### Sprint 5: Node Configuration (Days 13-15)
- [ ] Create `frontend/src/components/workflow/NodeConfigModal.jsx`
- [ ] Create `frontend/src/components/workflow/SuccessCriteriaEditor.jsx`
- [ ] Create `frontend/src/components/workflow/ProjectAssociationModal.jsx`
- [ ] Wire up node right-click context menu
- [ ] Implement command card linking

### Sprint 6: Executor (Days 16-20)
- [ ] Create `frontend/src/components/workflow/WorkflowExecutor.jsx`
- [ ] Create `frontend/src/components/workflow/WorkflowExecutorStep.jsx`
- [ ] Implement step execution (call `onExecute(commandCard)`)
- [ ] Implement "Next" button with autoAdvance logic
- [ ] Implement "Loop Back" dropdown
- [ ] Add success/failure path selection

### Sprint 7: Polish & Testing (Days 21-25)
- [ ] Add CSS styling (workflow-canvas, nodes, edges, executor)
- [ ] Implement validation (disconnected nodes, empty workflows)
- [ ] Add status indicators (green checkmarks, red X's)
- [ ] Write Playwright tests for workflow creation
- [ ] Write Playwright tests for workflow execution
- [ ] Add keyboard shortcuts (Ctrl+Shift+W for canvas)
- [ ] Update documentation

---

## 11. Testing Strategy

### Unit Tests

**File: `frontend/src/hooks/useWorkflowManager.test.js`**
```javascript
describe('useWorkflowManager', () => {
  test('loads workflows on mount', async () => {
    // Mock fetch
    // Verify workflows state updated
  });
  
  test('creates workflow with auto-incremented ID', async () => {
    // Create workflow
    // Verify ID = maxId + 1
  });
  
  test('updates workflow timestamp on save', async () => {
    // Update workflow
    // Verify updatedAt changed
  });
  
  test('filters workflows by project', async () => {
    // Mock workflows with different projects
    // Verify filtering logic
  });
});
```

**File: `internal/workflows/storage_test.go`**
```go
func TestLoadWorkflows(t *testing.T) {
    // Test loading from empty file
    // Test loading from valid JSON
    // Test loading from corrupted file
}

func TestSaveWorkflows(t *testing.T) {
    // Test saving to new file
    // Test updating existing file
    // Test timestamp updates
}

func TestGetWorkflowsByProject(t *testing.T) {
    // Test filtering by project name
    // Test global workflows (empty projects array)
}
```

### Integration Tests

**File: `frontend/tests/workflow-creation.spec.js`**
```javascript
test('create workflow from canvas', async ({ page }) => {
  // Navigate to Workflows tab
  // Click "+ New Workflow"
  // Drag Start node
  // Drag Command node
  // Connect nodes
  // Save workflow
  // Verify workflow appears in sidebar
});

test('execute workflow step-by-step', async ({ page }) => {
  // Open existing workflow
  // Click "Run"
  // Click "Execute Step 1"
  // Wait for terminal output
  // Click "Next"
  // Verify advanced to Step 2
});
```

### Manual Testing Checklist

- [ ] Create workflow with 6 nodes (start, 4 commands, end)
- [ ] Draw success and failure edges
- [ ] Configure success criteria on QE Test node
- [ ] Execute workflow, loop back from QE to Dev
- [ ] Delete command card referenced by node (verify warning)
- [ ] Associate workflow with 2 projects
- [ ] Switch to different project directory (verify filtering)
- [ ] Reload page during execution (verify state lost)
- [ ] Create workflow with disconnected node (verify validation error)

---

## 12. Future Enhancements (Phase 2+)

### Automated Agent Execution
```javascript
WorkflowNode.persona = {
  name: "dev-agent",
  model: "claude-3.5-sonnet",
  cliTool: "claude",
  systemPrompt: "You are a senior developer..."
};

// Execute automatically without user clicking "Next"
if (workflow.settings.fullyAutomated) {
  executeNodeAutomatically(node);
}
```

### Conditional Branching Evaluation
```javascript
WorkflowEdge.condition = "exitCode === 0 && coverage >= 80";

// Evaluate condition after step execution
const result = evaluateCondition(edge.condition, executionContext);
if (result) {
  followEdge(edge);
}
```

### Variable Passing Between Steps
```javascript
WorkflowNode.outputs = { "requirementDoc": "$OUTPUT" };
WorkflowNode.inputs = { "spec": "${step1.requirementDoc}" };

// Capture output from Step 1
execution.variables.step1 = { requirementDoc: terminalOutput };

// Inject as input to Step 2
const input = injectVariables(node.inputs, execution.variables);
executeCommand(input);
```

### Execution Persistence
```javascript
// Save to ~/.forge/workflow-runs/{workflowId}-{timestamp}.json
const executionState = {
  workflowId: 123,
  currentNodeId: "node-xyz",
  history: [...],
  resumable: true
};

// Resume on page reload
if (hasUnfinishedExecution()) {
  showResumeDialog();
}
```

### Workflow Templates Library
```javascript
const TEMPLATES = [
  {
    name: "Feature Development Cycle",
    description: "Full SDLC from requirements to PR merge",
    nodes: [...],
    edges: [...]
  },
  {
    name: "Bug Fix Workflow",
    description: "Quick cycle for hotfixes",
    nodes: [...],
    edges: [...]
  }
];
```

### Parallel Execution
```javascript
WorkflowNode.executionMode = "parallel"; // or "sequential"

// Execute multiple nodes concurrently
const parallelNodes = getParallelNodes(currentNode);
await Promise.all(parallelNodes.map(n => executeNode(n)));
```

---

## 13. Success Criteria for Phase 1

### Functional Requirements
- ✅ User can create workflow with 5+ nodes
- ✅ User can draw success/failure edges
- ✅ User can configure success criteria (manual, exit code, percentages)
- ✅ User can execute workflow step-by-step
- ✅ User can loop back from QE to Dev
- ✅ User can associate workflow with projects
- ✅ Workflows persist across app restarts
- ✅ Sidebar shows "Cards" → "Workflows" → "Files" tabs

### Non-Functional Requirements
- ✅ Canvas renders 20+ nodes without lag
- ✅ Workflow saves in < 500ms
- ✅ Executor advances to next step in < 200ms
- ✅ Edge drawing feels responsive (< 100ms feedback)

### Documentation Requirements
- ✅ User guide: "Creating Your First Workflow"
- ✅ API documentation for workflow endpoints
- ✅ Code comments for complex logic (edge traversal, criteria evaluation)

---

## 14. Dependencies

### NPM Packages
```bash
npm install @xyflow/react
# Includes built-in pan, zoom, minimap, background grid
```

### Go Packages
```bash
# No new dependencies - uses existing:
# - encoding/json (stdlib)
# - github.com/mikejsmith1985/forge-terminal/internal/storage
```

---

## 15. File Locations Reference

```
~/.forge/
├── workflows.json              # Workflow definitions
├── commands.json               # Existing command cards
├── config.json                 # App settings
└── am/                         # AM conversation logs

frontend/src/
├── components/
│   ├── workflow/               # NEW: All workflow components
│   │   ├── WorkflowCanvas.jsx
│   │   ├── WorkflowNode.jsx
│   │   ├── WorkflowEdge.jsx
│   │   ├── WorkflowCard.jsx
│   │   ├── WorkflowExecutor.jsx
│   │   └── ...
│   ├── WorkflowCards.jsx       # NEW: Sidebar tab content
│   └── App.jsx                 # MODIFY: Add workflows tab
├── hooks/
│   ├── useWorkflowManager.js   # NEW
│   ├── useWorkflowExecution.js # NEW
│   └── useProjectDetection.js  # NEW
└── types/
    └── workflow.js             # NEW

internal/
├── workflows/                  # NEW: Backend package
│   ├── storage.go
│   └── types.go
└── commands/
    └── storage.go              # Existing

cmd/forge/
└── main.go                     # MODIFY: Add workflow routes
```

---

## 16. Open Questions for User

1. **Success Criteria Parsing:** For "Test Coverage >= 80%", should we:
   - Parse terminal output manually (regex for "Coverage: 82%")?
   - Require specific output format?
   - Phase 2 feature?

2. **Workflow Sharing:** Should users be able to export/import workflows as JSON files?

3. **Execution Logging:** Should we log execution history to separate files (like AM logs)?

4. **Canvas Shortcuts:** Preferred keyboard shortcuts?
   - Delete node: `Delete` key?
   - Connect nodes: `Ctrl+Drag`?
   - Save: `Ctrl+S`?

5. **Edge Labels:** Should success/failure edges have default labels or require user input?

---

## Final Recommendation

✅ **Proceed with implementation following Sprint order**  
✅ **Focus on Phase 1 (manual execution) only**  
✅ **Defer automated execution to Phase 2**  
✅ **Target completion: 25 days (5 weeks part-time)**

This design is feasible, provides immediate value, and builds a solid foundation for future automation. The manual execution approach keeps complexity low while delivering a powerful visual workflow planning tool.
