import React from 'react';

/**
 * ErrorBoundary - Catches React errors and prevents full app crash
 * 
 * This component catches errors in child components and displays
 * a fallback UI with recovery options instead of crashing the entire app.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error information
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Log to monitoring service (if available)
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    try {
      // Send error to backend for logging
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error?.toString(),
          stack: errorInfo?.componentStack,
          timestamp: new Date().toISOString(),
        }),
      }).catch(err => console.error('Failed to log error:', err));
    } catch (e) {
      console.error('Error logging failed:', e);
    }
  };

  handleReload = () => {
    // Clear error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleFullReload = () => {
    // Full page reload
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>⚠️</div>
            <h1 style={styles.title}>Something Went Wrong</h1>
            <p style={styles.message}>
              An unexpected error occurred. Please try reloading the application.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Dev Only)</summary>
                <pre style={styles.pre}>
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div style={styles.buttonContainer}>
              <button
                onClick={this.handleReload}
                style={{ ...styles.button, ...styles.buttonPrimary }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleFullReload}
                style={{ ...styles.button, ...styles.buttonSecondary }}
              >
                Reload Page
              </button>
            </div>

            {this.state.errorCount > 3 && (
              <p style={styles.warning}>
                ⚠️ Multiple errors detected. If this persists, please try clearing your browser cache
                and reloading the page.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    background: 'linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  content: {
    textAlign: 'center',
    maxWidth: '600px',
    padding: '40px',
    background: '#2d2d3d',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    border: '1px solid #444',
  },
  icon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  title: {
    fontSize: '28px',
    margin: '20px 0 10px 0',
    color: '#fff',
  },
  message: {
    fontSize: '16px',
    color: '#aaa',
    marginBottom: '20px',
    lineHeight: '1.6',
  },
  details: {
    marginTop: '20px',
    textAlign: 'left',
  },
  summary: {
    cursor: 'pointer',
    color: '#0066ff',
    padding: '10px',
    background: '#1a1a2e',
    borderRadius: '4px',
    marginBottom: '10px',
  },
  pre: {
    background: '#1a1a2e',
    padding: '15px',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#aaa',
    overflow: 'auto',
    maxHeight: '300px',
    border: '1px solid #444',
  },
  buttonContainer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginTop: '30px',
    flexWrap: 'wrap',
  },
  button: {
    padding: '12px 24px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontWeight: '600',
  },
  buttonPrimary: {
    background: '#0066ff',
    color: '#fff',
  },
  buttonSecondary: {
    background: '#444',
    color: '#fff',
  },
  warning: {
    fontSize: '14px',
    color: '#ff9500',
    marginTop: '20px',
    padding: '10px',
    background: 'rgba(255, 149, 0, 0.1)',
    borderRadius: '4px',
    border: '1px solid #ff9500',
  },
};

export default ErrorBoundary;
