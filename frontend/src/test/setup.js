import '@testing-library/jest-dom'
import { vi } from 'vitest'

// @testing-library/react's asyncWrapper drain step uses jestFakeTimersAreEnabled()
// which checks `typeof jest !== 'undefined'`.  Vitest's `globals: true` provides
// `vi` but NOT `jest`, so the check fails and the drain step never fires
// jest.advanceTimersByTime(0), leaving a fake setTimeout(0) that never resolves.
// Exposing jest as a vi alias fixes fake-timer detection for all RTL waitFor calls.
globalThis.jest = vi
