import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommandModal from './CommandModal';

// Mock keybinding manager module
vi.mock('../utils/keybindingManager', () => ({
  validateKeybinding: vi.fn(),
  getNextAvailableKeybinding: vi.fn(),
  getKeybindingAvailability: vi.fn(),
  isDuplicateKeybinding: vi.fn(),
}));

// Mock IconPicker
vi.mock('./IconPicker', () => ({
  default: () => null,
  iconMap: {},
  emojiMap: {},
}));

describe('CommandModal - Edit Command Keybinding Bug', () => {
  const existingCommands = [
    { id: 1, description: 'Test 1', command: 'echo 1', keyBinding: 'Ctrl+Shift+1' },
    { id: 2, description: 'Test 2', command: 'echo 2', keyBinding: 'Ctrl+Shift+2' },
    { id: 3, description: 'Test 3', command: 'echo 3', keyBinding: 'Ctrl+Shift+3' },
  ];

  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the mocked functions
    const keybindingManager = await import('../utils/keybindingManager');
    
    // Setup default mock implementations
    keybindingManager.validateKeybinding.mockReturnValue({ valid: true, error: null });
    keybindingManager.getNextAvailableKeybinding.mockReturnValue('Ctrl+Shift+4');
    keybindingManager.getKeybindingAvailability.mockReturnValue({
      total: 20,
      assigned: 3,
      available: 17,
      availableList: [],
      assignedList: ['Ctrl+Shift+1', 'Ctrl+Shift+2', 'Ctrl+Shift+3'],
      allTaken: false,
    });
  });

  it('should allow editing command without changing keybinding', async () => {
    // Edit existing command - should exclude its own keybinding from validation
    const editingCommand = existingCommands[0];
    
    render(
      <CommandModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        initialData={editingCommand}
        commands={existingCommands}
      />
    );

    // Modal should open with existing data
    expect(screen.getByDisplayValue('Test 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('echo 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ctrl+Shift+1')).toBeInTheDocument();

    // Change description only
    const descInput = screen.getByDisplayValue('Test 1');
    fireEvent.change(descInput, { target: { value: 'Test 1 Updated' } });

    // Submit form
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    // Should call onSave with updated data, keeping same keybinding
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test 1 Updated',
          command: 'echo 1',
          keyBinding: 'Ctrl+Shift+1',
        })
      );
    });
  });

  it('should validate keybinding excluding current command when editing', async () => {
    const editingCommand = existingCommands[0];
    
    const keybindingManager = await import('../utils/keybindingManager');
    
    // Mock validation to check if excludeId is passed
    keybindingManager.validateKeybinding.mockImplementation((keybinding, commands, excludeId) => {
      // Should exclude the command being edited
      if (keybinding === 'Ctrl+Shift+1' && excludeId === 1) {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Keybinding already in use' };
    });

    render(
      <CommandModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        initialData={editingCommand}
        commands={existingCommands}
      />
    );

    // Verify keybinding field shows current value
    const keybindingInput = screen.getByDisplayValue('Ctrl+Shift+1');
    expect(keybindingInput).toBeInTheDocument();

    // Submit without changing keybinding
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    // validateKeybinding should have been called with excludeId
    await waitFor(() => {
      expect(keybindingManager.validateKeybinding).toHaveBeenCalledWith(
        'Ctrl+Shift+1',
        existingCommands,
        1 // excludeId should be the editing command's ID
      );
    });
  });

  it('should show error if changing to duplicate keybinding', async () => {
    const editingCommand = existingCommands[0];
    
    const keybindingManager = await import('../utils/keybindingManager');
    
    // Mock validation to reject duplicate
    keybindingManager.validateKeybinding.mockImplementation((keybinding, commands, excludeId) => {
      if (keybinding === 'Ctrl+Shift+2' && excludeId === 1) {
        return { 
          valid: false, 
          error: 'Keybinding "Ctrl+Shift+2" is already assigned to another command.' 
        };
      }
      return { valid: true, error: null };
    });

    render(
      <CommandModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        initialData={editingCommand}
        commands={existingCommands}
      />
    );

    // Change keybinding to one that's already in use
    const keybindingInput = screen.getByDisplayValue('Ctrl+Shift+1');
    fireEvent.change(keybindingInput, { target: { value: 'Ctrl+Shift+2' } });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/already assigned to another command/i)).toBeInTheDocument();
    });

    // Save button should be disabled
    const saveButton = screen.getByText('Save');
    expect(saveButton).toBeDisabled();
  });

  it('should allow changing to available keybinding', async () => {
    const editingCommand = existingCommands[0];
    
    const keybindingManager = await import('../utils/keybindingManager');
    
    // Mock validation to allow Ctrl+Shift+5
    keybindingManager.validateKeybinding.mockImplementation((keybinding, commands, excludeId) => {
      if (keybinding === 'Ctrl+Shift+5') {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Keybinding already in use' };
    });

    render(
      <CommandModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        initialData={editingCommand}
        commands={existingCommands}
      />
    );

    // Change to available keybinding
    const keybindingInput = screen.getByDisplayValue('Ctrl+Shift+1');
    fireEvent.change(keybindingInput, { target: { value: 'Ctrl+Shift+5' } });

    // Submit
    const saveButton = screen.getByText('Save');
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          keyBinding: 'Ctrl+Shift+5',
        })
      );
    });
  });

  it('should clear keybinding when field is emptied during edit', async () => {
    const editingCommand = existingCommands[0];

    render(
      <CommandModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        initialData={editingCommand}
        commands={existingCommands}
      />
    );

    // Clear the keybinding
    const keybindingInput = screen.getByDisplayValue('Ctrl+Shift+1');
    fireEvent.change(keybindingInput, { target: { value: '' } });

    // Submit
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    // Should save with empty keybinding (will auto-assign)
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          keyBinding: '',
        })
      );
    });
  });
});
