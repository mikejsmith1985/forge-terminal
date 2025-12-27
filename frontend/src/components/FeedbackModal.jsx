import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Camera, Github, Copy, Check, Settings, ExternalLink, Image as ImageIcon, Minus, X, Trash2, Video, StopCircle } from 'lucide-react';
import { getLogs, getRecentLogs } from '../utils/logger';

// ----------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------
// Replace this with your Application's Client ID from https://api.imgur.com/oauth2/addclient
// Select "Anonymous usage without user authorization" when registering.
const IMGUR_CLIENT_ID = '';
// ----------------------------------------------------------------------

const FeedbackModal = ({ isOpen, onClose }) => {
    const [comment, setComment] = useState('');
    const [screenshots, setScreenshots] = useState([]);
    const [videoBlob, setVideoBlob] = useState(null);
    const [videoUrl, setVideoUrl] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingStream, setRecordingStream] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdIssueUrl, setCreatedIssueUrl] = useState(null);

    // Auth State
    const [githubToken, setGithubToken] = useState('');
    const [showSetup, setShowSetup] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });

    useEffect(() => {
        const savedToken = localStorage.getItem('forge_github_token');
        if (savedToken) {
            setGithubToken(savedToken);
        } else {
            setShowSetup(true);
        }
    }, []);

    if (!isOpen) return null;

    const handleSaveSettings = () => {
        if (!githubToken.trim()) {
            setStatus({ type: 'error', msg: 'GitHub Token is required' });
            return;
        }
        localStorage.setItem('forge_github_token', githubToken.trim());
        setShowSetup(false);
        setStatus({ type: '', msg: '' });
    };

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoBlob(blob);
                setVideoUrl(url);
                setIsRecording(false);
                setRecordingStream(null);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingStream(stream);

            // Auto-stop after 30 seconds
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 30000);

        } catch (err) {
            console.error('Recording failed:', err);
            setStatus({ type: 'error', msg: 'Failed to start recording' });
        }
    };

    const handleStopRecording = () => {
        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
            // This will trigger mediaRecorder.onstop
        }
    };

    const handleRemoveVideo = () => {
        setVideoBlob(null);
        setVideoUrl(null);
    };

    const handleCapture = async () => {
        setIsCapturing(true);
        try {
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.style.visibility = 'hidden';

            const canvas = await html2canvas(document.body, {
                allowTaint: true,
                useCORS: true,
                logging: false,
            });

            if (modal) modal.style.visibility = 'visible';

            const dataUrl = canvas.toDataURL('image/png');
            setScreenshots(prev => [...prev, dataUrl]);

            // Backup copy to clipboard
            canvas.toBlob(async (blob) => {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                } catch (err) {
                    console.error('Clipboard copy failed:', err);
                }
            });

        } catch (err) {
            console.error('Screenshot failed:', err);
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.style.visibility = 'visible';
        } finally {
            setIsCapturing(false);
        }
    };

    const handleRemoveScreenshot = (index) => {
        setScreenshots(prev => prev.filter((_, i) => i !== index));
    };

    const handlePasteFromClipboard = async () => {
        try {
            // Check permission first to provide better UX
            const permissionStatus = await navigator.permissions.query({ name: 'clipboard-read' });
            
            if (permissionStatus.state === 'denied') {
                setStatus({ type: 'error', msg: 'Clipboard access denied. Please allow in browser settings.' });
                setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
                return;
            }

            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            setScreenshots(prev => [...prev, e.target.result]);
                            setStatus({ type: 'success', msg: 'Image pasted from clipboard!' });
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
            console.error('Paste failed:', err);
            setStatus({ type: 'error', msg: 'Failed to paste. Try Ctrl+v instead.' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2000);
        }
    };

    const uploadToImgur = async (base64Image) => {
        if (!IMGUR_CLIENT_ID) throw new Error('NO_IMGUR_ID');

        const content = base64Image.split(',')[1];
        const formData = new FormData();
        formData.append('image', content);
        formData.append('type', 'base64');

        const res = await fetch('https://api.imgur.com/3/image', {
            method: 'POST',
            headers: {
                'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`
            },
            body: formData
        });

        if (!res.ok) throw new Error('IMGUR_UPLOAD_FAILED');
        const data = await res.json();
        return data.data.link;
    };

    const uploadToGithub = async (base64Image) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `feedback-${timestamp}.png`;
        const content = base64Image.split(',')[1];

        const res = await fetch(`https://api.github.com/repos/mikejsmith1985/forge-terminal-2/contents/feedback-screenshots/${filename}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'upload feedback screenshot',
                content: content,
            })
        });

        if (!res.ok) {
            if (res.status === 403 || res.status === 404) throw new Error('PERMISSION_DENIED');
            throw new Error('GITHUB_UPLOAD_FAILED');
        }

        const data = await res.json();
        return data.content.download_url;
    };

    const uploadVideoToGithub = async (blob) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `feedback-video-${timestamp}.webm`;
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];
                try {
                    const res = await fetch(`https://api.github.com/repos/mikejsmith1985/forge-terminal-2/contents/feedback-screenshots/${filename}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${githubToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: 'upload feedback video',
                            content: base64data,
                        })
                    });
                    
                    if (!res.ok) throw new Error('GITHUB_UPLOAD_FAILED');
                    const data = await res.json();
                    resolve(data.content.download_url);
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsDataURL(blob);
        });
    };

    const createIssue = async (imageUrls, videoUrl) => {
        const title = `Feedback: ${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}`;
        let body = `**Description**\n${comment}\n\n`;

        if (imageUrls && imageUrls.length > 0) {
            body += `**Screenshot${imageUrls.length > 1 ? 's' : ''}**\n`;
            imageUrls.forEach((url, idx) => {
                body += `<img src="${url}">\n\n`;
            });
        } else {
            body += `**Screenshot**\n> 📋 **Paste Screenshot Here**\n> The screenshot is in your clipboard. Please press **Ctrl+v** (or Cmd+V) to attach it.\n\n`;
        }

        if (videoUrl) {
            body += `**Screen Recording**\n[Watch Video](${videoUrl})\n\n`;
        }

        body += `**Environment**\n- User Agent: ${navigator.userAgent}\n- Time: ${new Date().toISOString()}\n\n`;

        // Get logs from last 3 minutes
        const recentLogs = getRecentLogs(3);
        if (recentLogs) {
            body += `<details>\n<summary>Application Logs (Last 3 Minutes)</summary>\n\n\`\`\`\n${recentLogs}\n\`\`\`\n</details>`;
        }

        const res = await fetch(`https://api.github.com/repos/mikejsmith1985/forge-terminal-2/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, body })
        });

        if (!res.ok) throw new Error('ISSUE_FAILED');
        return await res.json();
    };

    const handleSubmit = async () => {
        if (!comment) return;
        setIsSubmitting(true);
        setStatus({ type: 'info', msg: 'Processing...' });

        try {
            let imageUrls = [];

            if (screenshots.length > 0) {
                for (let i = 0; i < screenshots.length; i++) {
                    const screenshot = screenshots[i];
                    let imageUrl = null;
                    
                    // Strategy: Imgur -> GitHub Repo -> Fail
                    if (IMGUR_CLIENT_ID) {
                        setStatus({ type: 'info', msg: `Uploading screenshot ${i + 1}/${screenshots.length} to Imgur...` });
                        try {
                            imageUrl = await uploadToImgur(screenshot);
                        } catch (err) {
                            console.warn('Imgur failed, trying GitHub...', err);
                        }
                    }

                    if (!imageUrl) {
                        setStatus({ type: 'info', msg: `Uploading screenshot ${i + 1}/${screenshots.length} to Repo...` });
                        try {
                            imageUrl = await uploadToGithub(screenshot);
                        } catch (err) {
                            console.warn('GitHub upload failed:', err);
                            setStatus({ type: 'warning', msg: 'Upload failed. Creating issue...' });
                        }
                    }
                    
                    if (imageUrl) {
                        imageUrls.push(imageUrl);
                    }
                }
            }

            let uploadedVideoUrl = null;
            if (videoBlob) {
                setStatus({ type: 'info', msg: 'Uploading video...' });
                try {
                    uploadedVideoUrl = await uploadVideoToGithub(videoBlob);
                } catch (err) {
                    console.warn('Video upload failed:', err);
                    setStatus({ type: 'warning', msg: 'Video upload failed. Continuing...' });
                }
            }

            setStatus({ type: 'info', msg: 'Creating GitHub issue...' });
            const issue = await createIssue(imageUrls, uploadedVideoUrl);

            setCreatedIssueUrl(issue.html_url);
            setStatus({ type: 'success', msg: `Issue #${issue.number} created!` });
            setTimeout(() => {
                onClose();
                setComment('');
                setScreenshots([]);
                setVideoBlob(null);
                setVideoUrl(null);
                setStatus({ type: '', msg: '' });
                setCreatedIssueUrl(null);
            }, 2000);

        } catch (err) {
            console.error(err);
            setStatus({ type: 'error', msg: 'Failed to create issue. Check token.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h3><Github size={20} style={{ marginRight: '8px', verticalAlign: 'bottom' }} /> Send Feedback</h3>
                    <button 
                        className="btn-close" 
                        onClick={onClose}
                        title={screenshots.length > 0 ? "Minimize (screenshots saved)" : "Close"}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        {screenshots.length > 0 ? <Minus size={20} strokeWidth={3} /> : <X size={20} />}
                    </button>
                </div>

                <div className="modal-body">
                    {showSetup ? (
                        <div className="setup-view">
                            <div className="alert alert-info" style={{ marginBottom: '20px', padding: '15px', background: '#1e293b', borderRadius: '6px', border: '1px solid #334155' }}>
                                <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center' }}>
                                    <Settings size={16} style={{ marginRight: '8px' }} />
                                    Setup Required
                                </h4>
                                <p style={{ fontSize: '0.9em', color: '#cbd5e1' }}>
                                    To submit feedback directly, you need a GitHub Personal Access Token (PAT).
                                </p>
                            </div>

                            <div className="form-group">
                                <label>GitHub Token (Required)</label>
                                <div style={{ fontSize: '0.8em', color: '#888', marginBottom: '5px' }}>
                                    Needed to create issues. <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Forge+Terminal+Feedback" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Generate Token</a>
                                </div>
                                <input
                                    type="password"
                                    value={githubToken}
                                    onChange={(e) => setGithubToken(e.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxx"
                                    className="form-control"
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
                                />
                            </div>

                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleSaveSettings}>Save Settings</button>
                            </div>
                        </div>
                    ) : (
                        <div className="feedback-form">
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <label>Issue Description</label>
                                    <button
                                        className="btn-link"
                                        onClick={() => setShowSetup(true)}
                                        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8em' }}
                                    >
                                        Update Settings
                                    </button>
                                </div>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Describe the issue or suggestion..."
                                    rows={4}
                                    className="form-control"
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
                                />
                            </div>

                            <div className="screenshot-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label>Screenshots {screenshots.length > 0 && `(${screenshots.length})`}</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={handlePasteFromClipboard}
                                            title="Paste image from clipboard"
                                        >
                                            <ImageIcon size={16} style={{ marginRight: '6px' }} />
                                            Paste
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleCapture}
                                            disabled={isCapturing || isRecording}
                                        >
                                            <Camera size={16} style={{ marginRight: '6px' }} />
                                            {isCapturing ? 'Capturing...' : screenshots.length > 0 ? 'Add Another' : 'Capture'}
                                        </button>
                                        {!isRecording && !videoBlob && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={handleStartRecording}
                                                disabled={isCapturing}
                                            >
                                                <Video size={16} style={{ marginRight: '6px' }} />
                                                Record Screen (30s)
                                            </button>
                                        )}
                                        {isRecording && (
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={handleStopRecording}
                                                style={{ background: '#ef4444', color: 'white', border: 'none' }}
                                            >
                                                <StopCircle size={16} style={{ marginRight: '6px' }} />
                                                Stop Recording
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {screenshots.length === 0 && !videoBlob && !isRecording && (
                                    <div style={{ 
                                        padding: '30px', 
                                        border: '2px dashed #333', 
                                        borderRadius: '8px', 
                                        textAlign: 'center',
                                        background: '#0a0a0a',
                                        color: '#888'
                                    }}>
                                        <ImageIcon size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                        <p style={{ margin: '0 0 8px 0', fontSize: '0.9em' }}>
                                            Press <kbd>Ctrl+v</kbd> to paste screenshot
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>
                                            or use the buttons above
                                        </p>
                                    </div>
                                )}

                                {videoUrl && (
                                    <div className="video-preview" style={{ marginBottom: '10px', border: '1px solid #333', borderRadius: '6px', padding: '10px', background: '#111', position: 'relative' }}>
                                        <video src={videoUrl} controls style={{ maxWidth: '100%', borderRadius: '4px' }} />
                                        <button
                                            type="button"
                                            onClick={handleRemoveVideo}
                                            style={{
                                                position: 'absolute',
                                                top: '5px',
                                                right: '5px',
                                                background: 'rgba(239, 68, 68, 0.9)',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '4px 6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                color: '#fff',
                                                fontSize: '0.75em'
                                            }}
                                            title="Remove video"
                                        >
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    </div>
                                )}

                                {screenshots.length > 0 && (
                                    <div className="screenshots-preview" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {screenshots.map((screenshot, index) => (
                                            <div key={index} className="screenshot-preview" style={{ border: '1px solid #333', borderRadius: '6px', padding: '10px', background: '#111', position: 'relative' }}>
                                                <img src={screenshot} alt={`Screenshot ${index + 1}`} style={{ maxWidth: '100%', borderRadius: '4px' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveScreenshot(index)}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '5px',
                                                        right: '5px',
                                                        background: 'rgba(239, 68, 68, 0.9)',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        padding: '4px 6px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        color: '#fff',
                                                        fontSize: '0.75em'
                                                    }}
                                                    title="Remove screenshot"
                                                >
                                                    <Trash2 size={12} /> Remove
                                                </button>
                                            </div>
                                        ))}
                                        <div style={{ fontSize: '0.9em', color: '#888', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Check size={14} color="#4ade80" /> {screenshots.length} screenshot{screenshots.length > 1 ? 's' : ''} ready to submit
                                        </div>
                                    </div>
                                )}
                            </div>

                            {status.msg && (
                                <div className={`alert alert-${status.type}`} style={{
                                    marginBottom: '15px',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    background: status.type === 'error' ? '#450a0a' : status.type === 'success' ? '#052e16' : '#172554',
                                    color: status.type === 'error' ? '#fca5a5' : status.type === 'success' ? '#86efac' : '#bfdbfe',
                                    fontSize: '0.9em'
                                }}>
                                    {createdIssueUrl ? (
                                        <a 
                                            href={createdIssueUrl} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            {status.msg} <ExternalLink size={14} />
                                        </a>
                                    ) : status.msg}
                                </div>
                            )}

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleSubmit}
                                    disabled={!comment || isSubmitting}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FeedbackModal;
