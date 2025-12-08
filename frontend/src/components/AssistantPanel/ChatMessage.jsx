import React from 'react';
import './ChatMessage.css';

const ChatMessage = ({ message }) => {
  const { role, content, timestamp } = message;

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'user':
        return '👤';
      case 'assistant':
        return '🤖';
      case 'error':
        return '❌';
      default:
        return '💬';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'Assistant';
      case 'error':
        return 'Error';
      default:
        return 'System';
    }
  };

  return (
    <div className={`chat-message chat-message-${role}`}>
      <div className="message-header">
        <span className="message-icon">{getRoleIcon(role)}</span>
        <span className="message-role">{getRoleLabel(role)}</span>
        <span className="message-time">{formatTime(timestamp)}</span>
      </div>
      <div className="message-content">
        {content}
      </div>
    </div>
  );
};

export default ChatMessage;
