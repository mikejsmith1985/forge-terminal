import React from 'react';
import { Terminal, Monitor } from 'lucide-react';

const ShellToggle = ({ shellConfig, onToggle, wslAvailable }) => {
  const getNextShell = () => {
    switch (shellConfig.shellType) {
      case 'cmd':
        return 'powershell';
      case 'powershell':
        return wslAvailable ? 'wsl' : 'cmd';
      case 'wsl':
        return 'cmd';
      default:
        return 'powershell';
    }
  };

  const getShellLabel = () => {
    switch (shellConfig.shellType) {
      case 'cmd':
        return 'CMD';
      case 'powershell':
        return 'PS';
      case 'wsl':
        return shellConfig.wslDistro ? shellConfig.wslDistro.split('-')[0] : 'WSL';
      default:
        return 'Shell';
    }
  };

  const getShellIcon = () => {
    switch (shellConfig.shellType) {
      case 'cmd':
        return <Monitor size={16} />;
      case 'powershell':
        return <Terminal size={16} />;
      case 'wsl':
        return <span style={{ fontSize: '14px' }}>🐧</span>;
      default:
        return <Terminal size={16} />;
    }
  };

  return (
    <button
      onClick={onToggle}
      className="btn btn-secondary shell-toggle"
      title={`Current: ${shellConfig.shellType}. Click to switch.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '0.85em',
        fontWeight: 500,
      }}
    >
      {getShellIcon()}
      <span>{getShellLabel()}</span>
    </button>
  );
};

export default ShellToggle;
