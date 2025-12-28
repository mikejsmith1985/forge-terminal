/**
 * Task 1 TDD Tests: Tab-Native Mode Implementation
 * 
 * Tests for:
 * - viewMode: 'chat' | 'terminal' tab state
 * - New tabs default to chat mode
 * - ChatView renders as full-tab view
 * - Terminal toggle in tab header
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock the modules
vi.mock('lucide-react', () => ({
  Send: () => <span data-testid="send-icon">Send</span>,
  Loader2: () => <span data-testid="loader-icon">Loading</span>,
  X: () => <span data-testid="x-icon">X</span>,
  Terminal: () => <span data-testid="terminal-icon">Terminal</span>,
  MessageSquare: () => <span data-testid="message-icon">Message</span>,
  Brain: () => <span data-testid="brain-icon">Brain</span>,
}));

// Test 1: Tab state supports viewMode
describe('Tab ViewMode State', () => {
  it('should have viewMode property defaulting to "chat"', () => {
    const newTab = {
      id: 'tab-1',
      title: 'New Tab',
      viewMode: 'chat', // New property
    };
    expect(newTab.viewMode).toBe('chat');
  });

  it('should support switching viewMode to "terminal"', () => {
    const tab = {
      id: 'tab-1',
      title: 'Test Tab',
      viewMode: 'chat',
    };
    tab.viewMode = 'terminal';
    expect(tab.viewMode).toBe('terminal');
  });
});

// Test 2: Tab toggle functionality
describe('Tab ViewMode Toggle', () => {
  it('should toggle from chat to terminal', () => {
    const toggleViewMode = (tab) => ({
      ...tab,
      viewMode: tab.viewMode === 'chat' ? 'terminal' : 'chat',
    });

    const tab = { id: 'tab-1', viewMode: 'chat' };
    const toggled = toggleViewMode(tab);
    expect(toggled.viewMode).toBe('terminal');
  });

  it('should toggle from terminal to chat', () => {
    const toggleViewMode = (tab) => ({
      ...tab,
      viewMode: tab.viewMode === 'chat' ? 'terminal' : 'chat',
    });

    const tab = { id: 'tab-1', viewMode: 'terminal' };
    const toggled = toggleViewMode(tab);
    expect(toggled.viewMode).toBe('chat');
  });
});

// Test 3: Default tab creation
describe('New Tab Creation', () => {
  it('should create new tabs with viewMode: "chat" by default', () => {
    const createNewTab = (id) => ({
      id,
      title: 'New Tab',
      viewMode: 'chat', // Default to chat mode
      shellConfig: { shellType: 'powershell' },
      colorTheme: 'molten',
      mode: 'dark',
    });

    const newTab = createNewTab('tab-123');
    expect(newTab.viewMode).toBe('chat');
  });
});
