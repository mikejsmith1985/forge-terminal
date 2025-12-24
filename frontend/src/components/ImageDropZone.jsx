import React, { useState, useCallback } from 'react';
import { Image, X } from 'lucide-react';

const ImageDropZone = ({ onToast }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(async (e) => {
    try {
      e.preventDefault();
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let item of items) {
        if (item.type.startsWith('image/')) {
          setIsProcessing(true);
          const blob = item.getAsFile();
          
          if (!blob) {
            setIsProcessing(false);
            continue;
          }
          
          const formData = new FormData();
          formData.append('image', blob);

          try {
            const response = await fetch('/api/temp-image', {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error('Failed to save image');
            }

            const { filePath } = await response.json();

            // Copy file path to clipboard
            await navigator.clipboard.writeText(filePath);

            // Show toast
            onToast?.({
              type: 'success',
              message: `File path copied to clipboard (replaced image)`,
              detail: filePath,
              duration: 5000,
            });
          } catch (error) {
            console.error('Failed to process image:', error);
            onToast?.({
              type: 'error',
              message: 'Failed to save image',
              detail: error?.message || 'Unknown error',
            });
          } finally {
            setIsProcessing(false);
          }
          break;
        }
      }
    } catch (err) {
      // Catch-all to prevent app crash
      console.error('Paste handler error:', err);
      setIsProcessing(false);
    }
  }, [onToast]);

  const handleDrop = useCallback(async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setIsProcessing(true);

      // Safely check for files
      if (!e.dataTransfer || !e.dataTransfer.files) {
        setIsProcessing(false);
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith('image/'));

      if (!imageFile) {
        onToast?.({
          type: 'warning',
          message: 'No image found',
          detail: 'Please drop an image file',
        });
        setIsProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.append('image', imageFile);

      try {
        const response = await fetch('/api/temp-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to save image');
        }

        const { filePath } = await response.json();

        // Copy file path to clipboard
        await navigator.clipboard.writeText(filePath);

        // Show toast
        onToast?.({
          type: 'success',
          message: `File path copied to clipboard (replaced previous content)`,
          detail: filePath,
          duration: 5000,
        });
      } catch (error) {
        console.error('Failed to process image:', error);
        onToast?.({
          type: 'error',
          message: 'Failed to save image',
          detail: error?.message || 'Unknown error',
        });
      } finally {
        setIsProcessing(false);
      }
    } catch (err) {
      // Catch-all to prevent app crash
      console.error('Drop handler error:', err);
      setIsProcessing(false);
    }
  }, [onToast]);

  return (
    <div 
      className={`image-drop-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      style={{
        padding: '20px',
        margin: '12px 0',
        border: '2px dashed var(--border-color)',
        borderRadius: '8px',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: isDragging ? 'var(--surface-hover)' : 'var(--surface)',
        transition: 'all 0.2s ease',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', opacity: isProcessing ? 0.5 : 1 }}>
        <Image size={24} style={{ color: 'var(--text-secondary)' }} />
        <div>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {isProcessing ? 'Processing...' : 'Paste or Drop Image Here'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Image will be saved and file path copied to clipboard
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageDropZone;
