/**
 * Tests for CLI prompt detection logic
 * 
 * These tests verify that the auto-respond feature correctly identifies
 * when CLI tools like Copilot and Claude are waiting for user input.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Copy of detection logic from ForgeTerminal.jsx for testing
// ============================================================================

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const MENU_SELECTION_PATTERNS = [
  /[›❯>]\s*1\.\s*Yes\b/i,
  /[›❯>]\s*Yes\b/i,
  /[›❯>]\s*Run\s+this\s+command/i,
  /[●◉✓✔]\s*Yes\b/i,
];

const MENU_CONTEXT_PATTERNS = [
  /Confirm with number keys or.*Enter/i,
  /use.*arrow.*keys.*select/i,
  /↑↓.*keys.*Enter/i,
  /Do you want to run this command\??/i,
  /Do you want to run\??/i,
  /Cancel with Esc/i,
];

const YN_PROMPT_PATTERNS = [
  /\(y\/n\)\s*$/i,
  /\[Y\/n\]\s*$/i,
  /\[y\/N\]\s*$/i,
  /\(yes\/no\)\s*$/i,
  /\[yes\/no\]\s*$/i,
  /\?\s*\(y\/n\)\s*$/i,
  /\?\s*\[Y\/n\]\s*$/i,
  /\?\s*\[y\/N\]\s*$/i,
  /\?\s*›?\s*\(Y\/n\)\s*$/i,
  /Are you sure.*\?\s*$/i,
];

const QUESTION_PATTERNS = [
  /Do you want to run this command\?/i,
  /Do you want to proceed\?/i,
  /Do you want to continue\?/i,
  /Would you like to proceed\?/i,
  /Proceed\?/i,
  /Continue\?/i,
  /Run this command\?/i,
];

const TUI_FRAME_INDICATORS = [
  /[╭╮╯╰│─┌┐└┘├┤┬┴┼]/,
  /Remaining requests:\s*[\d.]+%/i,
  /Ctrl\+c\s+Exit/i,
];

function detectMenuPrompt(cleanText) {
  const hasYesSelected = MENU_SELECTION_PATTERNS.some(p => p.test(cleanText));
  
  if (!hasYesSelected) {
    return { detected: false, confidence: 'low' };
  }
  
  const hasMenuContext = MENU_CONTEXT_PATTERNS.some(p => p.test(cleanText));
  const hasQuestion = QUESTION_PATTERNS.some(p => p.test(cleanText));
  const hasTuiFrame = TUI_FRAME_INDICATORS.some(p => p.test(cleanText));
  
  if (hasYesSelected && (hasMenuContext || hasTuiFrame)) {
    return { detected: true, confidence: 'high' };
  }
  
  if (hasYesSelected && hasQuestion) {
    return { detected: true, confidence: 'medium' };
  }
  
  if (hasYesSelected) {
    return { detected: true, confidence: 'low' };
  }
  
  return { detected: false, confidence: 'low' };
}

function detectYnPrompt(cleanText) {
  const lines = cleanText.split(/[\r\n]/).filter(l => l.trim());
  const lastLines = lines.slice(-3).join('\n');
  const hasYnPrompt = YN_PROMPT_PATTERNS.some(p => p.test(lastLines));
  return { detected: hasYnPrompt };
}

function detectCliPrompt(text) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none' };
  }
  
  const cleanText = stripAnsi(text);
  const bufferToCheck = cleanText.slice(-2000);
  
  const menuResult = detectMenuPrompt(bufferToCheck);
  if (menuResult.detected && menuResult.confidence !== 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: menuResult.confidence 
    };
  }
  
  const ynResult = detectYnPrompt(bufferToCheck);
  if (ynResult.detected) {
    return { 
      waiting: true, 
      responseType: 'y-enter', 
      confidence: 'high' 
    };
  }
  
  if (menuResult.detected && menuResult.confidence === 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: 'low' 
    };
  }
  
  return { waiting: false, responseType: null, confidence: 'none' };
}

// ============================================================================
// TEST CASES
// ============================================================================

describe('CLI Prompt Detection', () => {
  
  describe('Copilot CLI Prompts', () => {
    
    it('should detect Copilot CLI numbered menu with Yes selected (issue #16 format)', () => {
      const buffer = `
Do you want to run this command?

❯ 1. Yes
  2. Yes, and approve 'go get' for the rest of the running session
  3. No, and tell Copilot what to do differently (Esc)

Confirm with number keys or ↑↓ keys and Enter, Cancel with Esc
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect Copilot CLI with box drawing characters', () => {
      const buffer = `
╭──────────────────────────────────────────────────────────────╮
│ curl https://api.example.com/data                            │
╰──────────────────────────────────────────────────────────────╯

Do you want to run this command?

❯ 1. Yes
  2. No

Confirm with number keys or ↑↓ keys and Enter
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect Copilot CLI footer with remaining requests', () => {
      const buffer = `
❯ Yes

Ctrl+c Exit · Ctrl+r Expand recent                    Remaining requests: 84.8%
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect alternate selection indicator >', () => {
      const buffer = `
Do you want to run this command?

> 1. Yes
  2. No

Confirm with number keys or Enter
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      expect(result.confidence).toBe('high');
    });
    
  });
  
  describe('Y/N Style Prompts', () => {
    
    it('should detect (y/n) prompt', () => {
      const buffer = `Installing dependencies...
Proceed with installation? (y/n)
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect [Y/n] prompt with capital Y default', () => {
      const buffer = `
? Do you want to continue? [Y/n]
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect [y/N] prompt with capital N default', () => {
      const buffer = `
Are you sure you want to delete? [y/N]
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
      expect(result.confidence).toBe('high');
    });
    
    it('should detect (yes/no) prompt', () => {
      const buffer = `
Save changes before exiting? (yes/no)
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
      expect(result.confidence).toBe('high');
    });
    
  });
  
  describe('Inquirer-style Prompts', () => {
    
    it('should detect simple ❯ Yes selection', () => {
      const buffer = `
? Do you want to proceed?
❯ Yes
  No
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      // With "Do you want to proceed?" question, this is medium confidence
      expect(result.confidence).toBe('medium');
    });
    
    it('should detect › Yes selection (alternate arrow)', () => {
      const buffer = `
? Continue?
› Yes
  No
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
    });
    
  });
  
  describe('Edge Cases', () => {
    
    it('should not detect when No is selected', () => {
      const buffer = `
Do you want to run this command?

  1. Yes
❯ 2. No

Confirm with Enter
`;
      const result = detectCliPrompt(buffer);
      
      // Should not detect because Yes is not selected
      expect(result.waiting).toBe(false);
    });
    
    it('should not detect regular terminal output', () => {
      const buffer = `
$ ls -la
total 64
drwxr-xr-x  10 user user 4096 Dec  5 10:30 .
drwxr-xr-x   5 user user 4096 Dec  5 10:30 ..
-rw-r--r--   1 user user  150 Dec  5 10:30 README.md
$ _
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(false);
    });
    
    it('should not detect on empty or short text', () => {
      expect(detectCliPrompt('').waiting).toBe(false);
      expect(detectCliPrompt('abc').waiting).toBe(false);
      expect(detectCliPrompt(null).waiting).toBe(false);
    });
    
    it('should handle ANSI escape codes', () => {
      const buffer = `
\x1b[32mDo you want to run this command?\x1b[0m

\x1b[36m❯\x1b[0m 1. Yes
  2. No

Confirm with number keys or Enter
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
    });
    
    it('should detect prompt in large buffer with noise', () => {
      // Simulate lots of output before the prompt
      const noise = 'Building project...\nCompiling files...\n'.repeat(100);
      const prompt = `
Do you want to run this command?

❯ 1. Yes
  2. No

Confirm with number keys or Enter, Cancel with Esc
`;
      const buffer = noise + prompt;
      
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('enter');
      expect(result.confidence).toBe('high');
    });
    
  });
  
  describe('Confidence Levels', () => {
    
    it('should return high confidence with menu context', () => {
      const buffer = `
❯ Yes
Confirm with Enter, Cancel with Esc
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.confidence).toBe('high');
    });
    
    it('should return high confidence with TUI frame', () => {
      const buffer = `
│ Some command │
❯ Yes
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.confidence).toBe('high');
    });
    
    it('should return medium confidence with question only', () => {
      const buffer = `
Do you want to proceed?
❯ Yes
  No
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.confidence).toBe('medium');
    });
    
    it('should return low confidence with only selection indicator', () => {
      const buffer = `
Some random text
❯ Yes
More text
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.confidence).toBe('low');
    });
    
  });
  
});
