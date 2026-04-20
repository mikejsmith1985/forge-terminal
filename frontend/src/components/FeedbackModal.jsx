import React, { useState, useEffect } from 'react';
import { Camera, Mail, X, Minus, Image as ImageIcon, Video, StopCircle, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getRecentLogs } from '../utils/logger';

const FEEDBACK_EMAIL = 'team@rootlevellabs.tech';

const FeedbackModal = ({ isOpen, onClose }) => {
    const [comment, setComment] = useState('');
    const [screenshots, setScreenshots] = useState([]);
    const [videoBlob, setVideoBlob] = useState(null);
    const [videoUrl, setVideoUrl] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingStream, setRecordingStream] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setComment('');
            setScreenshots([]);
            setVideoBlob(null);
            setVideoUrl(null);
            setStatus({ type: '', msg: '' });
            setSubmitted(false);
        }
    }, [isOpen]);

    // Paste image from clipboard via Ctrl+V
    useEffect(() => {
        if (!isOpen) return;
        const handlePaste = async (e) => {
            const modal = document.querySelector('.modal-overlay');
            if (modal && !modal.contains(e.target)) return;
            const isText = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';
            if (isText) return;

            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            setScreenshots(prev => [...prev, ev.target.result]);
                            setStatus({ type: 'success', msg: 'Screenshot pasted!' });
                            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
                        };
                        reader.readAsDataURL(blob);
                    }
                    return;
                }
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isOpen]);

    if (!isOpen) return null;

    const handleCapture = async () => {
        setIsCapturing(true);
        try {
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.style.visibility = 'hidden';
            const canvas = await html2canvas(document.body, { allowTaint: true, useCORS: true, logging: false });
            if (modal) modal.style.visibility = 'visible';
            setScreenshots(prev => [...prev, canvas.toDataURL('image/png')]);
        } catch (err) {
            console.error('Screenshot failed:', err);
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.style.visibility = 'visible';
            setStatus({ type: 'error', msg: 'Screenshot failed' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
        } finally {
            setIsCapturing(false);
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            setScreenshots(prev => [...prev, e.target.result]);
                            setStatus({ type: 'success', msg: 'Image pasted!' });
                            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                }
            }
            setStatus({ type: 'warning', msg: 'No image found in clipboard' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
        } catch (err) {
            setStatus({ type: 'error', msg: 'Try Ctrl+V to paste instead' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
        }
    };

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                setVideoBlob(blob);
                setVideoUrl(URL.createObjectURL(blob));
                setIsRecording(false);
                setRecordingStream(null);
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            setIsRecording(true);
            setRecordingStream(stream);
            setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 30000);
        } catch (err) {
            setStatus({ type: 'error', msg: 'Recording failed' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
        }
    };

    const handleStopRecording = () => {
        if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    };

    const handleSend = () => {
        if (!comment.trim()) {
            setStatus({ type: 'error', msg: 'Please describe your feedback first' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
            return;
        }

        const logs = getRecentLogs ? getRecentLogs(3) : '';
        const env = `OS: ${navigator.platform} | Browser: ${navigator.userAgent.split(' ').pop()} | Time: ${new Date().toISOString()}`;

        let body = comment + '\n\n';
        body += '---\n';
        body += env + '\n';
        if (logs) body += '\nRecent logs:\n' + logs;
        if (screenshots.length > 0) {
            body += `\n\n[${screenshots.length} screenshot(s) captured — please attach from the Forge Terminal window]`;
        }
        if (videoBlob) {
            body += '\n[Screen recording captured — please attach manually]';
        }

        const subject = `Forge Terminal Feedback: ${comment.substring(0, 60)}`;
        const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
        setSubmitted(true);
    };

    const statusColors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#60a5fa' };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '560px' }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={18} />
                        Send Feedback
                    </h3>
                    <button className="btn-close" onClick={onClose}>
                        {screenshots.length > 0 ? <Minus size={20} strokeWidth={3} /> : <X size={20} />}
                    </button>
                </div>

                <div className="modal-body">
                    {submitted ? (
                        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                            <Mail size={40} style={{ color: '#22c55e', marginBottom: '12px' }} />
                            <h4 style={{ color: '#e5e5e5', marginBottom: '8px' }}>Your email client should have opened!</h4>
                            <p style={{ color: '#a3a3a3', fontSize: '0.85rem' }}>
                                Send the pre-filled email to <strong style={{ color: '#f97316' }}>{FEEDBACK_EMAIL}</strong>.
                                {screenshots.length > 0 && ' Attach your screenshots before sending.'}
                            </p>
                            <button
                                className="btn btn-secondary"
                                style={{ marginTop: '20px' }}
                                onClick={() => setSubmitted(false)}
                            >
                                Send More Feedback
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label style={{ display: 'block', marginBottom: '6px', color: '#a3a3a3', fontSize: '0.85rem' }}>
                                    Describe your feedback or issue
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="What happened? What did you expect? Steps to reproduce..."
                                    rows={5}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '8px',
                                        border: '1px solid #333', background: '#1a1a1a',
                                        color: '#e5e5e5', resize: 'vertical', fontSize: '0.9rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Screenshot tools */}
                            <div style={{ marginTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: '#a3a3a3', fontSize: '0.85rem' }}>
                                        Screenshots {screenshots.length > 0 && `(${screenshots.length})`}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={handlePasteFromClipboard}
                                            title="Paste image from clipboard"
                                        >
                                            <ImageIcon size={14} style={{ marginRight: '4px' }} />
                                            Paste
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleCapture}
                                            disabled={isCapturing || isRecording}
                                        >
                                            <Camera size={14} style={{ marginRight: '4px' }} />
                                            {isCapturing ? 'Capturing...' : 'Capture'}
                                        </button>
                                        {!isRecording ? (
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={handleStartRecording}
                                                disabled={isCapturing || !!videoBlob}
                                            >
                                                <Video size={14} style={{ marginRight: '4px' }} />
                                                Record
                                            </button>
                                        ) : (
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={handleStopRecording}
                                                style={{ color: '#ef4444' }}
                                            >
                                                <StopCircle size={14} style={{ marginRight: '4px' }} />
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Screenshot thumbnails */}
                                {screenshots.length > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        {screenshots.map((src, i) => (
                                            <div key={i} style={{ position: 'relative' }}>
                                                <img
                                                    src={src}
                                                    alt={`Screenshot ${i + 1}`}
                                                    style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #333' }}
                                                />
                                                <button
                                                    onClick={() => setScreenshots(prev => prev.filter((_, idx) => idx !== i))}
                                                    style={{
                                                        position: 'absolute', top: '-6px', right: '-6px',
                                                        background: '#ef4444', border: 'none', borderRadius: '50%',
                                                        width: '18px', height: '18px', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'white', padding: 0
                                                    }}
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {videoUrl && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <video src={videoUrl} style={{ height: '48px', borderRadius: '6px' }} controls />
                                        <button
                                            onClick={() => { setVideoBlob(null); setVideoUrl(null); }}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}

                                {isRecording && (
                                    <div style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                                        Recording screen (max 30s)...
                                    </div>
                                )}
                            </div>

                            {status.msg && (
                                <div style={{
                                    marginTop: '12px', padding: '8px 12px', borderRadius: '6px',
                                    background: 'rgba(0,0,0,0.3)', border: `1px solid ${statusColors[status.type] || '#555'}`,
                                    color: statusColors[status.type] || '#e5e5e5', fontSize: '0.85rem'
                                }}>
                                    {status.msg}
                                </div>
                            )}

                            <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '12px', marginBottom: 0 }}>
                                Opens your email client pre-filled with your feedback to {FEEDBACK_EMAIL}
                            </p>
                        </>
                    )}
                </div>

                {!submitted && (
                    <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSend}
                            disabled={!comment.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Mail size={15} />
                            Open Email Client
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedbackModal;
