import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import CommandCards from './CommandCards';

describe('CommandCards - Drag and Drop', () => {
  const mockCommands = [
    { id: 1, name: 'Test 1', command: 'echo 1', description: 'First', keyBinding: 'Ctrl+Shift+1' },
    { id: 2, name: 'Test 2', command: 'echo 2', description: 'Second', keyBinding: 'Ctrl+Shift+2' },
    { id: 3, name: 'Test 3', command: 'echo 3', description: 'Third', keyBinding: 'Ctrl+Shift+3' },
  ];

  const mockHandlers = {
    onExecute: vi.fn(),
    onPaste: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
    onToast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all command cards', () => {
    render(
      <DndContext>
        <CommandCards
          commands={mockCommands}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    expect(screen.getByText('Test 1')).toBeInTheDocument();
    expect(screen.getByText('Test 2')).toBeInTheDocument();
    expect(screen.getByText('Test 3')).toBeInTheDocument();
  });

  it('shows drag handle on each card', () => {
    const { container } = render(
      <DndContext>
        <CommandCards
          commands={mockCommands}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    // Should have drag handles (GripVertical icons)
    const dragHandles = container.querySelectorAll('[title="Drag to reorder"]');
    expect(dragHandles).toHaveLength(3);
  });

  it('calls onPaste when paste button clicked', () => {
    render(
      <DndContext>
        <CommandCards
          commands={mockCommands}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    const pasteButtons = screen.getAllByTitle('Paste to Terminal');
    fireEvent.click(pasteButtons[0]);

    expect(mockHandlers.onPaste).toHaveBeenCalledWith(mockCommands[0]);
  });

  it('calls onEdit when edit button clicked', () => {
    render(
      <DndContext>
        <CommandCards
          commands={mockCommands}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    const editButtons = screen.getAllByTitle('Edit Command');
    fireEvent.click(editButtons[0]);

    expect(mockHandlers.onEdit).toHaveBeenCalledWith(mockCommands[0]);
  });

  it('calls onDelete when delete button clicked', () => {
    render(
      <DndContext>
        <CommandCards
          commands={mockCommands}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    const deleteButtons = screen.getAllByTitle('Delete Command');
    fireEvent.click(deleteButtons[0]);

    expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockCommands[0].id);
  });

  it('filters out system cards', () => {
    const commandsWithSystem = [
      ...mockCommands,
      { id: 'system-1', name: 'System Card', command: 'test', isSystemCard: true },
    ];

    render(
      <DndContext>
        <CommandCards
          commands={commandsWithSystem}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    // System card should not be rendered
    expect(screen.queryByText('System Card')).not.toBeInTheDocument();
    // User cards should be rendered
    expect(screen.getByText('Test 1')).toBeInTheDocument();
  });

  it('shows empty state when no commands', () => {
    render(
      <DndContext>
        <CommandCards
          commands={[]}
          loading={false}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    expect(screen.getByText(/No command cards yet/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <DndContext>
        <CommandCards
          commands={[]}
          loading={true}
          error={null}
          {...mockHandlers}
        />
      </DndContext>
    );

    expect(screen.getByText(/Loading command cards/i)).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    render(
      <DndContext>
        <CommandCards
          commands={[]}
          loading={false}
          error="Failed to fetch"
          {...mockHandlers}
        />
      </DndContext>
    );

    expect(screen.getByText(/Failed to load command cards/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    
    const retryButton = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryButton);
    expect(mockHandlers.onRetry).toHaveBeenCalled();
  });
});
