import React from 'react';
import { Plus } from 'lucide-react';
import { WorkflowCard } from './workflow/WorkflowCard';

/**
 * WorkflowCards component - container for workflow cards list
 * @param {Object} props
 * @param {Array} props.workflows - Array of workflow objects
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {Function} props.onRun - Callback when workflow is run
 * @param {Function} props.onEdit - Callback when workflow is edited
 * @param {Function} props.onDelete - Callback when workflow is deleted
 * @param {Function} props.onNewWorkflow - Callback when "+ New Workflow" is clicked
 */
export function WorkflowCards({ 
  workflows, 
  loading, 
  error, 
  onRun, 
  onEdit, 
  onDelete, 
  onNewWorkflow 
}) {
  if (loading) {
    return (
      <div className="workflow-cards-container">
        <div className="workflow-cards-loading">
          <div className="spinner"></div>
          <p>Loading workflows...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workflow-cards-container">
        <div className="workflow-cards-error">
          <p className="error-message">⚠️ Failed to load workflows</p>
          <p className="error-details">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-cards-container">
      {workflows.length > 0 ? (
        <>
          <div className="workflow-cards-list">
            {workflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onRun={onRun}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
          <button 
            className="btn-new-workflow"
            onClick={onNewWorkflow}
            title="Create New Workflow"
          >
            <Plus size={16} />
            <span>New Workflow</span>
          </button>
        </>
      ) : (
        <div className="workflow-cards-empty">
          <p>No workflows yet.</p>
          <button 
            className="btn-new-workflow btn-new-workflow-large"
            onClick={onNewWorkflow}
          >
            <Plus size={20} />
            <span>Create Your First Workflow</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default WorkflowCards;
