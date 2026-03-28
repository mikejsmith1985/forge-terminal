/**
 * Mobile-optimized WebSocket reconnection configuration.
 * Mobile clients get faster initial reconnect, more attempts, and lower max delay
 * because mobile networks are flaky but recover quickly.
 */

export function MobileReconnectConfig(isMobile) {
  if (isMobile) {
    return {
      initialDelay: 500,    // Start faster on mobile
      maxDelay: 15000,       // Cap lower (mobile networks recover fast)
      maxAttempts: 20,       // More attempts (mobile disconnects are common)
      backoffMultiplier: 2,
      jitterFactor: 0.5,    // ±50% randomization to prevent thundering herd
    }
  }
  return {
    initialDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 10,
    backoffMultiplier: 2,
    jitterFactor: 0.3,      // ±30% jitter on desktop
  }
}

/**
 * Calculate reconnection delay with exponential backoff and jitter.
 * Jitter prevents multiple clients from reconnecting at the exact same time
 * (thundering herd problem).
 */
export function calculateDelay(attempt, config) {
  const baseDelay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  )

  // Apply jitter: delay ± (jitterFactor * delay)
  const jitter = baseDelay * config.jitterFactor
  const randomJitter = (Math.random() * 2 - 1) * jitter

  return Math.max(0, Math.round(baseDelay + randomJitter))
}

/**
 * Determine if a reconnection attempt should be made.
 * Respects navigator.onLine to avoid wasting attempts when offline.
 */
export function shouldAttemptReconnect(currentAttempt, maxAttempts, isOnline) {
  if (!isOnline) return false
  if (currentAttempt >= maxAttempts) return false
  return true
}
