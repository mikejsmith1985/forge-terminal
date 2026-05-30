import React, { useState, useEffect, useMemo } from 'react';
import IconPicker, { iconMap, getEmojiFromIcon } from './IconPicker';
import { ChevronDown } from 'lucide-react';
import { 
  getNextAvailableKeybinding, 
  validateKeybinding, 
  getKeybindingAvailability,
  isDuplicateKeybinding 
} from '../utils/keybindingManager';

const CommandModal = ({ isOpen, onClose, onSave, initialData, commands = [], preferredCliTool = 'claude' }) => {
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
        macro_delay: 1500,
        // On/off toggle fields. Held flat in the form for easy editing and
        // reassembled into a nested `toggle` object on submit (see handleSubmit).
        isToggle: false,
        onLabel: '',
        offLabel: '',
        offCommand: '',
        offMacroPayload: '',
        offMacroDelay: 1500
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
                macro_delay: 1500,
                isToggle: false,
                onLabel: '',
                offLabel: '',
                offCommand: '',
                offMacroPayload: '',
                offMacroDelay: 1500
            };

            if (initialData) {
                // Resolve the per-tool (Claude/Copilot/Google) view of a
                // tool-aware card for editing in the active tool's context.
                const isToolAware = !!initialData.toolVariants && Object.keys(initialData.toolVariants).length > 0;
                const activeCommand = isToolAware
                    ? (initialData.toolVariants[preferredCliTool] ?? initialData.command)
                    : initialData.command;
                const activeDescription = isToolAware && initialData.descriptionVariants?.[preferredCliTool]
                    ? initialData.descriptionVariants[preferredCliTool]
                    : initialData.description;
                const activeMacroPayload = isToolAware && initialData.macroVariants?.[preferredCliTool] !== undefined
                    ? initialData.macroVariants[preferredCliTool]
                    : (initialData.macro_payload || '');

                // Flatten a saved toggle card's nested config back into the form's
                // flat fields so an existing toggle card can be edited in place.
                const savedToggle = initialData.toggle || {};
                setFormData({
                    ...defaults,
                    ...initialData,
                    command: activeCommand,
                    description: activeDescription,
                    macro_payload: activeMacroPayload,
                    // Use ?? (nullish coalescing) so a saved macro_delay of 0 ms is
                    // preserved. The || operator incorrectly treats 0 as falsy,
                    // silently replacing it with the 1500 ms default.
                    macro_delay: initialData.macro_delay ?? 1500,
                    isToggle: initialData.cardType === 'toggle',
                    onLabel: savedToggle.onLabel || '',
                    offLabel: savedToggle.offLabel || '',
                    offCommand: savedToggle.offCommand || '',
                    offMacroPayload: savedToggle.offMacroPayload || '',
                    offMacroDelay: savedToggle.offMacroDelay ?? 1500
                });
            } else {
                setFormData(defaults);
            }
            setShowIconPicker(false);
        }
    }, [isOpen, initialData, preferredCliTool]);

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

        // Pull the flat toggle helper fields out of the form data; whatever
        // remains in `rest` is the normal command card payload.
        const { isToggle, onLabel, offLabel, offCommand, offMacroPayload, offMacroDelay, ...rest } = formData;

        const payload = { ...rest };
        if (isToggle) {
            // Mark the card as a toggle and pack the "off" action + labels into
            // the nested config the backend (ToggleConfig) and renderer expect.
            payload.cardType = 'toggle';
            payload.toggle = {
                onLabel: onLabel || '',
                offLabel: offLabel || '',
                offCommand: offCommand || '',
                offMacroPayload: offMacroPayload || '',
                offMacroDelay: offMacroDelay ?? 1500
            };
        } else {
            // Clear any prior toggle config so editing a card back to a normal
            // command does not leave an orphaned (and now ignored) toggle block.
            payload.cardType = '';
            payload.toggle = null;
        }

        onSave(payload);
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
                    {initialData && initialData.toolVariants && Object.keys(initialData.toolVariants).length > 0 && (
                        <div style={{
                            padding: '8px 12px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            borderLeft: '3px solid #3b82f6',
                            borderRadius: '4px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#e2e8f0'
                        }}>
                            💡 You are editing the command card settings for the active tool: <strong>{preferredCliTool === 'claude' ? 'Claude' : preferredCliTool === 'google' ? 'Google (Agy)' : 'Copilot'}</strong>.
                        </div>
                    )}
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
                        <label>{formData.isToggle ? 'Start (On) Command' : 'Command'}</label>
                        <textarea
                            name="command"
                            value={formData.command}
                            onChange={handleChange}
                            placeholder={formData.isToggle ? 'Command that launches the service...' : 'The command to execute...'}
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

                    {/* Options — each toggle is a self-describing row instead of a
                        cramped inline checkbox, so the choices read clearly and
                        match the styled fields above. */}
                    <div className="cmd-options">
                        <span className="cmd-options-label">Options</span>

                        <label className="cmd-option">
                            <input
                                type="checkbox"
                                name="pasteOnly"
                                checked={formData.pasteOnly}
                                onChange={handleChange}
                            />
                            <span className="cmd-option-text">
                                <span className="cmd-option-title">Paste Only</span>
                                <span className="cmd-option-desc">Send the text without pressing Enter</span>
                            </span>
                        </label>

                        <label className="cmd-option">
                            <input
                                type="checkbox"
                                name="favorite"
                                checked={formData.favorite}
                                onChange={handleChange}
                            />
                            <span className="cmd-option-text">
                                <span className="cmd-option-title">★ Favorite</span>
                                <span className="cmd-option-desc">Pin this card to the top of the list</span>
                            </span>
                        </label>

                        <label className="cmd-option">
                            <input
                                type="checkbox"
                                name="alwaysAppend"
                                checked={formData.alwaysAppend}
                                onChange={handleChange}
                            />
                            <span className="cmd-option-text">
                                <span className="cmd-option-title">📌 Always Append</span>
                                <span className="cmd-option-desc">Add this card's text to every prompt you send</span>
                            </span>
                        </label>

                        <label className="cmd-option">
                            <input
                                type="checkbox"
                                name="isToggle"
                                checked={formData.isToggle}
                                onChange={handleChange}
                            />
                            <span className="cmd-option-text">
                                <span className="cmd-option-title">🔀 On/Off Toggle</span>
                                <span className="cmd-option-desc">Show Start + Stop buttons instead of Run</span>
                            </span>
                        </label>
                    </div>

                    {formData.alwaysAppend && (
                        <div className="cmd-callout cmd-callout-append">
                            <p className="cmd-callout-title">⚡ Always Append Mode</p>
                            <p className="cmd-callout-text">
                                This card's text is automatically appended to every prompt you send to AI agents.
                                Use it for persistent instructions like coding standards, project context, or response formatting.
                            </p>
                        </div>
                    )}

                    {/* Toggle config — only shown when the card is an on/off toggle.
                        The Start action reuses the Command/Macro fields above; these
                        fields define the matching Stop (teardown) action + labels. */}
                    {formData.isToggle && (
                        <div className="cmd-callout cmd-callout-toggle">
                            <p className="cmd-callout-text" style={{ marginBottom: '12px' }}>
                                <strong style={{ color: '#22c55e' }}>🔀 On/Off Toggle</strong> — the card shows two buttons. The command above runs on <em>Start</em>; the fields below define <em>Stop</em>.
                            </p>

                            <div className="form-row" style={{ gap: '12px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Start Button Label</label>
                                    <input
                                        type="text"
                                        name="onLabel"
                                        value={formData.onLabel}
                                        onChange={handleChange}
                                        placeholder="Start"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Stop Button Label</label>
                                    <input
                                        type="text"
                                        name="offLabel"
                                        value={formData.offLabel}
                                        onChange={handleChange}
                                        placeholder="Stop"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Stop (Off) Command</label>
                                <textarea
                                    name="offCommand"
                                    value={formData.offCommand}
                                    onChange={handleChange}
                                    placeholder="Command that tears the service down..."
                                    rows={3}
                                    required={formData.isToggle}
                                />
                            </div>

                            <div className="form-group">
                                <label>Stop Macro Payload (Zero-Click, optional)</label>
                                <textarea
                                    name="offMacroPayload"
                                    value={formData.offMacroPayload}
                                    onChange={handleChange}
                                    placeholder="# Text to auto-inject after the stop command runs..."
                                    rows={2}
                                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                />
                            </div>

                            <div className="form-group" style={{ width: '150px' }}>
                                <label>Stop Macro Delay (ms)</label>
                                <input
                                    type="number"
                                    name="offMacroDelay"
                                    value={formData.offMacroDelay ?? 1500}
                                    onChange={handleChange}
                                    placeholder="1500"
                                    min="0"
                                    step="100"
                                />
                            </div>
                        </div>
                    )}
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
