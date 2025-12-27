import React from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * WorkflowNode - Custom node component for React Flow
 * @param {Object} props
 * @param {Object} props.data - Node data
 * @param {string} props.data.label - Node label
 * @param {string} props.data.nodeType - Node type (start, end, command, decision)
 * @param {string} props.data.description - Node description
 * @param {string} props.data.status - Node status (pending, completed, failed)
 */
export function WorkflowNode({ data }) {
  const { label, nodeType, description, status } = data;

  // Determine node styling based on type
  const getNodeClass = () => {
    const baseClass = 'workflow-node';
    const typeClass = `workflow-node-${nodeType}`;
    const statusClass = status ? `workflow-node-status-${status}` : '';
    return `${baseClass} ${typeClass} ${statusClass}`.trim();
  };

  // Determine node icon/emoji
  const getNodeIcon = () => {
    switch (nodeType) {
      case 'start':
        return '▶️';
      case 'end':
        return '🏁';
      case 'decision':
        return '❓';
      case 'command':
        return '⚙️';
      default:
        return '📦';
    }
  };

  return (
    <div className={getNodeClass()}>
      {/* Input handle (except for start nodes) */}
      {nodeType !== 'start' && (
        <Handle
          type="target"
          position={Position.Top}
          className="workflow-handle workflow-handle-target"
        />
      )}

      {/* Node content */}
      <div className="workflow-node-content">
        <div className="workflow-node-icon">{getNodeIcon()}</div>
        <div className="workflow-node-label">{label}</div>
        {description && (
          <div className="workflow-node-description">{description}</div>
        )}
      </div>

      {/* Output handle (except for end nodes) */}
      {nodeType !== 'end' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="workflow-handle workflow-handle-source"
        />
      )}
    </div>
  );
}
