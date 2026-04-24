import React, { useState, useEffect, useMemo } from 'react';
import IconPicker, { iconMap, getEmojiFromIcon } from './IconPicker';
import { ChevronDown } from 'lucide-react';
import { 
  getNextAvailableKeybinding, 
  validateKeybinding, 
  getKeybindingAvailability,
  isDuplicateKeybinding 
} from '../utils/keybindingManager';

const CommandModal = ({ isOpen, onClose, onSave, initialData, commands = [] }) => {
    const [formData, setFormData] = useState({
        description: '',
        command: '',
        keyBinding: '',
        pasteOnly: false,
        favorite: false,
        alwaysAppend: false,
        icon: null,
        delay: 0,
        macro_payload: '',
        macro_delay: 1500
    });
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [keybindingError, setKeybindingError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            // Reset state
            const defaults = {
                description: '',
                command: '',
                keyBinding: '',
                pasteOnly: false,
                favorite: false,
                alwaysAppend: false,
                icon: null,
                delay: 0,
                macro_payload: '',
                macro_delay: 1500
            };

            if (initialData) {
                setFormData({
                    ...defaults,
                    ...initialData,
                    // Ensure these are not undefined
                    macro_payload: initialData.macro_payload || '',
                    // Use ?? (nullish coalescing) so a saved macro_delay of 0 ms is
                    // preserved. The || operator incorrectly treats 0 as falsy,
                    // silently replacing it with the 1500 ms default.
                    macro_delay: initialData.macro_delay ?? 1500
                });
            } else {
                setFormData(defaults);
            }
            setShowIconPicker(false);
        }
    }, [isOpen, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value, 10) || 0 : value)
        }));
        
        // Validate keybinding on change
        if (name === 'keyBinding') {
            if (value && value.trim() !== '') {
                const validation = validateKeybinding(value, commands, initialData?.id);
                setKeybindingError(validation.valid ? null : validation.error);
            } else {
                setKeybindingError(null);
            }
        }
    };

    const handleIconSelect = (iconName) => {
        setFormData(prev => ({ ...prev, icon: iconName }));
        setShowIconPicker(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    // Handle emoji vs lucide icon rendering
    const selectedEmoji = getEmojiFromIcon(formData.icon);
    const SelectedIcon = !selectedEmoji && formData.icon ? iconMap[formData.icon] : null;

    // Calculate the smart keybinding that will be auto-assigned and availability
    const keybindingInfo = useMemo(() => {
        const activeCommands = initialData ? commands.filter(c => c.id !== initialData.id) : commands;
        const availability = getKeybindingAvailability(activeCommands);
        const nextKeybinding = initialData 
            ? null 
            : getNextAvailableKeybinding(activeCommands, null);
        
        return {
            availability,
            nextKeybinding,
        };
    }, [commands, initialData]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3>{initialData ? 'Edit Command' : 'Add Command'}</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <form id="command-form" onSubmit={handleSubmit}>
                    <div className="form-row" style={{ gap: '12px', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: '0 0 auto' }}>
                            <label>Icon</label>
                            <button
                                type="button"
                                className="icon-select-btn"
                                onClick={() => setShowIconPicker(!showIconPicker)}
                            >
                                {selectedEmoji ? (
                                    <span style={{ fontSize: '20px' }}>{selectedEmoji}</span>
                                ) : SelectedIcon ? (
                                    <SelectedIcon size={20} />
                                ) : (
                                    <span style={{ color: '#666' }}>∅</span>
                                )}
                                <ChevronDown size={14} />
                            </button>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Description</label>
                            <input
                                type="text"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                placeholder="e.g. Run Claude Code"
                                required
                            />
                        </div>
                    </div>

                    {showIconPicker && (
                        <IconPicker
                            selectedIcon={formData.icon}
                            onSelect={handleIconSelect}
                        />
                    )}

                    <div className="form-group">
                        <label>Command</label>
                        <textarea
                            name="command"
                            value={formData.command}
                            onChange={handleChange}
                            placeholder="The command to execute..."
                            rows={4}
                            required
                        />
                    </div>

                    <div className="form-row" style={{ gap: '12px' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Key Binding</label>
                            <input
                                type="text"
                                name="keyBinding"
                                value={formData.keyBinding}
                                onChange={handleChange}
                                placeholder={keybindingInfo.nextKeybinding ? `Auto: ${keybindingInfo.nextKeybinding}` : 'e.g. Ctrl+Shift+1'}
                                className={keybindingError ? 'error' : ''}
                            />
                            {keybindingError && (
                                <small style={{ color: '#ef4444' }}>{keybindingError}</small>
                            )}
                            {!keybindingError && keybindingInfo.nextKeybinding && !initialData && (
                                <small>Will auto-assign: {keybindingInfo.nextKeybinding}</small>
                            )}
                            {!keybindingError && keybindingInfo.availability.allTaken && !initialData && (
                                <small style={{ color: '#f59e0b' }}>
                                    ⚠️ All 20 default slots taken. Please assign a custom keybinding.
                                </small>
                            )}
                            {!keybindingError && !initialData && !keybindingInfo.availability.allTaken && (
                                <small style={{ color: '#666' }}>
                                    Available: {keybindingInfo.availability.available}/{keybindingInfo.availability.total} default keybindings
                                </small>
                            )}
                        </div>
                        <div className="form-group" style={{ width: '120px' }}>
                            <label>Delay (ms)</label>
                            <input
                                type="number"
                                name="delay"
                                value={formData.delay || 0}
                                onChange={handleChange}
                                placeholder="0"
                                min="0"
                                step="50"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Macro Payload (Zero-Click)</label>
                        <textarea
                            name="macro_payload"
                            value={formData.macro_payload}
                            onChange={handleChange}
                            placeholder="# Text to auto-inject after command execution..."
                            rows={3}
                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                        <small style={{ color: '#666' }}>Injects automatically after delay. Use for system prompts or setup.</small>
                    </div>

                    <div className="form-group" style={{ width: '150px' }}>
                        <label>Macro Delay (ms)</label>
                        <input
                            type="number"
                            name="macro_delay"
                            value={formData.macro_delay ?? 1500}
                            onChange={handleChange}
                            placeholder="1500"
                            min="0"
                            step="100"
                        />
                    </div>

                    <div className="form-row">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="pasteOnly"
                                checked={formData.pasteOnly}
                                onChange={handleChange}
                            />
                            Paste Only (don't press Enter)
                        </label>

                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="favorite"
                                checked={formData.favorite}
                                onChange={handleChange}
                            />
                            Favorite (show at top)
                        </label>

                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="alwaysAppend"
                                checked={formData.alwaysAppend}
                                onChange={handleChange}
                            />
                            📌 Always Append (add to every prompt)
                        </label>

                        {formData.alwaysAppend && (
                            <div style={{ marginLeft: '24px', marginTop: '8px', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                                <p style={{ fontSize: '13px', margin: 0, color: '#f59e0b' }}>
                                    <strong>⚡ Always Append Mode</strong>
                                </p>
                                <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
                                    This card's text will be automatically appended to every prompt you send to AI agents. 
                                    Use this for persistent instructions like coding standards, project context, or response formatting.
                                </p>
                            </div>
                        )}
                    </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button 
                        type="submit" 
                        form="command-form" 
                        className="btn btn-primary"
                        disabled={!!keybindingError}
                    >
                        Save
                    </button>
                </div>

            </div>
        </div>
    );
};

export default CommandModal;
