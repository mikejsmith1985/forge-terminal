import React, { useState, useEffect, useMemo } from 'react';
import IconPicker, { iconMap, emojiMap } from './IconPicker';
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
        triggerAM: false,
        llmProvider: '',
        llmType: 'chat',
        icon: null
    });
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [keybindingError, setKeybindingError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({ icon: null, llmProvider: '', llmType: 'chat', ...initialData });
            } else {
                setFormData({
                    description: '',
                    command: '',
                    keyBinding: '',
                    pasteOnly: false,
                    favorite: false,
                    triggerAM: false,
                    llmProvider: '',
                    llmType: 'chat',
                    icon: null
                });
            }
            setShowIconPicker(false);
        }
    }, [isOpen, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
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
    const isEmoji = formData.icon && formData.icon.startsWith('emoji-');
    const selectedEmoji = isEmoji ? emojiMap[formData.icon] : null;
    const SelectedIcon = !isEmoji && formData.icon ? iconMap[formData.icon] : null;

    // Calculate the smart keybinding that will be auto-assigned and availability
    const keybindingInfo = useMemo(() => {
        const availability = getKeybindingAvailability(
            initialData ? commands.filter(c => c.id !== initialData.id) : commands
        );
        const nextKeybinding = initialData 
            ? null 
            : getNextAvailableKeybinding(commands);
        
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

                    <div className="form-group">
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
                                name="triggerAM"
                                checked={formData.triggerAM}
                                onChange={handleChange}
                            />
                            Trigger AM (start AM when executed)
                        </label>

                        {formData.triggerAM && (
                            <div style={{ marginLeft: '24px', marginTop: '8px', padding: '12px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '4px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>
                                    <strong>LLM Provider (optional):</strong>
                                    <select 
                                        name="llmProvider" 
                                        value={formData.llmProvider} 
                                        onChange={handleChange}
                                        style={{ width: '100%', marginTop: '4px', padding: '6px' }}
                                    >
                                        <option value="">Auto-detect from command</option>
                                        <option value="copilot">GitHub Copilot</option>
                                        <option value="claude">Claude</option>
                                        <option value="aider">Aider</option>
                                    </select>
                                </label>
                                <label style={{ display: 'block', marginTop: '8px' }}>
                                    <strong>Command Type:</strong>
                                    <select 
                                        name="llmType" 
                                        value={formData.llmType} 
                                        onChange={handleChange}
                                        style={{ width: '100%', marginTop: '4px', padding: '6px' }}
                                    >
                                        <option value="chat">Chat/Conversation</option>
                                        <option value="suggest">Suggest Command</option>
                                        <option value="explain">Explain Code</option>
                                        <option value="code">Code Generation</option>
                                    </select>
                                </label>
                                <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
                                    💡 Specifying the provider helps AM track conversations more reliably
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
