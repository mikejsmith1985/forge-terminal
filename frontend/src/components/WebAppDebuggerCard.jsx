import React from 'react';
import { Globe, Bug } from 'lucide-react';
import './WebAppDebuggerCard.css';

/**
 * Web App Debugger Card
 *
 * Standalone card for debugging web applications.
 * Displays information about the Follow Me debugger.
 * 
 * v3.16.14: FollowMeDebugger moved to App.jsx for persistence across tab switches
 */
const WebAppDebuggerCard = () => {
  return (
    <div className="web-app-debugger-card">
      <div className="debugger-card-header">
        <div className="debugger-icon-group">
          <Globe size={20} className="icon-globe" />
          <Bug size={16} className="icon-bug" />
        </div>
        <div className="debugger-title-group">
          <h3>Web App Debugger</h3>
          <p className="debugger-subtitle">
            Record and analyze browser-based application issues
          </p>
        </div>
      </div>

      <div className="debugger-description">
        <p>
          <strong>What it captures:</strong> Keyboard/mouse events, console logs,
          network requests, and screen recording for <em>web applications running in your browser</em>.
        </p>
        <p className="debugger-note">
          💡 <strong>Note:</strong> This tool debugs <u>client-side web apps</u> only.
          It won't capture terminal commands, backend errors, or native desktop applications.
        </p>
      </div>

      <div className="debugger-footer">
        <div className="use-case-list">
          <div className="use-case-item">
            ✅ React/Vue/Angular apps
          </div>
          <div className="use-case-item">
            ✅ JavaScript UI bugs
          </div>
          <div className="use-case-item">
            ✅ API call failures
          </div>
          <div className="use-case-item">
            ❌ Terminal output
          </div>
          <div className="use-case-item">
            ❌ Backend errors
          </div>
          <div className="use-case-item">
            ❌ Native desktop apps
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebAppDebuggerCard;
