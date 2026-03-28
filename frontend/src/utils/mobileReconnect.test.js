import { MobileReconnectConfig, calculateDelay, shouldAttemptReconnect } from './mobileReconnect'

describe('MobileReconnectConfig', () => {
  it('mobile initial delay is 500ms', () => {
    const config = MobileReconnectConfig(true)
    expect(config.initialDelay).toBe(500)
  })

  it('desktop initial delay is 1000ms', () => {
    const config = MobileReconnectConfig(false)
    expect(config.initialDelay).toBe(1000)
  })

  it('mobile max attempts is 20', () => {
    const config = MobileReconnectConfig(true)
    expect(config.maxAttempts).toBe(20)
  })

  it('desktop max attempts is 10', () => {
    const config = MobileReconnectConfig(false)
    expect(config.maxAttempts).toBe(10)
  })

  it('mobile max delay is 15000ms', () => {
    const config = MobileReconnectConfig(true)
    expect(config.maxDelay).toBe(15000)
  })
})

describe('calculateDelay', () => {
  it('first attempt uses initial delay', () => {
    const config = MobileReconnectConfig(true)
    const delay = calculateDelay(0, config)
    // Should be initialDelay ± jitter
    expect(delay).toBeGreaterThanOrEqual(config.initialDelay * 0.5)
    expect(delay).toBeLessThanOrEqual(config.initialDelay * 1.5)
  })

  it('delay increases exponentially', () => {
    const config = MobileReconnectConfig(false)
    const delay0 = calculateDelay(0, config)
    const delay3 = calculateDelay(3, config)
    // Attempt 3 base = 1000 * 2^3 = 8000, much larger than attempt 0
    expect(delay3).toBeGreaterThan(delay0)
  })

  it('delay caps at maxDelay', () => {
    const config = MobileReconnectConfig(true)
    const delay = calculateDelay(100, config) // Very high attempt
    expect(delay).toBeLessThanOrEqual(config.maxDelay * 1.5) // With jitter
  })

  it('jitter adds randomness', () => {
    const config = MobileReconnectConfig(true)
    // Run multiple times and verify not all are identical
    const delays = new Set()
    for (let i = 0; i < 20; i++) {
      delays.add(calculateDelay(2, config))
    }
    // With jitter, we should get at least 2 different values in 20 attempts
    expect(delays.size).toBeGreaterThan(1)
  })
})

describe('shouldAttemptReconnect', () => {
  it('allows reconnect when online and under max attempts', () => {
    expect(shouldAttemptReconnect(5, 10, true)).toBe(true)
  })

  it('blocks reconnect when over max attempts', () => {
    expect(shouldAttemptReconnect(10, 10, true)).toBe(false)
  })

  it('blocks reconnect when offline', () => {
    expect(shouldAttemptReconnect(0, 10, false)).toBe(false)
  })

  it('allows reconnect at exactly max-1 attempts', () => {
    expect(shouldAttemptReconnect(9, 10, true)).toBe(true)
  })
})
