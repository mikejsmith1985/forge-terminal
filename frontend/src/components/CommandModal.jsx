import React, { useState, useEffect, useMemo } from 'react';
import IconPicker, { iconMap, emojiMap } from './IconPicker';
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
        triggerAM: false,
        llmProvider: '',
        llmType: 'chat',
        icon: null
    });
    const [showIconPicker, setShowIconPicker] = useState(false);

    // Hook setup wizard state
    const [showHooksWizard, setShowHooksWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [installInfo, setInstallInfo] = useState(null);
    const [applyInfo, setApplyInfo] = useState(null);
    const [selectedShell, setSelectedShell] = useState('bash');

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
        // Intercept triggerAM checkbox to start guided setup
        if (name === 'triggerAM') {
            if (type === 'checkbox' && checked) {
                // Start wizard
                setFormData(prev => ({ ...prev, triggerAM: true }));
                setShowHooksWizard(true);
                setWizardStep(1);
                return;
            }
            // Unchecking simply updates
            setFormData(prev => ({ ...prev, triggerAM: false }));
            return;
        }

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

    // Wizard actions
    const wizardCancel = () => {
        // user declined - turn off triggerAM
        setFormData(prev => ({ ...prev, triggerAM: false }));
        setShowHooksWizard(false);
        setWizardStep(1);
    };

    const wizardDeclineEnableHooks = () => {
        // user chose not to enable hooks - keep TriggerAM but proceed with 4/5 behavior
        setShowHooksWizard(false);
        setWizardStep(1);
    };

    const wizardInstall = async () => {
        setWizardStep(3);
        try {
            const res = await fetch('/api/am/install-hooks', { method: 'POST' });
            const data = await res.json();
            setInstallInfo(data);
            setWizardStep(4);
        } catch (err) {
            setInstallInfo({ success: false, error: err.message });
            setWizardStep(4);
        }
    };

    const wizardApply = async () => {
        // First request a preview snippet to show the exact lines that will be appended
        setWizardStep(5);
        try {
            const res = await fetch('/api/am/apply-hooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shell: selectedShell, preview: true })
            });
            const data = await res.json();
            // Show confirmation step with snippet
            setApplyInfo({ preview: data.snippet });
            setWizardStep(7); // confirmation
        } catch (err) {
            setApplyInfo({ success: false, error: err.message });
            setWizardStep(4);
        }
    };

    const wizardApplyConfirm = async () => {
        // User confirmed, perform actual apply
        setWizardStep(8);
        try {
            const res = await fetch('/api/am/apply-hooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shell: selectedShell, preview: false })
            });
            const data = await res.json();
            setApplyInfo(data);
            if (data.success) {
                // Close wizard and mark done
                setShowHooksWizard(false);
                setWizardStep(1);
            } else {
                setWizardStep(4);
            }
        } catch (err) {
            setApplyInfo({ success: false, error: err.message });
            setWizardStep(4);
        }
    };

    // Handle emoji vs lucide icon rendering
    const isEmoji = formData.icon && formData.icon.startsWith('emoji-');
    const selectedEmoji = isEmoji ? emojiMap[formData.icon] : null;
    const SelectedIcon = !isEmoji && formData.icon ? iconMap[formData.icon] : null;

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

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                </form>

                {/* Hooks Wizard Overlay */}
                {showHooksWizard && (
                    <div className="modal-overlay" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="modal" style={{ maxWidth: '600px' }}>
                            <div className="modal-header">
                                <h3>Enable AM Trigger - Guided Setup</h3>
                                <button className="btn-close" onClick={wizardCancel}>×</button>
                            </div>
                            <div className="modal-body" style={{ padding: '20px' }}>
                                {wizardStep === 1 && (
                                    <div>
                                        <p><strong>What is AM?</strong> AM remembers what happened in your terminal so you can recover work. It uses 5 checks (layers) to be sure it's working. Layer 2 (Shell Hooks) watches commands directly and makes AM smarter.</p>
                                        <p>Do you want to continue and configure the card to trigger AM when run?</p>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                            <button className="btn btn-secondary" onClick={wizardCancel}>No, cancel</button>
                                            <button className="btn btn-primary" onClick={() => setWizardStep(2)}>Yes, continue</button>
                                        </div>
                                    </div>
                                )}

                                {wizardStep === 2 && (
                                    <div>
                                        <p>Shell Hooks are tiny snippets added to your shell settings so Forge can see commands you run. This makes AM much more reliable.</p>
                                        <p>Do you want to enable Shell Hooks now?</p>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                            <button className="btn btn-secondary" onClick={wizardDeclineEnableHooks}>No, keep 4/5</button>
                                            <button className="btn btn-primary" onClick={wizardInstall}>Yes, show me the script</button>
                                        </div>
                                    </div>
                                )}

                                {wizardStep === 3 && (
                                    <div>
                                        <p>Generating shell hook instructions...</p>
                                    </div>
                                )}

                                {wizardStep === 4 && (
                                    <div>
                                        {installInfo && installInfo.success ? (
                                            <div>
                                                <p>Script created at: <code style={{ fontFamily: 'monospace' }}>{installInfo.path}</code></p>
                                                <p style={{ whiteSpace: 'pre-wrap', background: '#0a0a0a', padding: '12px', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto' }}>{installInfo.content}</p>

                                                <div style={{ marginTop: '10px' }}>
                                                    <label style={{ display: 'block', marginBottom: '6px' }}>Which shell should we apply this to automatically?</label>
                                                    <label style={{ marginRight: '10px' }}><input type="radio" name="shell" value="bash" checked={selectedShell === 'bash'} onChange={() => setSelectedShell('bash')} /> Bash / Zsh</label>
                                                    <label><input type="radio" name="shell" value="powershell" checked={selectedShell === 'powershell'} onChange={() => setSelectedShell('powershell')} /> PowerShell</label>
                                                </div>

                                                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                    <button className="btn btn-secondary" onClick={() => {
                                                        // Decline apply - offer continue or turn off
                                                        setWizardStep(6);
                                                    }}>No, don't apply</button>
                                                    <button className="btn btn-primary" onClick={wizardApply}>Yes, apply automatically</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <p>Failed to generate script: {installInfo?.error}</p>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                    <button className="btn btn-secondary" onClick={wizardCancel}>Cancel</button>
                                                    <button className="btn btn-primary" onClick={wizardInstall}>Try again</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {wizardStep === 5 && (
                                    <div>
                                        <p>Requesting preview...</p>
                                    </div>
                                )}

                                {wizardStep === 7 && (
                                    <div>
                                        <p><strong>Preview of lines to be appended:</strong></p>
                                        <pre style={{ whiteSpace: 'pre-wrap', background: '#0a0a0a', padding: '12px', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto' }}>{applyInfo?.preview}</pre>
                                        <p>Do you approve applying these lines to your shell profile? A backup will be created first.</p>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                            <button className="btn btn-secondary" onClick={() => setWizardStep(4)}>No, go back</button>
                                            <button className="btn btn-primary" onClick={wizardApplyConfirm}>Yes, apply now</button>
                                        </div>
                                    </div>
                                )}

                                {wizardStep === 8 && (
                                    <div>
                                        {applyInfo && applyInfo.success ? (
                                            <div>
                                                <p>Shell hooks applied to: <code style={{ fontFamily: 'monospace' }}>{applyInfo.path}</code></p>
                                                {applyInfo.backup && <p>Backup of previous file: <code style={{ fontFamily: 'monospace' }}>{applyInfo.backup}</code></p>}
                                                <p>AM is now fully activated. The card will trigger AM when executed.</p>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                    <button className="btn btn-primary" onClick={() => { setShowHooksWizard(false); setWizardStep(1); }}>Done</button>
                                                    {applyInfo.backup && (
                                                        <button className="btn btn-warning" onClick={async () => {
                                                            // Revert backup
                                                            try {
                                                                const res = await fetch('/api/am/restore-hooks', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ backup: applyInfo.backup, target: applyInfo.path })
                                                                });
                                                                const data = await res.json();
                                                                if (data.success) {
                                                                    alert('Backup restored: ' + data.restored);
                                                                } else {
                                                                    alert('Failed to restore backup: ' + data.error);
                                                                }
                                                            } catch (err) {
                                                                alert('Failed to restore backup: ' + err.message);
                                                            }
                                                        }}>Undo (restore backup)</button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <p>Failed to apply hooks: {applyInfo?.error}</p>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                    <button className="btn btn-secondary" onClick={() => setWizardStep(4)}>Back</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {wizardStep === 6 && (
                                    <div>
                                        <p>You chose not to apply hooks automatically. Would you like to continue with AM using 4 layers (Layer 2 ignored), or turn AM off for this card?</p>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                            <button className="btn btn-secondary" onClick={() => { setShowHooksWizard(false); setWizardStep(1); }}>Continue with 4 layers</button>
                                            <button className="btn btn-danger" onClick={() => { setFormData(prev => ({ ...prev, triggerAM: false })); setShowHooksWizard(false); setWizardStep(1); }}>Turn AM off for this card</button>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default CommandModal;
