import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle, Download } from 'lucide-react';
import { logger } from '../utils/logger';

const Toast = ({ message, type = 'info', duration = 3000, onClose, action, onAction, secondaryAction, onSecondaryAction }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    logger.toast('Displayed', { message, type, duration });
  }, [message, type, duration]);

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

  const handleAction = () => {
    onAction?.();
    handleClose();
  };

  const handleSecondaryAction = () => {
    onSecondaryAction?.();
    handleClose();
  };

  if (!isVisible) return null;

  const icons = {
    info: <Info size={18} />,
    warning: <AlertTriangle size={18} />,
    success: <CheckCircle size={18} />,
    error: <AlertTriangle size={18} />,
    update: <Download size={18} />,
  };

  const colors = {
    info: { bg: '#1e3a5f', border: '#3b82f6', icon: '#60a5fa' },
    warning: { bg: '#422006', border: '#f97316', icon: '#fb923c' },
    success: { bg: '#14532d', border: '#22c55e', icon: '#4ade80' },
    error: { bg: '#450a0a', border: '#ef4444', icon: '#f87171' },
    update: { bg: '#1e1b4b', border: '#8b5cf6', icon: '#a78bfa' },
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
      {secondaryAction && (
        <button className="toast-action toast-action-secondary" onClick={handleSecondaryAction} style={{ color: '#888' }}>
          {secondaryAction}
        </button>
      )}
      {action && (
        <button className="toast-action" onClick={handleAction} style={{ color: color.border }}>
          {action}
        </button>
      )}
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
          action={toast.action}
          onAction={toast.onAction}
          secondaryAction={toast.secondaryAction}
          onSecondaryAction={toast.onSecondaryAction}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 3000, options = {}) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { 
      id, 
      message, 
      type, 
      duration,
      action: options.action,
      onAction: options.onAction,
      secondaryAction: options.secondaryAction,
      onSecondaryAction: options.onSecondaryAction
    }]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
};

export default Toast;
