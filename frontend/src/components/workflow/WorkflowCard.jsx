import React from 'react';
import { Play, Edit2, Trash2, Workflow as WorkflowIcon } from 'lucide-react';

/**
 * WorkflowCard component - displays a single workflow in the sidebar
 * @param {Object} props
 * @param {Object} props.workflow - Workflow object
 * @param {Function} props.onRun - Callback when Run button is clicked
 * @param {Function} props.onEdit - Callback when Edit button is clicked
 * @param {Function} props.onDelete - Callback when Delete button is clicked
 */
export function WorkflowCard({ workflow, onRun, onEdit, onDelete }) {
  const nodeCount = workflow.nodes?.length || 0;
  const projectCount = workflow.projects?.length || 0;

  return (
    <div className={`workflow-card ${workflow.favorite ? 'favorite' : ''}`}>
      <div className="workflow-card-header">
        <div className="workflow-card-title-row">
          {workflow.keyBinding && (
            <span className="keybinding-badge">{workflow.keyBinding}</span>
          )}
          <WorkflowIcon size={16} className="workflow-icon" />
          <span className="workflow-card-title">{workflow.name}</span>
        </div>

        <div className="workflow-card-actions">
          <div 
            className="action-icon" 
            onClick={(e) => { e.stopPropagation(); onEdit(workflow); }} 
            title="Edit Workflow"
          >
            <Edit2 size={18} />
          </div>
          <div 
            className="action-icon delete" 
            onClick={(e) => { e.stopPropagation(); onDelete(workflow.id); }} 
            title="Delete Workflow"
          >
            <Trash2 size={18} />
          </div>
        </div>
      </div>

      {workflow.description && (
        <div className="workflow-card-description">
          {workflow.description}
        </div>
      )}

      <div className="workflow-card-meta">
        <span className="workflow-meta-item">
          {nodeCount} {nodeCount === 1 ? 'step' : 'steps'}
        </span>
        {projectCount > 0 && (
          <>
            <span className="workflow-meta-separator">•</span>
            <span className="workflow-meta-item">
              {projectCount} {projectCount === 1 ? 'project' : 'projects'}
            </span>
          </>
        )}
      </div>

      <div className="workflow-card-footer">
        <button
          className="btn-action btn-run-workflow"
          onClick={() => onRun(workflow)}
          title="Run Workflow"
        >
          <Play size={16} /> Run
        </button>
      </div>
    </div>
  );
}
