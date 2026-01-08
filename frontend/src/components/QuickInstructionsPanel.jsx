import React, { useState, useEffect } from 'react';
import { Zap, AlertCircle, Info } from 'lucide-react';

/**
 * QuickInstructionsPanel - Settings panel for Quick Instruction feature
 * v3.12.15: Configure floating prompt bar with auto-appended context
 */
function QuickInstructionsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/quick-instruction');
      if (!response.ok) throw new Error('Failed to load config');
      const data = await response.json();
      setEnabled(data.enabled || false);
      setTemplate(data.template || '');
    } catch (err) {
      setError('Failed to load Quick Instruction settings');
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSaveStatus('');

      // Validate
      if (enabled && !template.trim()) {
        setError('Template cannot be empty when Quick Instruction is enabled');
        return;
      }

      const response = await fetch('/api/quick-instruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, template })
      });

      if (!response.ok) throw new Error('Failed to save config');

      setSaveStatus('Settings saved successfully!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setError('Failed to save Quick Instruction settings');
      console.error('Save config error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
        Loading Quick Instruction settings...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <Zap size={28} color="#8b5cf6" />
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.5em' }}>Quick Instructions</h2>
        </div>
        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95em' }}>
          Append context to your prompts automatically using a floating input bar
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fca5a5'
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Save Status */}
      {saveStatus && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid #22c55e',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#86efac'
        }}>
          <Info size={20} />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Enable Toggle */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          gap: '15px'
        }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer',
              accentColor: '#8b5cf6'
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#f1f5f9', fontWeight: '600', marginBottom: '4px' }}>
              Enable Quick Instruction Bar
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>
              Show floating input bar above Forge Assist button (Toggle with Ctrl+I)
            </div>
          </div>
        </label>
      </div>

      {/* Template Editor */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <div style={{ color: '#f1f5f9', fontWeight: '600', marginBottom: '8px' }}>
            Quick Instruction Template
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.9em', marginBottom: '12px' }}>
            This text will be appended to your prompts when using the Quick Instruction bar
          </div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Enter your instruction template here..."
            rows={6}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '12px',
              color: '#e2e8f0',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
        </label>
      </div>

      {/* Info Box */}
      <div style={{
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid #8b5cf6',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Info size={20} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ color: '#cbd5e1', fontSize: '0.9em' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#e9d5ff' }}>
              How to Use Quick Instructions
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
              <li>Enable the feature above to show the floating bar</li>
              <li>Press <kbd style={{ background: '#334155', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>Ctrl+I</kbd> to toggle the bar visibility</li>
              <li>Type your prompt in the bar and click Send</li>
              <li>Your template will be automatically appended to the prompt</li>
              <li>Works with any CLI tool (gh copilot, claude, aider, etc.)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Example Preview */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ color: '#f1f5f9', fontWeight: '600', marginBottom: '12px' }}>
          Preview: What Gets Sent
        </div>
        <div style={{
          background: '#0f172a',
          border: '1px solid #475569',
          borderRadius: '8px',
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cbd5e1',
          whiteSpace: 'pre-wrap'
        }}>
          <div style={{ color: '#94a3b8', marginBottom: '8px' }}>// Your prompt:</div>
          <div style={{ marginBottom: '12px' }}>How do I list all files recursively?</div>
          <div style={{ color: '#94a3b8', marginBottom: '8px' }}>// Appended context:</div>
          <div style={{ fontStyle: 'italic', opacity: 0.8 }}>
            {template || '(No template configured)'}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={loadConfig}
          style={{
            padding: '10px 24px',
            background: 'transparent',
            border: '1px solid #475569',
            borderRadius: '8px',
            color: '#94a3b8',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#334155';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px',
            background: saving ? '#6d28d9' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s',
            opacity: saving ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(139, 92, 246, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default QuickInstructionsPanel;
