import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react';

const Toast = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  if (!isVisible) return null;

  const icons = {
    info: <Info size={18} />,
    warning: <AlertTriangle size={18} />,
    success: <CheckCircle size={18} />,
    error: <AlertTriangle size={18} />,
  };

  const colors = {
    info: { bg: '#1e3a5f', border: '#3b82f6', icon: '#60a5fa' },
    warning: { bg: '#422006', border: '#f97316', icon: '#fb923c' },
    success: { bg: '#14532d', border: '#22c55e', icon: '#4ade80' },
    error: { bg: '#450a0a', border: '#ef4444', icon: '#f87171' },
  };

  const color = colors[type] || colors.info;

  return (
    <div
      className={`toast ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      style={{
        background: color.bg,
        borderLeft: `4px solid ${color.border}`,
      }}
    >
      <span style={{ color: color.icon }}>{icons[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={handleClose}>
        <X size={16} />
      </button>
    </div>
  );
};

// Toast Container manages multiple toasts
export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
};

export default Toast;
