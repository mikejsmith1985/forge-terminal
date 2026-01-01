/**
 * ChatView - Full-tab Chat Interface for v3.5.1 Enhanced UX Layer
 * 
 * This is an enhanced UX layer for CLI AI tools (copilot, claude).
 * - Analyzes prompts with Smart Routing before CLI execution
 * - Displays rich output (files, screenshots, command cards)
 * - Uses CLI authentication - no API key needed
 * - Persists to SQLite with full-text search
 * 
 * Messages are persisted to SQLite and synced in real-time via WebSocket.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, Terminal, Brain, Settings, Play, Search, Image as ImageIcon, Command, FileText, Edit, X, Save } from 'lucide-react';
import ChatSearchOverlay from './ChatSearchOverlay';
import './ChatView.css';

// In-memory store for chat messages per tab (fallback if SQLite unavailable)
const chatMessagesStore = new Map();

const ChatView = ({ 
  tabId, 
  fontSize = 14, 
  onToggleTerminal,
  onOpenSettings,
  onToggleForgeAssist,
  onRunInTerminal,
  terminalRef, // v3.5.3: Reference to ForgeTerminal for PTY WebSocket access
  getTerminalRef, // Issue #52: Getter function for lazy ref access
}) => {
  // Issue #52: Helper to get terminal ref (handles race condition)
  const getActiveTerminalRef = () => {
    return terminalRef || (getTerminalRef && getTerminalRef());
  };

  // Initialize messages from store if available for this tab
  const [messages, setMessages] = useState(() => {
    return chatMessagesStore.get(tabId) || [];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(null); // SLM analysis display
  const [pendingImages, setPendingImages] = useState([]); // Images to attach
  const [isDragOver, setIsDragOver] = useState(false);
  const [usePTYBridge, setUsePTYBridge] = useState(true); // v3.5.3: Use PTY bridge by default
  const [pendingResponse, setPendingResponse] = useState(''); // Accumulating PTY output
  const [terminalReady, setTerminalReady] = useState(false); // Track when terminal ref is available
  
  // Issue #52: User preference for Enter key behavior
  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem('chat_enter_to_send');
    return saved !== null ? saved === 'true' : true; // Default: Enter sends
  });
  
  // v3.7.2: Draggable Forge Assist button
  const [forgeAssistBtnPos, setForgeAssistBtnPos] = useState(() => {
    const saved = localStorage.getItem('forge_assist_btn_pos');
    return saved ? JSON.parse(saved) : { right: 60, bottom: 80 }; // Default: right edge of input bar
  });
  const [isDraggingBtn, setIsDraggingBtn] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Instruction Mode State
  const [isInstructionMode, setIsInstructionMode] = useState(false);
  const [showInstructionEditor, setShowInstructionEditor] = useState(false);
  const [instructionContent, setInstructionContent] = useState('');
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({}); // For scrolling to search results
  const currentTabIdRef = useRef(tabId);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const responseAccumulatorRef = useRef(''); // For accumulating PTY output
  const assistantMessageIdRef = useRef(null); // Track current assistant message being built
  const isLoadingRef = useRef(false); // Track isLoading for PTY handlers (avoids stale closure)

  // Poll for terminal ref availability (handles race condition with ForgeTerminal mount)
  useEffect(() => {
    if (terminalReady) return;
    
    const checkTerminalRef = () => {
      const ref = getActiveTerminalRef();
      if (ref && ref.sendChatCommand) {
        console.log('[ChatView] Terminal ref now available');
        setTerminalReady(true);
      }
    };
    
    // Check immediately
    checkTerminalRef();
    
    // Poll every 100ms until terminal is ready
    const interval = setInterval(checkTerminalRef, 100);
    
    // Stop polling after 5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!terminalReady) {
        console.warn('[ChatView] Terminal ref not available after 5s, will use HTTP fallback');
      }
    }, 5000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [terminalReady, getTerminalRef, terminalRef]);

  // Keep isLoadingRef in sync with isLoading state
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Load messages from SQLite on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const response = await fetch('/api/chat/messages?limit=100');
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert SQLite format to local format
            const formatted = data.messages.map(m => ({
              id: m.id,
              role: m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : m.type,
              content: m.content,
              workerName: m.workerName,
              metadata: m.metadata,
              timestamp: m.timestamp || m.createdAt,
            }));
            setMessages(formatted);
          }
        }
      } catch (err) {
        console.error('[ChatView] Failed to load messages:', err);
      }
    };
    loadMessages();
  }, []);

  // Connect WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.message) {
            const msg = data.message;
            const formatted = {
              id: msg.id,
              role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : msg.type,
              content: msg.content,
              workerName: msg.workerName,
              metadata: msg.metadata,
              timestamp: msg.timestamp || new Date(msg.createdAt),
            };
            
            console.log('[ChatView] WebSocket message received:', formatted.id, formatted.role);
            
            setMessages(prev => {
              // Avoid duplicates - this is critical!
              if (prev.some(m => m.id === formatted.id)) {
                console.log('[ChatView] Duplicate message detected, skipping:', formatted.id);
                return prev;
              }
              console.log('[ChatView] Adding new message from WebSocket:', formatted.id);
              return [...prev, formatted];
            });
          }
        } catch (err) {
          console.error('[ChatView] WS parse error:', err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('[ChatView] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[ChatView] WebSocket connection failed:', err);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // v3.5.3: PTY Bridge - Subscribe to terminal output when using PTY mode
  // Issue #52: Use getActiveTerminalRef for lazy ref access
  // Fix: Wait for terminalReady state before registering handlers
  useEffect(() => {
    if (!usePTYBridge || !terminalReady) return;
    
    const ref = getActiveTerminalRef();
    if (!ref) return;
    
    console.log('[ChatView] Registering PTY bridge handlers');

    // Register a handler for PTY output that we receive via the terminal
    const handlePTYOutput = (data) => {
      // Use isLoadingRef to get current value (avoids stale closure issue)
      if (!isLoadingRef.current || !assistantMessageIdRef.current) return;
      
      // Accumulate output
      responseAccumulatorRef.current += data;
      
      // Update the assistant message in real-time
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(m => m.id === assistantMessageIdRef.current);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], content: responseAccumulatorRef.current };
        }
        return updated;
      });
    };

    // v3.5.3: Handler for response completion (detected by PromptDetector on backend)
    const handleResponseComplete = (response) => {
      console.log('[ChatView] Response complete from PromptDetector:', response?.length, 'chars');
      
      if (!assistantMessageIdRef.current) return;
      
      const finalResponse = response || responseAccumulatorRef.current;
      const assistantMessageId = assistantMessageIdRef.current;
      
      // Update the final message content
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(m => m.id === assistantMessageId);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], content: finalResponse };
        }
        return updated;
      });
      
      // Persist to SQLite
      fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          type: 'assistant',
          content: finalResponse,
          workerId: tabId || 'default',
          workerName: 'AI',
        })
      }).catch(err => console.warn('[ChatView] Failed to persist assistant message:', err));
      
      // Clear state
      setIsLoading(false);
      setAnalysisStatus(null);
      assistantMessageIdRef.current = null;
      responseAccumulatorRef.current = '';
    };

    // v3.7.1: Handler for prompt waiting (interactive prompts like [Y/n])
    // Shows the prompt in chat so user knows to respond
    const handlePromptWaiting = (promptText) => {
      console.log('[ChatView] Prompt waiting for input:', promptText);
      
      if (promptText && promptText.trim()) {
        // Add the prompt as a system message so user sees what they need to answer
        const promptMsgId = `prompt-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: promptMsgId,
          role: 'prompt', // Special role for interactive prompts
          content: promptText.trim(),
          isInteractive: true,
        }]);
      }
    };

    // v3.6.4: Handler for external commands (command cards) to initialize chat state
    const handleExternalCommand = (chatCommand) => {
      console.log('[ChatView] External command received:', chatCommand.command?.substring(0, 50));
      
      // Generate IDs and timestamp for messages
      const userMessageId = `user-ext-${Date.now()}`;
      const newAssistantMessageId = `assistant-ext-${Date.now()}`;
      const timestamp = new Date();
      
      // Add user message
      const userMsg = {
        id: userMessageId,
        role: 'user',
        content: chatCommand.command,
        timestamp,
      };
      
      // Add placeholder assistant message
      const assistantMsg = {
        id: newAssistantMessageId,
        role: 'assistant',
        content: '⏳ Waiting for response...',
        timestamp,
        workerName: chatCommand.model || chatCommand.cli || 'AI',
      };
      
      setMessages(prev => [...prev, userMsg, assistantMsg]);
      
      // Set up state for response accumulation
      assistantMessageIdRef.current = newAssistantMessageId;
      responseAccumulatorRef.current = '';
      setIsLoading(true);
      setError(null);
      
      // Persist user message to SQLite
      // v3.7.2 FIX: Don't persist if message already exists (prevents WebSocket duplication)
      fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userMessageId,
          type: 'user',
          content: chatCommand.command,
          workerId: tabId || 'default',
          workerName: 'User',
        })
      }).catch(err => console.warn('[ChatView] Failed to persist external user message:', err));
    };

    // Register handlers
    if (ref.registerChatOutputHandler) {
      ref.registerChatOutputHandler(handlePTYOutput);
    }
    if (ref.registerChatResponseCompleteHandler) {
      ref.registerChatResponseCompleteHandler(handleResponseComplete);
    }
    if (ref.registerChatPromptWaitingHandler) {
      ref.registerChatPromptWaitingHandler(handlePromptWaiting);
    }
    // v3.6.4: Register handler for external commands (command cards)
    if (ref.registerChatCommandInitHandler) {
      ref.registerChatCommandInitHandler(handleExternalCommand);
    }

    return () => {
      if (ref.unregisterChatOutputHandler) {
        ref.unregisterChatOutputHandler();
      }
      if (ref.unregisterChatResponseCompleteHandler) {
        ref.unregisterChatResponseCompleteHandler();
      }
      if (ref.unregisterChatPromptWaitingHandler) {
        ref.unregisterChatPromptWaitingHandler();
      }
      // v3.6.4: Unregister external command handler
      if (ref.unregisterChatCommandInitHandler) {
        ref.unregisterChatCommandInitHandler();
      }
    };
  }, [usePTYBridge, terminalReady, tabId]); // terminalReady triggers re-run when terminal becomes available

  // Persist messages to store when they change
  useEffect(() => {
    if (tabId) {
      chatMessagesStore.set(tabId, messages);
    }
  }, [messages, tabId]);

  // When tabId changes, load messages for that tab
  useEffect(() => {
    if (tabId !== currentTabIdRef.current) {
      currentTabIdRef.current = tabId;
      const storedMessages = chatMessagesStore.get(tabId) || [];
      setMessages(storedMessages);
    }
  }, [tabId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // v3.5.3: Send message via PTY bridge (injects into terminal's PTY session)
  // Issue #52: Use getActiveTerminalRef for lazy ref access
  const sendViaPTYBridge = useCallback(async (userMessage, slmResult) => {
    const ref = getActiveTerminalRef();
    if (!ref) {
      throw new Error('Terminal not connected');
    }

    const assistantMessageId = `msg-${Date.now() + 1}`;
    const timestamp = new Date();
    assistantMessageIdRef.current = assistantMessageId;
    responseAccumulatorRef.current = '';

    // v3.7.2 FIX: Actually invoke copilot CLI, don't just paste to PTY
    // Default to copilot for LLM invocation
    const cli = 'copilot';
    const model = slmResult?.recommendedModel || slmResult?.model || '';

    console.log('[ChatView] Sending via PTY bridge:', { 
      cli: cli, 
      model,
      messagePreview: userMessage.substring(0, 50)
    });

    // Add placeholder assistant message
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: '⏳ Waiting for response...', 
      id: assistantMessageId,
      timestamp,
      workerName: model || 'AI',
      metadata: slmResult ? { complexity: slmResult.complexity } : null,
    }]);

    // Send CHAT_COMMAND to terminal WebSocket
    // v3.7.2: cli is set to 'copilot', so backend will use SendCLICommand
    // This invokes: copilot --model <model> -p "<userMessage>"
    const success = ref.sendChatCommand({
      type: 'CHAT_COMMAND',
      command: userMessage,
      cli: cli,
      model: model,
    });

    if (!success) {
      throw new Error('Failed to send command to terminal');
    }

    // v3.5.3: Response completion is now detected by PromptDetector on the backend
    // The handleResponseComplete callback (registered in useEffect) will finalize the response
    // We still have a fallback timeout for safety, but it's much longer now
    setTimeout(() => {
      // Use isLoadingRef to get current value (avoids stale closure issue)
      if (isLoadingRef.current && assistantMessageIdRef.current === assistantMessageId) {
        console.warn('[ChatView] Response timeout - finalizing with accumulated content');
        // Fallback: finalize with whatever we have
        if (responseAccumulatorRef.current.trim()) {
          fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: assistantMessageId,
              type: 'assistant',
              content: responseAccumulatorRef.current,
              workerId: tabId || 'default',
              workerName: model || 'AI',
              metadata: slmResult ? { 
                complexity: slmResult.complexity,
                model: model,
                taskType: slmResult.taskType,
              } : null,
            })
          }).catch(err => console.warn('[ChatView] Failed to persist assistant message:', err));
        }
        setIsLoading(false);
        setAnalysisStatus(null);
        assistantMessageIdRef.current = null;
      }
    }, 120000); // 2 minute fallback timeout (PromptDetector should handle most cases)

    return assistantMessageId;
  }, [terminalRef, tabId]); // Removed isLoading - using isLoadingRef instead

  // v3.5.3: Send message via HTTP API (fallback mode)
  const sendViaHTTP = useCallback(async (userMessage, slmResult) => {
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        tabId: tabId || 'default'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to get response');
    }

    // Get routing info from headers
    const routedModel = response.headers.get('X-Forge-Routed-To');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const timestamp = new Date();
    let messageAdded = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullResponse += chunk;

      if (!messageAdded) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: fullResponse, 
          id: assistantMessageId,
          timestamp,
          workerName: routedModel || 'AI',
          metadata: slmResult ? { complexity: slmResult.complexity } : null,
        }]);
        messageAdded = true;
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(m => m.id === assistantMessageId);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], content: fullResponse };
          }
          return updated;
        });
      }
    }

    // Persist assistant message to SQLite
    await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: assistantMessageId,
        type: 'assistant',
        content: fullResponse,
        workerId: tabId || 'default',
        workerName: routedModel || 'AI',
        metadata: slmResult ? { 
          complexity: slmResult.complexity,
          model: routedModel,
          taskType: slmResult.taskType,
        } : null,
      })
    }).catch(err => console.warn('[ChatView] Failed to persist assistant message:', err));

    return fullResponse;
  }, [tabId]);

  const handleSendMessage = useCallback(async () => {
    // v3.7.2 FIX: Prevent duplicate sends if already loading
    if (!inputValue.trim() || isLoading) {
      console.log('[ChatView] Skipping send - already loading or empty input');
      return;
    }

    const userMessage = inputValue.trim();
    const userMsgId = `msg-${Date.now()}`;
    const timestamp = new Date();
    
    // v3.7.2 FIX: Clear input and set loading state IMMEDIATELY to prevent double-sends
    setInputValue('');
    setIsLoading(true);
    setError(null);
    
    // Append instructions if mode is active
    let finalUserMessage = userMessage;
    if (isInstructionMode) {
      finalUserMessage += `\n\n(Please follow and reference the instructions in copilot-instructions.md)`;
    }

    // Then add message to UI
    setMessages(prev => [...prev, { role: 'user', content: userMessage, id: userMsgId, timestamp }]);

    try {
      // Persist user message to SQLite
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userMsgId,
          type: 'user',
          content: finalUserMessage, // Persist the full message with instructions
          workerId: tabId || 'default',
        })
      }).catch(err => console.warn('[ChatView] Failed to persist user message:', err));

      // Show SLM analysis status
      setAnalysisStatus({ status: 'analyzing', message: 'Analyzing complexity...' });
      
      // Get SLM analysis first
      let slmResult = null;
      try {
        const slmResponse = await fetch('/api/slm/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: finalUserMessage }) // Analyze full message
        });
        if (slmResponse.ok) {
          slmResult = await slmResponse.json();
          setAnalysisStatus({
            status: 'complete',
            complexity: slmResult.complexity,
            model: slmResult.recommendedModel || slmResult.model,
            taskType: slmResult.taskType,
          });
        }
      } catch (slmErr) {
        console.warn('[ChatView] SLM analysis failed:', slmErr);
        setAnalysisStatus(null);
      }

      // v3.5.3: Use PTY bridge if available, otherwise fall back to HTTP
      // Issue #52: Use getActiveTerminalRef for lazy ref access
      const ref = getActiveTerminalRef();
      if (usePTYBridge && ref && ref.sendChatCommand) {
        console.log('[ChatView] Using PTY bridge mode');
        await sendViaPTYBridge(finalUserMessage, slmResult);
        // Note: isLoading will be cleared by the timeout in sendViaPTYBridge
        return;
      }

      // Fallback: Use HTTP API
      console.log('[ChatView] Using HTTP fallback mode');
      await sendViaHTTP(finalUserMessage, slmResult);

      // Clear analysis status after response
      setAnalysisStatus(null);

    } catch (err) {
      console.error('[ChatView] Error:', err);
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Error: ${err.message}`,
        id: `msg-${Date.now() + 2}`
      }]);
      setAnalysisStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, tabId]);

  // Scroll to a specific message (for search)
  const scrollToMessage = useCallback((messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 2000);
    }
  }, []);

  // Issue #52: Handle Enter key with configurable behavior
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (enterToSend) {
        // Enter sends, Shift+Enter for newline
        if (!e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      } else {
        // Shift+Enter sends, Enter for newline
        if (e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      }
    }
  };
  
  // Toggle Enter key behavior and persist to localStorage
  const toggleEnterBehavior = useCallback(() => {
    setEnterToSend(prev => {
      const newValue = !prev;
      localStorage.setItem('chat_enter_to_send', String(newValue));
      return newValue;
    });
  }, []);

  // v3.7.2: Draggable Forge Assist button handlers
  const handleBtnMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDraggingBtn(true);
    
    // Calculate offset from button position to mouse
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleBtnMouseMove = useCallback((e) => {
    if (!isDraggingBtn) return;
    
    // Calculate new position relative to viewport
    const newRight = window.innerWidth - e.clientX - dragOffset.x;
    const newBottom = window.innerHeight - e.clientY - dragOffset.y;
    
    // Constrain to viewport
    const constrainedPos = {
      right: Math.max(10, Math.min(window.innerWidth - 60, newRight)),
      bottom: Math.max(10, Math.min(window.innerHeight - 60, newBottom)),
    };
    
    setForgeAssistBtnPos(constrainedPos);
  }, [isDraggingBtn, dragOffset]);

  const handleBtnMouseUp = useCallback(() => {
    if (isDraggingBtn) {
      setIsDraggingBtn(false);
      // Save position to localStorage
      localStorage.setItem('forge_assist_btn_pos', JSON.stringify(forgeAssistBtnPos));
    }
  }, [isDraggingBtn, forgeAssistBtnPos]);

  // Add/remove mouse event listeners for dragging
  useEffect(() => {
    if (isDraggingBtn) {
      window.addEventListener('mousemove', handleBtnMouseMove);
      window.addEventListener('mouseup', handleBtnMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleBtnMouseMove);
        window.removeEventListener('mouseup', handleBtnMouseUp);
      };
    }
  }, [isDraggingBtn, handleBtnMouseMove, handleBtnMouseUp]);

  // Image upload handlers
  const handleImageUpload = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/chat/images', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setPendingImages(prev => [...prev, {
          id: Date.now(),
          filename: data.filename,
          url: data.url,
          name: file.name,
        }]);
      }
    } catch (err) {
      console.error('[ChatView] Image upload failed:', err);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    });
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        break;
      }
    }
  }, [handleImageUpload]);

  const removeImage = useCallback((id) => {
    setPendingImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // Instruction Mode Handlers
  const toggleInstructionMode = useCallback(() => {
    setIsInstructionMode(prev => !prev);
  }, []);

  const openInstructionEditor = useCallback(async () => {
    try {
      setIsSavingInstructions(true);
      // Default to copilot-instructions.md as per requirements
      const filename = 'copilot-instructions.md';
      
      const response = await fetch(`/api/files/read?path=${filename}`);
      if (response.ok) {
        const data = await response.json();
        setInstructionContent(data.content || '');
      } else {
        // File might not exist, start empty
        setInstructionContent('');
      }
      setShowInstructionEditor(true);
    } catch (err) {
      console.error('[ChatView] Failed to load instructions:', err);
      setInstructionContent('');
      setShowInstructionEditor(true);
    } finally {
      setIsSavingInstructions(false);
    }
  }, []);

  const saveInstructions = useCallback(async () => {
    try {
      setIsSavingInstructions(true);
      const filename = 'copilot-instructions.md';
      
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filename,
          content: instructionContent
        })
      });
      setShowInstructionEditor(false);
    } catch (err) {
      console.error('[ChatView] Failed to save instructions:', err);
      // Could add toast here
    } finally {
      setIsSavingInstructions(false);
    }
  }, [instructionContent]);

  return (
    <div 
      className={`chat-view ${isDragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header with mode toggle and router config */}
      <div className="chat-view-header">
        <div className="chat-view-title">
          <Brain size={20} className="chat-view-icon" />
          <h2>AI Assistant</h2>
        </div>
        <div className="chat-view-actions">
          <button 
            className={`chat-view-btn instruction-toggle-btn ${isInstructionMode ? 'active' : ''}`}
            onClick={toggleInstructionMode}
            title="Toggle Instruction Mode (Append copilot-instructions.md)"
            style={{ 
              borderColor: isInstructionMode ? 'var(--accent-color)' : '',
              color: isInstructionMode ? 'var(--accent-color)' : ''
            }}
          >
            <FileText size={18} />
            {isInstructionMode && <span style={{fontSize: '11px', fontWeight: 'bold'}}>ON</span>}
          </button>
          {isInstructionMode && (
            <button 
              className="chat-view-btn edit-instructions-btn"
              onClick={openInstructionEditor}
              title="Edit Instructions"
            >
              <Edit size={18} />
            </button>
          )}
          <button 
            className="chat-view-btn search-btn"
            onClick={() => setIsSearchOpen(true)}
            title="Search Chat History (Ctrl+F)"
          >
            <Search size={18} />
          </button>
          {onOpenSettings && (
            <button 
              className="chat-view-btn settings-btn"
              onClick={onOpenSettings}
              title="Intelligence & Budget Settings"
            >
              <Settings size={18} />
            </button>
          )}
          {onToggleTerminal && (
            <button 
              className="chat-view-btn terminal-toggle-btn"
              onClick={onToggleTerminal}
              title="Switch to Terminal"
            >
              <Terminal size={18} />
              <span>Terminal</span>
            </button>
          )}
        </div>
      </div>

      {/* SLM Analysis Status */}
      {analysisStatus && (
        <div className={`chat-view-analysis ${analysisStatus.status}`}>
          {analysisStatus.status === 'analyzing' ? (
            <>
              <Loader2 className="spinner" size={14} />
              <span>{analysisStatus.message}</span>
            </>
          ) : (
            <>
              <span className="complexity-badge" data-level={analysisStatus.complexity > 7 ? 'high' : analysisStatus.complexity > 4 ? 'medium' : 'low'}>
                Complexity: {analysisStatus.complexity}/10
              </span>
              {analysisStatus.model && <span className="model-badge">{analysisStatus.model}</span>}
              {analysisStatus.taskType && <span className="task-badge">{analysisStatus.taskType}</span>}
            </>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="chat-view-messages" style={{ fontSize: `${fontSize}px` }}>
        {messages.length === 0 && (
          <div className="chat-view-empty">
            <div className="chat-view-empty-icon">🤖</div>
            <h3>Welcome to Forge Terminal</h3>
            <p>Ask me anything about code, debugging, or development.</p>
            <p className="chat-view-hint">
              I use your CLI tools (copilot/claude) with Smart Routing to optimize responses.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div 
            key={msg.id} 
            ref={el => messageRefs.current[msg.id] = el}
            className={`chat-view-message chat-view-message-${msg.role}${msg.isInteractive ? ' interactive-prompt' : ''}`}
          >
            <div className="chat-view-bubble">
              {msg.role === 'user' && <div className="chat-view-avatar user-avatar">You</div>}
              {msg.role === 'assistant' && (
                <div className="chat-view-avatar assistant-avatar" title={msg.workerName}>
                  🤖
                </div>
              )}
              {msg.role === 'error' && <div className="chat-view-avatar error-avatar">❌</div>}
              {msg.role === 'prompt' && (
                <div className="chat-view-avatar prompt-avatar" title="Input needed">
                  ❓
                </div>
              )}
              <div className="chat-view-content">
                {msg.workerName && msg.role === 'assistant' && (
                  <div className="chat-view-worker-badge">{msg.workerName}</div>
                )}
                {msg.timestamp && (
                  <div className="chat-view-timestamp">{formatTimestamp(msg.timestamp)}</div>
                )}
                {msg.isInteractive && (
                  <div className="chat-view-prompt-indicator">⚡ Input needed - type your response below</div>
                )}
                {msg.role === 'assistant' ? (
                  <MarkdownContent content={msg.content || ''} onRunInTerminal={onRunInTerminal} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{msg.content || ''}</pre>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-view-message chat-view-message-loading">
            <div className="chat-view-bubble">
              <div className="chat-view-avatar assistant-avatar">🤖</div>
              <div className="chat-view-content">
                <Loader2 className="spinner" size={20} />
                <span className="loading-text">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-view-input-area">
        {/* Pending images */}
        {pendingImages.length > 0 && (
          <div className="chat-view-pending-images">
            {pendingImages.map(img => (
              <div key={img.id} className="pending-image">
                <img src={img.url} alt={img.name} />
                <button 
                  className="remove-image-btn" 
                  onClick={() => removeImage(img.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="chat-view-input-row">
          <button 
            className="chat-view-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Image"
          >
            <ImageIcon size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImageUpload(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <textarea
            className="chat-view-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            placeholder={enterToSend 
              ? "Ask a question... (Enter to send, Shift+Enter for newline)" 
              : "Ask a question... (Shift+Enter to send, Enter for newline)"}
            disabled={isLoading}
            rows={3}
          />
          <button
            className="chat-view-enter-toggle"
            onClick={toggleEnterBehavior}
            title={enterToSend ? "Enter sends message (click to toggle)" : "Shift+Enter sends message (click to toggle)"}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '10px',
              padding: '4px 8px',
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            {enterToSend ? '⏎ sends' : '⇧⏎ sends'}
          </button>
          <button
            className="chat-view-send-btn"
            onClick={handleSendMessage}
            disabled={isLoading || (!inputValue.trim() && pendingImages.length === 0)}
            title={enterToSend ? "Send (Enter)" : "Send (Shift+Enter)"}
          >
            {isLoading ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </div>

      {/* Search Overlay */}
      <ChatSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onScrollToMessage={scrollToMessage}
      />

      {/* Instruction Editor Modal */}
      {showInstructionEditor && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            width: '100%',
            maxWidth: '800px',
            height: '80%',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
                <FileText size={20} color="var(--accent-color)" />
                Edit Instructions (copilot-instructions.md)
              </h3>
              <button 
                onClick={() => setShowInstructionEditor(false)}
                style={{background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}
              >
                <X size={24} />
              </button>
            </div>
            <div style={{flex: 1, padding: '20px', display: 'flex', flexDirection: 'column'}}>
              <textarea
                value={instructionContent}
                onChange={(e) => setInstructionContent(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '16px',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  resize: 'none',
                  outline: 'none'
                }}
                placeholder="# Copilot Instructions\n\nAdd your custom instructions here..."
              />
            </div>
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button 
                onClick={() => setShowInstructionEditor(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={saveInstructions}
                disabled={isSavingInstructions}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-color)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isSavingInstructions ? 0.7 : 1
                }}
              >
                {isSavingInstructions ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v3.7.2: Draggable Forge Assist button */}
      {onToggleForgeAssist && (
        <button
          className={`forge-assist-floating-btn ${isDraggingBtn ? 'dragging' : ''}`}
          style={{
            position: 'fixed',
            right: `${forgeAssistBtnPos.right}px`,
            bottom: `${forgeAssistBtnPos.bottom}px`,
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--accent-color, #8b5cf6)',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: isDraggingBtn ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            zIndex: 1000,
            transition: isDraggingBtn ? 'none' : 'transform 0.2s, box-shadow 0.2s',
            userSelect: 'none',
          }}
          onMouseDown={handleBtnMouseDown}
          onClick={(e) => {
            // Only trigger if not dragging (small movement threshold)
            if (!isDraggingBtn) {
              onToggleForgeAssist();
            }
          }}
          onMouseEnter={(e) => {
            if (!isDraggingBtn) {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDraggingBtn) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            }
          }}
          title="Forge Assist - Drag to reposition (Ctrl+/)"
        >
          <Command size={24} />
        </button>
      )}
    </div>
  );
};

// Helper function to format timestamp
const formatTimestamp = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${mins}:${secs}`;
};

/**
 * Markdown content renderer - parses basic markdown for display
 */
const MarkdownContent = ({ content, onRunInTerminal }) => {
  const parseMarkdown = (text) => {
    if (!text) return []; // Guard against undefined/null content
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeBlockContent = '';
    let codeLanguage = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeBlockContent = '';
        } else {
          // Check if this is a runnable code block (bash, sh, powershell, cmd)
          const isRunnable = ['bash', 'sh', 'shell', 'powershell', 'ps1', 'cmd', 'zsh', ''].includes(codeLanguage.toLowerCase());
          const trimmedCode = codeBlockContent.trim();
          
          elements.push(
            <div key={`code-wrapper-${i}`} className="chat-view-code-wrapper">
              <pre className="chat-view-code-block">
                {codeLanguage && <div className="chat-view-code-lang">{codeLanguage}</div>}
                <code>{codeBlockContent}</code>
              </pre>
              {isRunnable && onRunInTerminal && trimmedCode && (
                <button 
                  className="chat-view-run-btn"
                  onClick={() => onRunInTerminal(trimmedCode)}
                  title="Run in Terminal (Ghost Driver)"
                >
                  <Play size={14} />
                  Run in Terminal
                </button>
              )}
            </div>
          );
          inCodeBlock = false;
          codeBlockContent = '';
          codeLanguage = '';
        }
      } else if (inCodeBlock) {
        codeBlockContent += line + '\n';
      } else if (trimmed.startsWith('# ')) {
        elements.push(<h2 key={`h2-${i}`} className="chat-view-heading">{trimmed.slice(2)}</h2>);
      } else if (trimmed.startsWith('## ')) {
        elements.push(<h3 key={`h3-${i}`} className="chat-view-heading">{trimmed.slice(3)}</h3>);
      } else if (trimmed.startsWith('### ')) {
        elements.push(<h4 key={`h4-${i}`} className="chat-view-heading">{trimmed.slice(4)}</h4>);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(<li key={`li-${i}`} className="chat-view-list-item">{trimmed.slice(2)}</li>);
      } else if (trimmed.match(/^\d+\.\s/)) {
        const match = trimmed.match(/^\d+\.\s(.*)$/);
        if (match) {
          elements.push(<li key={`oli-${i}`} className="chat-view-list-item ordered">{match[1]}</li>);
        }
      } else if (trimmed) {
        // Handle inline code
        const parts = line.split(/(`[^`]+`)/g);
        const rendered = parts.map((part, j) => {
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={j} className="chat-view-inline-code">{part.slice(1, -1)}</code>;
          }
          return part;
        });
        elements.push(<p key={`p-${i}`} className="chat-view-paragraph">{rendered}</p>);
      }
    }

    if (inCodeBlock) {
      const isRunnable = ['bash', 'sh', 'shell', 'powershell', 'ps1', 'cmd', 'zsh', ''].includes(codeLanguage.toLowerCase());
      const trimmedCode = codeBlockContent.trim();
      
      elements.push(
        <div key="code-wrapper-final" className="chat-view-code-wrapper">
          <pre className="chat-view-code-block">
            {codeLanguage && <div className="chat-view-code-lang">{codeLanguage}</div>}
            <code>{codeBlockContent}</code>
          </pre>
          {isRunnable && onRunInTerminal && trimmedCode && (
            <button 
              className="chat-view-run-btn"
              onClick={() => onRunInTerminal(trimmedCode)}
              title="Run in Terminal (Ghost Driver)"
            >
              <Play size={14} />
              Run in Terminal
            </button>
          )}
        </div>
      );
    }

    return elements;
  };

  return <div className="chat-view-markdown">{parseMarkdown(content)}</div>;
};

// Utility function to clean up chat messages for a tab (call when tab is closed)
export const cleanupChatMessages = (tabId) => {
  if (tabId && chatMessagesStore.has(tabId)) {
    chatMessagesStore.delete(tabId);
  }
};

export default ChatView;
