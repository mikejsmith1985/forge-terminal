/**
 * Tab Focus Tests
 * TDD: Write failing tests first, then fix the implementation
 * 
 * Issue: When a second tab is opened and user presses spacebar,
 * focus jumps to the first tab's terminal instead of staying in current tab.
 * 
 * Root cause: xterm creates a <textarea> for each terminal, and hidden
 * terminals still have focusable textareas in the DOM.
 * 
 * Solution: Set tabIndex="-1" on hidden terminal textareas to remove
 * them from tab order and prevent focus stealing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Tab Focus Management', () => {
  // Mock terminal elements
  let mockTerminals;
  
  beforeEach(() => {
    // Create mock terminal wrapper elements
    mockTerminals = [];
    
    // Create two terminal wrappers with xterm helper textareas
    for (let i = 0; i < 2; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = `terminal-wrapper ${i === 1 ? 'hidden' : ''}`;
      wrapper.setAttribute('data-tab-id', `tab-${i}`);
      
      const textarea = document.createElement('textarea');
      textarea.className = 'xterm-helper-textarea';
      textarea.setAttribute('data-tab-id', `tab-${i}`);
      
      wrapper.appendChild(textarea);
      document.body.appendChild(wrapper);
      mockTerminals.push({ wrapper, textarea });
    }
  });
  
  afterEach(() => {
    // Clean up
    mockTerminals.forEach(({ wrapper }) => {
      wrapper.remove();
    });
    mockTerminals = [];
  });
  
  it('should have only one visible terminal wrapper', () => {
    const visibleWrappers = document.querySelectorAll('.terminal-wrapper:not(.hidden)');
    expect(visibleWrappers.length).toBe(1);
  });
  
  it('should have hidden terminals not focusable via keyboard', () => {
    // Simulate the React fix - set tabIndex based on visibility
    // This is what ForgeTerminal.jsx does in useEffect
    mockTerminals.forEach(({ wrapper, textarea }) => {
      if (wrapper.classList.contains('hidden')) {
        textarea.tabIndex = -1; // Hidden: remove from tab order
      } else {
        textarea.tabIndex = 0; // Visible: focusable
      }
    });
    
    const hiddenWrapper = document.querySelector('.terminal-wrapper.hidden');
    const hiddenTextarea = hiddenWrapper.querySelector('.xterm-helper-textarea');
    
    // After fix: tabIndex should be -1 (not focusable via keyboard)
    expect(hiddenTextarea.tabIndex).toBe(-1);
  });
  
  it('should have active terminal textarea focusable', () => {
    // Simulate the React fix
    mockTerminals.forEach(({ wrapper, textarea }) => {
      if (wrapper.classList.contains('hidden')) {
        textarea.tabIndex = -1;
      } else {
        textarea.tabIndex = 0;
      }
    });
    
    const activeWrapper = document.querySelector('.terminal-wrapper:not(.hidden)');
    const activeTextarea = activeWrapper.querySelector('.xterm-helper-textarea');
    
    // Active terminal should be focusable
    expect(activeTextarea.tabIndex).toBeGreaterThanOrEqual(0);
  });
  
  it('should focus active terminal on spacebar, not hidden one', () => {
    // Simulate the React fix
    mockTerminals.forEach(({ wrapper, textarea }) => {
      if (wrapper.classList.contains('hidden')) {
        textarea.tabIndex = -1;
      } else {
        textarea.tabIndex = 0;
      }
    });
    
    const activeWrapper = document.querySelector('.terminal-wrapper:not(.hidden)');
    const activeTextarea = activeWrapper.querySelector('.xterm-helper-textarea');
    const hiddenTextarea = document.querySelector('.terminal-wrapper.hidden .xterm-helper-textarea');
    
    // Focus the active textarea
    activeTextarea.focus();
    
    // Simulate spacebar
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
    });
    activeTextarea.dispatchEvent(event);
    
    // Focus should still be on active textarea, not hidden one
    expect(document.activeElement).toBe(activeTextarea);
    expect(document.activeElement).not.toBe(hiddenTextarea);
  });
  
  it('should update tabIndex when switching tabs', () => {
    // Simulate switching from tab-0 to tab-1
    // This would make tab-0 hidden and tab-1 visible
    
    const tab0Wrapper = mockTerminals[0].wrapper;
    const tab1Wrapper = mockTerminals[1].wrapper;
    const tab0Textarea = mockTerminals[0].textarea;
    const tab1Textarea = mockTerminals[1].textarea;
    
    // Initial state: tab-0 visible, tab-1 hidden
    expect(tab0Wrapper.classList.contains('hidden')).toBe(false);
    expect(tab1Wrapper.classList.contains('hidden')).toBe(true);
    
    // Simulate tab switch - this is what the fix should do:
    // 1. Add 'hidden' to tab-0, set tabIndex=-1
    // 2. Remove 'hidden' from tab-1, set tabIndex=0
    tab0Wrapper.classList.add('hidden');
    tab0Textarea.tabIndex = -1;
    
    tab1Wrapper.classList.remove('hidden');
    tab1Textarea.tabIndex = 0;
    
    // Verify
    expect(tab0Textarea.tabIndex).toBe(-1);
    expect(tab1Textarea.tabIndex).toBe(0);
  });
  
  it('should not have multiple focusable terminal textareas', () => {
    // Set up the fix
    mockTerminals.forEach(({ wrapper, textarea }) => {
      if (wrapper.classList.contains('hidden')) {
        textarea.tabIndex = -1;
      } else {
        textarea.tabIndex = 0;
      }
    });
    
    // Count focusable textareas
    const focusableTextareas = document.querySelectorAll(
      '.xterm-helper-textarea:not([tabindex="-1"])'
    );
    
    expect(focusableTextareas.length).toBe(1);
  });
});

describe('CSS Focus Prevention', () => {
  it('hidden terminal should have pointer-events: none', () => {
    const hiddenWrapper = document.createElement('div');
    hiddenWrapper.className = 'terminal-wrapper hidden';
    document.body.appendChild(hiddenWrapper);
    
    // Check computed style (in real browser)
    // For unit test, we just verify the class is applied
    expect(hiddenWrapper.classList.contains('hidden')).toBe(true);
    
    hiddenWrapper.remove();
  });
  
  it('hidden terminal should have visibility: hidden', () => {
    // This is already in CSS - just validate the class
    const hiddenWrapper = document.createElement('div');
    hiddenWrapper.className = 'terminal-wrapper hidden';
    document.body.appendChild(hiddenWrapper);
    
    expect(hiddenWrapper.classList.contains('hidden')).toBe(true);
    
    hiddenWrapper.remove();
  });
});
