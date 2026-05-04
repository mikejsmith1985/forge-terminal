import '@testing-library/jest-dom';

// RTL's waitFor uses jestFakeTimersAreEnabled() to detect fake timers.
// Vitest doesn't set globalThis.jest by default, so we alias it here.
// Without this, waitFor hangs indefinitely when vi.useFakeTimers() is active.
globalThis.jest = vi;
