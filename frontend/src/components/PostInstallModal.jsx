import React, { useEffect, useRef } from 'react';

const PostInstallModal = ({ isOpen, onCompleted }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    const handleVideoEnd = () => {
      console.log('[PostInstall] Video ended, executing hard refresh');
      // Hard refresh to clear cache and reload
      window.location.reload(true);
    };

    const videoElement = videoRef.current;
    videoElement.addEventListener('ended', handleVideoEnd);

    return () => {
      videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay"
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
      }}
    >
      <div 
        className="modal"
        style={{
          maxWidth: '600px',
          border: 'none',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        }}
      >
        <div className="modal-header" style={{ borderBottom: 'none' }}>
          <h3 style={{ margin: 0, textAlign: 'center', fontSize: '1.8em' }}>
            ✨ Forging a New Version ✨
          </h3>
        </div>

        <div 
          className="modal-body"
          style={{
            padding: '40px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ 
            color: '#a78bfa', 
            marginBottom: '30px',
            fontSize: '1.1em',
            fontWeight: 500
          }}>
            Installation complete. Refreshing your experience...
          </p>

          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '500px',
              margin: '0 auto',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(139, 92, 246, 0.3)',
            }}
          >
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                backgroundColor: '#000',
              }}
              autoPlay
              muted
              playsInline
            >
              <source src="/Assets/ForgeVideo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          <p style={{
            color: '#666',
            marginTop: '30px',
            fontSize: '0.9em',
          }}>
            Please do not close this window...
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .forging-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default PostInstallModal;
