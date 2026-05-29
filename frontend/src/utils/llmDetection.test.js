/**
 * Unit tests for LLM command detection
 * Mirrors the Go tests in internal/terminal/context_manager_test.go
 */

import { describe, it, expect } from 'vitest';
import { isLLMCommand, getBaseCommand, startsWithLLMCommand } from './llmDetection';

describe('isLLMCommand', () => {
  describe('Copilot commands', () => {
    it('detects copilot with arguments', () => {
      expect(isLLMCommand('copilot explain this code')).toBe(true);
    });

    it('detects bare copilot command', () => {
      expect(isLLMCommand('copilot')).toBe(true);
    });

    it('handles whitespace trimming', () => {
      expect(isLLMCommand('  copilot  ')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(isLLMCommand('COPILOT --help')).toBe(true);
    });

    it('detects gh copilot commands', () => {
      expect(isLLMCommand('gh copilot suggest')).toBe(true);
    });
  });

  describe('Claude commands', () => {
    it('detects claude with arguments', () => {
      expect(isLLMCommand('claude chat hello')).toBe(true);
    });

    it('detects bare claude command', () => {
      expect(isLLMCommand('claude')).toBe(true);
    });

    it('handles whitespace', () => {
      expect(isLLMCommand('  claude  ')).toBe(true);
    });
  });

  describe('Gemini commands', () => {
    it('detects gemini with arguments', () => {
      expect(isLLMCommand('gemini chat hello')).toBe(true);
    });

    it('detects bare gemini command', () => {
      expect(isLLMCommand('gemini')).toBe(true);
    });

    it('handles whitespace', () => {
      expect(isLLMCommand('  gemini  ')).toBe(true);
    });
  });

  describe('Subagent commands', () => {
    it('detects @reviewer commands', () => {
      expect(isLLMCommand('@reviewer check this PR')).toBe(true);
    });

    it('detects @architect commands', () => {
      expect(isLLMCommand('@architect design system')).toBe(true);
    });

    it('detects bare @ symbol', () => {
      expect(isLLMCommand('@')).toBe(true);
    });
  });

  describe('Shell commands (should return false)', () => {
    it('rejects ls command', () => {
      expect(isLLMCommand('ls -la')).toBe(false);
    });

    it('rejects cd command', () => {
      expect(isLLMCommand('cd /home/user')).toBe(false);
    });

    it('rejects git command', () => {
      expect(isLLMCommand('git status')).toBe(false);
    });

    it('rejects npm command', () => {
      expect(isLLMCommand('npm install')).toBe(false);
    });

    it('rejects echo command', () => {
      expect(isLLMCommand('echo hello')).toBe(false);
    });

    it('rejects copilot-like but invalid commands', () => {
      expect(isLLMCommand('copilot-not-a-command')).toBe(false);
      expect(isLLMCommand('my-copilot-tool')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isLLMCommand('')).toBe(false);
    });

    it('rejects whitespace only', () => {
      expect(isLLMCommand('   ')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(isLLMCommand(null)).toBe(false);
      expect(isLLMCommand(undefined)).toBe(false);
    });
  });
});

describe('getBaseCommand', () => {
  it('extracts first word from command', () => {
    expect(getBaseCommand('copilot explain this code')).toBe('copilot');
  });

  it('returns full string if no spaces', () => {
    expect(getBaseCommand('copilot')).toBe('copilot');
  });

  it('handles leading whitespace', () => {
    expect(getBaseCommand('  ls -la  ')).toBe('ls');
  });

  it('returns empty string for empty input', () => {
    expect(getBaseCommand('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(getBaseCommand(null)).toBe('');
    expect(getBaseCommand(undefined)).toBe('');
  });
});

describe('startsWithLLMCommand', () => {
  it('detects partial copilot typing', () => {
    expect(startsWithLLMCommand('copi')).toBe(true);
    expect(startsWithLLMCommand('copil')).toBe(true);
  });

  it('detects partial gemini typing', () => {
    expect(startsWithLLMCommand('gem')).toBe(true);
    expect(startsWithLLMCommand('gemin')).toBe(true);
  });

  it('detects full copilot command', () => {
    expect(startsWithLLMCommand('copilot')).toBe(true);
  });

  it('detects @ prefix immediately', () => {
    expect(startsWithLLMCommand('@')).toBe(true);
    expect(startsWithLLMCommand('@rev')).toBe(true);
  });

  it('rejects non-LLM command starts', () => {
    expect(startsWithLLMCommand('l')).toBe(false);
    expect(startsWithLLMCommand('ls')).toBe(false);
  });

  it('handles empty input', () => {
    expect(startsWithLLMCommand('')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(startsWithLLMCommand('COPI')).toBe(true);
  });
});
