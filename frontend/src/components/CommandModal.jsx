import React, { useState, useEffect } from 'react';

const CommandModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState({
        description: '',
        command: '',
        keyBinding: '',
        pasteOnly: false,
        favorite: false
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
            } else {
                setFormData({
                    description: '',
                    command: '',
                    keyBinding: '',
                    pasteOnly: false,
                    favorite: false
                });
            }
        }
    }, [isOpen, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3>{initialData ? 'Edit Command' : 'Add Command'}</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Description</label>
                        <input
                            type="text"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="e.g. 🤖 Run Claude Code"
                            required
                        />
                    </div>

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
                            placeholder="e.g. Ctrl+Shift+1"
                        />
                        <small>Supported: Ctrl+Shift+[0-9]</small>
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
