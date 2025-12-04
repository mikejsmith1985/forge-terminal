import React, { useState, useEffect, useMemo } from 'react';
import IconPicker, { iconMap } from './IconPicker';
import { ChevronDown } from 'lucide-react';

// Smart keybinding generator - matches logic in App.jsx
const generateSmartKeybinding = (position, existingCommands) => {
    // Cards 1-10: Ctrl+Shift+1, Ctrl+Shift+2, ... Ctrl+Shift+0
    if (position <= 10) {
        const key = position === 10 ? '0' : String(position);
        return `Ctrl+Shift+${key}`;
    }
    
    // Card 11+: Try to auto-increment from previous card
    if (existingCommands.length > 0) {
        const lastCmd = existingCommands[existingCommands.length - 1];
        if (lastCmd.keyBinding) {
            const match = lastCmd.keyBinding.match(/Ctrl\+Shift\+(.+)$/i);
            if (match) {
                const lastKey = match[1];
                // Increment key
                if (/^[0-9]$/.test(lastKey)) {
                    const num = parseInt(lastKey);
                    if (num < 9) return `Ctrl+Shift+${num + 1}`;
                    return 'Ctrl+Shift+A';
                }
                if (/^[A-Z]$/i.test(lastKey)) {
                    const upper = lastKey.toUpperCase();
                    if (upper < 'Z') return `Ctrl+Shift+${String.fromCharCode(upper.charCodeAt(0) + 1)}`;
                }
            }
        }
    }
    
    // Fallback: use letters starting from A for 11+
    const letterIndex = position - 11;
    if (letterIndex < 26) {
        return `Ctrl+Shift+${String.fromCharCode(65 + letterIndex)}`;
    }
    
    return '';
};

const CommandModal = ({ isOpen, onClose, onSave, initialData, commands = [] }) => {
    const [formData, setFormData] = useState({
        description: '',
        command: '',
        keyBinding: '',
        pasteOnly: false,
        favorite: false,
        icon: null
    });
    const [showIconPicker, setShowIconPicker] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({ icon: null, ...initialData });
            } else {
                setFormData({
                    description: '',
                    command: '',
                    keyBinding: '',
                    pasteOnly: false,
                    favorite: false,
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
    };

    const handleIconSelect = (iconName) => {
        setFormData(prev => ({ ...prev, icon: iconName }));
        setShowIconPicker(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const SelectedIcon = formData.icon ? iconMap[formData.icon] : null;

    // Calculate the smart keybinding that will be auto-assigned
    const smartKeybinding = useMemo(() => {
        if (initialData) return ''; // Editing existing command
        const position = commands.length + 1;
        return generateSmartKeybinding(position, commands);
    }, [commands, initialData]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3>{initialData ? 'Edit Command' : 'Add Command'}</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-row" style={{ gap: '12px', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: '0 0 auto' }}>
                            <label>Icon</label>
                            <button
                                type="button"
                                className="icon-select-btn"
                                onClick={() => setShowIconPicker(!showIconPicker)}
                            >
                                {SelectedIcon ? <SelectedIcon size={20} /> : <span style={{ color: '#666' }}>∅</span>}
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
                            placeholder={smartKeybinding ? `Auto: ${smartKeybinding}` : 'e.g. Ctrl+Shift+1'}
                        />
                        <small>{smartKeybinding && !initialData ? `Will auto-assign: ${smartKeybinding}` : 'Supported: Ctrl+Shift+[0-9, A-Z]'}</small>
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
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CommandModal;
