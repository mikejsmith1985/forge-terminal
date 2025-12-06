import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Save, X, Play } from 'lucide-react';
import './MonacoEditor.css';

export default function MonacoEditor({ 
  file, 
  onClose, 
  onSave, 
  theme = 'vs-dark',
  terminalRef 
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  
  useEffect(() => {
    if (file) {
      loadFile(file.path);
    }
  }, [file]);
  
  const loadFile = async (path) => {
    setLoading(true);
    try {
      const response = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      
      if (!response.ok) throw new Error('Failed to load file');
      
      const data = await response.json();
      setContent(data.content);
      setModified(false);
    } catch (err) {
      console.error('Failed to load file:', err);
      alert('Failed to load file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async () => {
    if (!file || !modified) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: file.path,
          content: editorRef.current?.getValue() || content
        })
      });
      
      if (!response.ok) throw new Error('Failed to save file');
      
      setModified(false);
      if (onSave) onSave(file);
    } catch (err) {
      console.error('Failed to save file:', err);
      alert('Failed to save file: ' + err.message);
    } finally {
      setSaving(false);
    }
  };
  
  const handleRun = () => {
    if (!file || !terminalRef?.current) return;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    const commands = {
      'js': `node ${file.name}`,
      'py': `python3 ${file.name}`,
      'go': `go run ${file.name}`,
      'sh': `bash ${file.name}`,
    };
    
    const command = commands[ext];
    if (command) {
      terminalRef.current.write(command + '\r');
    }
  };
  
  const handleClose = () => {
    if (modified) {
      if (confirm('You have unsaved changes. Close anyway?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  const getLanguage = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
      'py': 'python',
      'go': 'go',
      'sh': 'shell',
      'bash': 'shell',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
    };
    return langMap[ext] || 'plaintext';
  };
  
  return (
    <div className="monaco-editor-container">
      <div className="monaco-toolbar">
        <div className="monaco-toolbar-left">
          <span className="monaco-filename">{file?.name || 'Untitled'}</span>
          {modified && <span className="monaco-modified-indicator">●</span>}
        </div>
        
        <div className="monaco-toolbar-right">
          {file?.name.match(/\.(js|py|go|sh)$/) && (
            <button
              className="monaco-toolbar-btn"
              onClick={handleRun}
              title="Run in terminal"
            >
              <Play size={16} />
              Run
            </button>
          )}
          
          <button
            className="monaco-toolbar-btn"
            onClick={handleSave}
            disabled={!modified || saving}
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          
          <button
            className="monaco-toolbar-btn"
            onClick={handleClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      
      <div className="monaco-editor-wrapper">
        {loading ? (
          <div className="monaco-loading">Loading...</div>
        ) : (
          <Editor
            height="100%"
            language={getLanguage(file?.name || '')}
            value={content}
            theme={theme === 'light' ? 'vs-light' : 'vs-dark'}
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
            }}
            onChange={(value) => {
              setContent(value);
              setModified(true);
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              
              // Ctrl+S to save
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                handleSave();
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
