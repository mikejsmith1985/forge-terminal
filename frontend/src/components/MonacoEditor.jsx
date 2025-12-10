import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Save, X, Play } from 'lucide-react';
import './MonacoEditor.css';

export default function MonacoEditor({ 
  file, 
  onClose, 
  onSave, 
  theme = 'vs-dark',
  rootPath = '.',
  terminalRef 
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  
  useEffect(() => {
    if (file && file.path) {
      console.log('[MonacoEditor] Loading file:', file.path, file.name);
      loadFile(file.path);
    } else if (file) {
      console.error('[MonacoEditor] File object missing path:', file);
    }
  }, [file]);
  
  const loadFile = async (path) => {
    setLoading(true);
    setContent('');
    
    console.log('[MonacoEditor] ===== FILE LOAD START =====');
    console.log('[MonacoEditor] Path:', path);
    console.log('[MonacoEditor] Root:', rootPath);
    console.log('[MonacoEditor] Platform:', navigator.platform);
    
    try {
      const requestBody = { path, rootPath };
      console.log('[MonacoEditor] Sending request:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('[MonacoEditor] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[MonacoEditor] Server error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('[MonacoEditor] Response data:', {
        hasContent: !!data.content,
        contentLength: data.content?.length || 0,
        contentPreview: data.content?.substring(0, 100) || ''
      });
      
      setContent(data.content || '');
      setModified(false);
      console.log('[MonacoEditor] ===== FILE LOAD SUCCESS =====');
    } catch (err) {
      console.error('[MonacoEditor] ===== FILE LOAD FAILED =====');
      console.error('[MonacoEditor] Error details:', {
        message: err.message,
        stack: err.stack,
        path: path,
        rootPath: rootPath
      });
      
      setContent(
        `// ❌ Error loading file\n` +
        `// \n` +
        `// Error: ${err.message}\n` +
        `// Path: ${path}\n` +
        `// Root: ${rootPath}\n` +
        `// \n` +
        `// This file could not be loaded. Possible reasons:\n` +
        `// 1. File access permissions not set (check Settings → File Access Security)\n` +
        `// 2. Path is outside allowed directory (enable Full System Access in settings)\n` +
        `// 3. File does not exist or cannot be read\n` +
        `// 4. Cross-filesystem access denied (WSL paths on Windows)\n` +
        `// \n` +
        `// Check the browser console (F12) and server logs for more details.\n`
      );
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
          content: editorRef.current?.getValue() || content,
          rootPath
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
