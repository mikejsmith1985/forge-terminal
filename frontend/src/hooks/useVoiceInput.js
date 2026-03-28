import { useState, useCallback, useRef, useEffect } from 'react';

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export function useVoiceInput({ onResult, onError, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => !!getSpeechRecognition());
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.addEventListener('result', (event) => {
      const text = event.results[event.resultIndex]?.[0]?.transcript || '';
      setTranscript(text);
      if (onResult) onResult(text);
    });

    recognition.addEventListener('error', (event) => {
      setIsListening(false);
      if (onError) onError(event.error);
    });

    recognition.addEventListener('end', () => {
      setIsListening(false);
      recognitionRef.current = null;
    });

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [lang, onResult, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return { isListening, isSupported, transcript, startListening, stopListening };
}
