import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Save, Plus, FolderTree } from 'lucide-react';
import { WorkflowNode } from './WorkflowNode';
import { WorkflowEdge } from './WorkflowEdge';
import { NodeConfigModal } from './NodeConfigModal';
import { ProjectAssociationModal } from './ProjectAssociationModal';

// Custom node types
const nodeTypes = {
  workflow: WorkflowNode,
};

// Custom edge types
const edgeTypes = {
  workflow: WorkflowEdge,
};

/**
 * WorkflowCanvas - Full-screen workflow editor with React Flow
 * @param {Object} props
 * @param {Object} props.workflow - Workflow to edit (null for new)
 * @param {Function} props.onSave - Called with workflow data on save
 * @param {Function} props.onClose - Called when canvas is closed
 * @param {Array} props.commandCards - Available command cards for node assignment
 */
export function WorkflowCanvas({ workflow, onSave, onClose, commandCards = [] }) {
  const [workflowName, setWorkflowName] = useState(workflow?.name || '');
  const [workflowDescription, setWorkflowDescription] = useState(workflow?.description || '');
  const [workflowProjects, setWorkflowProjects] = useState(workflow?.projects || []);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isNodeConfigOpen, setIsNodeConfigOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  // Convert workflow nodes to React Flow format
  const initialNodes = workflow?.nodes?.map(node => ({
    id: node.id,
    type: 'workflow',
    position: node.position,
    data: {
      label: node.label,
      nodeType: node.type,
      description: node.description,
      commandCardId: node.commandCardId,
      status: node.status,
      successCriteria: node.successCriteria,
    },
  })) || [];

  // Convert workflow edges to React Flow format
  const initialEdges = workflow?.edges?.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'workflow',
    data: {
      edgeType: edge.type,
      label: edge.label,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.type === 'success' ? '#22c55e' : edge.type === 'failure' ? '#ef4444' : '#6b7280',
    },
    style: {
      stroke: edge.type === 'success' ? '#22c55e' : edge.type === 'failure' ? '#ef4444' : '#6b7280',
      strokeWidth: 2,
    },
  })) || [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'workflow',
      data: { edgeType: 'default' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style: { stroke: '#6b7280', strokeWidth: 2 },
    }, eds)),
    [setEdges]
  );

  const onNodeDoubleClick = useCallback((event, node) => {
    setSelectedNode(node);
    setIsNodeConfigOpen(true);
  }, []);

  const handleNodeConfigSave = (updatedNode) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === updatedNode.id ? updatedNode : n))
    );
  };

  const handleAddNode = (nodeType) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'workflow',
      position: { x: 100, y: 100 },
      data: {
        label: nodeType === 'start' ? 'Start' : nodeType === 'end' ? 'End' : 'New Step',
        nodeType,
        description: '',
        commandCardId: null,
        status: 'pending',
        successCriteria: null,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSave = () => {
    // Convert React Flow nodes back to workflow format
    const workflowNodes = nodes.map(node => ({
      id: node.id,
      type: node.data.nodeType,
      label: node.data.label,
      description: node.data.description || '',
      commandCardId: node.data.commandCardId,
      successCriteria: node.data.successCriteria,
      position: node.position,
      status: node.data.status || 'pending',
      metadata: {
        executionTime: null,
        lastExecuted: null,
        retryCount: 0,
        output: null,
      },
    }));

    // Convert React Flow edges back to workflow format
    const workflowEdges = edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.data?.edgeType || 'default',
      label: edge.data?.label || null,
      animated: false,
    }));

    const workflowData = {
      ...workflow,
      name: workflowName || 'Untitled Workflow',
      description: workflowDescription,
      nodes: workflowNodes,
      edges: workflowEdges,
      settings: workflow?.settings || {
        autoAdvance: false,
        requireConfirmation: false,
      },
      projects: workflowProjects,
    };

    onSave(workflowData);
  };

  return (
    <div className="workflow-canvas-fullscreen">
      {/* Header */}
      <div className="workflow-canvas-header">
        <div className="workflow-canvas-header-left">
          <input
            type="text"
            className="workflow-name-input"
            placeholder="Workflow Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
          />
          <input
            type="text"
            className="workflow-description-input"
            placeholder="Description (optional)"
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
          />
        </div>
        <div className="workflow-canvas-header-right">
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsProjectModalOpen(true)}
            title="Manage Project Associations"
          >
            <FolderTree size={16} /> Projects ({workflowProjects.length})
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            <X size={16} /> Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} /> Save
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="workflow-canvas-toolbar">
        <div className="workflow-toolbar-section">
          <span className="workflow-toolbar-label">Add Node:</span>
          <button
            className="btn btn-toolbar"
            onClick={() => handleAddNode('start')}
            title="Add Start Node"
          >
            Start
          </button>
          <button
            className="btn btn-toolbar"
            onClick={() => handleAddNode('command')}
            title="Add Command Node"
          >
            Command
          </button>
          <button
            className="btn btn-toolbar"
            onClick={() => handleAddNode('decision')}
            title="Add Decision Node"
          >
            Decision
          </button>
          <button
            className="btn btn-toolbar"
            onClick={() => handleAddNode('end')}
            title="Add End Node"
          >
            End
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="workflow-canvas-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.data.nodeType === 'start') return '#22c55e';
              if (node.data.nodeType === 'end') return '#ef4444';
              if (node.data.nodeType === 'decision') return '#f59e0b';
              return '#3b82f6';
            }}
            maskColor="#00000050"
          />
        </ReactFlow>
      </div>

      {/* Node Configuration Modal */}
      <NodeConfigModal
        isOpen={isNodeConfigOpen}
        onClose={() => {
          setIsNodeConfigOpen(false);
          setSelectedNode(null);
        }}
        onSave={handleNodeConfigSave}
        node={selectedNode}
        commandCards={commandCards}
      />

      {/* Project Association Modal */}
      <ProjectAssociationModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={(projects) => setWorkflowProjects(projects)}
        projects={workflowProjects}
      />
    </div>
  );
}
