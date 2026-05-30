import { describe, expect, it } from 'vitest'
import { detectSecretInDescription } from './secretDetector'

// These cases mirror the authoritative Go detector tests
// (internal/vault/secretscan_test.go) so the client and server heuristics stay
// aligned.
describe('detectSecretInDescription', () => {
  const positiveCases = [
    ['login URL with embedded password query', 'https://dev.service-now.com/login.do?user_name=admin&user_password=Hunter2!'],
    ['URL with userinfo credentials', 'connect at https://admin:s3cr3tP%40ss@db.internal/login'],
    ['OpenAI-style secret key', 'key is sk-abcdEFGH1234ijklMNOP5678qrst'],
    ['GitHub personal access token', 'ghp_ABCDEFghijkl0123456789MNOPqrstuvwx'],
    ['raw 40-char hex blob', '0123456789abcdef0123456789abcdef01234567'],
    ['PEM private key header', '-----BEGIN RSA PRIVATE KEY-----'],
  ]

  it.each(positiveCases)('flags %s', (_name, text) => {
    const { isSuspicious, reason } = detectSecretInDescription(text)
    expect(isSuspicious).toBe(true)
    expect(reason).not.toBe('')
  })

  const negativeCases = [
    ['ordinary description', 'Used for code generation tasks'],
    ['short label', 'ServiceNow dev admin'],
    ['plain login URL without credentials', 'https://service.example.com/login'],
    ['empty string', ''],
    ['whitespace only', '   '],
  ]

  it.each(negativeCases)('does not flag %s', (_name, text) => {
    const { isSuspicious } = detectSecretInDescription(text)
    expect(isSuspicious).toBe(false)
  })
})
