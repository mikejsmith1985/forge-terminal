import { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from 'lucide-react';
import './ImageViewer.css';

export default function ImageViewer({
  file,
  onClose,
  rootPath = '.'
}) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState(true); // true = fit to view, false = actual size

  useEffect(() => {
    if (file?.path) {
      loadImage(file.path);
    }
  }, [file]);

  const loadImage = async (path) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[ImageViewer] Loading image:', path, 'rootPath:', rootPath);
      
      // Use stream endpoint for binary file support
      const response = await fetch(`/api/files/stream?path=${encodeURIComponent(path)}&rootPath=${encodeURIComponent(rootPath)}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      
      console.log('[ImageViewer] Image loaded successfully');
    } catch (err) {
      console.error('[ImageViewer] Load error:', err);
      setError(err.message || 'Failed to load image');
    } finally {
      setLoading(false);
    }
  };

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 500));
    setFitMode(false);
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 25));
    setFitMode(false);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleFitToView = () => {
    setFitMode(true);
    setZoom(100);
  };

  const handleDownload = () => {
    if (imageUrl) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="image-viewer">
      <div className="image-viewer-header">
        <div className="image-viewer-title">
          <span className="image-viewer-icon">🖼️</span>
          <span>{file?.name || 'Image'}</span>
        </div>
        <div className="image-viewer-controls">
          <button 
            className="image-viewer-btn" 
            onClick={handleZoomOut}
            disabled={loading || error || zoom <= 25}
            title="Zoom Out (25%)"
          >
            <ZoomOut size={16} />
          </button>
          <span className="image-viewer-zoom-level">{zoom}%</span>
          <button 
            className="image-viewer-btn" 
            onClick={handleZoomIn}
            disabled={loading || error || zoom >= 500}
            title="Zoom In (25%)"
          >
            <ZoomIn size={16} />
          </button>
          <button 
            className="image-viewer-btn" 
            onClick={handleFitToView}
            disabled={loading || error}
            title="Fit to View"
          >
            <Maximize2 size={16} />
          </button>
          <button 
            className="image-viewer-btn" 
            onClick={handleRotate}
            disabled={loading || error}
            title="Rotate 90°"
          >
            <RotateCw size={16} />
          </button>
          <button 
            className="image-viewer-btn" 
            onClick={handleDownload}
            disabled={loading || error}
            title="Download"
          >
            <Download size={16} />
          </button>
          <button 
            className="image-viewer-btn image-viewer-close" 
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="image-viewer-content">
        {loading && (
          <div className="image-viewer-loading">
            <div className="image-viewer-spinner"></div>
            <div>Loading image...</div>
          </div>
        )}

        {error && (
          <div className="image-viewer-error">
            <div>❌ Error loading image</div>
            <div className="image-viewer-error-detail">{error}</div>
          </div>
        )}

        {imageUrl && !loading && !error && (
          <div className="image-viewer-container">
            <img
              src={imageUrl}
              alt={file?.name || 'Image'}
              className={fitMode ? 'fit-mode' : ''}
              style={{
                transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
                transformOrigin: 'center center'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
