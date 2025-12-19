import { useState, useEffect, useCallback } from 'react';

export function useAssistantStream(tabId) {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!tabId) return;

    // Connect to WebSocket
    // In a real app, this might be a shared connection or context
    // For now, we assume a direct connection to the backend
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
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
        const data = JSON.parse(event.data);
        
        // Filter events for this tab
        if (data.tabId && data.tabId !== tabId) return;

        switch (data.type) {
          case 'assistant_thinking':
            setIsThinking(true);
            setThinkingContent(prev => prev + data.metadata.content);
            break;
            
          case 'assistant_response':
            setIsThinking(false);
            setThinkingContent(''); // Clear thinking when response starts? Or keep it?
            // For now, we append to messages
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isComplete) {
                // Append to last message if it's streaming
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, content: lastMsg.content + data.metadata.content }
                ];
              } else {
                // New message
                return [
                  ...prev,
                  { role: 'assistant', content: data.metadata.content, isComplete: false }
                ];
              }
            });
            break;

          case 'assistant_done':
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
            break;
            
          case 'assistant_tool_use':
            // Handle tool use request
            setMessages(prev => [
              ...prev,
              { 
                role: 'tool_request', 
                tool: data.metadata.tool, 
                params: data.metadata.params,
                isComplete: true 
              }
            ]);
            break;
        }
      } catch (err) {
        console.error('[Assistant] Error parsing message:', err);
      }
    });

    return () => {
      ws.close();
    };
  }, [tabId]);

  const sendMessage = useCallback((content) => {
    // This would send via HTTP POST to /api/assistant/chat
    // which then triggers the backend process
    // For now, we just update local state to show user message
    setMessages(prev => [...prev, { role: 'user', content, isComplete: true }]);
  }, []);

  return {
    messages,
    isThinking,
    thinkingContent,
    isConnected,
    sendMessage
  };
}
