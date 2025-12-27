/**
 * Workflow type definitions
 * Mirrors backend types from internal/workflows/types.go
 */

/**
 * @typedef {Object} Position
 * @property {number} x - X coordinate on canvas
 * @property {number} y - Y coordinate on canvas
 */

/**
 * @typedef {Object} SuccessCriteria
 * @property {string} type - "testCoverage" | "passRate" | "manual" | "exitCode"
 * @property {number} threshold - e.g., 80.0 for 80%
 * @property {string} operator - ">=" | ">" | "==" | "<"
 */

/**
 * @typedef {Object} NodeMetadata
 * @property {number|null} executionTime - Milliseconds
 * @property {string|null} lastExecuted - ISO8601 timestamp
 * @property {number} retryCount - Number of retries
 * @property {string|null} output - Last execution output snippet
 */

/**
 * @typedef {Object} WorkflowNode
 * @property {string} id - Unique ID: "node-{uuid}"
 * @property {string} type - "command" | "decision" | "start" | "end"
 * @property {string} label - Plain English step name
 * @property {string} [description] - Optional longer explanation
 * @property {number|null} [commandCardId] - References Command.id
 * @property {Position} position - Canvas coordinates
 * @property {string} status - "pending" | "running" | "completed" | "failed" | "skipped"
 * @property {string|null} [persona] - Future: "dev-agent", "qa-agent"
 * @property {SuccessCriteria|null} [successCriteria] - Validation rules
 * @property {NodeMetadata} metadata - Execution tracking
 */

/**
 * @typedef {Object} WorkflowEdge
 * @property {string} id - Unique ID: "edge-{uuid}"
 * @property {string} source - Source WorkflowNode.id
 * @property {string} target - Target WorkflowNode.id
 * @property {string} type - "success" | "failure" | "default"
 * @property {string|null} [label] - Display text
 * @property {boolean} animated - Animate arrow for active path
 */

/**
 * @typedef {Object} WorkflowSettings
 * @property {boolean} autoAdvance - Show "Next" button vs manual
 * @property {boolean} requireConfirmation - Dialog before each step
 */

/**
 * @typedef {Object} Workflow
 * @property {number} id - Unique workflow ID
 * @property {string} name - Workflow name
 * @property {string} description - Workflow description
 * @property {WorkflowNode[]} nodes - Array of workflow nodes
 * @property {WorkflowEdge[]} edges - Array of connections
 * @property {WorkflowSettings} settings - Configuration
 * @property {string[]} projects - Project associations (empty = global)
 * @property {string} createdAt - ISO8601 timestamp
 * @property {string} updatedAt - ISO8601 timestamp
 * @property {boolean} favorite - Favorite flag
 * @property {string|null} [icon] - Icon name (lucide or emoji)
 * @property {string|null} [keyBinding] - Keyboard shortcut
 */

/**
 * @typedef {Object} WorkflowExecution
 * @property {number} workflowId - Workflow being executed
 * @property {string|null} currentNodeId - Active node
 * @property {string} startedAt - ISO8601 timestamp
 * @property {ExecutionHistoryEntry[]} history - Execution history
 * @property {Object} variables - Future: Pass data between steps
 */

/**
 * @typedef {Object} ExecutionHistoryEntry
 * @property {string} nodeId - Node that was executed
 * @property {string} startTime - ISO8601 timestamp
 * @property {string|null} endTime - ISO8601 timestamp
 * @property {string} status - "completed" | "failed" | "skipped"
 * @property {string|null} output - Terminal output capture
 * @property {CriteriaResult|null} criteriaResult - Validation result
 */

/**
 * @typedef {Object} CriteriaResult
 * @property {boolean} met - Whether criteria was met
 * @property {number|null} actual - Actual value measured
 * @property {number|null} expected - Expected threshold
 */

export const WorkflowTypes = {
  // Export for JSDoc reference
};
