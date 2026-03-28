import React, { useState, useRef } from 'react';
import { Upload, Loader2, Check, AlertCircle } from 'lucide-react';
import { useMobileDetect } from '../hooks/useMobileDetect';
import { API_CONFIG } from '../config';
import './MobileFileUpload.css';

export function MobileFileUpload({ onUploadComplete }) {
  const { isMobile } = useMobileDetect();
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!isMobile) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_CONFIG.base}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }

      const data = await response.json();
      setStatus('success');
      if (onUploadComplete) onUploadComplete(data.path);
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Upload failed');
      setTimeout(() => setStatus('idle'), 3000);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="mobile-file-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={status === 'uploading'}
        aria-label="upload"
      >
        {status === 'idle' && <Upload size={18} />}
        {status === 'uploading' && <Loader2 size={18} className="spin" />}
        {status === 'success' && <Check size={18} />}
        {status === 'error' && <AlertCircle size={18} />}
        <span>
          {status === 'idle' && 'Upload'}
          {status === 'uploading' && 'Uploading...'}
          {status === 'success' && 'Done'}
          {status === 'error' && 'Failed'}
        </span>
      </button>
      {errorMsg && <span className="upload-error">{errorMsg}</span>}
    </div>
  );
}
