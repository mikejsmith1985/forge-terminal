/**
 * useChatStore - React hook for SQLite-backed persistent chat
 * v3.5.1: Chat as orchestration layer with WebSocket sync
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Message types matching backend
export const MessageType = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  COMMAND: 'command',
  FILE: 'file',
  IMAGE: 'image',
  ANALYSIS: 'analysis',
};

/**
 * Hook for interacting with the persistent chat store
 */
export function useChatStore() {
  const [messages, setMessages] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Load initial messages
  const loadMessages = useCallback(async (limit = 100) => {
    try {
      const response = await fetch(`/api/chat/messages?limit=${limit}`);
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data.messages || []);
      setError(null);
    } catch (err) {
      console.error('[ChatStore] Load error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load workers
  const loadWorkers = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/workers');
      if (!response.ok) throw new Error('Failed to load workers');
      const data = await response.json();
      setWorkers(data.workers || []);
    } catch (err) {
      console.error('[ChatStore] Workers load error:', err);
    }
  }, []);

  // Connect WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[ChatStore] WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message') {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
          }
        } catch (err) {
          console.error('[ChatStore] Parse error:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('[ChatStore] WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error('[ChatStore] WebSocket error:', err);
        setError('WebSocket connection failed');
      };
    } catch (err) {
      console.error('[ChatStore] WebSocket creation error:', err);
      setError(err.message);
    }
  }, []);

  // Add a message
  const addMessage = useCallback(async (message) => {
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) throw new Error('Failed to add message');
      
      const data = await response.json();
      
      // Optimistically add to local state (WebSocket will confirm)
      setMessages(prev => [...prev, { ...message, id: data.id }]);
      
      return data;
    } catch (err) {
      console.error('[ChatStore] Add message error:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Search messages
  const searchMessages = useCallback(async (query, limit = 50) => {
    try {
      const response = await fetch(`/api/chat/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      return data.messages || [];
    } catch (err) {
      console.error('[ChatStore] Search error:', err);
      setError(err.message);
      return [];
    }
  }, []);

  // Get thread messages
  const getThread = useCallback(async (threadId) => {
    try {
      const response = await fetch(`/api/chat/thread/${threadId}`);
      if (!response.ok) throw new Error('Failed to get thread');
      const data = await response.json();
      return data.messages || [];
    } catch (err) {
      console.error('[ChatStore] Thread error:', err);
      return [];
    }
  }, []);

  // Upload image
  const uploadImage = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/chat/images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload image');
      return await response.json();
    } catch (err) {
      console.error('[ChatStore] Upload error:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Get context for SLM
  const getContext = useCallback(async (hours = 24, maxTokens = 4000) => {
    try {
      const response = await fetch(`/api/chat/context?hours=${hours}&maxTokens=${maxTokens}`);
      if (!response.ok) throw new Error('Failed to get context');
      return await response.json();
    } catch (err) {
      console.error('[ChatStore] Context error:', err);
      return { context: '', estimatedTokens: 0 };
    }
  }, []);

  // Register a worker
  const registerWorker = useCallback(async (worker) => {
    try {
      const response = await fetch('/api/chat/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worker),
      });

      if (!response.ok) throw new Error('Failed to register worker');
      
      const data = await response.json();
      await loadWorkers(); // Refresh workers list
      return data.worker;
    } catch (err) {
      console.error('[ChatStore] Register worker error:', err);
      throw err;
    }
  }, [loadWorkers]);

  // Initialize on mount
  useEffect(() => {
    loadMessages();
    loadWorkers();
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [loadMessages, loadWorkers, connectWebSocket]);

  return {
    // State
    messages,
    workers,
    isConnected,
    isLoading,
    error,
    
    // Actions
    addMessage,
    searchMessages,
    getThread,
    uploadImage,
    getContext,
    registerWorker,
    refresh: loadMessages,
  };
}

/**
 * Hook for chat search with debouncing
 */
export function useChatSearch(debounceMs = 300) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const { searchMessages } = useChatStore();
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const messages = await searchMessages(query);
      setResults(messages);
      setIsSearching(false);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, searchMessages, debounceMs]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    clearSearch: () => {
      setQuery('');
      setResults([]);
    },
  };
}

export default useChatStore;
