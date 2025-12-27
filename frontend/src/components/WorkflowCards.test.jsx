import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowCards } from './WorkflowCards';

describe('WorkflowCards', () => {
  const mockWorkflows = [
    {
      id: 1,
      name: 'Test Workflow',
      description: 'Test workflow description',
      nodes: [{ id: 'node1' }, { id: 'node2' }],
      edges: [],
      settings: {},
      projects: ['project1'],
    },
  ];

  it('should render loading state', () => {
    render(
      <WorkflowCards
        workflows={[]}
        loading={true}
        error={null}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={vi.fn()}
      />
    );

    expect(screen.getByText(/loading workflows/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    render(
      <WorkflowCards
        workflows={[]}
        loading={false}
        error="Failed to load"
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={vi.fn()}
      />
    );

    expect(screen.getByText(/failed to load workflows/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('should render empty state with "Create First Workflow" button', () => {
    const onNewWorkflow = vi.fn();

    render(
      <WorkflowCards
        workflows={[]}
        loading={false}
        error={null}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={onNewWorkflow}
      />
    );

    expect(screen.getByText(/no workflows yet/i)).toBeInTheDocument();
    
    const createButton = screen.getByText(/create your first workflow/i);
    expect(createButton).toBeInTheDocument();
    
    fireEvent.click(createButton);
    expect(onNewWorkflow).toHaveBeenCalledTimes(1);
  });

  it('should render workflow list with cards', () => {
    render(
      <WorkflowCards
        workflows={mockWorkflows}
        loading={false}
        error={null}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={vi.fn()}
      />
    );

    expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    expect(screen.getByText('Test workflow description')).toBeInTheDocument();
  });

  it('should render "New Workflow" button when workflows exist', () => {
    const onNewWorkflow = vi.fn();

    render(
      <WorkflowCards
        workflows={mockWorkflows}
        loading={false}
        error={null}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={onNewWorkflow}
      />
    );

    const newButton = screen.getByText(/new workflow/i);
    expect(newButton).toBeInTheDocument();
    
    fireEvent.click(newButton);
    expect(onNewWorkflow).toHaveBeenCalledTimes(1);
  });

  it('should call onRun when Run button is clicked', () => {
    const onRun = vi.fn();

    render(
      <WorkflowCards
        workflows={mockWorkflows}
        loading={false}
        error={null}
        onRun={onRun}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNewWorkflow={vi.fn()}
      />
    );

    const runButton = screen.getByTitle('Run Workflow');
    fireEvent.click(runButton);
    
    expect(onRun).toHaveBeenCalledWith(mockWorkflows[0]);
  });

  it('should call onEdit when Edit button is clicked', () => {
    const onEdit = vi.fn();

    render(
      <WorkflowCards
        workflows={mockWorkflows}
        loading={false}
        error={null}
        onRun={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onNewWorkflow={vi.fn()}
      />
    );

    const editButton = screen.getByTitle('Edit Workflow');
    fireEvent.click(editButton);
    
    expect(onEdit).toHaveBeenCalledWith(mockWorkflows[0]);
  });

  it('should call onDelete when Delete button is clicked', () => {
    const onDelete = vi.fn();

    render(
      <WorkflowCards
        workflows={mockWorkflows}
        loading={false}
        error={null}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onNewWorkflow={vi.fn()}
      />
    );

    const deleteButton = screen.getByTitle('Delete Workflow');
    fireEvent.click(deleteButton);
    
    expect(onDelete).toHaveBeenCalledWith(mockWorkflows[0].id);
  });
});
