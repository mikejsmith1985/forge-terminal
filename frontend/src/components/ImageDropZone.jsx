import React, { useState, useCallback } from 'react';
import { Image, X } from 'lucide-react';

const ImageDropZone = ({ onToast }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [justPasted, setJustPasted] = useState(false);

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
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) {
        console.log('[ImageDropZone] No clipboard items');
        return;
      }

      // Check if there's an image first
      let foundImage = false;
      for (let item of items) {
        if (item.type.startsWith('image/')) {
          foundImage = true;
          break;
        }
      }

      // Only prevent default if we found an image
      if (!foundImage) {
        console.log('[ImageDropZone] No image found in clipboard, allowing default paste');
        return;
      }

      // Now prevent default and process the image
      e.preventDefault();
      e.stopPropagation();

      for (let item of items) {
        if (item.type.startsWith('image/')) {
          setIsProcessing(true);
          setJustPasted(true);
          setTimeout(() => setJustPasted(false), 2000);
          
          const blob = item.getAsFile();
          
          if (!blob) {
            console.error('[ImageDropZone] Failed to get file from clipboard item');
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
              const errorText = await response.text().catch(() => 'Unknown error');
              throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            if (!result || !result.filePath) {
              throw new Error('Invalid response from server');
            }

            // Copy file path to clipboard
            await navigator.clipboard.writeText(result.filePath);

            // Show toast
            if (onToast) {
              onToast(`File path copied to clipboard (replaced image)`, 'success', 5000);
            }
          } catch (error) {
            console.error('[ImageDropZone] Failed to process image:', error);
            if (onToast) {
              onToast('Failed to save image', 'error', 3000);
            }
          } finally {
            setIsProcessing(false);
          }
          break;
        }
      }
    } catch (err) {
      // Catch-all to prevent app crash
      console.error('[ImageDropZone] Paste handler error:', err);
      setIsProcessing(false);
      if (onToast) {
        onToast('Paste operation failed', 'error', 3000);
      }
    }
  }, [onToast]);

  const handleDrop = useCallback(async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setIsProcessing(true);

      // Safely check for files
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        console.log('[ImageDropZone] No files in drop event');
        setIsProcessing(false);
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith('image/'));

      if (!imageFile) {
        if (onToast) {
          onToast('No image found - please drop an image file', 'warning', 3000);
        }
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
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        if (!result || !result.filePath) {
          throw new Error('Invalid response from server');
        }

        // Copy file path to clipboard
        await navigator.clipboard.writeText(result.filePath);

        // Show toast
        if (onToast) {
          onToast(`File path copied to clipboard (replaced previous content)`, 'success', 5000);
        }
      } catch (error) {
        console.error('[ImageDropZone] Failed to process image:', error);
        if (onToast) {
          onToast('Failed to save image', 'error', 3000);
        }
      } finally {
        setIsProcessing(false);
      }
    } catch (err) {
      // Catch-all to prevent app crash
      console.error('[ImageDropZone] Drop handler error:', err);
      setIsProcessing(false);
      if (onToast) {
        onToast('Drop operation failed', 'error', 3000);
      }
    }
  }, [onToast]);

  return (
    <>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { 
            border-color: var(--border-color);
            box-shadow: 0 0 0 0 rgba(255, 107, 0, 0);
          }
          50% { 
            border-color: #ff6b00;
            box-shadow: 0 0 0 4px rgba(255, 107, 0, 0.1);
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .image-drop-zone-processing {
          animation: pulse-border 1.5s ease-in-out infinite;
        }
        
        .image-drop-zone-icon-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
      <div 
        className={`image-drop-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'image-drop-zone-processing' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onClick={(e) => e.currentTarget.focus()}
        tabIndex={0}
        style={{
          padding: '20px',
          margin: '12px 0',
          border: isFocused ? '2px solid #ff6b00' : '2px dashed var(--border-color)',
          borderRadius: '8px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging ? 'var(--surface-hover)' : 
                          isFocused ? 'rgba(255, 107, 0, 0.05)' : 
                          'var(--surface)',
          transition: 'all 0.2s ease',
          outline: 'none',
          position: 'relative',
        }}
      >
        {/* Focus hint */}
        {isFocused && !isProcessing && (
          <div style={{
            position: 'absolute',
            top: '4px',
            right: '8px',
            fontSize: '10px',
            color: '#ff6b00',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Ready - Press Ctrl+V
          </div>
        )}
        
        {/* Success indicator */}
        {justPasted && !isProcessing && (
          <div style={{
            position: 'absolute',
            top: '4px',
            right: '8px',
            fontSize: '11px',
            color: '#00ff00',
            fontWeight: 600,
          }}>
            ✓ Saved!
          </div>
        )}
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '8px',
          opacity: isProcessing ? 0.7 : 1,
        }}>
          <Image 
            size={24} 
            className={isProcessing ? 'image-drop-zone-icon-spin' : ''}
            style={{ 
              color: isFocused ? '#ff6b00' : 'var(--text-secondary)',
              transition: 'color 0.2s ease',
            }} 
          />
          <div>
            <div style={{ 
              fontWeight: 500, 
              color: isFocused ? '#ff6b00' : 'var(--text-primary)',
              transition: 'color 0.2s ease',
            }}>
              {isProcessing ? 'Processing Image...' : 'Click to Focus, Then Paste or Drop Image'}
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              marginTop: '4px' 
            }}>
              {isFocused ? 'Ready to receive paste (Ctrl+V)' : 'Image will be saved and file path copied to clipboard'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ImageDropZone;
