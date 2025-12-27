import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

/**
 * ProjectAssociationModal - Manage project associations for a workflow
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSave - Save callback with updated projects array
 * @param {Array} props.projects - Current project associations
 */
export function ProjectAssociationModal({ isOpen, onClose, onSave, projects = [] }) {
  const [projectList, setProjectList] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProjectList([...projects]);
      setNewProjectName('');
    }
  }, [isOpen, projects]);

  const handleAddProject = () => {
    const trimmed = newProjectName.trim();
    if (trimmed && !projectList.includes(trimmed)) {
      setProjectList([...projectList, trimmed]);
      setNewProjectName('');
    }
  };

  const handleRemoveProject = (projectName) => {
    setProjectList(projectList.filter(p => p !== projectName));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(projectList);
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddProject();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container modal-container-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Project Associations</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Associate this workflow with specific projects. Leave empty to make it available globally.
            </p>

            {/* Add New Project */}
            <div className="form-group">
              <label htmlFor="new-project">Add Project</label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="new-project"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="e.g., forge-terminal, my-app"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={handleAddProject}
                  disabled={!newProjectName.trim()}
                  title="Add Project"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Project List */}
            <div className="form-group">
              <label>Associated Projects ({projectList.length})</label>
              {projectList.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-text">
                    No projects associated. This workflow will be available globally.
                  </p>
                </div>
              ) : (
                <ul className="project-list">
                  {projectList.map(project => (
                    <li key={project} className="project-item">
                      <span className="project-name">{project}</span>
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-small"
                        onClick={() => handleRemoveProject(project)}
                        title="Remove Project"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Help Text */}
            <div className="form-help">
              <strong>Note:</strong> Workflows without project associations are shown in all projects.
              Add specific projects to limit visibility.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
