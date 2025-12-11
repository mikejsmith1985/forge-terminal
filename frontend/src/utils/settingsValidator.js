/**
 * Settings Validation Utility
 * Phase 1 P0 Fix #1-3: Settings validation
 */

import { validateFilePath, validateShellPath, validateAPIKey } from './errorFormatter';

export function validateShellConfig(config) {
  const errors = {};
  if (!config) {
    return { isValid: false, errors: { general: 'Configuration is required' } };
  }

  if (config.shellType) {
    const validShells = ['bash', 'zsh', 'sh', 'fish', 'powershell', 'cmd', 'pwsh'];
    if (!validShells.includes(config.shellType)) {
      errors.shellType = `Unknown shell type: ${config.shellType}`;
    }
  }

  if (config.wslDistro || config.shellType === 'wsl') {
    if (!config.wslDistro || config.wslDistro.trim().length === 0) {
      errors.wslDistro = 'WSL distro must be specified';
    }
    if (!config.wslHomePath || config.wslHomePath.trim().length === 0) {
      errors.wslHomePath = 'WSL home path must be specified';
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return { isValid, errors: isValid ? {} : errors };
}

export function validateWSLConfig(distro, homePath) {
  const errors = {};

  if (!distro || distro.trim().length === 0) {
    errors.distro = 'WSL distro is required';
  }

  if (!homePath || homePath.trim().length === 0) {
    errors.homePath = 'Home path is required';
  } else if (!homePath.startsWith('/')) {
    errors.homePath = 'WSL paths should start with /';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors: isValid ? {} : errors,
    message: isValid ? '✓ WSL configuration looks good' : undefined
  };
}

export function validateAPIKeyRealtime(key) {
  const result = validateAPIKey(key);
  let isComplete = false;
  if (key && key.length > 30 && !key.includes(' ')) {
    isComplete = true;
  }
  return {
    ...result,
    isComplete,
    confidence: key ? Math.min(100, (key.length / 50) * 100) : 0
  };
}

export function validateSettingsForm(settings) {
  const errors = {};
  if (!settings) {
    return { isValid: false, errors: { general: 'Settings object is required' } };
  }

  if (settings.shellConfig) {
    const shellValidation = validateShellConfig(settings.shellConfig);
    if (!shellValidation.isValid) {
      errors.shellConfig = shellValidation.errors;
    }
  }

  if (settings.visionEnabled && settings.visionApiKey) {
    const keyValidation = validateAPIKey(settings.visionApiKey);
    if (!keyValidation.valid) {
      errors.visionApiKey = keyValidation.message;
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return { isValid, errors: isValid ? {} : errors };
}

export function getFieldValidationStatus(fieldName, value) {
  if (!value && fieldName !== 'optional') {
    return { status: 'empty', message: 'This field is required' };
  }

  switch (fieldName) {
    case 'apiKey':
      const keyValidation = validateAPIKey(value);
      return {
        status: keyValidation.valid ? 'valid' : 'invalid',
        message: keyValidation.message
      };

    case 'shellPath':
      const pathValidation = validateShellPath(value);
      return {
        status: pathValidation.valid ? 'valid' : 'invalid',
        message: pathValidation.message
      };

    default:
      return {
        status: value ? 'valid' : 'empty',
        message: value ? 'Looks good' : 'This field is required'
      };
  }
}

export function getValidationIndicator(status) {
  const indicators = {
    'valid': { color: '#22c55e', icon: '✓', bgColor: '#1a2e1a' },
    'invalid': { color: '#ef4444', icon: '✗', bgColor: '#3f1f1f' },
    'empty': { color: '#888', icon: '○', bgColor: '#1a1a1a' }
  };
  return indicators[status] || indicators['empty'];
}

export function createValidationFeedback(fieldName, value) {
  const status = getFieldValidationStatus(fieldName, value);
  const indicator = getValidationIndicator(status.status);

  return {
    statusText: status.message,
    statusColor: indicator.color,
    backgroundColor: indicator.bgColor,
    icon: indicator.icon,
    status: status.status
  };
}

export default {
  validateShellConfig,
  validateWSLConfig,
  validateAPIKeyRealtime,
  validateSettingsForm,
  getFieldValidationStatus,
  getValidationIndicator,
  createValidationFeedback
};
