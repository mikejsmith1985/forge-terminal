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
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
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
  /\(y\/n\)[:?]?\s*$/i,
  /\[Y\/n\][:?]?\s*$/i,
  /\[y\/N\][:?]?\s*$/i,
  /\(yes\/no\)[:?]?\s*$/i,
  /\[yes\/no\][:?]?\s*$/i,
  /\?\s*\(y\/n\)[:?]?\s*$/i,
  /\?\s*\[Y\/n\][:?]?\s*$/i,
  /\?\s*\[y\/N\][:?]?\s*$/i,
  /\?\s*›?\s*\(Y\/n\)[:?]?\s*$/i,
  /Are you sure.*\?\s*$/i,
  // PowerShell -Confirm prompts
  /\[Y\]\s*Yes\s+\[A\]\s*Yes to All\s+\[N\]\s*No/i,
  /\(default is "Y"\)\s*:?\s*$/i,
  /\[Y\].*\[N\].*:\s*$/i,
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
  const lastLines = lines.slice(-5); // Array of last 5 lines
  
  // Check if ANY of the last lines matches the pattern
  // This handles cases where the prompt is followed by a cursor or empty line
  const hasYnPrompt = lastLines.some(line => 
    YN_PROMPT_PATTERNS.some(p => p.test(line))
  );
  return { detected: hasYnPrompt };
}

function detectCliPrompt(text) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none' };
  }
  
  const cleanText = stripAnsi(text);
  const bufferToCheck = cleanText.slice(-800);
  
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

    it('should detect PowerShell -Confirm prompt', () => {
      const buffer = `
Confirm
Are you sure you want to perform this action?
Performing the operation "Remove File" on target "C:\\test.txt".
[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"):
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
      expect(result.confidence).toBe('high');
    });

    it('should detect PowerShell default is Y prompt ending', () => {
      const buffer = `
Some operation prompt (default is "Y"):
`;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.responseType).toBe('y-enter');
    });

    it('should detect Y/N prompt followed by cursor line', () => {
      // Regression test for auto-respond fix
      const buffer = `
Proceed with installation? (y/n)
> `;
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

    it('should detect prompt when context is pushed out of 800 char buffer', () => {
      // 800 chars is small. If we have a lot of noise between context and prompt...
      // Context: "Confirm with number keys..."
      // Prompt: "❯ 1. Yes"
      
      // Case 1: Context is far away (should be low confidence but detected)
      const context = "Confirm with number keys or Enter\n";
      const noise = "x".repeat(900); // Push context out of buffer
      const prompt = "\n❯ 1. Yes\n";
      
      const buffer = context + noise + prompt;
      const result = detectCliPrompt(buffer);
      
      expect(result.waiting).toBe(true);
      expect(result.confidence).toBe('low'); // Context lost, so low confidence
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

// =============================================================================
// Interactive TUI Detection Tests (v3.4.0)
// =============================================================================

// Copy of detection logic from ForgeTerminal.jsx for testing
const INTERACTIVE_TUI_PATTERNS = [
  /Tab\s+to\s+navigate/i,
  /↹\s+to\s+switch/i,
  /Tab\s+to\s+switch/i,
  /\[\s*\d+\s*\/\s*\d+\s*\]/,
  /Step\s+\d+\s+of\s+\d+/i,
  /Select.*files?.*to/i,
  /Choose.*option/i,
  /Space\s+to\s+select/i,
  /Press\s+space\s+to\s+toggle/i,
  /Allow\s+tool/i,
  /Deny\s+tool/i,
  /Enter\s+.*:/,
  /Type\s+.*:/,
  /Input:/i,
];

const TUI_FRAME_INDICATORS_TEST = [
  /[╭╮╯╰│─┌┐└┘├┤┬┴┼]/,
  /Remaining requests:\s*[\d.]+%/i,
  /Ctrl\+c\s+Exit/i,
];

function detectInteractiveTUI(cleanText) {
  const hasTuiFrame = TUI_FRAME_INDICATORS_TEST.some(p => p.test(cleanText));
  const hasInteractivePattern = INTERACTIVE_TUI_PATTERNS.some(p => p.test(cleanText));
  
  if (hasInteractivePattern) {
    return { detected: true, type: 'interactive-wizard' };
  }
  
  if (hasTuiFrame) {
    const hasYesSelected = MENU_SELECTION_PATTERNS.some(p => p.test(cleanText));
    const hasYnPrompt = YN_PROMPT_PATTERNS.some(p => p.test(cleanText));
    
    if (!hasYesSelected && !hasYnPrompt) {
      return { detected: true, type: 'tui-active' };
    }
  }
  
  return { detected: false, type: null };
}

describe('Interactive TUI Detection', () => {
  
  describe('Claude Code Multi-Question Wizards', () => {
    
    it('should detect Tab to navigate prompt', () => {
      const buffer = `
╭──────────────────────────────────────────────────────────────╮
│ Select files to edit                                          │
╰──────────────────────────────────────────────────────────────╯

[x] src/index.js
[ ] src/utils.js
[ ] package.json

Tab to navigate • Space to select • Enter to confirm
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('interactive-wizard');
    });
    
    it('should detect Step X of Y wizard progress', () => {
      const buffer = `
Step 2 of 4: Configure build settings

Enter output directory: _
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('interactive-wizard');
    });
    
    it('should detect Space to select multi-choice', () => {
      const buffer = `
? Which packages to install?
  Press space to toggle selection

❯ [ ] eslint
  [ ] prettier
  [ ] typescript
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('interactive-wizard');
    });
    
    it('should detect Allow/Deny tool prompts', () => {
      const buffer = `
Claude wants to use the following tool:

read_file: package.json

Allow tool • Deny tool • Allow for session
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('interactive-wizard');
    });
    
    it('should detect input field prompts', () => {
      const buffer = `
Enter your project name:
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('interactive-wizard');
    });
    
  });
  
  describe('TUI Frame Detection', () => {
    
    it('should detect TUI with box characters but no confirmation pattern', () => {
      const buffer = `
╭──────────────────────────────────────────────────────────────╮
│ Loading project files...                                      │
│                                                               │
│ [████████████████████████████░░░░░░░░░░░░] 70%               │
╰──────────────────────────────────────────────────────────────╯
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('tui-active');
    });
    
    it('should NOT detect TUI when Y/N prompt is present', () => {
      // Y/N prompt on its own line at the end - this would be handled by auto-respond
      const buffer = `
╭──────────────────────────────────────────────────────────────╮
│ Some TUI content here                                         │
╰──────────────────────────────────────────────────────────────╯

Are you sure? (y/n)
`;
      const result = detectInteractiveTUI(buffer);
      // Should be false because Y/N pattern IS present
      expect(result.detected).toBe(false);
    });
    
    it('should NOT detect TUI when Yes is selected', () => {
      const buffer = `
╭──────────────────────────────────────────────────────────────╮
│ Do you want to run this command?                              │
╰──────────────────────────────────────────────────────────────╯

❯ Yes
  No
`;
      const result = detectInteractiveTUI(buffer);
      // Should be false because Yes IS selected
      expect(result.detected).toBe(false);
    });
    
  });
  
  describe('Non-Interactive Terminal Output', () => {
    
    it('should NOT detect regular command output', () => {
      const buffer = `
$ npm install
added 150 packages in 5s

$ npm run build
Building project...
Done!
$ _
`;
      const result = detectInteractiveTUI(buffer);
      expect(result.detected).toBe(false);
    });
    
  });
  
});
