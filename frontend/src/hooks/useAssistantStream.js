import { useState, useEffect, useCallback } from 'react';

export function useAssistantStream(tabId) {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!tabId) return;

    // Connect to WebSocket for terminal (NOT assistant-specific yet)
    // The terminal WebSocket handles both terminal data and control messages
    // TODO: In future, create dedicated /ws/assistant endpoint for chat
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?tabId=${tabId}`;
    
    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      setIsConnected(true);
      console.log(`[Assistant] Connected for tab ${tabId}`);
    });

    ws.addEventListener('close', () => {
      setIsConnected(false);
      console.log(`[Assistant] Disconnected for tab ${tabId}`);
    });

    ws.addEventListener('message', (event) => {
      try {
        // Terminal WebSocket sends different types of messages:
        // - Binary (terminal output)
        // - JSON control messages (RESIZE, VISION_*, AM_*, etc.)
        
        // Skip binary messages (terminal output)
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          return;
        }

        const data = JSON.parse(event.data);
        
        // Filter to only process assistant-related messages
        // For now, we don't have a dedicated message type, so we'll ignore most
        // In future enhancement, backend should send:
        // { type: 'ASSISTANT_THINKING', content: '...' }
        // { type: 'ASSISTANT_RESPONSE', content: '...' }
        // { type: 'ASSISTANT_DONE' }
        
        if (data.type === 'ASSISTANT_THINKING') {
          setIsThinking(true);
          setThinkingContent(prev => prev + data.content);
        } else if (data.type === 'ASSISTANT_RESPONSE') {
          setIsThinking(false);
          setThinkingContent('');
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isComplete) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + data.content }
              ];
            } else {
              return [
                ...prev,
                { role: 'assistant', content: data.content, isComplete: false }
              ];
            }
          });
        } else if (data.type === 'ASSISTANT_DONE') {
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, isComplete: true }
              ];
            }
            return prev;
          });
        } else if (data.type === 'ASSISTANT_TOOL_USE') {
          setMessages(prev => [
            ...prev,
            { 
              role: 'tool_request', 
              tool: data.tool, 
              params: data.params,
              isComplete: true 
            }
          ]);
        }
        // Ignore other message types (RESIZE, VISION_*, etc.)
      } catch (err) {
        // Only log if it's actually a JSON parsing error, not binary data
        if (typeof event.data === 'string') {
          console.error('[Assistant] Error parsing message:', err);
        }
      }
    });

    return () => {
      ws.close();
    };
  }, [tabId]);

  const sendMessage = useCallback(async (content) => {
    // Add user message to UI immediately
    setMessages(prev => [...prev, { role: 'user', content, isComplete: true }]);
    
    // TODO: Send via HTTP POST to /api/assistant/chat
    // For now, this is a placeholder
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabId,
          message: content,
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      // Backend will stream responses via WebSocket
      // Messages will be received in the message event listener above
    } catch (error) {
      console.error('[Assistant] Failed to send message:', error);
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `Error: Unable to reach assistant. ${error.message}`,
          isComplete: true,
          error: true
        }
      ]);
    }
  }, [tabId]);

  return {
    messages,
    isThinking,
    thinkingContent,
    isConnected,
    sendMessage
  };
}
