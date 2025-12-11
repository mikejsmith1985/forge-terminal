/**
 * Error Message Formatter and Validator Utility
 * Phase 1 P0 Fix #4-6: Better error messages
 */

export function validateAPIKey(key) {
  if (!key || key.trim().length === 0) {
    return { valid: false, message: 'API key is required' };
  }
  if (key.length < 20) {
    return { valid: false, message: 'API key appears to be too short' };
  }
  return { valid: true, message: 'API key format looks good' };
}

export function validateFilePath(path) {
  if (!path || path.trim().length === 0) {
    return { valid: false, message: 'Path cannot be empty' };
  }
  if (path.match(/[<>"|?*]/)) {
    return { valid: false, message: 'Path contains invalid characters' };
  }
  return { valid: true, message: 'Path format is valid' };
}

export function validateShellPath(shellPath) {
  if (!shellPath || shellPath.trim().length === 0) {
    return { valid: false, message: 'Shell path cannot be empty' };
  }
  return { valid: true, message: 'Shell path format looks good' };
}

export function formatErrorMessage(errorType, context = {}) {
  const errorMap = {
    'PERMISSION_DENIED': {
      title: '❌ Permission Denied',
      message: 'You don\'t have permission to access this resource',
      suggestion: 'Check file permissions or ask administrator'
    },
    'NOT_FOUND': {
      title: '❌ Not Found',
      message: 'The resource you\'re looking for doesn\'t exist',
      suggestion: 'Verify the path and try again'
    },
    'FILE_NOT_FOUND': {
      title: '❌ File Not Found',
      message: 'Could not find the file',
      suggestion: 'Check that the file name is spelled correctly'
    },
    'CONNECTION_ERROR': {
      title: '❌ Connection Lost',
      message: 'Lost connection to the terminal',
      suggestion: 'Check your internet connection'
    }
  };
  return errorMap[errorType] || { title: '❌ Error', message: 'An error occurred', suggestion: 'Please try again' };
}

export function formatConnectionError(reason, attemptNumber = 1) {
  return {
    title: '�� Connection Issue',
    message: `Connection attempt ${attemptNumber} - ${reason}`,
    suggestion: attemptNumber > 3 ? 'Please check your internet connection' : 'Retrying...'
  };
}

export function formatValidationError(field, reason) {
  return {
    title: 'Validation Error',
    message: `Please check your ${field} and try again`
  };
}

export function showErrorToast(toastFn, errorType, context = {}) {
  if (!toastFn) return;
  const error = formatErrorMessage(errorType, context);
  const fullMessage = `${error.title}\n\n${error.message}\n\n${error.suggestion}`;
  toastFn(fullMessage, 'error', 5000);
}

export default {
  validateAPIKey,
  validateFilePath,
  validateShellPath,
  formatErrorMessage,
  formatConnectionError,
  formatValidationError,
  showErrorToast
};
