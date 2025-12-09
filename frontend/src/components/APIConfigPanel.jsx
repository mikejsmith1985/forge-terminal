import React, { useState, useEffect } from 'react'
import { API_CONFIG, setAPIBase, clearAPIBase } from '../config'
import { Settings } from 'lucide-react'
import './APIConfigPanel.css'

export const APIConfigPanel = ({ onClose }) => {
  const [apiBase, setLocalAPIBase] = useState(API_CONFIG.base)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    
    try {
      const response = await fetch(`${apiBase}/api/version`)
      if (response.ok) {
        const data = await response.json()
        setTestResult({
          success: true,
          message: `✓ Connected! Version: ${data.version || 'unknown'}`,
        })
      } else {
        setTestResult({
          success: false,
          message: `✗ Server returned ${response.status}`,
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `✗ Connection failed: ${error.message}`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleApply = () => {
    if (apiBase === API_CONFIG.base) {
      onClose()
      return
    }
    setAPIBase(apiBase)
  }

  const handleReset = () => {
    clearAPIBase()
    setLocalAPIBase(API_CONFIG.base)
  }

  return (
    <div className="api-config-panel">
      <div className="api-config-content">
        <div className="api-config-header">
          <Settings size={20} />
          <h2>API Configuration</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="api-config-form">
          <div className="form-group">
            <label htmlFor="api-base">Backend URL</label>
            <input
              id="api-base"
              type="text"
              value={apiBase}
              onChange={(e) => setLocalAPIBase(e.target.value)}
              placeholder="http://localhost:8333"
            />
            <small>Current: {API_CONFIG.base}</small>
          </div>

          <div className="form-group">
            <label>WebSocket URL</label>
            <input
              type="text"
              value={apiBase.replace('http', 'ws')}
              readOnly
            />
            <small>Automatically derived from backend URL</small>
          </div>

          <div className="form-actions">
            <button
              onClick={testConnection}
              disabled={testing}
              className="btn btn-secondary"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={handleApply} className="btn btn-primary">
              Apply
            </button>
            <button onClick={handleReset} className="btn btn-secondary">
              Reset to Default
            </button>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.message}
            </div>
          )}
        </div>

        <div className="api-config-info">
          <h3>Configuration Modes</h3>
          <ul>
            <li><strong>Local:</strong> http://localhost:8333</li>
            <li><strong>Codespaces:</strong> https://[codespace-id].csb.app</li>
            <li><strong>Custom:</strong> Enter your backend URL above</li>
          </ul>
          <p>
            Configuration is saved to browser localStorage and persists across sessions.
          </p>
        </div>
      </div>
    </div>
  )
}
